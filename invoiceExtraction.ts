/**
 * Reads a vendor's tax invoice (PDF or photo) and extracts the header details and line items,
 * so the "Record Delivery & Invoice" form can be filled automatically.
 * Uses Gemini when configured, with a pattern-matching fallback for text PDFs.
 */
import type { GoogleGenAI } from '@google/genai';
import { QUOTE_DOC_MIME, GST_RATES, extractDocumentText, toIsoDate } from './quoteExtraction.js';
import type { QuoteDocKind } from './quoteExtraction.js';

export const INVOICE_KINDS: QuoteDocKind[] = ['pdf', 'png', 'jpeg', 'webp'];

export interface InvoiceLineItem {
  description: string;
  hsn?: string;
  quantity?: number;
  unit?: string;
  rate?: number; // Rs. per unit, excl. GST
  gstRate?: number;
  amount?: number; // taxable value of the line (excl. GST)
}

export interface ExtractedInvoice {
  invoiceNumber?: string;
  invoiceDate?: string; // YYYY-MM-DD
  vendorGstin?: string;
  poReference?: string;
  lineItems: InvoiceLineItem[];
  materialQuantity?: number; // quantity of the ordered material on this invoice
  taxableAmount?: number;
  gstAmount?: number;
  freightCharges?: number;
  loadingCharges?: number;
  invoiceTotal?: number;
}

const nearest = (value: number, options: number[]) =>
  options.reduce((best, o) => (Math.abs(o - value) < Math.abs(best - value) ? o : best), options[0]);
const num = (v: unknown, allowZero = false) => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n < 1e10 && (n > 0 || (allowZero && n === 0)) ? Math.round(n * 1000) / 1000 : undefined;
};
const money = (v: unknown) => {
  const n = num(v, true);
  return n === undefined ? undefined : Math.round(n * 100) / 100;
};
const text = (v: unknown, max: number) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : undefined;
};
const GSTIN_RE = /\b(\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b/;

export function normaliseInvoice(raw: Record<string, any>): ExtractedInvoice {
  const out: ExtractedInvoice = { lineItems: [] };
  const invNo = text(raw.invoiceNumber, 60);
  if (invNo) out.invoiceNumber = invNo;
  const date = toIsoDate(raw.invoiceDate);
  if (date) out.invoiceDate = date;
  const gstin = String(raw.vendorGstin || '').toUpperCase().match(GSTIN_RE)?.[1];
  if (gstin) out.vendorGstin = gstin;
  const poRef = text(raw.poReference, 40);
  if (poRef) out.poReference = poRef;
  for (const li of Array.isArray(raw.lineItems) ? raw.lineItems.slice(0, 50) : []) {
    const description = text(li?.description, 200);
    if (!description) continue;
    const item: InvoiceLineItem = { description };
    const hsn = text(li.hsn, 12);
    if (hsn && /^\d{4,8}$/.test(hsn)) item.hsn = hsn;
    const qty = num(li.quantity);
    if (qty) item.quantity = qty;
    const unit = text(li.unit, 20);
    if (unit) item.unit = unit;
    const rate = money(li.rate);
    if (rate) item.rate = rate;
    const gst = num(li.gstRate, true);
    if (gst !== undefined && gst <= 28) item.gstRate = nearest(gst, GST_RATES);
    const amount = money(li.amount);
    if (amount) item.amount = amount;
    out.lineItems.push(item);
  }
  const mq = num(raw.materialQuantity);
  if (mq) out.materialQuantity = mq;
  for (const k of ['taxableAmount', 'gstAmount', 'freightCharges', 'loadingCharges', 'invoiceTotal'] as const) {
    const v = money(raw[k]);
    if (v !== undefined && (v > 0 || k === 'freightCharges' || k === 'loadingCharges')) out[k] = v;
  }
  return out;
}

/** Fallback for text PDFs when the AI service is unavailable (header figures only) */
export function extractInvoiceWithPatterns(input: string): ExtractedInvoice {
  const t = input.replace(/\r/g, '');
  const find = (re: RegExp) => (t.match(re) || [])[1];
  return normaliseInvoice({
    invoiceNumber: find(/(?:tax\s*)?invoice\s*(?:no|number|#)\.?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/\-]{1,29})/i) || find(/bill\s*(?:no|number)\.?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/\-]{1,29})/i),
    invoiceDate:
      find(/(?:invoice|bill)?\s*date[d]?\s*[:\-]?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i) ||
      find(/(?:invoice|bill)?\s*date[d]?\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})/i),
    vendorGstin: (t.toUpperCase().match(GSTIN_RE) || [])[1],
    poReference: find(/\b(PO-\d{4}-\d{4,})\b/i),
    invoiceTotal: find(/(?:grand\s*total|invoice\s*(?:total|value|amount)|total\s*amount(?:\s*after\s*tax)?|net\s*payable|amount\s*payable)[^\n\d]{0,30}([\d,]+(?:\.\d+)?)/i),
    freightCharges: find(/(?:freight|transport(?:ation)?)[^\n\d]{0,30}([\d,]+(?:\.\d+)?)/i),
    loadingCharges: find(/loading[^\n\d]{0,30}([\d,]+(?:\.\d+)?)/i),
  });
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    invoiceNumber: { type: 'string', description: 'Tax invoice / bill number exactly as printed' },
    invoiceDate: { type: 'string', description: 'Invoice date as YYYY-MM-DD' },
    vendorGstin: { type: 'string', description: "Supplier's (seller's) 15-character GSTIN" },
    poReference: { type: 'string', description: "Buyer's purchase order number quoted on the invoice, if any" },
    lineItems: {
      type: 'array',
      description: 'Every billed line, in the order printed (including freight / loading lines if listed as items)',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          hsn: { type: 'string', description: 'HSN / SAC code' },
          quantity: { type: 'number' },
          unit: { type: 'string', description: 'Unit of measure, e.g. Bags, MT, Nos' },
          rate: { type: 'number', description: 'Rate per unit in INR excluding GST' },
          gstRate: { type: 'number', description: 'GST % for the line (CGST + SGST, or IGST)' },
          amount: { type: 'number', description: 'Taxable value of the line in INR excluding GST' },
        },
        required: ['description'],
      },
    },
    materialQuantity: { type: 'number', description: 'Total quantity billed of the ordered material, in the ordered unit' },
    taxableAmount: { type: 'number', description: 'Total taxable value in INR before GST' },
    gstAmount: { type: 'number', description: 'Total GST in INR (CGST + SGST + IGST)' },
    freightCharges: { type: 'number', description: 'Freight / transport charges in INR (0 if none)' },
    loadingCharges: { type: 'number', description: 'Loading / unloading charges in INR (0 if none)' },
    invoiceTotal: { type: 'number', description: 'Final invoice total payable in INR, including GST and all charges' },
  },
};

