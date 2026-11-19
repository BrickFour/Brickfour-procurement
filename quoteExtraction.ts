/**
 * Reads a vendor's quotation (pasted text, PDF, Word, image or Excel/CSV) and extracts the key figures.
 * Uses Gemini (native PDF / image understanding, or document text) with a strict JSON schema,
 * and falls back to pattern matching on the document text when the AI service is unavailable.
 */
import type { GoogleGenAI } from '@google/genai';

export type QuoteDocKind = 'pdf' | 'docx' | 'doc' | 'xlsx' | 'csv' | 'png' | 'jpeg' | 'webp' | 'text';

export const QUOTE_DOC_MIME: Record<QuoteDocKind, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  text: 'text/plain',
};

/** Which upload option accepts which file kinds */
export const METHOD_KINDS: Record<'pdf' | 'word' | 'image-excel', QuoteDocKind[]> = {
  pdf: ['pdf'],
  word: ['docx', 'doc'],
  'image-excel': ['png', 'jpeg', 'webp', 'xlsx', 'csv'],
};

export const MAX_QUOTE_DOC_BYTES = 10 * 1024 * 1024;
export const GST_RATES = [0, 5, 12, 18, 28];

/** The key figures of a quotation (whatever could be found in the document) */
export interface ExtractedQuoteFields {
  unitRate?: number; // Rs. per unit, excluding GST
  quantity?: number; // quantity the vendor can supply
  gstRate?: number;
  freightCharges?: number; // Rs.
  loadingCharges?: number; // Rs.
  totalPrice?: number; // Rs., incl. GST, freight & loading
  deliveryDays?: number;
  promisedDeliveryDate?: string; // YYYY-MM-DD
  validityDays?: number;
  paymentTerms?: string;
  warranty?: string;
  remarks?: string;
}

/** Identify the real file type from its first bytes (never trust the file name or browser-reported type) */
export function detectDocKind(buf: Buffer, fileName = ''): QuoteDocKind | null {
  if (buf.length < 4) return null;
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString('latin1') === 'PNG') return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    // ZIP container: Word documents contain word/, Excel workbooks contain xl/
    if (buf.includes(Buffer.from('word/'))) return 'docx';
    if (buf.includes(Buffer.from('xl/'))) return 'xlsx';
    return null;
  }
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) {
    // Legacy OLE container: only Word .doc is supported (old .xls must be saved as .xlsx/.csv)
    return /\.xls$/i.test(fileName) ? null : 'doc';
  }
  if (/\.csv$/i.test(fileName)) {
    const sample = buf.subarray(0, 4096).toString('utf8');
    return /[\x00-\x08\x0e-\x1f]/.test(sample) ? null : 'csv';
  }
  return null;
}

export async function extractDocumentText(buf: Buffer, kind: QuoteDocKind): Promise<string> {
  try {
    if (kind === 'text' || kind === 'csv') return buf.toString('utf8');
    if (kind === 'docx') {
      const mammoth = await import('mammoth');
      const { value } = await (mammoth.default || mammoth).extractRawText({ buffer: buf });
      return value || '';
    }
    if (kind === 'doc') {
      const WordExtractor = (await import('word-extractor')).default;
      const doc = await new WordExtractor().extract(buf);
      return [doc.getHeaders?.(), doc.getBody(), doc.getFootnotes?.(), doc.getFooters?.()].filter(Boolean).join('\n');
    }
    if (kind === 'xlsx') {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as any);
      const lines: string[] = [];
      wb.eachSheet((sheet) => {
        lines.push(`# Sheet: ${sheet.name}`);
        sheet.eachRow((row) => {
          const cells = (row.values as any[]).slice(1).map((v) => {
            if (v === null || v === undefined) return '';
            if (typeof v === 'object') return v.result ?? v.text ?? (v.richText ? v.richText.map((r: any) => r.text).join('') : '');
            return String(v);
          });
          lines.push(cells.join(' | '));
        });
      });
      return lines.join('\n');
    }
    if (kind === 'pdf') {
      // Import the library file directly: the package entry point runs a debug self-test
      const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
      const { text } = await pdfParse(buf);
      return text || '';
    }
    return ''; // images have no extractable text without AI
  } catch (err: any) {
    console.warn(`[Quote Extraction] Could not read ${kind} text:`, err?.message || err);
    return '';
  }
}

