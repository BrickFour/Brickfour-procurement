import React from 'react';
import { ClipboardCheck } from 'lucide-react';
import type { MaterialVerification, QualityGrade } from '../types';

/** Material verification (GRN inspection) while the form is being filled in */
export interface VerificationDraft {
  acceptedQty: string; // '' = accept everything delivered
  quality: QualityGrade;
  rejectionReason: string;
  checks: MaterialVerification['checks'];
  inspectedBy: string;
  remarks: string;
}

export const newVerificationDraft = (inspectedBy = ''): VerificationDraft => ({
  acceptedQty: '',
  quality: 'Good',
  rejectionReason: '',
  checks: { specificationMatches: false, quantityVerified: false, noDamage: false, documentsReceived: false },
  inspectedBy,
  remarks: '',
});

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Accepted / rejected quantities for a delivered quantity */
export function verificationQuantities(draft: VerificationDraft, delivered: number) {
  const accepted = draft.acceptedQty === '' ? delivered : Number(draft.acceptedQty);
  return { accepted: Number.isFinite(accepted) ? accepted : NaN, rejected: round3(delivered - (Number.isFinite(accepted) ? accepted : 0)) };
}

/** Problem with the verification, or null when it can be saved */
export function verificationError(draft: VerificationDraft, delivered: number): string | null {
  const { accepted, rejected } = verificationQuantities(draft, delivered);
  if (!(delivered > 0)) return 'Please enter the quantity delivered.';
  if (!Number.isFinite(accepted) || accepted < 0 || accepted > delivered + 1e-9) return 'Accepted quantity must be between 0 and the quantity delivered.';
  if (rejected > 0 && !draft.rejectionReason.trim()) return 'Please give the reason for rejecting material.';
  if (!draft.checks.quantityVerified) return 'Please confirm the delivered quantity was counted / weighed.';
  if (!draft.inspectedBy.trim()) return 'Please enter who inspected the material.';
  return null;
}

export function toVerification(draft: VerificationDraft, delivered: number): MaterialVerification {
  const { accepted, rejected } = verificationQuantities(draft, delivered);
  return {
    receivedQty: delivered,
    acceptedQty: accepted,
    rejectedQty: Math.max(0, rejected),
    ...(rejected > 0 ? { rejectionReason: draft.rejectionReason.trim() } : {}),
    quality: draft.quality,
    checks: draft.checks,
    inspectedBy: draft.inspectedBy.trim(),
    ...(draft.remarks.trim() ? { remarks: draft.remarks.trim() } : {}),
  };
}

const CHECKS: { key: keyof MaterialVerification['checks']; label: string; required?: boolean }[] = [
  { key: 'quantityVerified', label: 'Quantity counted / weighed', required: true },
  { key: 'specificationMatches', label: 'Matches the ordered specification / brand' },
  { key: 'noDamage', label: 'No damage, leakage or breakage' },
  { key: 'documentsReceived', label: 'Delivery challan / test certificate received' },
];

const GRADES: { id: QualityGrade; label: string; hint: string; cls: string }[] = [
  { id: 'Good', label: 'Good', hint: 'Meets specification', cls: 'border-emerald-500 bg-emerald-50 text-emerald-900' },
  { id: 'Acceptable', label: 'Acceptable', hint: 'Minor issues', cls: 'border-amber-500 bg-amber-50 text-amber-900' },
  { id: 'Poor', label: 'Poor', hint: 'Below standard', cls: 'border-rose-500 bg-rose-50 text-rose-900' },
];

/**
 * Material verification step shown when stock is received: accepted / rejected quantity, quality grade,
 * inspection checklist and inspector. Only the accepted quantity is added to stock.
 */
export default function MaterialVerificationPanel({
  idPrefix,
  unit,
  delivered,
  value,
  onChange,
}: {
  idPrefix: string;
  unit: string;
  delivered: number;
  value: VerificationDraft;
  onChange: (next: VerificationDraft) => void;
}) {
  const { accepted, rejected } = verificationQuantities(value, delivered);
  const set = (patch: Partial<VerificationDraft>) => onChange({ ...value, ...patch });
  const field =
    'w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#23408e]/30 focus:border-[#23408e]';

  return (
    <fieldset className="rounded-xl border border-[#c9d6f2] bg-[#f5f8fd] p-4 space-y-3">
      <legend className="px-1 text-sm font-semibold text-[#23408e] inline-flex items-center gap-1.5">
        <ClipboardCheck size={15} /> Material verification
      </legend>
      <p className="text-xs text-slate-600 -mt-1">Inspect the material before it is added to stock. Only the accepted quantity is stocked and paid for.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block text-sm font-medium text-slate-700">
          Accepted ({unit})
          <input
            id={`${idPrefix}-accepted`}
            type="number"
            min="0"
            step="any"
            value={value.acceptedQty === '' ? (delivered > 0 ? String(delivered) : '') : value.acceptedQty}
            onChange={(e) => set({ acceptedQty: e.target.value })}
            className={`${field} mt-1`}
          />
        </label>
        <div className="text-sm">
          <span className="block font-medium text-slate-700">Rejected ({unit})</span>
          <span id={`${idPrefix}-rejected`} className={`mt-1 block px-3 py-2 rounded-lg border ${rejected > 0 ? 'border-rose-300 bg-rose-50 text-rose-800 font-semibold' : 'border-slate-200 bg-white text-slate-500'}`}>
            {Number.isFinite(accepted) && rejected > 0 ? rejected : 0}
          </span>
        </div>
        <label className="block text-sm font-medium text-slate-700">
          Inspected by *
          <input id={`${idPrefix}-inspector`} value={value.inspectedBy} onChange={(e) => set({ inspectedBy: e.target.value })} maxLength={100} className={`${field} mt-1`} />
        </label>
      </div>

      {rejected > 0 && (
        <label className="block text-sm font-medium text-slate-700">
          Reason for rejection *
          <input
            id={`${idPrefix}-reject-reason`}
            value={value.rejectionReason}
            onChange={(e) => set({ rejectionReason: e.target.value })}
            maxLength={300}
            placeholder="e.g. 20 bags lumpy / set cement, 2 rods bent"
            className={`${field} mt-1`}
          />
        </label>
      )}

      <div>
        <span className="block text-sm font-medium text-slate-700 mb-1">Quality *</span>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Quality grade">
          {GRADES.map((g) => (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={value.quality === g.id}
              id={`${idPrefix}-quality-${g.id.toLowerCase()}`}
              onClick={() => set({ quality: g.id })}
              className={`px-2 py-2 rounded-lg border text-left cursor-pointer ${value.quality === g.id ? g.cls : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              <span className="block text-sm font-semibold">{g.label}</span>
              <span className="block text-[11px] opacity-80">{g.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
        {CHECKS.map((c) => (
          <label key={c.key} className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              id={`${idPrefix}-check-${c.key}`}
              type="checkbox"
              checked={value.checks[c.key]}
              onChange={(e) => set({ checks: { ...value.checks, [c.key]: e.target.checked } })}
              className="mt-0.5 accent-[#23408e]"
            />
            <span>
              {c.label}
              {c.required && <span className="text-rose-600"> *</span>}
            </span>
          </label>
        ))}
      </div>

      <label className="block text-sm font-medium text-slate-700">
        Inspection remarks
        <input id={`${idPrefix}-remarks`} value={value.remarks} onChange={(e) => set({ remarks: e.target.value })} maxLength={300} className={`${field} mt-1`} />
      </label>
    </fieldset>
  );
}