export async function extractInvoiceFields(opts: {
  ai: GoogleGenAI | null;
  model: string;
  buf: Buffer;
  kind: QuoteDocKind;
  context: { materialName: string; unit: string; poNumber: string };
}): Promise<{ invoice: ExtractedInvoice; method: 'ai' | 'patterns' | 'none' }> {
  const { ai, model, buf, kind, context } = opts;
  if (ai && process.env.GEMINI_API_KEY) {
    try {
      const instruction = `You are reading a supplier's GST tax invoice for a construction project in India.
It was raised against purchase order ${context.poNumber} for "${context.materialName}" (ordered unit: ${context.unit}).
Extract the invoice header and every line item. Amounts are in INR. If a value is not printed, omit it; do not guess.
materialQuantity is the quantity of "${context.materialName}" billed, expressed in ${context.unit}.`;
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType: QUOTE_DOC_MIME[kind], data: buf.toString('base64') } }, { text: instruction }] }],
        config: { temperature: 0, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA as any },
      });
      const invoice = normaliseInvoice(JSON.parse(response.text || '{}'));
      if (invoice.invoiceNumber || invoice.invoiceTotal || invoice.lineItems.length) return { invoice, method: 'ai' };
    } catch (err: any) {
      console.warn('[Invoice Extraction] AI extraction failed, using pattern matching:', err?.message || err);
    }
  }
  const docText = kind === 'pdf' ? await extractDocumentText(buf, 'pdf') : '';
  const invoice = docText ? extractInvoiceWithPatterns(docText) : { lineItems: [] };
  const found = Object.keys(invoice).filter((k) => k !== 'lineItems').length > 0;
  return { invoice, method: found ? 'patterns' : 'none' };
}