const nearest = (value: number, options: number[]) =>
  options.reduce((best, o) => (Math.abs(o - value) < Math.abs(best - value) ? o : best), options[0]);

export function toIsoDate(raw: unknown): string | undefined {
  const s = String(raw ?? '').trim();
  if (!s) return undefined;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  // Indian format first: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

const num = (v: unknown, allowZero = false) => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && (n > 0 || (allowZero && n === 0)) ? n : undefined;
};
const money = (v: unknown) => {
  const n = num(v, true);
  return n !== undefined && n < 1e10 ? Math.round(n * 100) / 100 : undefined;
};
const text = (v: unknown, max: number) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : undefined;
};

/** Normalise raw values (from AI or regex) into the form's allowed values */
export function normaliseFields(raw: Record<string, any>): ExtractedQuoteFields {
  const out: ExtractedQuoteFields = {};
  const rate = money(raw.unitRate);
  if (rate && rate > 0) out.unitRate = rate;
  const qty = num(raw.quantity);
  if (qty && qty < 1e8) out.quantity = Math.round(qty * 1000) / 1000;
  const gst = num(raw.gstRate, true);
  if (gst !== undefined && gst <= 28) out.gstRate = nearest(gst, GST_RATES);
  const freight = money(raw.freightCharges);
  if (freight !== undefined) out.freightCharges = freight;
  const loading = money(raw.loadingCharges);
  if (loading !== undefined) out.loadingCharges = loading;
  const total = money(raw.totalPrice);
  if (total && total > 0) out.totalPrice = total;
  const days = num(raw.deliveryDays);
  if (days && days <= 365) out.deliveryDays = Math.round(days);
  const date = toIsoDate(raw.promisedDeliveryDate);
  if (date) out.promisedDeliveryDate = date;
  const validity = num(raw.validityDays);
  if (validity && validity <= 365) out.validityDays = Math.round(validity);
  const terms = text(raw.paymentTerms, 120);
  if (terms) out.paymentTerms = terms;
  const warranty = text(raw.warranty, 120);
  if (warranty) out.warranty = warranty;
  const remarks = text(raw.remarks, 1000);
  if (remarks) out.remarks = remarks;
  return out;
}

