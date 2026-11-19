import React, { useEffect, useState } from 'react';
import { ProjectRequirement, Vendor, VendorQuotation, MarketPriceBenchmark, User } from '../types';
import { getMarketBenchmark, computeQuoteTotal, defaultGstRate, parseCreditDays } from '../lib/vendorComparison';
import { X, FileCheck, Store } from 'lucide-react';

/**
 * "Add Quote" = quotation from a LOCAL vendor who is not registered in the system.
 * The site manager / admin enters the vendor's details and the 10 key figures (registered vendors
 * submit their own quotes through their secure link).
 */
interface VendorQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  pr: ProjectRequirement | null;
  vendors: Vendor[];
  marketBenchmarks: MarketPriceBenchmark[];
  existingQuotes: VendorQuotation[];
  currentUser: User;
  onSubmitQuote: (quote: VendorQuotation) => void;
}

const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fieldCls =
  'w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500';

/** Label + input wrapper (module level so inputs keep focus while typing) */
function Field({ id, label, children, span }: { id: string; label: React.ReactNode; children: React.ReactNode; span?: string }) {
  return (
    <div className={span}>
      <label htmlFor={id} className="block text-xs font-extrabold text-slate-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

export default function VendorQuoteModal(props: VendorQuoteModalProps) {
  // Hooks live in the inner component so they always run in the same order
  if (!props.isOpen || !props.pr) return null;
  return <VendorQuoteModalContent {...props} pr={props.pr} />;
}

function VendorQuoteModalContent({
  onClose,
  pr,
  vendors,
  marketBenchmarks,
  existingQuotes,
  currentUser,
  onSubmitQuote,
}: VendorQuoteModalProps & { pr: ProjectRequirement }) {
  const benchmark = getMarketBenchmark(pr.materialCode, marketBenchmarks);

  // Local vendor details
  const [vendorName, setVendorName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');

  // Key figures (same 10 required fields as the supplier portal; remarks optional)
  const [quotedRate, setQuotedRate] = useState('');
  const [quantity, setQuantity] = useState(String(pr.quantity));
  const [gstRate, setGstRate] = useState(String(defaultGstRate(pr.materialName)));
  const [freightCharges, setFreightCharges] = useState('');
  const [loadingCharges, setLoadingCharges] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [totalTouched, setTotalTouched] = useState(false);
  const [deliveryDays, setDeliveryDays] = useState('');
  const [validityDays, setValidityDays] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [warranty, setWarranty] = useState('');
  const [remarks, setRemarks] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const calculatedTotal = (() => {
    const r = Number(quotedRate);
    const q = Number(quantity);
    if (!(r > 0) || !(q > 0)) return null;
    return computeQuoteTotal(r, q, Number(gstRate) || 0, Number(freightCharges) || 0, Number(loadingCharges) || 0);
  })();
  useEffect(() => {
    if (!totalTouched && calculatedTotal !== null) setTotalAmount(String(calculatedTotal));
  }, [calculatedTotal, totalTouched]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = (v: string) => (v.trim() === '' ? NaN : Number(v));
    const name = vendorName.trim();
    const gst = gstin.trim().toUpperCase();
    const mail = email.trim();
    const problems: string[] = [];

    // Vendor details
    if (!name) problems.push('Vendor / firm name');
    if (!contactPerson.trim()) problems.push('Contact person');
    if (!/^[+\d][\d\s-]{7,}$/.test(phone.trim())) problems.push('Valid mobile number');
    if (mail && !EMAIL_PATTERN.test(mail)) problems.push('Valid email');
    if (gst && !GSTIN_PATTERN.test(gst)) problems.push('Valid 15-character GSTIN');
    if (!address.trim()) problems.push('Vendor address');
    const registered = vendors.find((v) => v.name.trim().toLowerCase() === name.toLowerCase());
    if (registered) problems.push(`"${registered.name}" is a registered vendor - they submit through their own quotation link`);

    // Key figures
    if (!(n(quotedRate) > 0)) problems.push('Unit rate');
    if (!(n(quantity) > 0)) problems.push('Quantity');
    if (!(n(gstRate) >= 0)) problems.push('GST %');
    if (!(n(freightCharges) >= 0)) problems.push('Freight / transport (0 if included)');
    if (!(n(loadingCharges) >= 0)) problems.push('Loading charges (0 if included)');
    if (!(n(totalAmount) > 0)) problems.push('Total price');
    if (!(n(deliveryDays) >= 1 && n(deliveryDays) <= 365)) problems.push('Delivery time');
    if (!(n(validityDays) >= 1 && n(validityDays) <= 365)) problems.push('Validity');
    if (!paymentTerms.trim()) problems.push('Payment terms');
    if (!warranty.trim()) problems.push('Warranty');

    if (problems.length) {
      setFormError(`Please complete: ${problems.join(', ')}.`);
      return;
    }

    // Same local vendor quoting again for this PR replaces their earlier quote
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const previous = existingQuotes.find((q) => q.prId === pr.id && q.isLocalVendor && q.vendorName.toLowerCase() === name.toLowerCase());
    const vendorId = previous?.vendorId || `local-${slug}-${Date.now().toString(36)}`;

    const newQuote: VendorQuotation = {
      id: `quote-${vendorId}-${pr.id}`,
      prId: pr.id,
      token: pr.token,
      materialCode: pr.materialCode,
      materialName: pr.materialName,
      vendorId,
      vendorName: name,
      vendorEmail: mail || undefined,
      vendorPhone: phone.trim(),
      isLocalVendor: true,
      vendorContactPerson: contactPerson.trim(),
      vendorGstin: gst || undefined,
      vendorAddress: address.trim(),
      addedByName: currentUser.name,
      unit: pr.unit,
      quotedRate: n(quotedRate),
      quantity: n(quantity),
      gstRate: n(gstRate),
      freightCharges: n(freightCharges),
      loadingCharges: n(loadingCharges),
      totalAmount: n(totalAmount),
      deliveryDays: Math.round(n(deliveryDays)),
      validityDays: Math.round(n(validityDays)),
      paymentTerms: paymentTerms.trim(),
      creditDays: parseCreditDays(paymentTerms),
      warranty: warranty.trim(),
      ...(remarks.trim() ? { remarks: remarks.trim() } : {}),
      submissionMethod: 'form',
      status: 'Submitted',
      submittedAt: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }),
      submittedVia: 'internal',
    };

    onSubmitQuote(newQuote);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden text-slate-900" role="dialog" aria-label="Add local vendor quote">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black">
              <Store size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black">Add Local Vendor Quote</h3>
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 text-[10px] font-black border border-slate-700">
                  {pr.id} • #{pr.materialCode}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                {pr.materialName} ({pr.quantity} {pr.unit}) for {pr.projectName}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <div className="bg-amber-50 px-6 py-3 border-b border-amber-200 text-xs text-amber-950 font-medium">
          For vendors <strong>not registered</strong> in the system (e.g. a local supplier who quoted by phone or on paper).
          Registered vendors submit their own quotation through the secure link in their RFQ email.
          {benchmark ? <> Market benchmark: <strong>Rs. {benchmark.currentMarketPrice} / {pr.unit}</strong>.</> : null}
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
          {/* Vendor details */}
          <div>
            <p className="text-xs font-black text-slate-800 mb-2">Vendor details</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field id="lv-name" label="Vendor / firm name *" span="sm:col-span-2">
                <input id="lv-name" value={vendorName} onChange={(e) => setVendorName(e.target.value)} maxLength={120} className={fieldCls} />
              </Field>
              <Field id="lv-contact" label="Contact person *">
                <input id="lv-contact" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} maxLength={80} className={fieldCls} />
              </Field>
              <Field id="lv-phone" label="Mobile number *">
                <input id="lv-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98xxx xxxxx" className={fieldCls} />
              </Field>
              <Field id="lv-email" label="Email (for the purchase order)">
                <input id="lv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldCls} />
              </Field>
              <Field id="lv-gstin" label="GSTIN (if registered)">
                <input id="lv-gstin" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase().replace(/\s/g, ''))} maxLength={15} className={`${fieldCls} font-mono`} />
              </Field>
              <Field id="lv-address" label="Address *" span="sm:col-span-3">
                <input id="lv-address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={250} className={fieldCls} />
              </Field>
            </div>
          </div>

          {/* Key figures */}
          <div>
            <p className="text-xs font-black text-slate-800 mb-2">
              Key figures <span className="font-medium text-slate-500">(all 10 required; remarks optional)</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field id="mq-rate" label={`Unit rate (Rs. per ${pr.unit}, excl. GST) *`}>
                <input id="mq-rate" type="number" min="0" step="any" value={quotedRate} onChange={(e) => setQuotedRate(e.target.value)} className={fieldCls} />
              </Field>
              <Field id="mq-qty" label={`Quantity vendor can supply (${pr.unit}) *`}>
                <input id="mq-qty" type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={fieldCls} />
              </Field>
              <Field id="mq-gst" label="GST % *">
                <select id="mq-gst" value={gstRate} onChange={(e) => setGstRate(e.target.value)} className={fieldCls}>
                  {[0, 5, 12, 18, 28].map((g) => <option key={g} value={String(g)}>{g}%</option>)}
                </select>
              </Field>
              <Field id="mq-freight" label="Freight / transport (Rs.) *">
                <input id="mq-freight" type="number" min="0" step="any" value={freightCharges} onChange={(e) => setFreightCharges(e.target.value)} placeholder="0 if included" className={fieldCls} />
              </Field>
              <Field id="mq-loading" label="Loading charges (Rs.) *">
                <input id="mq-loading" type="number" min="0" step="any" value={loadingCharges} onChange={(e) => setLoadingCharges(e.target.value)} placeholder="0 if included" className={fieldCls} />
              </Field>
              <Field id="mq-total" label="Total price (Rs., incl. all) *">
                <input id="mq-total" type="number" min="0" step="any" value={totalAmount}
                  onChange={(e) => { setTotalTouched(true); setTotalAmount(e.target.value); }} className={fieldCls} />
                <p className="mt-0.5 text-[10px] text-slate-500">Auto: rate × qty + GST + freight + loading</p>
              </Field>
              <Field id="mq-days" label="Delivery time (days) *">
                <input id="mq-days" type="number" min="1" max="365" value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} className={fieldCls} />
              </Field>
              <Field id="mq-validity" label="Validity (days) *">
                <input id="mq-validity" type="number" min="1" max="365" value={validityDays} onChange={(e) => setValidityDays(e.target.value)} className={fieldCls} />
              </Field>
              <Field id="mq-warranty" label="Warranty *">
                <input id="mq-warranty" value={warranty} onChange={(e) => setWarranty(e.target.value)} placeholder="e.g. Not applicable" className={fieldCls} />
              </Field>
              <Field id="mq-terms" label="Payment terms *" span="sm:col-span-3">
                <input id="mq-terms" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. 30 days credit" className={fieldCls} />
              </Field>
              <Field id="mq-remarks" label="Remarks (optional)" span="sm:col-span-3">
                <textarea id="mq-remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} className={fieldCls} />
              </Field>
            </div>
          </div>

          {formError && (
            <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2" role="alert">{formError}</p>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition-colors cursor-pointer">
              Cancel
            </button>
            <button type="submit" className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-2 shadow-xs">
              <FileCheck size={14} className="text-amber-400" /> Save Local Vendor Quote
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
