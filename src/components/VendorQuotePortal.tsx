import React, { useEffect, useMemo, useRef, useState } from 'react';
import vyasLogo from '../images/vyas logo.png';
import {
  Type,
  FileText,
  FileType2,
  Image as ImageIcon,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
  Sparkles,
  Download,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface PortalPR {
  id: string;
  projectName: string;
  materialName: string;
  materialCode: string;
  category: string;
  quantity: number;
  unit: string;
  requiredDate: string;
  urgency: string;
  specifications: string;
  deliveryAddress: string;
  specialInstructions?: string;
  receivingHours?: string;
  unloadingConstraints?: string;
  quoteDeadline?: string;
  status: string;
}

interface Attachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
}

type Method = 'text' | 'pdf' | 'word' | 'image-excel';

interface ExistingQuote {
  status: string;
  quotedRate: number;
  quantity: number;
  gstRate: number;
  freightCharges: number;
  loadingCharges: number;
  totalAmount: number;
  deliveryDays: number;
  promisedDeliveryDate?: string;
  validityDays: number;
  paymentTerms: string;
  warranty: string;
  remarks?: string;
  submissionMethod?: Method;
  quoteText?: string;
  attachment?: Attachment;
  declineReason?: string;
  submittedAt: string;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      pr: PortalPR;
      vendor: { id: string; name: string };
      existingQuote: ExistingQuote | null;
      isClosed: boolean;
      closedReason: string | null;
      gstRateOptions: number[];
    };

/** Key figures (kept as strings while editing) */
interface KeyFigures {
  quotedRate: string;
  quantity: string;
  gstRate: string;
  freightCharges: string;
  loadingCharges: string;
  totalAmount: string;
  deliveryDays: string;
  promisedDeliveryDate: string;
  validityDays: string;
  paymentTerms: string;
  warranty: string;
  remarks: string;
}
type FigureKey = keyof KeyFigures;

const EMPTY: KeyFigures = {
  quotedRate: '',
  quantity: '',
  gstRate: '',
  freightCharges: '',
  loadingCharges: '',
  totalAmount: '',
  deliveryDays: '',
  promisedDeliveryDate: '',
  validityDays: '',
  paymentTerms: '',
  warranty: '',
  remarks: '',
};

/** The 10 mandatory items (delivery is satisfied by days OR a promised date) */
const REQUIRED_ITEMS: { id: string; keys: FigureKey[]; label: string }[] = [
  { id: 'quotedRate', keys: ['quotedRate'], label: 'Unit rate' },
  { id: 'quantity', keys: ['quantity'], label: 'Quantity you can supply' },
  { id: 'gstRate', keys: ['gstRate'], label: 'GST %' },
  { id: 'freightCharges', keys: ['freightCharges'], label: 'Freight / transport' },
  { id: 'loadingCharges', keys: ['loadingCharges'], label: 'Loading charges' },
  { id: 'totalAmount', keys: ['totalAmount'], label: 'Total price' },
  { id: 'delivery', keys: ['deliveryDays', 'promisedDeliveryDate'], label: 'Delivery time or promised date' },
  { id: 'validityDays', keys: ['validityDays'], label: 'Validity' },
  { id: 'paymentTerms', keys: ['paymentTerms'], label: 'Payment terms' },
  { id: 'warranty', keys: ['warranty'], label: 'Warranty' },
];

const METHODS: { id: Method; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; accept?: string; hint?: string }[] = [
  { id: 'text', label: '1. Type / paste text', icon: Type },
  { id: 'pdf', label: '2. Upload PDF', icon: FileText, accept: '.pdf,application/pdf', hint: 'PDF up to 10 MB' },
  {
    id: 'word',
    label: '3. Upload Word (.doc/.docx)',
    icon: FileType2,
    accept: '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    hint: 'Word document (.doc or .docx) up to 10 MB',
  },
  {
    id: 'image-excel',
    label: '4. Image / Excel',
    icon: ImageIcon,
    accept: '.jpg,.jpeg,.png,.webp,.xlsx,.csv,image/jpeg,image/png,image/webp',
    hint: 'Photo or scan (JPG, PNG, WEBP) or spreadsheet (.xlsx, .csv) up to 10 MB',
  },
];

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const formatBytes = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const formatDate = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