/** Pattern-matching fallback used when the AI service is unavailable */
export function extractWithPatterns(input: string): ExtractedQuoteFields {
  const t = input.replace(/\r/g, '');
  const find = (re: RegExp) => (t.match(re) || [])[1];
  const RS = String.raw`(?:rs\.?|inr|₹)\s*`;
  const AMT = String.raw`([\d,]+(?:\.\d+)?)`;
  return normaliseFields({
    // Only accept money values written with an explicit currency marker (tables are too ambiguous without AI)
    unitRate: find(new RegExp(String.raw`(?:unit\s*rate|basic\s*rate|rate)(?:\s*per\s*\w+)?\s*[:\-]?\s*${RS}${AMT}`, 'i')),
    gstRate: find(/(?:gst|igst)\s*(?:@|rate)?\s*[:\-]?\s*(\d{1,2}(?:\.\d+)?)\s*%/i),
    freightCharges: /(?:freight|transport(?:ation)?)[^\n]{0,40}(?:included|inclusive|free|nil)/i.test(t)
      ? 0
      : find(new RegExp(String.raw`(?:freight|transport(?:ation)?)[^\n\d]{0,30}${RS}${AMT}`, 'i')),
    loadingCharges: /loading[^\n]{0,40}(?:included|inclusive|free|nil)/i.test(t)
      ? 0
      : find(new RegExp(String.raw`loading[^\n\d]{0,30}${RS}${AMT}`, 'i')),
    totalPrice: find(new RegExp(String.raw`(?:grand\s*total|total\s*(?:price|amount|value)?)[^\n\d]{0,30}${RS}${AMT}`, 'i')),
    deliveryDays: find(/(?:delivery|lead\s*time|dispatch)[^\n\d]{0,40}(\d{1,3})\s*(?:working\s*)?days?/i),
    validityDays: find(/valid(?:ity)?[^\n\d]{0,40}(\d{1,3})\s*days?/i),
    paymentTerms: find(/(?:payment|credit)\s*(?:terms?)?\s*[:\-]\s*([^\n]{3,80})/i) || find(/(\d{1,3}\s*days?\s*credit[^\n]{0,40})/i),
    warranty: find(/(?:warranty|guarantee)\s*[:\-]\s*([^\n]{2,80})/i),
  });
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    unitRate: { type: 'number', description: 'Price per single unit of the requested material in INR, EXCLUDING GST' },
    quantity: { type: 'number', description: 'Quantity the supplier offers to supply, in the requested unit' },
    gstRate: { type: 'number', description: 'GST percentage applicable, e.g. 18' },
    freightCharges: { type: 'number', description: 'Total freight / transport charges in INR (0 if included or free)' },
    loadingCharges: { type: 'number', description: 'Total loading / unloading charges in INR (0 if included or free)' },
    totalPrice: { type: 'number', description: 'Grand total in INR including GST, freight and loading' },
    deliveryDays: { type: 'number', description: 'Delivery lead time in days from order' },
    promisedDeliveryDate: { type: 'string', description: 'Promised delivery date as YYYY-MM-DD, if a date is given' },
    validityDays: { type: 'number', description: 'How many days the quotation is valid' },
    paymentTerms: { type: 'string', description: 'Payment terms as a short phrase, e.g. "30 days credit" or "100% advance"' },
    warranty: { type: 'string', description: 'Warranty / guarantee offered, e.g. "12 months" or "Not applicable"' },
    remarks: { type: 'string', description: 'Any other important commercial conditions, one or two sentences' },
  },
};

export async function extractQuoteFields(opts: {
  ai: GoogleGenAI | null;
  model: string;
  buf: Buffer;
  kind: QuoteDocKind;
  context: { materialName: string; quantity: number; unit: string };
}): Promise<{ fields: ExtractedQuoteFields; method: 'ai' | 'patterns' | 'none' }> {
  const { ai, model, buf, kind, context } = opts;
  const isBinaryForAi = kind === 'pdf' || kind === 'png' || kind === 'jpeg' || kind === 'webp';
  const docText = isBinaryForAi ? '' : await extractDocumentText(buf, kind);

  if (ai && process.env.GEMINI_API_KEY) {
    try {
      const instruction = `You are reading a supplier's commercial quotation for a construction project in India.
The buyer requested: ${context.quantity} ${context.unit} of "${context.materialName}".
Extract the key commercial figures. The unit rate is the price per single ${context.unit}, excluding GST.
If a value is not present, omit that field. Do not guess or calculate values that are not stated, except:
- if freight or loading is stated as included/free, use 0.`;
      const parts: any[] = isBinaryForAi
        ? [{ inlineData: { mimeType: QUOTE_DOC_MIME[kind], data: buf.toString('base64') } }, { text: instruction }]
        : [{ text: `${instruction}\n\nQUOTATION:\n"""\n${docText.slice(0, 60000)}\n"""` }];

      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: { temperature: 0, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA as any },
      });
      const fields = normaliseFields(JSON.parse(response.text || '{}'));
      if (Object.keys(fields).length > 0) return { fields, method: 'ai' };
    } catch (err: any) {
      console.warn('[Quote Extraction] AI extraction failed, using pattern matching:', err?.message || err);
    }
  }

  const fallbackText = docText || (kind === 'pdf' ? await extractDocumentText(buf, 'pdf') : '');
  const fields = fallbackText ? extractWithPatterns(fallbackText) : {};
  return { fields, method: Object.keys(fields).length ? 'patterns' : 'none' };
}
