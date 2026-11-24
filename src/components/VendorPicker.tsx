import { useEffect, useMemo, useState } from 'react';
import type { NearbySupplier, ProjectRequirement, Vendor, VendorMatch } from '../types';
import { Sparkles, MapPin, Plus, Loader2, Phone, Globe, X, Check } from 'lucide-react';

const field =
  'w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#23408e]/30 focus:border-[#23408e]';
const CONF: Record<VendorMatch['confidence'], { label: string; cls: string }> = {
  high: { label: 'Best match', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  medium: { label: 'Likely', cls: 'bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]' },
  low: { label: 'Possible', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
};
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/**
 * Choose the vendors who get the RFQ for a requirement:
 * - registered vendors the AI thinks can supply the item (shown first),
 * - suppliers found near the delivery location (one click to register them),
 * - "Other": register any new vendor by hand.
 */
export default function VendorPicker({
  pr,
  vendors,
  picked,
  onChange,
  onAddVendor,
}: {
  pr: ProjectRequirement;
  vendors: Vendor[];
  picked: string[];
  onChange: (ids: string[]) => void;
  onAddVendor: (vendor: Vendor) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<VendorMatch[]>([]);
  const [nearby, setNearby] = useState<NearbySupplier[]>([]);
  const [location, setLocation] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [form, setForm] = useState<Partial<Vendor> | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch('/api/vendors/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item: pr.materialName,
        category: pr.category,
        specifications: [pr.specifications, pr.purpose].filter(Boolean).join('. '),
        materialCode: pr.materialCode,
        department: pr.department || '',
        // Department purchases are delivered to the office (server default); site orders to the site
        location: pr.department ? '' : pr.deliveryAddress,
      }),
    })
      .then((r) => r.json().catch(() => null))
      .then((json) => {
        if (!alive) return;
        if (!json?.success) {
          setNote('AI suggestions are not available right now. Pick vendors from the list or add a new one.');
          return;
        }
        setMatches(json.matches || []);
        setNearby(json.nearby || []);
        setLocation(json.location || '');
        if (!json.aiAvailable) setNote('AI suggestions are not available right now; showing vendors registered for this material only.');
        else if (!json.nearbyAvailable) setNote('The nearby supplier search is not available right now.');
        // Nothing chosen yet: pre-select the best matches
        if (!picked.length) {
          const best = (json.matches || []).filter((m: VendorMatch) => m.confidence !== 'low').map((m: VendorMatch) => m.vendorId);
          if (best.length) onChange(best);
        }
      })
      .catch(() => alive && setNote('AI suggestions could not be loaded (connection problem).'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pr.id]);

  const matchById = useMemo(() => new Map(matches.map((m) => [m.vendorId, m])), [matches]);
  const suggested = matches.map((m) => vendors.find((v) => v.id === m.vendorId)).filter((v): v is Vendor => Boolean(v));
  // Vendors added in this dialog, and any picked vendor, always stay visible
  const others = vendors.filter((v) => !matchById.has(v.id) && (showAll || picked.includes(v.id)));
  const toggle = (id: string) => onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);

  const saveVendor = () => {
    if (!form) return;
    const name = (form.name || '').trim();
    const email = (form.email || '').trim().toLowerCase();
    if (!name) return setFormError('Please enter the vendor name.');
    if (email && !isEmail(email)) return setFormError('Please enter a valid email address, or leave it empty.');
    if (vendors.some((v) => v.name.trim().toLowerCase() === name.toLowerCase())) return setFormError('A vendor with this name is already registered.');
    const vendor: Vendor = {
      id: `ven-${Date.now()}`,
      name,
      contactPerson: (form.contactPerson || '').trim(),
      email,
      phone: (form.phone || '').trim(),
      address: (form.address || '').trim(),
      gstin: (form.gstin || '').trim().toUpperCase(),
      rating: 0,
      suppliedMaterialCodes: pr.materialCode && pr.materialCode !== '000' ? [pr.materialCode] : [],
      suppliedItems: [pr.materialName, pr.category].filter(Boolean),
      standardCreditPeriod: '30 Days',
      avgLeadDays: 3,
      status: 'Under Review',
      ...(form.website ? { website: form.website } : {}),
      ...(form.source ? { source: form.source } : {}),
    };
    onAddVendor(vendor);
    onChange([...picked, vendor.id]);
    setForm(null);
    setFormError(null);
  };

  const row = (v: Vendor) => {
    const m = matchById.get(v.id);
    return (
      <label key={v.id} className="flex items-start gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
        <input type="checkbox" checked={picked.includes(v.id)} onChange={() => toggle(v.id)} className="accent-[#23408e] mt-1" />
        <span className="flex-1 min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-900 font-medium">{v.name}</span>
            {m && <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${CONF[m.confidence].cls}`}>{CONF[m.confidence].label}</span>}
          </span>
          {m && <span className="block text-xs text-slate-500">{m.reason}</span>}
          <span className={`block text-xs ${v.email ? 'text-slate-500' : 'text-amber-700'}`}>{v.email || 'No email - share the quote link with them yourself'}</span>
        </span>
      </label>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">Send the RFQ to *</span>
        <span className="text-xs text-slate-500">{picked.length} selected</span>
      </div>

      {/* Registered vendors: AI suggestions first */}
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-3 py-2 bg-violet-50 border-b border-violet-100 text-xs font-semibold text-violet-900 inline-flex w-full items-center gap-1.5">
          <Sparkles size={13} /> Registered vendors who can supply {pr.materialName.toLowerCase()}
          {loading && <Loader2 size={13} className="animate-spin ml-auto" />}
        </div>
        <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
          {!loading && suggested.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">None of the registered vendors look like a match. Use a nearby supplier or add a new vendor below.</p>}
          {suggested.map(row)}
          {others.map(row)}
        </div>
        <button type="button" onClick={() => setShowAll((s) => !s)} className="w-full px-3 py-1.5 text-xs font-semibold text-[#23408e] hover:bg-slate-50 border-t border-slate-100 cursor-pointer text-left">
          {showAll ? 'Hide other vendors' : `Show all ${vendors.length} registered vendors`}
        </button>
      </div>

      {/* Suppliers near the office / site */}
      {(loading || nearby.length > 0) && (
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-100 text-xs font-semibold text-emerald-900 flex items-start gap-1.5">
            <MapPin size={13} className="mt-0.5 shrink-0" />
            <span>Suppliers near {pr.department ? 'the office' : 'the site'}{location ? ` (${location.length > 60 ? `${location.slice(0, 60)}…` : location})` : ''}</span>
          </div>
          {loading ? (
            <p className="px-3 py-2 text-xs text-slate-500 inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Searching nearby suppliers…</p>
          ) : (
            <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
              {nearby.map((s) => (
                <div key={s.name} className="px-3 py-2 text-sm flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900">
                      {s.name}
                      {s.distanceKm !== undefined && <span className="ml-1.5 text-xs font-normal text-slate-500">~{s.distanceKm} km</span>}
                    </div>
                    {s.reason && <div className="text-xs text-slate-600">{s.reason}</div>}
                    <div className="text-xs text-slate-500">{s.address}</div>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-x-3">
                      {s.phone && <span className="inline-flex items-center gap-1"><Phone size={10} /> {s.phone}</span>}
                      {s.website && (
                        <a href={s.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#23408e] hover:underline">
                          <Globe size={10} /> Website
                        </a>
                      )}
                      {s.email && <span>{s.email}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setForm({ name: s.name, address: s.address, phone: s.phone || '', email: s.email || '', website: s.website, source: 'Nearby supplier search (AI)' });
                    }}
                    className="shrink-0 px-2.5 py-1 rounded-md border border-emerald-300 text-emerald-800 hover:bg-emerald-50 text-xs font-semibold cursor-pointer inline-flex items-center gap-1"
                  >
                    <Plus size={12} /> Add as vendor
                  </button>
                </div>
              ))}
            </div>
          )}
          {!loading && <p className="px-3 py-1.5 text-[11px] text-slate-500 border-t border-slate-100">Found by AI web search. Please confirm the details with the supplier before ordering.</p>}
        </div>
      )}

      {note && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{note}</p>}

      {/* "Other": register a new vendor */}
      {form ? (
        <div className="rounded-lg border border-[#c9d6f2] bg-[#f5f8fd] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900">New vendor</span>
            <button type="button" onClick={() => setForm(null)} aria-label="Cancel new vendor" className="text-slate-400 hover:text-slate-700 cursor-pointer"><X size={15} /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input aria-label="Vendor name" placeholder="Vendor / firm name *" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${field} col-span-2`} />
            <input aria-label="Vendor email" placeholder="Email (to receive the RFQ)" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} className={field} />
            <input aria-label="Vendor phone" placeholder="Phone" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={field} />
            <input aria-label="Contact person" placeholder="Contact person" value={form.contactPerson || ''} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} className={field} />
            <input aria-label="GSTIN" placeholder="GSTIN" value={form.gstin || ''} onChange={(e) => setForm({ ...form, gstin: e.target.value })} className={field} />
            <input aria-label="Vendor address" placeholder="Address" value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} className={`${field} col-span-2`} />
          </div>
          {!form.email && <p className="text-[11px] text-amber-700">Without an email the RFQ cannot be emailed; you can share their quote link yourself.</p>}
          {formError && <p role="alert" className="text-xs text-rose-700">{formError}</p>}
          <button type="button" onClick={saveVendor} className="px-3 py-1.5 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
            <Check size={13} /> Save vendor and select
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setForm({});
          }}
          className="w-full px-3 py-2 rounded-lg border border-dashed border-slate-300 text-sm font-semibold text-[#23408e] hover:bg-[#f5f8fd] cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          <Plus size={15} /> Other - add a new vendor
        </button>
      )}
    </div>
  );
}