function timeLeft(deadline: string, now: number): string {
  const ms = Date.parse(deadline) - now;
  if (ms <= 0) return 'Closed';
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  return d > 0 ? `${d} d ${h} h left` : h > 0 ? `${h} h ${m} m left` : `${m} m left`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

const toStr = (v: unknown) => (v === undefined || v === null ? '' : String(v));

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function VendorQuotePortal() {
  const params = new URLSearchParams(window.location.search);
  const prId = params.get('pr') || '';
  const vendorId = params.get('v') || '';
  const token = params.get('t') || '';
  const linkQuery = new URLSearchParams({ pr: prId, v: vendorId, t: token }).toString();

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [now, setNow] = useState(Date.now());
  const [method, setMethod] = useState<Method>('text');
  const [quoteText, setQuoteText] = useState('');
  const [figures, setFigures] = useState<KeyFigures>(EMPTY);
  const [totalTouched, setTotalTouched] = useState(false);
  const [autoFilled, setAutoFilled] = useState<Set<FigureKey>>(new Set());
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [reading, setReading] = useState<{ status: 'idle' | 'busy' | 'done' | 'error'; message?: string }>({ status: 'idle' });
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ kind: 'submitted' | 'declined'; at: string } | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  // Load the RFQ
  useEffect(() => {
    document.title = 'Submit Quotation';
    if (!prId || !vendorId || !token) {
      setState({ kind: 'error', message: 'This quotation link is incomplete. Please use the full link from your RFQ email.' });
      return;
    }
    // Ignore the response if this effect was superseded (prevents a late response overwriting what the vendor typed)
    let cancelled = false;
    fetch(`/api/vendor-quote?${linkQuery}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !json?.success) throw new Error(json?.error || 'Unable to open this quotation request.');
        const existing: ExistingQuote | null = json.existingQuote;
        setState({
          kind: 'ready',
          pr: json.pr,
          vendor: json.vendor,
          existingQuote: existing,
          isClosed: json.isClosed,
          closedReason: json.closedReason,
          gstRateOptions: json.gstRateOptions || [0, 5, 12, 18, 28],
        });
        if (existing && existing.status !== 'Declined') {
          setFigures({
            quotedRate: toStr(existing.quotedRate),
            quantity: toStr(existing.quantity),
            gstRate: toStr(existing.gstRate),
            freightCharges: toStr(existing.freightCharges),
            loadingCharges: toStr(existing.loadingCharges),
            totalAmount: toStr(existing.totalAmount),
            deliveryDays: existing.promisedDeliveryDate ? '' : toStr(existing.deliveryDays),
            promisedDeliveryDate: existing.promisedDeliveryDate || '',
            validityDays: toStr(existing.validityDays),
            paymentTerms: existing.paymentTerms || '',
            warranty: existing.warranty || '',
            remarks: existing.remarks || '',
          });
          // Keep auto-calculating the total unless the vendor's saved total differs from the calculation
          const computed =
            existing.quotedRate * existing.quantity * (1 + (existing.gstRate || 0) / 100) +
            (existing.freightCharges || 0) +
            (existing.loadingCharges || 0);
          setTotalTouched(Math.abs(computed - existing.totalAmount) > 1);
          setMethod(existing.submissionMethod && existing.submissionMethod !== ('form' as Method) ? existing.submissionMethod : 'text');
          setQuoteText(existing.quoteText || '');
          setAttachment(existing.attachment || null);
        } else {
          setFigures({ ...EMPTY, quantity: toStr(json.pr.quantity) });
          if (existing?.status === 'Declined') setResult({ kind: 'declined', at: existing.submittedAt });
        }
      })
      .catch((err) => {
        if (!cancelled) setState({ kind: 'error', message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [prId, vendorId, token]);

  // Countdown tick
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const num = (v: string) => (v === '' ? NaN : Number(v));
  const calculatedTotal = useMemo(() => {
    const rate = num(figures.quotedRate);
    const qty = num(figures.quantity);
    if (!(rate > 0) || !(qty > 0)) return null;
    const gst = Number(figures.gstRate) || 0;
    const base = rate * qty;
    const total = base * (1 + gst / 100) + (Number(figures.freightCharges) || 0) + (Number(figures.loadingCharges) || 0);
    return Math.round(total * 100) / 100;
  }, [figures.quotedRate, figures.quantity, figures.gstRate, figures.freightCharges, figures.loadingCharges]);

  // Keep the total in sync with the inputs until the vendor types their own total
  useEffect(() => {
    if (!totalTouched && calculatedTotal !== null) {
      setFigures((prev) => ({ ...prev, totalAmount: String(calculatedTotal) }));
    }
  }, [calculatedTotal, totalTouched]);

  const setField = (key: FigureKey, value: string) => {
    setFigures((prev) => ({ ...prev, [key]: value }));
    if (key === 'totalAmount') setTotalTouched(true);
    setSubmitError(null);
    setAutoFilled((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const fieldError = (key: FigureKey): string | null => {
    const v = figures[key];
    switch (key) {
      case 'quotedRate':
      case 'quantity':
      case 'totalAmount':
        return v !== '' && !(Number(v) > 0) ? 'Must be greater than 0' : null;
      case 'freightCharges':
      case 'loadingCharges':
        return v !== '' && !(Number(v) >= 0) ? 'Enter 0 if included' : null;
      case 'deliveryDays':
        return v !== '' && !(Number(v) >= 1 && Number(v) <= 365) ? '1-365 days' : null;
      case 'validityDays':
        return v !== '' && !(Number(v) >= 1 && Number(v) <= 365) ? '1-365 days' : null;
      default:
        return null;
    }
  };

  const itemDone = (item: (typeof REQUIRED_ITEMS)[number]) =>
    item.keys.some((k) => String(figures[k]).trim() !== '' && !fieldError(k));
  const completed = REQUIRED_ITEMS.filter(itemDone).length;
  const missingKeys = new Set<FigureKey>(REQUIRED_ITEMS.filter((i) => !itemDone(i)).flatMap((i) => i.keys));

  const applyExtracted = (f: any) => {
    const found: Partial<KeyFigures> = {};
    if (f.unitRate) found.quotedRate = String(f.unitRate);
    if (f.quantity) found.quantity = String(f.quantity);
    if (f.gstRate !== undefined) found.gstRate = String(f.gstRate);
    if (f.freightCharges !== undefined) found.freightCharges = String(f.freightCharges);
    if (f.loadingCharges !== undefined) found.loadingCharges = String(f.loadingCharges);
    if (f.totalPrice) found.totalAmount = String(f.totalPrice);
    if (f.deliveryDays) found.deliveryDays = String(f.deliveryDays);
    if (f.promisedDeliveryDate) found.promisedDeliveryDate = f.promisedDeliveryDate;
    if (f.validityDays) found.validityDays = String(f.validityDays);
    if (f.paymentTerms) found.paymentTerms = f.paymentTerms;
    if (f.warranty) found.warranty = f.warranty;
    if (f.remarks) found.remarks = f.remarks;
    setFigures((prev) => ({ ...prev, ...found }));
    setTotalTouched(Boolean(found.totalAmount));
    setAutoFilled(new Set(Object.keys(found) as FigureKey[]));
    setSubmitError(null);
    const n = REQUIRED_ITEMS.filter((i) => i.keys.some((k) => k in found)).length;
    setReading({
      status: 'done',
      message:
        n > 0
          ? `We filled ${n} of 10 key figures from your quotation (highlighted in yellow). Please check them and complete any that are empty.`
          : 'We could not read the figures automatically. Please fill in the key figures below.',
    });
  };

  const readText = async () => {
    if (quoteText.trim().length < 10) {
      setReading({ status: 'error', message: 'Please type or paste your quotation text first.' });
      return;
    }
    setReading({ status: 'busy' });
    try {
      const res = await fetch('/api/vendor-quote/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pr: prId, v: vendorId, t: token, method: 'text', text: quoteText }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || 'We could not read this text.');
      applyExtracted(json.fields || {});
    } catch (err: any) {
      setReading({ status: 'error', message: err.message });
    }
  };

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setReading({ status: 'error', message: 'The file is too large. Maximum size is 10 MB.' });
      return;
    }
    setReading({ status: 'busy' });
    try {
      const data = await readFileAsBase64(file);
      const res = await fetch('/api/vendor-quote/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pr: prId, v: vendorId, t: token, method, fileName: file.name, data }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || 'We could not read this file.');
      setAttachment(json.attachment);
      applyExtracted(json.fields || {});
    } catch (err: any) {
      setReading({ status: 'error', message: err.message });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const switchMethod = (m: Method) => {
    setMethod(m);
    setReading({ status: 'idle' });
    if (m === 'text') setAttachment(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    if (completed < REQUIRED_ITEMS.length) {
      setSubmitError(`Please complete all 10 key figures (${completed} of 10 done).`);
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/vendor-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pr: prId,
          v: vendorId,
          t: token,
          method,
          quoteText: method === 'text' ? quoteText : undefined,
          attachmentId: method !== 'text' ? attachment?.id : undefined,
          quotedRate: Number(figures.quotedRate),
          quantity: Number(figures.quantity),
          gstRate: Number(figures.gstRate),
          freightCharges: Number(figures.freightCharges),
          loadingCharges: Number(figures.loadingCharges),
          totalAmount: Number(figures.totalAmount),
          deliveryDays: figures.deliveryDays === '' ? undefined : Number(figures.deliveryDays),
          promisedDeliveryDate: figures.promisedDeliveryDate || undefined,
          validityDays: Number(figures.validityDays),
          paymentTerms: figures.paymentTerms,
          warranty: figures.warranty,
          remarks: figures.remarks,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Submission failed. Please try again.');
      setResult({ kind: 'submitted', at: json.quote?.submittedAt || new Date().toLocaleString() });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecline = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/vendor-quote/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pr: prId, v: vendorId, t: token, reason: declineReason }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Could not record your response.');
      setDeclineOpen(false);
      setResult({ kind: 'declined', at: json.declinedAt });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ---------------- Layout pieces ---------------- */

  const header = (
    <header className="bg-[#13294b]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="bg-white rounded-lg px-3 py-2 shadow-sm">
          <img src={vyasLogo} alt="Vyas" className="h-11 w-auto object-contain" />
        </div>
        <span className="text-sm font-medium text-slate-200">Secure supplier portal</span>
      </div>
    </header>
  );

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-900">
      {header}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">{children}</main>
    </div>
  );

  if (state.kind === 'loading') {
    return shell(
      <div className="flex items-center justify-center gap-2 py-24 text-slate-500 text-sm font-medium">
        <Loader2 size={18} className="animate-spin" /> Loading quotation request...
      </div>
    );
  }

  if (state.kind === 'error') {
    return shell(
      <div className="max-w-xl mx-auto bg-white rounded-xl border border-rose-200 p-6 text-center shadow-sm" role="alert">
        <AlertTriangle size={30} className="mx-auto text-rose-500" />
        <h1 className="mt-3 text-base font-semibold text-slate-900">Quotation link not valid</h1>
        <p className="mt-1 text-sm text-slate-600">{state.message}</p>
      </div>
    );
  }

  const { pr, vendor, existingQuote, isClosed, closedReason, gstRateOptions } = state;
  const deadlineClosed = pr.quoteDeadline ? Date.parse(pr.quoteDeadline) <= now : false;
  const closed = isClosed || deadlineClosed;
  const activeMethod = METHODS.find((m) => m.id === method)!;

  const Detail = ({ label, value, wide }: { label: string; value?: string; wide?: boolean }) => (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-[15px] font-medium text-slate-900 mt-0.5">{value || '—'}</dd>
    </div>
  );

  const inputCls = (key: FigureKey) => {
    const invalid = (showErrors && missingKeys.has(key)) || Boolean(fieldError(key));
    return `w-full px-3.5 py-2.5 rounded-lg border text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#13294b]/30 focus:border-[#13294b] ${
      invalid ? 'border-rose-400 bg-rose-50/50' : autoFilled.has(key) ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white'
    }`;
  };

  const FieldLabel = ({ htmlFor, children, k }: { htmlFor: string; children: React.ReactNode; k: FigureKey }) => (
    <label htmlFor={htmlFor} className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-800 mb-1.5">
      <span>{children}</span>
      {autoFilled.has(k) && (
        <span className="text-amber-600 shrink-0" title="Filled from your quotation - please check" aria-label="Filled from your quotation">
          <Sparkles size={13} />
        </span>
      )}
    </label>
  );
  const Err = ({ k }: { k: FigureKey }) =>
    fieldError(k) ? <p className="mt-1 text-xs text-rose-600">{fieldError(k)}</p> : null;

  return shell(
    <>
      {/* Title */}
      <div>
        <p className="text-sm font-medium tracking-wide text-slate-500 uppercase">Request for quotation</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#13294b] mt-1">{pr.id}</h1>
        <p className="text-base text-slate-500 mt-1">For {vendor.name}</p>
      </div>

      {/* Requirement */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <h2 className="px-6 py-4 border-b border-slate-200 text-base font-semibold text-slate-900">Requirement</h2>
        <div className="px-6 py-5">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-4">
            <Detail label="Material" value={pr.materialName} />
            <Detail label="Specification" value={pr.specifications} />
            <Detail label="Quantity" value={`${pr.quantity} ${pr.unit}`} />
            <Detail label="Required delivery date" value={formatDate(pr.requiredDate)} />
            <Detail label="Delivery address" value={pr.deliveryAddress || pr.projectName} wide />
            <Detail label="Receiving hours" value={pr.receivingHours} />
            <Detail label="Unloading constraints" value={pr.unloadingConstraints || pr.specialInstructions} />
          </dl>
          <div className="mt-5 pt-4 border-t border-slate-200 flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px]">
            {pr.quoteDeadline ? (
              <>
                <span className="text-slate-700">
                  Deadline: <strong className="text-slate-900">{formatDateTime(pr.quoteDeadline)}</strong>
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-md text-sm font-medium ${
                    deadlineClosed ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-[#1d4f91]'
                  }`}
                >
                  {timeLeft(pr.quoteDeadline, now)}
                </span>
              </>
            ) : (
              <span className="text-slate-700">Please submit your quotation at the earliest.</span>
            )}
            <a href={`/api/vendor-quote/rfq-pdf?${linkQuery}`} className="font-medium text-[#1d4f91] hover:underline inline-flex items-center gap-1">
              <Download size={15} /> Download RFQ PDF
            </a>
          </div>
        </div>
      </section>

      {/* Result / closed / form */}
      {result ? (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center" role="status">
          {result.kind === 'submitted' ? (
            <>
              <CheckCircle2 size={36} className="mx-auto text-emerald-600" />
              <h2 className="mt-3 text-lg font-semibold text-slate-900">Quotation submitted</h2>
              <p className="mt-1 text-sm text-slate-600">
                Thank you. We received your quotation on {result.at}. Total price: {inr(Number(figures.totalAmount) || 0)}.
              </p>
              {!closed && (
                <button type="button" onClick={() => setResult(null)} className="mt-5 px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-800 hover:bg-slate-50 cursor-pointer">
                  Revise quotation
                </button>
              )}
            </>
          ) : (
            <>
              <X size={36} className="mx-auto text-slate-400" />
              <h2 className="mt-3 text-lg font-semibold text-slate-900">You declined to quote</h2>
              <p className="mt-1 text-sm text-slate-600">Your response was recorded on {result.at}. Thank you for letting us know.</p>
              {!closed && (
                <button type="button" onClick={() => setResult(null)} className="mt-5 px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-800 hover:bg-slate-50 cursor-pointer">
                  Submit a quotation instead
                </button>
              )}
            </>
          )}
        </section>
      ) : closed ? (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
          <AlertTriangle size={30} className="mx-auto text-slate-400" />
          <h2 className="mt-3 text-base font-semibold text-slate-900">Quotations are closed</h2>
          <p className="mt-1 text-sm text-slate-600">{closedReason || 'The deadline for this quotation request has passed.'}</p>
        </section>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              {existingQuote && existingQuote.status !== 'Declined' ? 'Update your quotation' : 'Submit your quotation'}
            </h2>
            {existingQuote && existingQuote.status !== 'Declined' && (
              <span className="text-xs text-slate-500">Last submitted {existingQuote.submittedAt}</span>
            )}
          </div>

          <div className="p-6 space-y-6">
            {/* How to submit */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" role="tablist" aria-label="How would you like to submit your quotation?">
              {METHODS.map((m) => {
                const Icon = m.icon;
                const active = method === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => switchMethod(m.id)}
                    className={`flex flex-col items-center justify-center gap-2 px-3 py-4 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                      active ? 'border-[#13294b] bg-[#eef3fa] text-[#13294b]' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Icon size={22} />
                    {m.label}
                  </button>
                );
              })}
            </div>

            {method === 'text' ? (
              <div className="space-y-2">
                <label htmlFor="vq-text" className="block text-sm font-semibold text-slate-800">
                  Type or paste your quotation
                </label>
                <textarea
                  id="vq-text"
                  rows={6}
                  value={quoteText}
                  onChange={(e) => setQuoteText(e.target.value)}
                  placeholder={`e.g. Rate Rs. 1,450 per ${pr.unit} + GST 5%, freight Rs. 6,000, loading included, delivery in 3 days, valid 15 days, 30 days credit.`}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#13294b]/30 focus:border-[#13294b]"
                />
                <button
                  type="button"
                  onClick={readText}
                  disabled={reading.status === 'busy'}
                  className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 cursor-pointer inline-flex items-center gap-2"
                >
                  {reading.status === 'busy' ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  Fill key figures from text
                </button>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleFile(e.dataTransfer.files?.[0]);
                }}
                className={`rounded-lg border-2 border-dashed px-5 py-6 text-center transition-colors ${
                  isDragging ? 'border-[#13294b] bg-[#eef3fa]' : 'border-slate-300 bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  id="vq-file"
                  type="file"
                  accept={activeMethod.accept}
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                {reading.status === 'busy' ? (
                  <p className="text-sm font-medium text-slate-700 inline-flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" /> Reading your quotation...
                  </p>
                ) : (
                  <>
                    <Upload size={22} className="mx-auto text-slate-500" />
                    <p className="mt-2 text-sm text-slate-700">
                      Drag and drop your file here, or{' '}
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="font-semibold text-[#1d4f91] hover:underline cursor-pointer">
                        browse
                      </button>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{activeMethod.hint}. We'll read it and fill in the key figures for you.</p>
                  </>
                )}
                {attachment && (
                  <div className="mt-4 mx-auto max-w-md flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-left">
                    <span className="flex items-center gap-2 text-sm text-slate-800 min-w-0">
                      <FileText size={15} className="text-slate-500 shrink-0" />
                      <span className="truncate">{attachment.name}</span>
                      <span className="text-xs text-slate-400 shrink-0">{formatBytes(attachment.size)}</span>
                    </span>
                    <button type="button" onClick={() => setAttachment(null)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="Remove file">
                      <X size={15} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {reading.message && (
              <p
                role={reading.status === 'error' ? 'alert' : 'status'}
                className={`text-sm ${reading.status === 'error' ? 'text-rose-700' : 'text-amber-800'}`}
              >
                {reading.message}
              </p>
            )}

            {/* Key figures */}
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <h3 className="text-base font-semibold text-slate-900">
                  Key figures <span className="font-normal text-slate-500 text-sm">(all 10 required; remarks optional)</span>
                </h3>
                <span className={`text-sm font-medium ${completed === 10 ? 'text-emerald-700' : 'text-slate-500'}`} aria-live="polite">
                  {completed} of 10 completed
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <FieldLabel htmlFor="vq-quotedRate" k="quotedRate">Unit rate (₹ per {pr.unit}, excl. GST)</FieldLabel>
                  <input id="vq-quotedRate" type="number" min="0" step="any" inputMode="decimal" value={figures.quotedRate}
                    onChange={(e) => setField('quotedRate', e.target.value)} className={inputCls('quotedRate')} />
                  <Err k="quotedRate" />
                </div>
                <div>
                  <FieldLabel htmlFor="vq-quantity" k="quantity">Quantity you can supply ({pr.unit})</FieldLabel>
                  <input id="vq-quantity" type="number" min="0" step="any" inputMode="decimal" value={figures.quantity}
                    onChange={(e) => setField('quantity', e.target.value)} placeholder={String(pr.quantity)} className={inputCls('quantity')} />
                  <Err k="quantity" />
                </div>
                <div>
                  <FieldLabel htmlFor="vq-gstRate" k="gstRate">GST %</FieldLabel>
                  <select id="vq-gstRate" value={figures.gstRate} onChange={(e) => setField('gstRate', e.target.value)} className={inputCls('gstRate')}>
                    <option value="">Select</option>
                    {gstRateOptions.map((g) => (
                      <option key={g} value={String(g)}>{g}%</option>
                    ))}
                  </select>
                </div>

                <div>
                  <FieldLabel htmlFor="vq-freightCharges" k="freightCharges">Freight / transport (₹)</FieldLabel>
                  <input id="vq-freightCharges" type="number" min="0" step="any" inputMode="decimal" value={figures.freightCharges}
                    onChange={(e) => setField('freightCharges', e.target.value)} placeholder="0 if included" className={inputCls('freightCharges')} />
                  <Err k="freightCharges" />
                </div>
                <div>
                  <FieldLabel htmlFor="vq-loadingCharges" k="loadingCharges">Loading charges (₹)</FieldLabel>
                  <input id="vq-loadingCharges" type="number" min="0" step="any" inputMode="decimal" value={figures.loadingCharges}
                    onChange={(e) => setField('loadingCharges', e.target.value)} placeholder="0 if included" className={inputCls('loadingCharges')} />
                  <Err k="loadingCharges" />
                </div>
                <div>
                  <FieldLabel htmlFor="vq-totalAmount" k="totalAmount">Total price (₹, incl. all)</FieldLabel>
                  <input id="vq-totalAmount" type="number" min="0" step="any" inputMode="decimal" value={figures.totalAmount}
                    onChange={(e) => setField('totalAmount', e.target.value)} className={inputCls('totalAmount')} />
                  {calculatedTotal !== null && Math.abs((Number(figures.totalAmount) || 0) - calculatedTotal) > 1 ? (
                    <button type="button" onClick={() => { setTotalTouched(false); setFigures((p) => ({ ...p, totalAmount: String(calculatedTotal) })); }}
                      className="mt-1 text-xs text-[#1d4f91] hover:underline cursor-pointer">
                      Calculated: {inr(calculatedTotal)} — use this
                    </button>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">Rate × quantity + GST + freight + loading</p>
                  )}
                  <Err k="totalAmount" />
                </div>

                <div>
                  <FieldLabel htmlFor="vq-deliveryDays" k="deliveryDays">Delivery time (days)</FieldLabel>
                  <input id="vq-deliveryDays" type="number" min="1" max="365" step="1" inputMode="numeric" value={figures.deliveryDays}
                    onChange={(e) => setField('deliveryDays', e.target.value)} className={inputCls('deliveryDays')} />
                  <Err k="deliveryDays" />
                </div>
                <div>
                  <FieldLabel htmlFor="vq-promisedDeliveryDate" k="promisedDeliveryDate">…or promised delivery date</FieldLabel>
                  <input id="vq-promisedDeliveryDate" type="date" value={figures.promisedDeliveryDate}
                    onChange={(e) => setField('promisedDeliveryDate', e.target.value)} className={inputCls('promisedDeliveryDate')} />
                </div>
                <div>
                  <FieldLabel htmlFor="vq-validityDays" k="validityDays">Validity (days)</FieldLabel>
                  <input id="vq-validityDays" type="number" min="1" max="365" step="1" inputMode="numeric" value={figures.validityDays}
                    onChange={(e) => setField('validityDays', e.target.value)} className={inputCls('validityDays')} />
                  <Err k="validityDays" />
                </div>

                <div className="sm:col-span-2">
                  <FieldLabel htmlFor="vq-paymentTerms" k="paymentTerms">Payment terms</FieldLabel>
                  <input id="vq-paymentTerms" type="text" maxLength={120} value={figures.paymentTerms}
                    onChange={(e) => setField('paymentTerms', e.target.value)} placeholder="e.g. 30 days credit" className={inputCls('paymentTerms')} />
                </div>
                <div>
                  <FieldLabel htmlFor="vq-warranty" k="warranty">Warranty</FieldLabel>
                  <input id="vq-warranty" type="text" maxLength={120} value={figures.warranty}
                    onChange={(e) => setField('warranty', e.target.value)} placeholder="e.g. Not applicable" className={inputCls('warranty')} />
                </div>

                <div className="sm:col-span-3">
                  <FieldLabel htmlFor="vq-remarks" k="remarks">Remarks <span className="font-normal text-slate-500">(optional)</span></FieldLabel>
                  <textarea id="vq-remarks" rows={4} maxLength={1000} value={figures.remarks}
                    onChange={(e) => setField('remarks', e.target.value)} className={inputCls('remarks')} />
                </div>
              </div>
            </div>

            {submitError && (
              <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2.5" role="alert">
                {submitError}
              </p>
            )}

            {declineOpen && (
              <div className="rounded-lg border border-slate-300 bg-slate-50 p-4 space-y-3">
                <label htmlFor="vq-declineReason" className="block text-sm font-semibold text-slate-800">
                  Reason for declining <span className="font-normal text-slate-500">(optional)</span>
                </label>
                <textarea id="vq-declineReason" rows={2} maxLength={500} value={declineReason} onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="e.g. Material not available in this period"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm focus:outline-hidden focus:ring-2 focus:ring-[#13294b]/30" />
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setDeclineOpen(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 cursor-pointer">
                    Cancel
                  </button>
                  <button type="button" onClick={handleDecline} disabled={isSubmitting}
                    className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-60 cursor-pointer">
                    Confirm decline
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              <button type="button" onClick={() => setDeclineOpen(true)} className="px-4 py-2.5 rounded-lg text-[15px] font-medium text-slate-800 hover:bg-slate-100 cursor-pointer">
                Decline to quote
              </button>
              <button type="submit" disabled={isSubmitting || reading.status === 'busy'}
                className="px-6 py-3 rounded-lg bg-[#13467f] hover:bg-[#0f3a6b] text-white text-base font-semibold disabled:opacity-60 cursor-pointer inline-flex items-center gap-2">
                {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                {existingQuote && existingQuote.status !== 'Declined' ? 'Update Quotation' : 'Submit Quotation'}
              </button>
            </div>
          </div>
        </form>
      )}
    </>
  );
}
