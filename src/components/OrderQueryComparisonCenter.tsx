import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiError, safeText, userMessage, UserFacingError } from '../lib/userError';
import {
  ProjectRequirement,
  Vendor,
  VendorQuotation,
  MarketPriceBenchmark,
  Project,
  User,
  Material,
  PurchaseOrderRecord,
  PurchaseOrderReceipt,
  InvoiceLineItem,
  ExtractedInvoice,
  MaterialVerification,
  VendorPerformance,
  NegotiationRound,
} from '../types';
import MaterialVerificationPanel, { newVerificationDraft, verificationError, verificationQuantities, VerificationDraft } from './MaterialVerificationPanel';
import { useVendorPerformance, displayRating } from '../lib/vendorPerformance';
import {
  getMarketBenchmark,
  calculateMarketDelta,
  rankAndScoreQuotes,
  landedCostPerUnit,
  parseCreditDays,
  EVALUATION_CRITERIA_TEXT,
} from '../lib/vendorComparison';
import {
  ArrowLeft,
  Search,
  Plus,
  FileText,
  CheckCircle2,
  Truck,
  CreditCard,
  Clock,
  ShieldCheck,
  Award,
  Package,
  Receipt,
  ChevronDown,
  ChevronRight,
  Mail,
  AlertTriangle,
  Loader2,
  X,
  ShoppingCart,
  Upload,
  Sparkles,
  CalendarClock,
  BellRing,
  Banknote,
  Handshake,
} from 'lucide-react';

/* Brand colours (app theme) */
const BRAND = '#23408e';

const SUBMISSION_METHOD_LABEL: Record<string, string> = {
  text: 'Submitted as text',
  pdf: 'Submitted as PDF',
  word: 'Submitted as Word document',
  'image-excel': 'Submitted as image / Excel',
  form: 'Entered by procurement team',
};

export interface DeliveryInput {
  receivedQty: number; // delivered by the vendor
  acceptedQty: number; // accepted after inspection (added to stock and invoiced)
  quality: MaterialVerification['quality'];
  checks: MaterialVerification['checks'];
  rejectionReason?: string;
  inspectedBy: string;
  receivedOn: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceTotal: number;
  notes: string;
  file?: { fileName: string; data: string };
  lineItems?: InvoiceLineItem[];
}

export interface DeliveryResult {
  ok: boolean;
  error?: string;
  receipt?: PurchaseOrderReceipt;
  stockUpdated?: boolean;
  materialCreated?: boolean;
  projectName?: string;
  estimationDelta?: number; // change in the project's estimation cost (Rs.)
}

interface OrderQueryComparisonCenterProps {
  prs: ProjectRequirement[];
  vendors: Vendor[];
  quotes: VendorQuotation[];
  marketBenchmarks: MarketPriceBenchmark[];
  projects: Project[];
  materials: Material[];
  currentUser: User;
  onOpenNewPR: () => void;
  onOpenSubmitQuote: (pr: ProjectRequirement) => void;
  /** A requirement changed on the server (sent for approval, approved, rejected) */
  onPrUpdated: (pr: ProjectRequirement) => void;
  /** Quotations changed on the server (counter-offer sent): re-read them */
  onQuotesChanged: () => void;
  /** A PO was issued on approval (refresh notifications etc.) */
  onPoIssued?: () => void;
  onRecordDelivery: (
    po: PurchaseOrderRecord,
    input: DeliveryInput
  ) => Promise<DeliveryResult>;
  poRefreshKey?: number;
  /** Manually retry the automatic PO for an awarded PR */
  onRetryPurchaseOrder: (prId: string, vendorId: string) => Promise<boolean>;
  /** Open a specific RFQ / purchase order (e.g. from a notification) */
  focusRequest?: { view: 'rfqs' | 'pos' | 'approvals'; prId?: string; poNumber?: string; nonce: number } | null;
}

/** Payment state of a recorded invoice */
function paymentInfo(r: PurchaseOrderReceipt): { label: string; className: string; urgent: boolean } {
  if (r.paymentStatus === 'Not applicable') return { label: 'Rejected - no invoice', className: 'bg-slate-100 text-slate-600 border-slate-200', urgent: false };
  if (r.paymentStatus === 'Paid') return { label: `Paid${r.paidOn ? ` ${fmtDate(r.paidOn)}` : ''}`, className: 'bg-emerald-50 text-emerald-800 border-emerald-200', urgent: false };
  if (!r.dueDate) return { label: 'Unpaid', className: 'bg-slate-100 text-slate-700 border-slate-200', urgent: false };
  const days = Math.round((Date.parse(`${r.dueDate}T12:00:00Z`) - Date.parse(`${todayIso()}T12:00:00Z`)) / 86400000);
  if (days < 0) return { label: `Overdue ${-days}d`, className: 'bg-rose-50 text-rose-800 border-rose-200', urgent: true };
  if (days === 0) return { label: 'Due today', className: 'bg-rose-50 text-rose-800 border-rose-200', urgent: true };
  if (days <= 2) return { label: `Due in ${days}d`, className: 'bg-amber-50 text-amber-800 border-amber-200', urgent: true };
  return { label: `Due in ${days}d`, className: 'bg-slate-100 text-slate-700 border-slate-200', urgent: false };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const rs = (n: number, digits = 0) => `Rs. ${n.toLocaleString('en-IN', { maximumFractionDigits: digits || 2, minimumFractionDigits: digits })}`;
const fmtDate = (v?: string) => {
  if (!v) return '—';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
/** Credit days of a PO (stored on new POs; parsed from the payment terms on older ones) */
const poCreditDays = (po: PurchaseOrderRecord) =>
  typeof po.creditDays === 'number' ? po.creditDays : parseCreditDays(po.paymentTerms || '');
const readAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });

const PR_STATUS_STYLE: Record<string, string> = {
  'Enquiry Sent': 'bg-slate-100 text-slate-700 border-slate-200',
  'Quotes Received': 'bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]',
  'Under Comparison': 'bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]',
  Shortlisted: 'bg-amber-50 text-amber-800 border-amber-200',
  Draft: 'bg-slate-100 text-slate-600 border-slate-200',
};
const DELIVERY_STYLE: Record<string, string> = {
  Pending: 'bg-amber-50 text-amber-800 border-amber-200',
  'Partially Received': 'bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]',
  Received: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${className}`}>{children}</span>;
}

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) {
  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
      <span className="text-[11px] text-slate-500">{hint}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Record Delivery & Invoice dialog                                    */
/* ------------------------------------------------------------------ */

function DeliveryDialog({
  po,
  projectName,
  inspectorName,
  onClose,
  onSubmit,
}: {
  po: PurchaseOrderRecord;
  projectName: string;
  inspectorName: string;
  onClose: () => void;
  onSubmit: (input: DeliveryInput) => Promise<{ ok: boolean; error?: string }>;
}) {
  const remaining = round2(po.orderedQty - po.receivedQty);
  const [deliveredQty, setDeliveredQty] = useState(String(remaining));
  const [verification, setVerification] = useState<VerificationDraft>(() => newVerificationDraft(inspectorName));
  const delivered = Number(deliveredQty) || 0;
  const { accepted } = verificationQuantities(verification, delivered);
  // Invoice and stock are for the accepted quantity only
  const qty = String(Number.isFinite(accepted) ? accepted : 0);
  const setQty = (v: string) => setVerification((d) => ({ ...d, acceptedQty: v }));
  const needsInvoice = Number(qty) > 0;
  const [receivedOn, setReceivedOn] = useState(todayIso());
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [invoiceTotal, setInvoiceTotal] = useState('');
  const [totalTouched, setTotalTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileData, setFileData] = useState<string>('');
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [reading, setReading] = useState(false);
  const [readResult, setReadResult] = useState<{ ok: boolean; text: string; warnings: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = Number(qty) || 0;
  const fraction = po.orderedQty > 0 ? q / po.orderedQty : 0;
  const base = round2(q * po.rate);
  const gst = round2((base * po.gstRate) / 100);
  const freight = round2(po.freightCharges * fraction);
  const loading = round2(po.loadingCharges * fraction);
  const computed = round2(base + gst + freight + loading);
  useEffect(() => {
    if (!totalTouched) setInvoiceTotal(computed > 0 ? String(computed) : '');
  }, [computed, totalTouched]);
  const variance = round2((Number(invoiceTotal) || 0) - computed);

  const creditDays = poCreditDays(po);
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) ? addDays(invoiceDate, creditDays) : '';
  const reminderOn = dueDate ? addDays(dueDate, -2) : '';

  /** Upload the vendor invoice: read it and fill the form automatically */
  const handleInvoiceFile = async (f: File | null) => {
    setFile(f);
    setFileData('');
    setReadResult(null);
    setLineItems([]);
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      setFile(null);
      return setReadResult({ ok: false, text: 'Invoice file is too large (max 10 MB).', warnings: [] });
    }
    setReading(true);
    try {
      const data = await readAsBase64(f);
      setFileData(data);
      const res = await fetch(`/api/purchase-orders/${encodeURIComponent(po.poNumber)}/invoice/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: f.name, data }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw apiError(json, 'Could not read the invoice.');
      const inv: ExtractedInvoice = json.invoice;
      const filled: string[] = [];
      const warnings: string[] = [];
      if (inv.invoiceNumber) { setInvoiceNumber(inv.invoiceNumber); filled.push('invoice number'); }
      if (inv.invoiceDate) { setInvoiceDate(inv.invoiceDate); filled.push('invoice date'); }
      const items = inv.lineItems || [];
      setLineItems(items);
      if (items.length) filled.push(`${items.length} line item${items.length === 1 ? '' : 's'}`);
      const materialQty = inv.materialQuantity || (items.length === 1 ? items[0].quantity : undefined);
      if (materialQty) {
        setDeliveredQty(String(materialQty));
        filled.push('quantity');
        if (materialQty > remaining + 1e-6) warnings.push(`Invoice quantity (${materialQty} ${po.unit}) is more than the ${remaining} ${po.unit} pending on this PO.`);
      }
      if (inv.invoiceTotal) { setTotalTouched(true); setInvoiceTotal(String(inv.invoiceTotal)); filled.push('invoice amount'); }
      if (inv.poReference && inv.poReference.toUpperCase() !== po.poNumber.toUpperCase()) {
        warnings.push(`The invoice quotes ${inv.poReference}, not ${po.poNumber}.`);
      }
      if (inv.vendorGstin && po.vendorGstin && inv.vendorGstin !== po.vendorGstin.toUpperCase()) {
        warnings.push(`Supplier GSTIN on the invoice (${inv.vendorGstin}) differs from the vendor's GSTIN (${po.vendorGstin}).`);
      }
      setReadResult(
        filled.length
          ? { ok: true, text: `Filled automatically from the invoice: ${filled.join(', ')}. Please check before saving.`, warnings }
          : { ok: false, text: 'Could not read details from this invoice. Please fill in the fields below.', warnings }
      );
    } catch (err: any) {
      setReadResult({ ok: false, text: `${userMessage(err, 'Could not read the invoice.')} The file will still be attached; please fill in the fields below.`, warnings: [] });
    } finally {
      setReading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const vError = verificationError(verification, delivered);
    if (vError) return setError(vError);
    if (q > remaining + 1e-6) return setError(`Only ${remaining} ${po.unit} is pending on this PO. Accepted quantity cannot be more.`);
    if (needsInvoice && !invoiceNumber.trim()) return setError('Please enter the vendor invoice number.');
    if (needsInvoice && !(Number(invoiceTotal) > 0)) return setError('Please enter the invoice amount.');
    setBusy(true);
    setError(null);
    let filePayload: DeliveryInput['file'];
    try {
      if (file && needsInvoice) filePayload = { fileName: file.name, data: fileData || (await readAsBase64(file)) };
    } catch {
      setBusy(false);
      return setError('Could not read the invoice file.');
    }
    const result = await onSubmit({
      receivedQty: delivered,
      acceptedQty: q,
      quality: verification.quality,
      checks: verification.checks,
      ...(delivered - q > 0 ? { rejectionReason: verification.rejectionReason.trim() } : {}),
      inspectedBy: verification.inspectedBy.trim(),
      receivedOn,
      invoiceNumber: needsInvoice ? invoiceNumber.trim() : '',
      invoiceDate,
      invoiceTotal: needsInvoice ? Number(invoiceTotal) : 0,
      notes: [notes.trim(), verification.remarks.trim() && `Inspection: ${verification.remarks.trim()}`].filter(Boolean).join(' | '),
      file: filePayload,
      ...(lineItems.length && needsInvoice ? { lineItems } : {}),
    });
    setBusy(false);
    if (!result.ok) setError(safeText(result.error, 'Could not record the delivery. Please try again.'));
  };

  const field = 'w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#23408e]/30 focus:border-[#23408e]';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <form onSubmit={submit} noValidate role="dialog" aria-label="Record delivery and invoice" className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Record Delivery, Inspection &amp; Invoice</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {po.poNumber} • {po.materialName} • {po.vendorName} • Pending: <strong>{remaining} {po.unit}</strong>
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {/* 1. Upload vendor invoice -> auto-fill */}
          <div className="rounded-xl border-2 border-dashed border-[#c9d6f2] bg-[#f5f8fd] p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#23408e] text-white flex items-center justify-center shrink-0">
                {reading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">Upload vendor invoice</p>
                <p className="text-xs text-slate-500">
                  PDF or photo (JPG, PNG, WEBP), max 10 MB. Invoice number, date, line items, quantity and amount are filled in automatically.
                </p>
                {file && <p className="text-xs text-[#23408e] font-medium mt-1 truncate">{file.name} ({Math.round(file.size / 1024)} KB)</p>}
              </div>
              <label className="px-4 py-2 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold cursor-pointer inline-flex items-center gap-2 shrink-0">
                <Upload size={15} /> {file ? 'Change file' : 'Choose invoice'}
                <input
                  id="dl-file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                  className="sr-only"
                  disabled={reading}
                  onChange={(e) => { handleInvoiceFile(e.target.files?.[0] || null); e.target.value = ''; }}
                />
              </label>
            </div>
            {reading && <p className="text-xs text-[#23408e] mt-3 inline-flex items-center gap-1.5"><Sparkles size={13} /> Reading the invoice…</p>}
            {readResult && (
              <div className="mt-3 space-y-1">
                <p className={`text-xs inline-flex items-start gap-1.5 ${readResult.ok ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {readResult.ok ? <Sparkles size={13} className="mt-0.5 shrink-0" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0" />}
                  <span id="dl-read-result">{readResult.text}</span>
                </p>
                {readResult.warnings.map((w) => (
                  <p key={w} className="text-xs text-amber-700 flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {w}</p>
                ))}
              </div>
            )}
          </div>

          {lineItems.length > 0 && (
            <div className="rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-xs" aria-label="Invoice line items">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-500">
                    <th className="px-3 py-2 font-semibold">#</th>
                    <th className="px-3 py-2 font-semibold">Description</th>
                    <th className="px-3 py-2 font-semibold">HSN</th>
                    <th className="px-3 py-2 font-semibold text-right">Qty</th>
                    <th className="px-3 py-2 font-semibold text-right">Rate</th>
                    <th className="px-3 py-2 font-semibold text-right">GST</th>
                    <th className="px-3 py-2 font-semibold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 text-slate-500">{i + 1}</td>
                      <td className="px-3 py-1.5 text-slate-900">{li.description}</td>
                      <td className="px-3 py-1.5 text-slate-600">{li.hsn || '—'}</td>
                      <td className="px-3 py-1.5 text-right">{li.quantity ?? '—'} {li.unit || ''}</td>
                      <td className="px-3 py-1.5 text-right">{li.rate !== undefined ? rs(li.rate) : '—'}</td>
                      <td className="px-3 py-1.5 text-right">{li.gstRate !== undefined ? `${li.gstRate}%` : '—'}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{li.amount !== undefined ? rs(li.amount) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-slate-700">
              Quantity delivered ({po.unit}) *
              <input id="dl-qty" type="number" min="0" step="any" value={deliveredQty} onChange={(e) => setDeliveredQty(e.target.value)} className={`${field} mt-1`} />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Received on *
              <input id="dl-received" type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} className={`${field} mt-1`} />
              {po.deliveryByIso && receivedOn > po.deliveryByIso && (
                <span className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                  <AlertTriangle size={12} /> Late by {Math.round((Date.parse(`${receivedOn}T12:00:00Z`) - Date.parse(`${po.deliveryByIso}T12:00:00Z`)) / 86400000)} day(s) - counts in the vendor's rating
                </span>
              )}
            </label>
          </div>

          <MaterialVerificationPanel idPrefix="dl-verify" unit={po.unit} delivered={delivered} value={verification} onChange={setVerification} />

          {!needsInvoice ? (
            <p className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              The whole delivery is rejected: nothing is added to stock and no invoice or payment is recorded. The vendor is emailed to replace the material, and the quantity stays pending on {po.poNumber}.
            </p>
          ) : (
          <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-slate-700">
              Vendor invoice number *
              <input id="dl-invoice" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} maxLength={60} className={`${field} mt-1`} />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Invoice date *
              <input id="dl-invoice-date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={`${field} mt-1`} />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl bg-[#f5f8fd] border border-[#d9e3f5] p-4 text-sm">
              <p className="font-semibold text-[#23408e] mb-2">Invoice amount as per {po.poNumber}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-700">
                <span>Material ({q} × {rs(po.rate)})</span><span className="text-right">{rs(base)}</span>
                <span>GST @ {po.gstRate}%</span><span className="text-right">{rs(gst)}</span>
                <span>Freight share</span><span className="text-right">{rs(freight)}</span>
                <span>Loading share</span><span className="text-right">{rs(loading)}</span>
                <span className="font-semibold text-slate-900 border-t border-[#d9e3f5] pt-1">Expected total</span>
                <span className="text-right font-semibold text-slate-900 border-t border-[#d9e3f5] pt-1">{rs(computed)}</span>
              </div>
            </div>
            <div className="rounded-xl bg-amber-50/60 border border-amber-200 p-4 text-sm" id="dl-due">
              <p className="font-semibold text-amber-900 mb-2 inline-flex items-center gap-1.5"><CalendarClock size={15} /> Payment due date</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-700">
                <span>Payment terms</span><span className="text-right">{po.paymentTerms || 'Not specified'}</span>
                <span>Credit period</span><span className="text-right">{creditDays > 0 ? `${creditDays} days from invoice` : 'Due on invoice date'}</span>
                <span className="font-semibold text-slate-900 border-t border-amber-200 pt-1">Due on</span>
                <span className="text-right font-semibold text-slate-900 border-t border-amber-200 pt-1">{dueDate ? fmtDate(dueDate) : '—'}</span>
              </div>
              <p className="text-xs text-amber-800 mt-2 inline-flex items-start gap-1.5">
                <BellRing size={13} className="mt-0.5 shrink-0" />
                Reminder email &amp; notification on {reminderOn ? fmtDate(reminderOn) : '—'} (2 days before).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-slate-700">
              Invoice amount as per vendor bill (Rs.) *
              <input id="dl-total" type="number" min="0" step="any" value={invoiceTotal}
                onChange={(e) => { setTotalTouched(true); setInvoiceTotal(e.target.value); }} className={`${field} mt-1`} />
              {Math.abs(variance) > 1 && (
                <span className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                  <AlertTriangle size={12} /> Differs from PO terms by {rs(variance)}
                </span>
              )}
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Notes
              <input id="dl-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="e.g. Vehicle MH12 AB 1234" className={`${field} mt-1`} />
            </label>
          </div>
          <p className="text-xs text-slate-500">
            On saving: a GRN number is assigned, <strong>{q || 0} {po.unit}</strong> (accepted) is added to the {projectName} stock, the project estimation cost is updated, the bill is filed
            under <strong>GST &amp; URD Bills</strong>, and the payment reminder is scheduled.
            {delivered - q > 0 && <> The rejected {round2(delivered - q)} {po.unit} stays pending and the vendor is emailed to replace it.</>}
          </p>
          </>
          )}
          {error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-200 cursor-pointer">Cancel</button>
          <button type="submit" disabled={busy || reading} className="px-5 py-2 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold disabled:opacity-60 cursor-pointer inline-flex items-center gap-2">
            {busy && <Loader2 size={15} className="animate-spin" />} Save Delivery &amp; Invoice
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function OrderQueryComparisonCenter({
  prs,
  vendors,
  quotes,
  marketBenchmarks,
  currentUser,
  onOpenNewPR,
  onOpenSubmitQuote,
  onPrUpdated,
  onQuotesChanged,
  onPoIssued,
  onRecordDelivery,
  poRefreshKey = 0,
  onRetryPurchaseOrder,
  focusRequest,
  projects,
  materials,
}: OrderQueryComparisonCenterProps) {
  const isApprover = currentUser.role === 'approver';
  const [view, setView] = useState<'rfqs' | 'approvals' | 'pos'>(isApprover ? 'approvals' : 'rfqs');
  const { byVendor: vendorPerf, refresh: refreshVendorPerf } = useVendorPerformance();
  const [approvalDialog, setApprovalDialog] = useState<{ pr: ProjectRequirement; quote: VendorQuotation } | null>(null);
  const [negotiateDialog, setNegotiateDialog] = useState<{ pr: ProjectRequirement; quote: VendorQuotation; peers: VendorQuotation[] } | null>(null);
  const [decision, setDecision] = useState<{ pr: ProjectRequirement; kind: 'approve' | 'reject' } | null>(null);
  const [selectedPrId, setSelectedPrId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRecord[]>([]);
  const [loadingPos, setLoadingPos] = useState(false);
  const [expandedPo, setExpandedPo] = useState<string | null>(null);
  const [deliveryPo, setDeliveryPo] = useState<PurchaseOrderRecord | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const loadPurchaseOrders = useCallback(async () => {
    setLoadingPos(true);
    try {
      const res = await fetch('/api/purchase-orders');
      const json = await res.json();
      if (json?.success) setPurchaseOrders(json.purchaseOrders || []);
    } catch {
      // keep the previous list
    } finally {
      setLoadingPos(false);
    }
  }, []);
  useEffect(() => {
    loadPurchaseOrders();
  }, [loadPurchaseOrders, poRefreshKey]);

  // Jump to the RFQ / PO a notification points to
  useEffect(() => {
    if (!focusRequest) return;
    setView(focusRequest.view);
    if (focusRequest.view === 'rfqs') {
      const pr = focusRequest.prId ? prs.find((p) => p.id === focusRequest.prId) : undefined;
      setSelectedPrId(pr && !['Awarded', 'Closed', 'Pending Approval'].includes(pr.status) ? pr.id : null);
    } else if (focusRequest.view === 'approvals') {
      setSelectedPrId(null);
    } else {
      setSelectedPrId(null);
      if (focusRequest.poNumber) setExpandedPo(focusRequest.poNumber);
      loadPurchaseOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.nonce]);

  const [payingId, setPayingId] = useState<string | null>(null);
  const markPaid = async (po: PurchaseOrderRecord, r: PurchaseOrderReceipt) => {
    const reference = window.prompt(
      `Mark invoice ${r.invoiceNumber} (${rs(r.invoiceTotal)}) to ${po.vendorName} as paid?\n\nPayment reference (UTR / cheque no., optional):`,
      ''
    );
    if (reference === null) return;
    setPayingId(r.id);
    try {
      const res = await fetch(`/api/purchase-orders/${encodeURIComponent(po.poNumber)}/receipts/${encodeURIComponent(r.id)}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paidOn: todayIso(), reference, paidBy: currentUser.name }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw apiError(json, 'Could not record the payment. Please try again.');
      setNotice(`Invoice ${r.invoiceNumber} marked as paid. No further reminders will be sent.`);
      loadPurchaseOrders();
    } catch (err: any) {
      alert(userMessage(err, 'Could not record the payment. Please check your internet connection and try again.'));
    } finally {
      setPayingId(null);
    }
  };

  /** POST to the API; returns the JSON or throws a user-facing error */
  const postJson = async (url: string, body: any, fallback: string) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw apiError(json, fallback);
    return json;
  };

  const requestApproval = async (pr: ProjectRequirement, quote: VendorQuotation, note: string) => {
    const json = await postJson(
      '/api/approvals/request',
      { prId: pr.id, vendorId: quote.vendorId, requestedBy: currentUser.name, note, pr },
      'Could not send this order for approval. Please try again.'
    );
    onPrUpdated(json.pr);
    setSelectedPrId(null);
    setView('approvals');
    setNotice(`${pr.id} sent for approval: ${quote.vendorName} at ${rs(quote.totalAmount)}. The PO is issued as soon as it is approved.`);
  };

  const decideApproval = async (pr: ProjectRequirement, kind: 'approve' | 'reject', comment: string) => {
    const json = await postJson(
      '/api/approvals/decide',
      { prId: pr.id, decision: kind, comment, decidedBy: currentUser.name },
      'Could not record your decision. Please try again.'
    );
    onPrUpdated(json.pr);
    if (kind === 'approve') {
      setNotice(
        json.purchaseOrder
          ? `Approved. Purchase order ${json.purchaseOrder.poNumber} was generated${json.purchaseOrder.emailStatus === 'sent' ? ` and emailed to ${json.purchaseOrder.emailedTo}` : ''}.`
          : `Approved. ${safeText(json.poError, 'The purchase order could not be generated - use "Retry PO" under Purchase Orders.')}`
      );
      loadPurchaseOrders();
      onPoIssued?.();
      refreshVendorPerf();
    } else {
      setNotice(`${pr.id} was not approved. It is back with the purchase team for comparison.`);
    }
  };

  const sendOffer = async (pr: ProjectRequirement, quote: VendorQuotation, targetRate: number, note: string) => {
    const json = await postJson(
      '/api/negotiations/offer',
      { prId: pr.id, vendorId: quote.vendorId, targetRate, note, byName: currentUser.name },
      'Could not send the counter-offer. Please try again.'
    );
    onQuotesChanged();
    setNotice(
      json.emailed
        ? `Counter-offer of ${rs(targetRate)} / ${quote.unit} emailed to ${quote.vendorName}. You will be notified when they reply.`
        : `Counter-offer of ${rs(targetRate)} / ${quote.unit} recorded, but ${quote.vendorName} could not be emailed. Please share it with them.`
    );
  };

  // Open RFQs = not yet sent for approval / awarded / closed. Awarded RFQs move to Purchase Orders.
  const openPrs = useMemo(() => prs.filter((p) => !['Awarded', 'Closed', 'Pending Approval'].includes(p.status)), [prs]);
  const approvalPrs = useMemo(() => prs.filter((p) => p.status === 'Pending Approval'), [prs]);
  const decidedApprovals = useMemo(
    () =>
      prs
        .filter((p) => p.approval && p.approval.status !== 'Pending')
        .sort((a, b) => String(b.approval?.decidedAt).localeCompare(String(a.approval?.decidedAt)))
        .slice(0, 15),
    [prs]
  );
  const awardedWithoutPo = useMemo(() => prs.filter((p) => p.status === 'Awarded' && !p.purchaseOrder && p.selectedVendorId), [prs]);
  const quotesByPr = useMemo(() => {
    const map = new Map<string, VendorQuotation[]>();
    for (const q of quotes) map.set(q.prId, [...(map.get(q.prId) || []), q]);
    return map;
  }, [quotes]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return openPrs
      .filter((p) => !term || [p.materialName, p.id, p.projectName].some((s) => s.toLowerCase().includes(term)))
      .map((pr) => {
        const prQuotes = (quotesByPr.get(pr.id) || []).filter((q) => q.status !== 'Declined');
        const best = prQuotes.length ? Math.min(...prQuotes.map(landedCostPerUnit)) : null;
        return { pr, received: prQuotes.length, invited: pr.invitedVendorIds.length, best };
      })
      .sort((a, b) => a.pr.materialName.localeCompare(b.pr.materialName));
  }, [openPrs, quotesByPr, search]);

  const selectedPr = selectedPrId ? prs.find((p) => p.id === selectedPrId) || null : null;
  // If the selected RFQ gets sent for approval or awarded, leave the detail view
  useEffect(() => {
    if (selectedPr && ['Awarded', 'Closed', 'Pending Approval'].includes(selectedPr.status)) setSelectedPrId(null);
  }, [selectedPr]);

  const kpiOpenQuotes = openPrs.reduce((s, p) => s + (quotesByPr.get(p.id) || []).filter((q) => q.status !== 'Declined').length, 0);
  const pendingDelivery = purchaseOrders.filter((p) => p.deliveryStatus !== 'Received').length;
  const invoiced = purchaseOrders.reduce((s, p) => s + (p.invoicedAmount || 0), 0);
  const unpaidReceipts = purchaseOrders.flatMap((p) => p.receipts.filter((r) => r.paymentStatus === 'Unpaid'));
  const unpaidTotal = unpaidReceipts.reduce((s, r) => s + (r.invoiceTotal || 0), 0);

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#23408e] text-white flex items-center justify-center">
            <ShoppingCart size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Order Queries &amp; Quotes</h1>
            <p className="text-xs text-slate-500">
              {isApprover
                ? 'Review the vendors selected by the purchase team and approve or reject them. Approved orders are issued as purchase orders immediately.'
                : 'Request quotations, compare and negotiate, send for approval, and track purchase orders & invoices.'}
            </p>
          </div>
        </div>
        {!isApprover && (
          <button onClick={onOpenNewPR} className="px-4 py-2.5 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer">
            <Plus size={16} /> Raise New Order Query / PR
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isApprover ? (
          <Kpi label="Awaiting Approval" value={approvalPrs.length} hint={approvalPrs.length ? rs(approvalPrs.reduce((s, p) => s + (p.approval?.amount || 0), 0), 0) : 'Nothing waiting'} />
        ) : (
          <Kpi label="Open RFQs" value={openPrs.length} hint={approvalPrs.length ? `${approvalPrs.length} awaiting approval` : 'Awaiting quotes / comparison'} />
        )}
        <Kpi label="Quotes Received" value={kpiOpenQuotes} hint="On open RFQs" />
        <Kpi label="Purchase Orders" value={purchaseOrders.length} hint={`${pendingDelivery} awaiting delivery`} />
        <Kpi label="Invoiced" value={rs(invoiced, 0)} hint={unpaidReceipts.length ? `${rs(unpaidTotal, 0)} unpaid (${unpaidReceipts.length} invoice${unpaidReceipts.length === 1 ? '' : 's'})` : 'Against purchase orders'} />
      </div>

      {notice && (
        <div role="status" className="flex items-start justify-between gap-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-lg px-4 py-2.5">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="text-emerald-700 cursor-pointer"><X size={15} /></button>
        </div>
      )}

      {/* Tabs */}
      {!selectedPr && (
        <div className="flex items-center gap-1 border-b border-slate-200" role="tablist">
          {(
            [
              ['rfqs', `Open RFQs (${openPrs.length})`],
              ['approvals', `Approvals${approvalPrs.length ? ` (${approvalPrs.length})` : ''}`],
              ['pos', `Purchase Orders (${purchaseOrders.length + awardedWithoutPo.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px cursor-pointer ${
                view === id ? 'border-[#23408e] text-[#23408e]' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ---------------- RFQ detail: quote comparison ---------------- */}
      {selectedPr ? (
        <RfqDetail
          pr={selectedPr}
          quotes={quotesByPr.get(selectedPr.id) || []}
          vendors={vendors}
          benchmark={getMarketBenchmark(selectedPr.materialCode, marketBenchmarks)}
          onBack={() => setSelectedPrId(null)}
          onAddLocalQuote={() => onOpenSubmitQuote(selectedPr)}
          readOnly={isApprover}
          vendorPerf={vendorPerf}
          onSendForApproval={(quote) => setApprovalDialog({ pr: selectedPr, quote })}
          onNegotiate={(quote, peers) => setNegotiateDialog({ pr: selectedPr, quote, peers })}
        />
      ) : view === 'approvals' ? (
        <ApprovalsView
          pending={approvalPrs}
          decided={decidedApprovals}
          quotesByPr={quotesByPr}
          benchmarks={marketBenchmarks}
          vendorPerf={vendorPerf}
          isApprover={isApprover}
          onDecide={(pr, kind) => setDecision({ pr, kind })}
        />
      ) : view === 'rfqs' ? (
        /* ---------------- Open RFQs table ---------------- */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
            <Search size={16} className="text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by product, RFQ number or project"
              aria-label="Search RFQs"
              className="flex-1 text-sm py-1 focus:outline-hidden"
            />
          </div>
          {rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              {openPrs.length === 0 ? 'No open RFQs. Use "Raise New Order Query / PR" to request quotations.' : 'No RFQs match your search.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#23408e] text-white text-left text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 font-semibold">Product</th>
                    <th className="px-4 py-3 font-semibold">RFQ / PR</th>
                    <th className="px-4 py-3 font-semibold">Project</th>
                    <th className="px-4 py-3 font-semibold text-right">Quantity</th>
                    <th className="px-4 py-3 font-semibold">Required By</th>
                    <th className="px-4 py-3 font-semibold">Quote Deadline</th>
                    <th className="px-4 py-3 font-semibold text-center">Quotes</th>
                    <th className="px-4 py-3 font-semibold text-right">Best Landed Price</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-2 py-3" aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ pr, received, invited, best }) => {
                    const deadlinePassed = pr.quoteDeadline ? Date.parse(pr.quoteDeadline) < Date.now() : false;
                    return (
                      <tr
                        key={pr.id}
                        onClick={() => setSelectedPrId(pr.id)}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelectedPrId(pr.id)}
                        tabIndex={0}
                        role="button"
                        aria-label={`Open comparison for ${pr.materialName} (${pr.id})`}
                        className="border-b border-slate-100 last:border-0 hover:bg-[#f5f8fd] cursor-pointer focus:outline-hidden focus:bg-[#eaf0fb]"
                      >
                        <td className="px-4 py-3 font-semibold text-slate-900">{pr.materialName}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{pr.id}</td>
                        <td className="px-4 py-3 text-slate-600">{pr.projectName}</td>
                        <td className="px-4 py-3 text-right text-slate-800">{pr.quantity.toLocaleString('en-IN')} {pr.unit}</td>
                        <td className="px-4 py-3 text-slate-600">{fmtDate(pr.requiredDate)}</td>
                        <td className={`px-4 py-3 ${deadlinePassed ? 'text-rose-700' : 'text-slate-600'}`}>
                          {pr.quoteDeadline ? `${fmtDate(pr.quoteDeadline)}${deadlinePassed ? ' (closed)' : ''}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-semibold ${received ? 'text-[#23408e]' : 'text-slate-400'}`}>{received}</span>
                          <span className="text-slate-400"> / {invited}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-800">{best !== null ? `${rs(Math.round(best * 100) / 100)} / ${pr.unit}` : '—'}</td>
                        <td className="px-4 py-3">
                          <Pill className={PR_STATUS_STYLE[pr.status] || PR_STATUS_STYLE.Draft}>{pr.status}</Pill>
                          {pr.approval?.status === 'Rejected' && (
                            <div className="mt-1"><Pill className="bg-rose-50 text-rose-800 border-rose-200">Approval rejected</Pill></div>
                          )}
                          {(quotesByPr.get(pr.id) || []).some((q) => q.negotiation?.status === 'Offered' || q.negotiation?.status === 'Countered') && (
                            <div className="mt-1"><Pill className="bg-violet-50 text-violet-800 border-violet-200">Negotiating</Pill></div>
                          )}
                        </td>
                        <td className="px-2 py-3 text-slate-400"><ChevronRight size={16} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* ---------------- Purchase orders tracking ---------------- */
        <div className="space-y-4">
          {awardedWithoutPo.length > 0 && (
            <div className="bg-[#f5f8fd] border border-[#d9e3f5] rounded-xl p-4">
              {awardedWithoutPo.map((pr) => {
                const q = (quotesByPr.get(pr.id) || []).find((x) => x.vendorId === pr.selectedVendorId);
                const busy = retrying === pr.id;
                return (
                  <div key={pr.id} className="flex flex-wrap items-center justify-between gap-2 py-1 text-sm">
                    <span className="text-slate-800 inline-flex items-center gap-2">
                      <Loader2 size={15} className="animate-spin text-[#23408e]" />
                      Generating and emailing the purchase order for <strong>{pr.materialName}</strong> ({pr.id}) to {q?.vendorName || pr.selectedVendorId}…
                    </span>
                    <button
                      onClick={async () => {
                        setRetrying(pr.id);
                        await onRetryPurchaseOrder(pr.id, pr.selectedVendorId!);
                        setRetrying(null);
                        loadPurchaseOrders();
                      }}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-lg border border-[#23408e] text-[#23408e] hover:bg-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
                      title="Use this if the purchase order was not generated automatically"
                    >
                      <FileText size={13} /> Retry PO
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {loadingPos && purchaseOrders.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500 inline-flex w-full justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading purchase orders…</div>
            ) : purchaseOrders.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No purchase orders yet. A PO is generated and emailed to the vendor when you award an RFQ.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#23408e] text-white text-left text-xs uppercase tracking-wide">
                      <th className="px-2 py-3" aria-label="Expand" />
                      <th className="px-3 py-3 font-semibold">PO Number</th>
                      <th className="px-3 py-3 font-semibold">Product</th>
                      <th className="px-3 py-3 font-semibold">Vendor</th>
                      <th className="px-3 py-3 font-semibold text-right">PO Value</th>
                      <th className="px-3 py-3 font-semibold">Delivery By</th>
                      <th className="px-3 py-3 font-semibold">Received</th>
                      <th className="px-3 py-3 font-semibold text-right">Invoiced</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseOrders.map((po) => {
                      const pct = po.orderedQty ? Math.min(100, (po.receivedQty / po.orderedQty) * 100) : 0;
                      const open = expandedPo === po.poNumber;
                      return (
                        <React.Fragment key={po.poNumber}>
                          <tr className="border-b border-slate-100 align-top">
                            <td className="px-2 py-3">
                              <button onClick={() => setExpandedPo(open ? null : po.poNumber)} aria-label={open ? 'Hide invoices' : 'Show invoices'} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                                {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              </button>
                            </td>
                            <td className="px-3 py-3">
                              <a href={`/api/purchase-orders/${encodeURIComponent(po.poNumber)}/pdf`} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#23408e] hover:underline">
                                {po.poNumber}
                              </a>
                              <div className="text-[11px] text-slate-500">{fmtDate(po.issuedAt)} • {po.prId}</div>
                              <div className="text-[11px] mt-0.5 inline-flex items-center gap-1">
                                <Mail size={11} className={po.emailStatus === 'sent' ? 'text-emerald-600' : 'text-amber-600'} />
                                <span className={po.emailStatus === 'sent' ? 'text-emerald-700' : 'text-amber-700'}>
                                  {po.emailStatus === 'sent' ? `Emailed to ${po.emailedTo}` : po.emailStatus === 'failed' ? 'Email failed — send manually' : po.emailStatus === 'sending' ? 'Sending email…' : 'No vendor email'}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="font-medium text-slate-900">{po.materialName}</div>
                              <div className="text-[11px] text-slate-500">{po.projectName}</div>
                            </td>
                            <td className="px-3 py-3 text-slate-700">{po.vendorName}</td>
                            <td className="px-3 py-3 text-right font-medium text-slate-900">{rs(po.grandTotal, 0)}</td>
                            <td className="px-3 py-3 text-slate-600">
                              {po.deliveryBy}
                              {(() => {
                                if (po.deliveryStatus === 'Received' || !po.deliveryByIso) return null;
                                const days = Math.round((Date.parse(`${po.deliveryByIso}T12:00:00Z`) - Date.parse(`${todayIso()}T12:00:00Z`)) / 86400000);
                                const last = (po.deliveryFollowUps || []).slice(-1)[0];
                                return (
                                  <>
                                    {days < 0 && <div className="text-[11px] font-semibold text-rose-700">Overdue {-days}d</div>}
                                    {days === 0 && <div className="text-[11px] font-semibold text-amber-700">Due today</div>}
                                    {last && (
                                      <div className="text-[10px] text-slate-500 inline-flex items-center gap-1" title="Automatic delivery follow-up to the vendor">
                                        <BellRing size={10} /> {last.type === 'overdue' ? 'Overdue alert' : 'Reminder'} {last.emailed ? 'emailed' : 'not emailed'} {fmtDate(last.at)}
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </td>
                            <td className="px-3 py-3 min-w-[140px]">
                              <div className="text-xs text-slate-700">{po.receivedQty} / {po.orderedQty} {po.unit}</div>
                              <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full bg-[#23408e]" style={{ width: `${pct}%` }} />
                              </div>
                              {(po.rejectedQty || 0) > 0 && <div className="text-[11px] text-rose-700 mt-0.5">{po.rejectedQty} {po.unit} rejected</div>}
                            </td>
                            <td className="px-3 py-3 text-right text-slate-800">
                              {rs(po.invoicedAmount || 0, 0)}
                              <div className="text-[11px] text-slate-500">{po.receipts.length} invoice{po.receipts.length === 1 ? '' : 's'}</div>
                              {(() => {
                                const next = po.receipts
                                  .filter((r) => r.paymentStatus === 'Unpaid' && r.dueDate)
                                  .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
                                if (!next) return null;
                                const info = paymentInfo(next);
                                return (
                                  <div className={`text-[11px] mt-0.5 font-semibold ${info.urgent ? 'text-rose-700' : 'text-slate-600'}`}>
                                    Next due {fmtDate(next.dueDate)}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="px-3 py-3"><Pill className={DELIVERY_STYLE[po.deliveryStatus]}>{po.deliveryStatus}</Pill></td>
                            <td className="px-3 py-3">
                              {isApprover ? (
                                <span className="text-xs text-slate-500">{po.approvedBy ? `Approved by ${po.approvedBy}` : '—'}</span>
                              ) : po.deliveryStatus !== 'Received' ? (
                                <button
                                  onClick={() => setDeliveryPo(po)}
                                  className="px-3 py-1.5 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                                >
                                  <Truck size={13} /> Record Delivery &amp; Inspection
                                </button>
                              ) : (
                                <span className="text-xs text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 size={13} /> Fully received</span>
                              )}
                            </td>
                          </tr>
                          {open && (
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <td />
                              <td colSpan={9} className="px-3 py-3">
                                {po.receipts.length === 0 ? (
                                  <p className="text-xs text-slate-500">No deliveries or invoices recorded yet.</p>
                                ) : (
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-left text-slate-500">
                                        <th className="py-1 pr-3 font-semibold">GRN / Received</th>
                                        <th className="py-1 pr-3 font-semibold">Inspection</th>
                                        <th className="py-1 pr-3 font-semibold text-right">Accepted</th>
                                        <th className="py-1 pr-3 font-semibold">Invoice No.</th>
                                        <th className="py-1 pr-3 font-semibold">Invoice Date</th>
                                        <th className="py-1 pr-3 font-semibold text-right">As per PO</th>
                                        <th className="py-1 pr-3 font-semibold text-right">Invoice Amount</th>
                                        <th className="py-1 pr-3 font-semibold">Due Date</th>
                                        <th className="py-1 pr-3 font-semibold">Payment</th>
                                        <th className="py-1 pr-3 font-semibold">Recorded By</th>
                                        <th className="py-1 font-semibold">Copy</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {po.receipts.map((r) => {
                                        const pay = paymentInfo(r);
                                        return (
                                        <React.Fragment key={r.id}>
                                        <tr className="border-t border-slate-200 align-top">
                                          <td className="py-1.5 pr-3 whitespace-nowrap">
                                            {r.grnNumber && <div className="font-semibold text-slate-800">{r.grnNumber}</div>}
                                            {fmtDate(r.receivedOn)}
                                            {r.onTime === false && <div className="text-[10px] font-semibold text-amber-700">Late</div>}
                                          </td>
                                          <td className="py-1.5 pr-3 min-w-[130px]">
                                            {r.quality ? (
                                              <>
                                                <Pill className={r.quality === 'Good' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : r.quality === 'Acceptable' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-rose-50 text-rose-800 border-rose-200'}>
                                                  {r.quality}
                                                </Pill>
                                                {(r.rejectedQty || 0) > 0 && (
                                                  <div className="text-[10px] text-rose-700 mt-0.5" title={r.rejectionReason}>
                                                    {r.rejectedQty} of {r.deliveredQty} {po.unit} rejected: {r.rejectionReason}
                                                  </div>
                                                )}
                                                {r.inspectedBy && <div className="text-[10px] text-slate-500">By {r.inspectedBy}</div>}
                                              </>
                                            ) : (
                                              <span className="text-slate-400">—</span>
                                            )}
                                          </td>
                                          <td className="py-1.5 pr-3 text-right">{r.receivedQty} {po.unit}</td>
                                          <td className="py-1.5 pr-3 font-medium">{r.invoiceNumber || '—'}</td>
                                          <td className="py-1.5 pr-3">{r.invoiceDate ? fmtDate(r.invoiceDate) : '—'}</td>
                                          <td className="py-1.5 pr-3 text-right">{r.invoiceTotal ? rs(r.computedTotal) : '—'}</td>
                                          <td className={`py-1.5 pr-3 text-right ${Math.abs(r.variance) > 1 ? 'text-amber-700 font-semibold' : ''}`}>
                                            {r.invoiceTotal ? rs(r.invoiceTotal) : '—'}{Math.abs(r.variance) > 1 ? ` (${r.variance > 0 ? '+' : ''}${rs(r.variance)})` : ''}
                                          </td>
                                          <td className="py-1.5 pr-3 whitespace-nowrap">
                                            {r.dueDate ? fmtDate(r.dueDate) : '—'}
                                            {r.paymentTerms && r.dueDate && <div className="text-[10px] text-slate-500">{r.paymentTerms}</div>}
                                          </td>
                                          <td className="py-1.5 pr-3 whitespace-nowrap">
                                            <Pill className={pay.className}>{pay.label}</Pill>
                                            {r.paymentStatus === 'Unpaid' && !isApprover && (
                                              <button
                                                onClick={() => markPaid(po, r)}
                                                disabled={payingId === r.id}
                                                className="ml-2 px-2 py-0.5 rounded-md border border-[#c9d6f2] text-[#23408e] hover:bg-[#eaf0fb] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                                              >
                                                {payingId === r.id ? <Loader2 size={11} className="animate-spin" /> : <Banknote size={11} />} Mark Paid
                                              </button>
                                            )}
                                            {r.reminderEmailStatus === 'sent' && r.paymentStatus === 'Unpaid' && (
                                              <div className="text-[10px] text-slate-500 mt-0.5 inline-flex items-center gap-1"><BellRing size={10} /> Reminder emailed</div>
                                            )}
                                          </td>
                                          <td className="py-1.5 pr-3">{r.recordedBy || '—'}</td>
                                          <td className="py-1.5">
                                            {r.invoiceFile ? (
                                              <a href={`/api/purchase-orders/${encodeURIComponent(po.poNumber)}/documents/${r.invoiceFile.id}`} target="_blank" rel="noopener noreferrer" className="text-[#23408e] hover:underline">View</a>
                                            ) : '—'}
                                          </td>
                                        </tr>
                                        {r.lineItems && r.lineItems.length > 0 && (
                                          <tr>
                                            <td colSpan={11} className="pb-2 pt-0.5 text-[11px] text-slate-500">
                                              Line items: {r.lineItems.map((li) => `${li.description}${li.quantity ? ` - ${li.quantity} ${li.unit || ''}` : ''}${li.amount ? ` (${rs(li.amount)})` : ''}`).join('; ')}
                                            </td>
                                          </tr>
                                        )}
                                        </React.Fragment>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {deliveryPo && (
        <DeliveryDialog
          po={deliveryPo}
          projectName={projects.find((p) => p.id === deliveryPo.projectId)?.name || deliveryPo.projectName}
          inspectorName={currentUser.name}
          onClose={() => setDeliveryPo(null)}
          onSubmit={async (input) => {
            const result = await onRecordDelivery(deliveryPo, input);
            if (result.ok) {
              setDeliveryPo(null);
              setExpandedPo(deliveryPo.poNumber);
              const due = result.receipt?.dueDate;
              refreshVendorPerf();
              if (!(input.acceptedQty > 0)) {
                setNotice(
                  `${result.receipt?.grnNumber || 'Delivery'} recorded: all ${input.receivedQty} ${deliveryPo.unit} rejected (${input.rejectionReason}). Nothing was added to stock; the vendor has been emailed to replace the material.`
                );
                loadPurchaseOrders();
                return result;
              }
              setNotice(
                `${result.receipt?.grnNumber ? `${result.receipt.grnNumber}: ` : ''}accepted ${input.acceptedQty} of ${input.receivedQty} ${deliveryPo.unit} against ${deliveryPo.poNumber} with invoice ${input.invoiceNumber}. ` +
                  (input.receivedQty > input.acceptedQty ? `${round2(input.receivedQty - input.acceptedQty)} ${deliveryPo.unit} rejected - the vendor has been emailed. ` : '') +
                  (result.stockUpdated
                    ? `Stock added to ${result.projectName || deliveryPo.projectName}${result.materialCreated ? ' (new catalogue item created)' : ''}, ` +
                      `project estimation cost ${result.estimationDelta !== undefined ? `${result.estimationDelta >= 0 ? '+' : '-'}${rs(Math.abs(result.estimationDelta), 0)}` : 'updated'}, ` +
                      'bill filed under GST & URD Bills.'
                    : 'Stock could not be updated automatically.') +
                  (due ? ` Payment due ${fmtDate(due)}; reminder on ${fmtDate(addDays(due, -2))}.` : '')
              );
              loadPurchaseOrders();
            }
            return result;
          }}
        />
      )}

      {approvalDialog && (
        <SendForApprovalDialog
          pr={approvalDialog.pr}
          quote={approvalDialog.quote}
          onClose={() => setApprovalDialog(null)}
          onSubmit={async (note) => {
            await requestApproval(approvalDialog.pr, approvalDialog.quote, note);
            setApprovalDialog(null);
          }}
        />
      )}

      {negotiateDialog && (
        <NegotiateDialog
          pr={negotiateDialog.pr}
          quote={negotiateDialog.quote}
          peers={negotiateDialog.peers}
          benchmark={getMarketBenchmark(negotiateDialog.pr.materialCode, marketBenchmarks)}
          lastBuyRate={materials.find((m) => m.id === negotiateDialog.pr.materialId)?.unitCost}
          onClose={() => setNegotiateDialog(null)}
          onSubmit={async (rate, note) => {
            await sendOffer(negotiateDialog.pr, negotiateDialog.quote, rate, note);
            setNegotiateDialog(null);
          }}
        />
      )}

      {decision && (
        <DecisionDialog
          pr={decision.pr}
          kind={decision.kind}
          onClose={() => setDecision(null)}
          onSubmit={async (comment) => {
            await decideApproval(decision.pr, decision.kind, comment);
            setDecision(null);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small dialogs: send for approval, counter-offer, approve / reject   */
/* ------------------------------------------------------------------ */

function DialogShell({
  title,
  subtitle,
  onClose,
  onSubmit,
  submitLabel,
  submitClass = 'bg-[#23408e] hover:bg-[#1b3170]',
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  submitLabel: string;
  submitClass?: string;
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <form
        noValidate
        role="dialog"
        aria-label={title}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await onSubmit();
          } catch (err) {
            setError(userMessage(err, 'Something went wrong. Please try again.'));
          } finally {
            setBusy(false);
          }
        }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {children}
          {error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-200 cursor-pointer">Cancel</button>
          <button type="submit" disabled={busy} className={`px-5 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-60 cursor-pointer inline-flex items-center gap-2 ${submitClass}`}>
            {busy && <Loader2 size={15} className="animate-spin" />} {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

const dialogField =
  'w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#23408e]/30 focus:border-[#23408e]';

function SendForApprovalDialog({ pr, quote, onClose, onSubmit }: { pr: ProjectRequirement; quote: VendorQuotation; onClose: () => void; onSubmit: (note: string) => Promise<void> }) {
  const [note, setNote] = useState('');
  const negotiated = quote.negotiation && quote.negotiation.originalRate > quote.quotedRate;
  return (
    <DialogShell title="Send for approval" subtitle={`${pr.id} • ${pr.materialName}`} onClose={onClose} onSubmit={() => onSubmit(note.trim())} submitLabel="Send for Approval">
      <div className="rounded-xl bg-[#f5f8fd] border border-[#d9e3f5] p-4 text-sm grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-slate-500">Vendor</span><span className="text-right font-semibold text-slate-900">{quote.vendorName}</span>
        <span className="text-slate-500">Unit rate</span><span className="text-right font-semibold text-slate-900">{rs(quote.quotedRate)} / {quote.unit}</span>
        {negotiated && (<><span className="text-slate-500">Negotiated from</span><span className="text-right text-emerald-700 font-semibold">{rs(quote.negotiation!.originalRate)}</span></>)}
        <span className="text-slate-500">Total (incl. GST & charges)</span><span className="text-right font-bold text-slate-900">{rs(quote.totalAmount)}</span>
        <span className="text-slate-500">Rank</span><span className="text-right text-slate-900">#{quote.rank ?? '—'} • score {quote.evaluationScore?.toFixed(1) ?? '—'}</span>
      </div>
      <label className="block text-sm font-medium text-slate-700">
        Reason for selecting this vendor
        <textarea
          id="approval-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder={quote.rank && quote.rank > 1 ? 'Required context: why not the top-ranked vendor?' : 'e.g. Lowest landed cost, reliable delivery'}
          className={`${dialogField} mt-1`}
        />
      </label>
      <p className="text-xs text-slate-500">The approver is notified. The purchase order is generated and emailed to the vendor as soon as it is approved.</p>
    </DialogShell>
  );
}

/** Suggested counter-offer: the lowest credible benchmark below the vendor's rate, asking at most 10% per round */
function suggestTarget(quote: VendorQuotation, peers: VendorQuotation[], marketRate?: number, lastBuyRate?: number, targetBudgetRate?: number) {
  const current = quote.quotedRate;
  const others = peers.filter((p) => p.vendorId !== quote.vendorId && p.status !== 'Declined' && p.quotedRate > 0);
  const refs = [
    others.length ? { label: 'Lowest competing quote', rate: Math.min(...others.map((p) => p.quotedRate)) } : null,
    marketRate ? { label: 'Market rate', rate: marketRate } : null,
    lastBuyRate ? { label: 'Last purchase rate', rate: lastBuyRate } : null,
    targetBudgetRate ? { label: 'Target budget rate', rate: targetBudgetRate } : null,
  ].filter((r): r is { label: string; rate: number } => Boolean(r && r.rate > 0));
  const below = refs.filter((r) => r.rate < current);
  const roundRate = (n: number) => (current >= 100 ? Math.round(n) : round2(n));
  const floor = current * 0.9;
  if (below.length) {
    const lowest = below.reduce((a, b) => (b.rate < a.rate ? b : a));
    const rate = roundRate(Math.max(lowest.rate, floor));
    return {
      refs,
      rate: rate >= current ? roundRate(current * 0.97) : rate,
      reason: lowest.rate < floor ? `${lowest.label} is ${rs(lowest.rate)}; asking for at most 10% off in one round.` : `Matches the ${lowest.label.toLowerCase()}.`,
    };
  }
  return { refs, rate: roundRate(current * 0.97), reason: 'No benchmark is lower than this quote, so the suggestion asks for 3% off.' };
}

function NegotiateDialog({
  pr,
  quote,
  peers,
  benchmark,
  lastBuyRate,
  onClose,
  onSubmit,
}: {
  pr: ProjectRequirement;
  quote: VendorQuotation;
  peers: VendorQuotation[];
  benchmark?: MarketPriceBenchmark;
  lastBuyRate?: number;
  onClose: () => void;
  onSubmit: (rate: number, note: string) => Promise<void>;
}) {
  const suggestion = useMemo(
    () => suggestTarget(quote, peers, benchmark?.currentMarketPrice, lastBuyRate, pr.targetBudgetRate),
    [quote, peers, benchmark, lastBuyRate, pr.targetBudgetRate]
  );
  const [rate, setRate] = useState(String(suggestion.rate));
  const [note, setNote] = useState('');
  const r = Number(rate) || 0;
  const qty = quote.quantity || 0;
  const offersLeft = 3 - (quote.negotiation?.buyerOffers || 0);
  return (
    <DialogShell
      title={`Negotiate with ${quote.vendorName}`}
      subtitle={`${pr.id} • ${pr.materialName} • ${offersLeft} counter-offer${offersLeft === 1 ? '' : 's'} left`}
      onClose={onClose}
      onSubmit={async () => {
        if (!(r > 0) || r >= quote.quotedRate) throw new UserFacingError(`The offer must be below the current rate of ${rs(quote.quotedRate)}.`);
        await onSubmit(r, note.trim());
      }}
      submitLabel="Send Counter-offer"
    >
      <div className="rounded-xl border border-slate-200 overflow-hidden text-sm">
        <div className="flex justify-between px-4 py-2 bg-slate-50"><span className="text-slate-600">Vendor's current rate</span><span className="font-bold text-slate-900">{rs(quote.quotedRate)} / {quote.unit}</span></div>
        {suggestion.refs.map((ref) => (
          <div key={ref.label} className="flex justify-between px-4 py-1.5 border-t border-slate-100">
            <span className="text-slate-600">{ref.label}</span>
            <span className={ref.rate < quote.quotedRate ? 'text-emerald-700 font-semibold' : 'text-slate-700'}>{rs(ref.rate)}</span>
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-violet-50 border border-violet-200 p-3 text-sm text-violet-900 inline-flex items-start gap-2">
        <Sparkles size={15} className="mt-0.5 shrink-0" />
        <span>Suggested offer <strong>{rs(suggestion.rate)}</strong> / {quote.unit}. {suggestion.reason}</span>
      </div>
      <label className="block text-sm font-medium text-slate-700">
        Your offer (Rs. per {quote.unit}, excl. GST) *
        <input id="neg-rate" type="number" min="0" step="any" value={rate} onChange={(e) => setRate(e.target.value)} className={`${dialogField} mt-1`} />
        {r > 0 && r < quote.quotedRate && (
          <span className="mt-1 block text-xs text-emerald-700">
            {((1 - r / quote.quotedRate) * 100).toFixed(1)}% below the quote • saving about {rs(round2((quote.quotedRate - r) * qty), 0)} on {qty} {quote.unit}
          </span>
        )}
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Message to the vendor
        <textarea id="neg-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder="e.g. We have a lower quote; can you match this rate for a confirmed order?" className={`${dialogField} mt-1`} />
      </label>
      <p className="text-xs text-slate-500">The vendor gets an email with their secure link and can accept, send a counter-rate, or keep their quoted rate. Competing vendors' names are never shown to them.</p>
    </DialogShell>
  );
}

function DecisionDialog({ pr, kind, onClose, onSubmit }: { pr: ProjectRequirement; kind: 'approve' | 'reject'; onClose: () => void; onSubmit: (comment: string) => Promise<void> }) {
  const [comment, setComment] = useState('');
  const a = pr.approval;
  return (
    <DialogShell
      title={kind === 'approve' ? 'Approve and issue PO' : 'Reject selection'}
      subtitle={`${pr.id} • ${pr.materialName} • ${a?.vendorName} • ${rs(a?.amount || 0)}`}
      onClose={onClose}
      onSubmit={async () => {
        if (kind === 'reject' && !comment.trim()) throw new UserFacingError('Please give a reason so the purchase team knows what to change.');
        await onSubmit(comment.trim());
      }}
      submitLabel={kind === 'approve' ? 'Approve & Issue PO' : 'Reject'}
      submitClass={kind === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}
    >
      <p className="text-sm text-slate-700">
        {kind === 'approve'
          ? `Approving issues purchase order for ${rs(a?.amount || 0)} to ${a?.vendorName} and emails it to them immediately.`
          : 'The requirement goes back to the purchase team for comparison or negotiation.'}
      </p>
      <label className="block text-sm font-medium text-slate-700">
        {kind === 'approve' ? 'Comment (optional)' : 'Reason for rejection *'}
        <textarea id="decision-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={3} className={`${dialogField} mt-1`} />
      </label>
    </DialogShell>
  );
}

/* ------------------------------------------------------------------ */
/* Approvals queue                                                     */
/* ------------------------------------------------------------------ */

const NEG_STATUS: Record<string, { label: string; cls: string }> = {
  Offered: { label: 'Waiting for vendor', cls: 'bg-violet-50 text-violet-800 border-violet-200' },
  Countered: { label: 'Vendor countered', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  Accepted: { label: 'Offer accepted', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  Rejected: { label: 'Vendor kept rate', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
};
const ROUND_TEXT: Record<NegotiationRound['action'], string> = {
  offer: 'We offered',
  accept: 'Vendor accepted',
  counter: 'Vendor countered',
  reject: 'Vendor kept',
  revise: 'Vendor revised quote to',
};

/** Negotiation status and history on a quotation card */
function NegotiationTrail({ negotiation, unit }: { negotiation: NonNullable<VendorQuotation['negotiation']>; unit: string }) {
  const s = NEG_STATUS[negotiation.status] || NEG_STATUS.Offered;
  return (
    <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/40 p-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-violet-900 inline-flex items-center gap-1"><Handshake size={12} /> Negotiation</span>
        <Pill className={s.cls}>{s.label}</Pill>
      </div>
      <ol className="mt-1.5 space-y-0.5 text-slate-700">
        {negotiation.rounds.map((r, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span className="truncate" title={r.note}>{ROUND_TEXT[r.action]} {rs(r.rate)}/{unit}{r.note ? ` - "${r.note}"` : ''}</span>
            <span className="text-slate-400 shrink-0">{fmtDate(r.at)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RatingBadge({ perf, manual }: { perf?: VendorPerformance; manual?: number }) {
  const r = displayRating(perf, manual || 0);
  if (!r.value) return null;
  const tip = perf && perf.rating !== null ? perf.criteria.map((c) => `${c.label}: ${c.score === null ? 'no data' : Math.round(c.score)} - ${c.detail}`).join('\n') : 'Manual rating (no purchase history yet)';
  return (
    <span title={tip} className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap bg-amber-50 text-amber-800 border-amber-200">
      ★ {r.value.toFixed(1)}{r.measured ? '' : ' (manual)'}
    </span>
  );
}

function ApprovalsView({
  pending,
  decided,
  quotesByPr,
  benchmarks,
  vendorPerf,
  isApprover,
  onDecide,
}: {
  pending: ProjectRequirement[];
  decided: ProjectRequirement[];
  quotesByPr: Map<string, VendorQuotation[]>;
  benchmarks: MarketPriceBenchmark[];
  vendorPerf: Map<string, VendorPerformance>;
  isApprover: boolean;
  onDecide: (pr: ProjectRequirement, kind: 'approve' | 'reject') => void;
}) {
  return (
    <div className="space-y-4">
      {pending.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          No orders are waiting for approval.
        </div>
      ) : (
        pending.map((pr) => {
          const a = pr.approval!;
          const benchmark = getMarketBenchmark(pr.materialCode, benchmarks);
          const ranked = rankAndScoreQuotes(quotesByPr.get(pr.id) || [], benchmark?.currentMarketPrice, pr.quantity);
          const chosen = ranked.find((q) => q.vendorId === a.vendorId);
          const lowest = ranked.length ? Math.min(...ranked.map(landedCostPerUnit)) : 0;
          const waiting = Math.max(0, Math.round((Date.now() - Date.parse(a.requestedAt)) / 86400000));
          return (
            <div key={pr.id} className="bg-white rounded-xl border border-amber-300 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-amber-800 font-medium">{pr.id} • {pr.projectName} • requested by {a.requestedBy} {waiting ? `${waiting} day${waiting === 1 ? '' : 's'} ago` : 'today'}</p>
                  <h3 className="text-base font-bold text-slate-900">{pr.materialName} — {pr.quantity} {pr.unit}</h3>
                </div>
                {isApprover ? (
                  <div className="flex gap-2">
                    <button onClick={() => onDecide(pr, 'reject')} className="px-3.5 py-2 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 text-sm font-semibold cursor-pointer">Reject</button>
                    <button onClick={() => onDecide(pr, 'approve')} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                      <CheckCircle2 size={15} /> Approve &amp; Issue PO
                    </button>
                  </div>
                ) : (
                  <Pill className="bg-amber-100 text-amber-900 border-amber-300">Waiting for approver</Pill>
                )}
              </div>
              <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                <div><dt className="text-xs text-slate-500">Selected vendor</dt><dd className="font-semibold text-slate-900">{a.vendorName}</dd><RatingBadge perf={vendorPerf.get(a.vendorId)} /></div>
                <div><dt className="text-xs text-slate-500">Unit rate</dt><dd className="font-semibold text-slate-900">{rs(a.unitRate)} / {pr.unit}</dd>
                  {chosen?.negotiation && chosen.negotiation.originalRate > chosen.quotedRate && <dd className="text-xs text-emerald-700">Negotiated from {rs(chosen.negotiation.originalRate)}</dd>}
                </div>
                <div><dt className="text-xs text-slate-500">Total amount</dt><dd className="font-bold text-slate-900">{rs(a.amount)}</dd></div>
                <div><dt className="text-xs text-slate-500">Rank</dt><dd className="font-semibold text-slate-900">#{chosen?.rank ?? '—'} of {ranked.length} • score {chosen?.evaluationScore?.toFixed(1) ?? '—'}</dd>
                  {chosen && landedCostPerUnit(chosen) > lowest + 0.01 && <dd className="text-xs text-amber-700">Not the lowest landed price</dd>}
                </div>
                <div><dt className="text-xs text-slate-500">Market rate</dt><dd className="text-slate-900">{benchmark ? `${rs(benchmark.currentMarketPrice)} / ${benchmark.unit}` : '—'}</dd></div>
              </div>
              {a.note && <p className="px-5 pb-3 text-sm text-slate-700"><span className="text-slate-500">Reason: </span>{a.note}</p>}
              {ranked.length > 0 && (
                <div className="px-5 pb-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="py-1.5 pr-3 font-semibold">#</th>
                        <th className="py-1.5 pr-3 font-semibold">Vendor</th>
                        <th className="py-1.5 pr-3 font-semibold text-right">Rate</th>
                        <th className="py-1.5 pr-3 font-semibold text-right">Landed / unit</th>
                        <th className="py-1.5 pr-3 font-semibold text-right">Total</th>
                        <th className="py-1.5 pr-3 font-semibold">Delivery</th>
                        <th className="py-1.5 pr-3 font-semibold">Payment</th>
                        <th className="py-1.5 font-semibold">Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((q) => (
                        <tr key={q.id} className={`border-b border-slate-100 ${q.vendorId === a.vendorId ? 'bg-emerald-50 font-semibold' : ''}`}>
                          <td className="py-1.5 pr-3">{q.rank}</td>
                          <td className="py-1.5 pr-3">{q.vendorName}{q.vendorId === a.vendorId ? ' (selected)' : ''}</td>
                          <td className="py-1.5 pr-3 text-right">{rs(q.quotedRate)}</td>
                          <td className="py-1.5 pr-3 text-right">{rs(round2(landedCostPerUnit(q)))}</td>
                          <td className="py-1.5 pr-3 text-right">{rs(q.totalAmount)}</td>
                          <td className="py-1.5 pr-3">{q.deliveryDays} days</td>
                          <td className="py-1.5 pr-3">{q.paymentTerms}</td>
                          <td className="py-1.5"><RatingBadge perf={vendorPerf.get(q.vendorId)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}

      {decided.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <h3 className="px-5 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900">Recent decisions</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {decided.map((pr) => (
                  <tr key={pr.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-2 font-mono text-xs text-slate-600">{pr.id}</td>
                    <td className="px-3 py-2 text-slate-900">{pr.materialName}</td>
                    <td className="px-3 py-2 text-slate-700">{pr.approval?.vendorName}</td>
                    <td className="px-3 py-2 text-right text-slate-900">{rs(pr.approval?.amount || 0)}</td>
                    <td className="px-3 py-2">
                      <Pill className={pr.approval?.status === 'Approved' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'}>{pr.approval?.status}</Pill>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{pr.approval?.decidedBy} • {fmtDate(pr.approval?.decidedAt)}{pr.approval?.comment ? ` • "${pr.approval.comment}"` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* RFQ detail: header + ranked quote comparison                        */
/* ------------------------------------------------------------------ */

function RfqDetail({
  pr,
  quotes,
  vendors,
  benchmark,
  onBack,
  onAddLocalQuote,
  readOnly,
  vendorPerf,
  onSendForApproval,
  onNegotiate,
}: {
  pr: ProjectRequirement;
  quotes: VendorQuotation[];
  vendors: Vendor[];
  benchmark?: MarketPriceBenchmark;
  onBack: () => void;
  onAddLocalQuote: () => void;
  readOnly: boolean;
  vendorPerf: Map<string, VendorPerformance>;
  onSendForApproval: (quote: VendorQuotation) => void;
  onNegotiate: (quote: VendorQuotation, peers: VendorQuotation[]) => void;
}) {
  const ranked = rankAndScoreQuotes(quotes, benchmark?.currentMarketPrice, pr.quantity);
  const declined = quotes.filter((q) => q.status === 'Declined');
  const responded = new Set(quotes.map((q) => q.vendorId));
  const awaiting = pr.invitedVendorIds.filter((id) => !responded.has(id)).map((id) => vendors.find((v) => v.id === id)?.name || id);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#23408e] hover:underline cursor-pointer">
        <ArrowLeft size={15} /> All RFQs
      </button>

      {/* RFQ header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-[#23408e] text-white px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <p className="text-xs text-blue-100 font-medium">{pr.id} • Material code #{pr.materialCode} • {pr.category}</p>
            <h2 className="text-xl font-bold mt-0.5">{pr.materialName}</h2>
          </div>
          <div className="flex items-center gap-3">
            {benchmark && (
              <div className="text-right bg-white/10 rounded-lg px-3 py-2">
                <span className="block text-[10px] uppercase tracking-wide text-blue-100">Market benchmark</span>
                <span className="font-bold">{rs(benchmark.currentMarketPrice)} / {benchmark.unit}</span>
              </div>
            )}
            {!readOnly && (
              <button
                onClick={onAddLocalQuote}
                className="px-3.5 py-2 rounded-lg bg-white text-[#23408e] hover:bg-blue-50 text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                title="Enter a quotation from a local vendor who is not registered in the system"
              >
                <Plus size={15} /> Add Local Vendor Quote
              </button>
            )}
          </div>
        </div>
        <dl className="grid grid-cols-2 md:grid-cols-5 gap-4 px-5 py-4 text-sm">
          {[
            ['Project', pr.projectName],
            ['Quantity', `${pr.quantity} ${pr.unit}`],
            ['Required by', fmtDate(pr.requiredDate)],
            ['Quote deadline', pr.quoteDeadline ? fmtDate(pr.quoteDeadline) : '—'],
            ['Specification', pr.specifications],
          ].map(([k, v]) => (
            <div key={k} className={k === 'Specification' ? 'col-span-2 md:col-span-1' : ''}>
              <dt className="text-xs text-slate-500">{k}</dt>
              <dd className="font-medium text-slate-900 mt-0.5 line-clamp-2" title={v}>{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {pr.approval?.status === 'Rejected' && (
        <div role="status" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <strong>Not approved:</strong> {pr.approval.decidedBy} rejected {pr.approval.vendorName} ({rs(pr.approval.amount)}) on {fmtDate(pr.approval.decidedAt)}
          {pr.approval.comment ? ` - "${pr.approval.comment}"` : ''}. Negotiate or choose another vendor, then send for approval again.
        </div>
      )}

      {/* Comparison */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
          <Award size={16} className="text-[#23408e]" /> Quotations ({ranked.length} received)
        </h3>
        <span className="text-xs text-slate-500">Ranked by: {EVALUATION_CRITERIA_TEXT}</span>
      </div>

      {ranked.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          No quotations received yet for {pr.id}. Vendors submit through the link in their RFQ email.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ranked.map((quote) => {
            const isTop = quote.rank === 1;
            const delta = calculateMarketDelta(quote.quotedRate, benchmark?.currentMarketPrice);
            const partial = quote.quantity < pr.quantity;
            return (
              <div
                key={quote.id}
                className={`bg-white rounded-xl border p-4 flex flex-col justify-between shadow-sm ${isTop ? 'border-[#23408e] ring-1 ring-[#23408e]/30' : 'border-slate-200'}`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className={`w-7 h-7 shrink-0 rounded-md flex items-center justify-center text-xs font-bold ${isTop ? 'bg-[#23408e] text-white' : 'bg-slate-100 text-slate-700'}`}>
                        #{quote.rank}
                      </span>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-sm text-slate-900 truncate" title={quote.vendorName}>{quote.vendorName}</h4>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          <RatingBadge perf={vendorPerf.get(quote.vendorId)} manual={vendors.find((v) => v.id === quote.vendorId)?.rating} />
                          {isTop && <Pill className="bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]">Best value</Pill>}
                          {quote.submittedVia === 'vendor-portal' && <Pill className="bg-emerald-50 text-emerald-800 border-emerald-200">Vendor portal</Pill>}
                          {quote.isLocalVendor && <Pill className="bg-sky-50 text-sky-800 border-sky-200">Local vendor</Pill>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-lg font-bold text-slate-900">{quote.evaluationScore?.toFixed(1)}</span>
                      <span className="block text-[10px] text-slate-400 uppercase">Score / 100</span>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs space-y-1">
                    <div className="flex justify-between items-baseline">
                      <span className="text-slate-500">Unit rate (excl. GST)</span>
                      <span className="text-base font-bold text-slate-900">{rs(quote.quotedRate)} <span className="text-[10px] font-normal text-slate-500">/ {quote.unit}</span></span>
                    </div>
                    {quote.negotiation && quote.negotiation.originalRate !== quote.quotedRate && (
                      <div className="flex justify-between"><span className="text-slate-500">Originally quoted</span><span className="text-slate-500 line-through">{rs(quote.negotiation.originalRate)}</span></div>
                    )}
                    <div className="flex justify-between"><span className="text-slate-500">Qty can supply</span><span className={`font-semibold ${partial ? 'text-rose-700' : 'text-slate-900'}`}>{quote.quantity} {quote.unit}{partial ? ' (partial)' : ''}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">GST</span><span className="font-semibold text-slate-900">{quote.gstRate}%</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Freight / transport</span><span className="font-semibold text-slate-900">{quote.freightCharges ? rs(quote.freightCharges) : 'Included'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Loading charges</span><span className="font-semibold text-slate-900">{quote.loadingCharges ? rs(quote.loadingCharges) : 'Included'}</span></div>
                    <div className="flex justify-between border-t border-slate-200 pt-1"><span className="font-semibold text-slate-700">Total price (incl. all)</span><span className="font-bold text-slate-900">{rs(quote.totalAmount)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Landed cost</span><span className="font-semibold text-slate-900">{rs(Math.round(landedCostPerUnit(quote) * 100) / 100)} / {quote.unit}</span></div>
                    {benchmark && (
                      <div className="flex justify-between"><span className="text-slate-500">vs market</span>
                        <span className={`font-semibold ${delta.isLower ? 'text-emerald-700' : 'text-rose-700'}`}>{delta.formatted}</span>
                      </div>
                    )}
                  </div>

                  <dl className="mt-3 text-xs divide-y divide-slate-100">
                    <div className="flex justify-between gap-2 py-1.5"><dt className="text-slate-500 inline-flex items-center gap-1"><Truck size={12} /> Delivery</dt><dd className="font-semibold text-slate-900 text-right">{quote.deliveryDays} days{quote.promisedDeliveryDate ? ` (by ${fmtDate(quote.promisedDeliveryDate)})` : ''}</dd></div>
                    <div className="flex justify-between gap-2 py-1.5"><dt className="text-slate-500 inline-flex items-center gap-1 shrink-0"><CreditCard size={12} /> Payment terms</dt><dd className="font-semibold text-slate-900 text-right truncate" title={quote.paymentTerms}>{quote.paymentTerms}</dd></div>
                    <div className="flex justify-between gap-2 py-1.5"><dt className="text-slate-500 inline-flex items-center gap-1"><Clock size={12} /> Validity</dt><dd className="font-semibold text-slate-900">{quote.validityDays} days</dd></div>
                    <div className="flex justify-between gap-2 py-1.5"><dt className="text-slate-500 inline-flex items-center gap-1 shrink-0"><ShieldCheck size={12} /> Warranty</dt><dd className="font-semibold text-slate-900 text-right truncate" title={quote.warranty}>{quote.warranty}</dd></div>
                    {quote.remarks && <div className="py-1.5"><dt className="text-slate-500">Remarks</dt><dd className="text-slate-700 mt-0.5 line-clamp-2" title={quote.remarks}>{quote.remarks}</dd></div>}
                    <div className="flex justify-between gap-2 py-1.5 text-slate-500">
                      <span>{SUBMISSION_METHOD_LABEL[quote.submissionMethod || 'form']} • {quote.submittedAt}</span>
                      {quote.attachment && (
                        <a href={`/api/quote-attachments/${quote.attachment.id}`} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[#23408e] font-semibold hover:underline inline-flex items-center gap-1">
                          <FileText size={12} /> Vendor's file
                        </a>
                      )}
                    </div>
                  </dl>
                </div>

                {quote.negotiation && <NegotiationTrail negotiation={quote.negotiation} unit={quote.unit} />}

                {!readOnly && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {(() => {
                      const waiting = quote.negotiation?.status === 'Offered';
                      const used = (quote.negotiation?.buyerOffers || 0) >= 3;
                      return (
                        <button
                          onClick={() => onNegotiate(quote, ranked)}
                          disabled={waiting || used}
                          title={waiting ? 'Waiting for the vendor to reply to your offer' : used ? 'Maximum of 3 counter-offers reached' : 'Send a counter-offer to this vendor'}
                          className="py-2 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer border border-violet-300 text-violet-800 hover:bg-violet-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Handshake size={15} /> {waiting ? 'Offer sent' : 'Negotiate'}
                        </button>
                      );
                    })()}
                    <button
                      onClick={() => onSendForApproval(quote)}
                      disabled={quote.negotiation?.status === 'Offered'}
                      title={quote.negotiation?.status === 'Offered' ? 'Wait for the vendor to reply to your counter-offer first' : 'Send this vendor to the approver'}
                      className={`py-2 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        isTop ? 'bg-[#23408e] hover:bg-[#1b3170] text-white' : 'bg-white border border-[#23408e] text-[#23408e] hover:bg-[#f5f8fd]'
                      }`}
                    >
                      <CheckCircle2 size={15} /> Send for Approval
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(declined.length > 0 || awaiting.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {awaiting.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="font-semibold text-slate-700 mb-1.5 inline-flex items-center gap-1"><Package size={13} /> Awaiting response ({awaiting.length})</p>
              <p className="text-slate-600">{awaiting.join(', ')}</p>
            </div>
          )}
          {declined.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="font-semibold text-slate-700 mb-1.5 inline-flex items-center gap-1"><Receipt size={13} /> Declined to quote ({declined.length})</p>
              <ul className="space-y-1 text-slate-600">
                {declined.map((q) => (
                  <li key={q.id}><strong className="text-slate-800">{q.vendorName}</strong> • {q.submittedAt}{q.declineReason ? ` • "${q.declineReason}"` : ''}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
