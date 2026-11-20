import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Upload, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2, Info, Search, Users, Boxes, Sparkles, Building2 } from 'lucide-react';
import type { Material, Project, Vendor, InventoryTransaction, ProjectRequirement, VendorQuotation } from '../types';
import { INITIAL_MATERIALS, INITIAL_TRANSACTIONS, INITIAL_VENDORS } from '../initialData';
import {
  BulkKind,
  ParsedSheet,
  columnsFor,
  buildMaterialImportPlan,
  buildVendorImportPlan,
  findRemovableSampleMaterials,
  findRemovableSampleVendors,
  MaterialImportPlan,
  VendorImportPlan,
  BULK_MAX_FILE_BYTES,
  BULK_MAX_ROWS,
  buildSupplyOptions,
  collectUnmatchedSupplyItems,
} from '../lib/bulkImport';
import { STANDARD_MATERIAL_GROUPS, resolveMaterialGroup } from '../lib/materialCodes';

const SAMPLE_MATERIAL_IDS = new Set(INITIAL_MATERIALS.map((m) => m.id));
const SAMPLE_TRANSACTION_IDS = new Set(INITIAL_TRANSACTIONS.map((t) => t.id));
const SAMPLE_VENDOR_IDS = new Set(INITIAL_VENDORS.map((v) => v.id));

interface BulkUploadModalProps {
  kind: BulkKind;
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  materials: Material[];
  transactions: InventoryTransaction[];
  vendors: Vendor[];
  prs: ProjectRequirement[];
  quotes: VendorQuotation[];
  /** Site selected in the header (preselected as the upload site) */
  selectedProjectId?: string;
  onApplyMaterials: (plan: MaterialImportPlan) => void;
  onApplyVendors: (plan: VendorImportPlan) => void;
}

const readAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const rs = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-IN')}`;

function Tile({ label, value, tone = 'slate' }: { label: string; value: number | string; tone?: 'slate' | 'navy' | 'green' | 'red' | 'amber' }) {
  const color = { slate: 'text-slate-900', navy: 'text-[#23408e]', green: 'text-emerald-700', red: 'text-rose-700', amber: 'text-amber-700' }[tone];
  return (
    <div className="bg-white p-3 rounded-lg border border-slate-200 min-w-0">
      <span className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide truncate">{label}</span>
      <span className={`block text-xl font-bold mt-0.5 ${color}`}>{value}</span>
    </div>
  );
}

export default function BulkUploadModal({
  kind,
  isOpen,
  onClose,
  projects,
  materials,
  transactions,
  vendors,
  prs,
  quotes,
  selectedProjectId,
  onApplyMaterials,
  onApplyVendors,
}: BulkUploadModalProps) {
  const [targetProjectId, setTargetProjectId] = useState('');
  const [aiMatches, setAiMatches] = useState<Record<string, string>>({});
  const [aiState, setAiState] = useState<'idle' | 'checking' | 'done' | 'off'>('idle');
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeSamples, setRemoveSamples] = useState(true);
  const [done, setDone] = useState<string | null>(null);
  const [showAllIssues, setShowAllIssues] = useState(false);
  const [view, setView] = useState<'upload' | 'directory'>('upload');
  const [dirSearch, setDirSearch] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSheet(null);
    setFileName('');
    setError(null);
    setDone(null);
    setRemoveSamples(true);
    setShowAllIssues(false);
    setView('upload');
    setDirSearch('');
    setAiMatches({});
    setAiState('idle');
    setTargetProjectId(selectedProjectId && selectedProjectId !== 'all' && projects.some((p) => p.id === selectedProjectId) ? selectedProjectId : '');
  }, [isOpen, kind]);

  // Vendors: typed entries the rules cannot match are checked once with AI (spelling mistakes, synonyms)
  useEffect(() => {
    if (kind !== 'vendors' || !sheet) return;
    const items = collectUnmatchedSupplyItems(sheet, materials);
    if (!items.length) { setAiState('idle'); return; }
    let cancelled = false;
    setAiState('checking');
    fetch('/api/bulk/match-materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, options: buildSupplyOptions(materials).map((o) => ({ code: o.code, label: o.label })) }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setAiMatches(j?.matches || {});
        setAiState(j?.ai ? 'done' : 'off');
      })
      .catch(() => !cancelled && setAiState('off'));
    return () => { cancelled = true; };
  }, [kind, sheet, materials]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, busy, onClose]);

  // Sample records that would be removed (shown before a file is chosen too)
  const sampleInfo = useMemo(() => {
    if (kind === 'materials') {
      if (!targetProjectId) return { removable: 0, kept: [] as string[] };
      const r = findRemovableSampleMaterials(materials, transactions, SAMPLE_MATERIAL_IDS, SAMPLE_TRANSACTION_IDS, targetProjectId);
      return { removable: r.removable.length, kept: r.keptSamples.map((m) => m.name) };
    }
    const r = findRemovableSampleVendors(vendors, prs, quotes, SAMPLE_VENDOR_IDS);
    return { removable: r.removable.length, kept: r.keptSamples.map((v) => v.name) };
  }, [kind, materials, transactions, vendors, prs, quotes, targetProjectId]);

  const plan = useMemo(() => {
    if (!sheet) return null;
    const project = projects.find((p) => p.id === targetProjectId);
    if (kind === 'materials' && !project) return null;
    return kind === 'materials'
      ? buildMaterialImportPlan(sheet, {
          project: project!,
          materials,
          transactions,
          sampleMaterialIds: SAMPLE_MATERIAL_IDS,
          sampleTransactionIds: SAMPLE_TRANSACTION_IDS,
          removeSamples,
          today: todayIso(),
        })
      : buildVendorImportPlan(sheet, {
          vendors,
          materials,
          prs,
          quotes,
          sampleVendorIds: SAMPLE_VENDOR_IDS,
          removeSamples,
          aiMatches,
        });
  }, [sheet, kind, projects, materials, transactions, vendors, prs, quotes, removeSamples, targetProjectId, aiMatches]);

  if (!isOpen) return null;

  const label = kind === 'materials' ? 'Materials' : 'Vendors';
  const cols = columnsFor(kind);
  const importCount = plan ? plan.add.length + plan.update.length : 0;
  const removeCount = plan ? ('removeMaterialIds' in plan ? plan.removeMaterialIds.length : (plan as VendorImportPlan).removeVendorIds.length) : 0;
  const blocked = !plan || plan.missingColumns.length > 0 || plan.totalRows > BULK_MAX_ROWS || importCount === 0 || aiState === 'checking';

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setDone(null);
    setSheet(null);
    setFileName(file.name);
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      setError('Choose an Excel (.xlsx) or CSV (.csv) file. Old .xls files must be saved as .xlsx first.');
      return;
    }
    if (file.size > BULK_MAX_FILE_BYTES) {
      setError('The file is larger than 3 MB. Split it into smaller files.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/bulk/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: kind, fileName: file.name, data: await readAsBase64(file) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || `Could not read the file (HTTP ${res.status}).`);
      if (!json.rows?.length) throw new Error('The sheet has a header row but no data rows.');
      setSheet({ headers: json.headers, rows: json.rows });
    } catch (e: any) {
      setError(e?.message || 'Could not read the file.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const apply = () => {
    if (!plan || blocked) return;
    if (kind === 'materials') onApplyMaterials(plan as MaterialImportPlan);
    else onApplyVendors(plan as VendorImportPlan);
    const parts = [
      plan.add.length ? `${plan.add.length} added` : '',
      plan.update.length ? `${plan.update.length} updated` : '',
      removeCount ? `${removeCount} sample ${kind} removed` : '',
      plan.errors.length ? `${plan.errors.length} row${plan.errors.length === 1 ? '' : 's'} skipped` : '',
    ].filter(Boolean);
    setDone(`${label} imported: ${parts.join(', ')}.`);
    setSheet(null);
    setFileName('');
  };

  const issues = plan ? [...plan.errors.map((e) => ({ ...e, level: 'error' as const })), ...plan.warnings.map((w) => ({ ...w, level: 'warning' as const }))] : [];
  const shownIssues = showAllIssues ? issues : issues.slice(0, 8);
  const preview = plan ? [...plan.add.map((x) => ({ item: x, isNew: true })), ...plan.update.map((x) => ({ item: x, isNew: false }))].slice(0, 50) : [];

  const filteredVendors = vendors.filter((v) => {
    const q = dirSearch.trim().toLowerCase();
    return !q || v.name.toLowerCase().includes(q) || v.email.toLowerCase().includes(q) || v.suppliedMaterialCodes.some((c) => c.includes(q));
  });

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-950/50 backdrop-blur-xs" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`Bulk upload ${label.toLowerCase()}`} className="bg-white w-full max-w-4xl max-h-[92vh] rounded-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-[#23408e] text-white px-5 py-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
              {kind === 'materials' ? <Boxes size={20} /> : <Users size={20} />}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold">{kind === 'materials' ? 'Bulk Upload Materials' : 'Vendors'}</h2>
              <p className="text-xs text-blue-100">
                {kind === 'materials'
                  ? 'Upload the material list of one site (Excel or CSV).'
                  : `${vendors.length} vendor${vendors.length === 1 ? '' : 's'} registered. Upload your vendor list; each vendor is matched to the materials they supply.`}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="p-1.5 rounded-lg text-blue-100 hover:text-white hover:bg-white/10 cursor-pointer disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        {kind === 'vendors' && (
          <div className="flex items-center gap-1 border-b border-slate-200 px-5" role="tablist">
            {(
              [
                ['upload', 'Bulk Upload Vendors'],
                ['directory', `Vendor Directory (${vendors.length})`],
              ] as const
            ).map(([id, text]) => (
              <button
                key={id}
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={`px-3 py-2.5 text-sm font-semibold border-b-2 -mb-px cursor-pointer ${view === id ? 'border-[#23408e] text-[#23408e]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >
                {text}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-5 space-y-4">
          {view === 'directory' ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                <Search size={16} className="text-slate-400" />
                <input
                  value={dirSearch}
                  onChange={(e) => setDirSearch(e.target.value)}
                  placeholder="Search by vendor, email or material code"
                  aria-label="Search vendors"
                  className="flex-1 text-sm py-1 focus:outline-hidden"
                />
                <span className="text-xs text-slate-500 shrink-0">{filteredVendors.length} shown</span>
              </div>
              <div className="overflow-x-auto max-h-[55vh]">
                <table className="w-full text-sm text-left">
                  <thead className="sticky top-0">
                    <tr className="bg-[#23408e] text-white text-xs font-semibold uppercase tracking-wide">
                      <th className="px-3 py-2.5">Vendor</th>
                      <th className="px-3 py-2.5">Email</th>
                      <th className="px-3 py-2.5">Supplies (material codes)</th>
                      <th className="px-3 py-2.5">Terms</th>
                      <th className="px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVendors.slice(0, 300).map((v) => (
                      <tr key={v.id} className="border-t border-slate-100 hover:bg-[#f5f8fd] align-top">
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {v.name}
                          {SAMPLE_VENDOR_IDS.has(v.id) && <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">Sample</span>}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{v.email}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {v.suppliedMaterialCodes.map((c) => (
                              <span key={c} title={resolveMaterialGroup(c)} className="text-[10px] font-semibold font-mono px-1.5 py-0.5 rounded-full bg-[#eaf0fb] text-[#23408e] border border-[#c9d6f2]">#{c}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{v.standardCreditPeriod}</td>
                        <td className="px-3 py-2 text-slate-600">{v.status}</td>
                      </tr>
                    ))}
                    {filteredVendors.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">No vendors match your search.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {filteredVendors.length > 300 && <p className="px-4 py-2 text-xs text-slate-500 border-t border-slate-200">Showing the first 300. Refine the search to find others.</p>}
            </div>
          ) : (
            <>
              {done && (
                <div role="status" className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-lg px-4 py-2.5">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  <span>{done} The changes are saved automatically.</span>
                </div>
              )}

              {/* Step 1: format */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">1. Fill in the template</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {kind === 'materials'
                        ? 'One row per material of the site you choose below. Re-uploading updates materials with the same name on that site.'
                        : 'One row per vendor. Pick "Materials Can Supply" from the dropdowns (they list your materials), so RFQs reach every vendor who can supply that material. Re-uploading updates vendors with the same email.'}{' '}
                      Up to {BULK_MAX_ROWS.toLocaleString('en-IN')} rows, 3 MB per file.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`/api/bulk/template?type=${kind}`}
                      download
                      className="px-3.5 py-2 rounded-lg border border-[#23408e] text-[#23408e] bg-white hover:bg-[#f5f8fd] text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap"
                    >
                      <Download size={15} /> Download template
                    </a>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cols.map((c) => (
                    <span
                      key={c.key}
                      title={c.note}
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${c.required ? 'bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]' : 'bg-slate-50 text-slate-600 border-slate-200'}`}
                    >
                      {c.header.replace(' *', '')}
                      {c.required ? ' *' : ''}
                    </span>
                  ))}
                </div>
                {kind === 'vendors' && (
                  <p className="text-xs text-slate-500 flex items-start gap-1.5">
                    <Info size={13} className="text-[#23408e] shrink-0 mt-0.5" />
                    Upload materials first, then download the vendor template: its dropdowns list your {materials.length.toLocaleString('en-IN')} materials and the {STANDARD_MATERIAL_GROUPS.length} material groups. Typed names with spelling mistakes are corrected automatically (with AI if needed).
                  </p>
                )}
              </div>

              {/* Step 2: upload */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                <h3 className="text-sm font-bold text-slate-900">2. {kind === 'materials' ? 'Choose the site and upload the file' : 'Upload the file'}</h3>
                {kind === 'materials' && (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <label htmlFor="bulk-target-site" className="text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5 shrink-0">
                      <Building2 size={15} className="text-[#23408e]" /> Site *
                    </label>
                    <select
                      id="bulk-target-site"
                      value={targetProjectId}
                      onChange={(e) => setTargetProjectId(e.target.value)}
                      className="flex-1 bg-white border border-slate-300 text-slate-800 text-sm rounded-lg px-3 py-2 focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20 cursor-pointer"
                    >
                      <option value="">Select the site these materials belong to</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} - {p.location}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {kind === 'materials' && sheet && !targetProjectId && (
                  <div role="alert" className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-lg px-3 py-2">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" /> Select the site to check the file.
                  </div>
                )}
                <label
                  htmlFor={`bulk-file-${kind}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleFile(e.dataTransfer.files?.[0]);
                  }}
                  className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-[#c9d6f2] hover:border-[#23408e] bg-[#f5f8fd] rounded-lg px-4 py-6 text-center cursor-pointer transition-colors"
                >
                  {busy ? <Loader2 size={22} className="animate-spin text-[#23408e]" /> : <FileSpreadsheet size={22} className="text-[#23408e]" />}
                  <span className="text-sm font-semibold text-slate-800">
                    {busy ? `Reading ${fileName}...` : fileName ? fileName : 'Choose an .xlsx or .csv file, or drop it here'}
                  </span>
                  <span className="text-xs text-slate-500">Nothing is saved until you click Import.</span>
                </label>
                <input id={`bulk-file-${kind}`} ref={fileRef} type="file" accept=".xlsx,.csv" className="sr-only" onChange={(e) => handleFile(e.target.files?.[0])} />
                {error && (
                  <div role="alert" className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-lg px-3 py-2">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {error}
                  </div>
                )}

                {/* Sample data */}
                {sampleInfo.removable > 0 && (
                  <label className="flex items-start gap-2.5 bg-amber-50/60 border border-amber-200 rounded-lg px-3 py-2.5 text-sm cursor-pointer">
                    <input type="checkbox" checked={removeSamples} onChange={(e) => setRemoveSamples(e.target.checked)} className="mt-0.5 accent-[#23408e]" />
                    <span className="text-slate-700">
                      <strong className="text-slate-900">Remove sample data</strong> - delete the {sampleInfo.removable} demo {kind} that came with the app
                      {kind === 'materials' ? ' (and their demo stock movements)' : ''}, so you start with your own list.
                      {sampleInfo.kept.length > 0 && (
                        <span className="block text-xs text-slate-500 mt-0.5">
                          Kept because they have real {kind === 'materials' ? 'purchases or stock movements' : 'RFQs or quotes'}: {sampleInfo.kept.slice(0, 4).join(', ')}
                          {sampleInfo.kept.length > 4 ? ` and ${sampleInfo.kept.length - 4} more` : ''}.
                        </span>
                      )}
                    </span>
                  </label>
                )}
              </div>

              {/* Step 3: preview */}
              {plan && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">3. Check and import</h3>
                  {kind === 'vendors' && aiState !== 'idle' && (
                    <p role="status" className="text-xs text-slate-600 inline-flex items-center gap-1.5">
                      {aiState === 'checking' ? (
                        <><Loader2 size={13} className="animate-spin text-[#23408e]" /> Checking typed material names with AI...</>
                      ) : aiState === 'done' ? (
                        <><Sparkles size={13} className="text-[#23408e]" /> Typed material names checked with AI - corrections are listed below.</>
                      ) : (
                        <><Info size={13} className="text-slate-500" /> AI check unavailable - typed names were matched by spelling only.</>
                      )}
                    </p>
                  )}

                  {plan.missingColumns.length > 0 ? (
                    <div role="alert" className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-lg px-3 py-2">
                      <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                      <span>
                        Required column{plan.missingColumns.length === 1 ? '' : 's'} not found: <strong>{plan.missingColumns.join(', ')}</strong>. Use the template headers.
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        <Tile label="Rows read" value={plan.totalRows} />
                        <Tile label="New" value={plan.add.length} tone="navy" />
                        <Tile label="Updated" value={plan.update.length} tone="green" />
                        <Tile label="Skipped (errors)" value={plan.errors.length} tone={plan.errors.length ? 'red' : 'slate'} />
                        <Tile label="Samples removed" value={removeCount} tone={removeCount ? 'amber' : 'slate'} />
                      </div>

                      {kind === 'vendors' && Object.keys((plan as VendorImportPlan).coverage).length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Vendors per material code after import</p>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries((plan as VendorImportPlan).coverage)
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([code, n]) => (
                                <span key={code} title={resolveMaterialGroup(code)} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#eaf0fb] text-[#23408e] border border-[#c9d6f2]">
                                  #{code} {resolveMaterialGroup(code).split(/[&,]/)[0].trim()}: {n}
                                </span>
                              ))}
                          </div>
                        </div>
                      )}

                      {issues.length > 0 && (
                        <div className="rounded-lg border border-slate-200 overflow-hidden">
                          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 flex items-center justify-between">
                            <span>
                              {plan.errors.length} error{plan.errors.length === 1 ? '' : 's'} (rows skipped) • {plan.warnings.length} warning{plan.warnings.length === 1 ? '' : 's'}
                            </span>
                            {issues.length > 8 && (
                              <button onClick={() => setShowAllIssues((s) => !s)} className="text-[#23408e] hover:underline cursor-pointer">
                                {showAllIssues ? 'Show fewer' : `Show all ${issues.length}`}
                              </button>
                            )}
                          </div>
                          <ul className="max-h-48 overflow-y-auto divide-y divide-slate-100 text-xs">
                            {shownIssues.map((i, idx) => (
                              <li key={idx} className="px-3 py-1.5 flex items-start gap-2">
                                <span className={`shrink-0 font-semibold px-1.5 py-px rounded-full border ${i.level === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                                  {i.rowNumber ? `Row ${i.rowNumber}` : 'File'}
                                </span>
                                <span className="text-slate-700">{i.message}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {preview.length > 0 && (
                        <div className="rounded-lg border border-slate-200 overflow-hidden">
                          <div className="overflow-x-auto max-h-64">
                            <table className="w-full text-xs text-left">
                              <thead className="sticky top-0">
                                {kind === 'materials' ? (
                                  <tr className="bg-[#23408e] text-white font-semibold uppercase tracking-wide">
                                    <th className="px-2.5 py-2"></th>
                                    <th className="px-2.5 py-2">Material</th>
                                    <th className="px-2.5 py-2">Code</th>
                                    <th className="px-2.5 py-2 text-right">Stock</th>
                                    <th className="px-2.5 py-2 text-right">Rate</th>
                                    <th className="px-2.5 py-2 text-right">Value</th>
                                  </tr>
                                ) : (
                                  <tr className="bg-[#23408e] text-white font-semibold uppercase tracking-wide">
                                    <th className="px-2.5 py-2"></th>
                                    <th className="px-2.5 py-2">Vendor</th>
                                    <th className="px-2.5 py-2">Email</th>
                                    <th className="px-2.5 py-2">Matched material codes</th>
                                    <th className="px-2.5 py-2">Terms</th>
                                  </tr>
                                )}
                              </thead>
                              <tbody>
                                {preview.map(({ item, isNew }) =>
                                  kind === 'materials' ? (
                                    <tr key={(item as Material).id} className="border-t border-slate-100">
                                      <td className="px-2.5 py-1.5"><NewTag isNew={isNew} /></td>
                                      <td className="px-2.5 py-1.5 font-medium text-slate-900">{(item as Material).name}</td>
                                      <td className="px-2.5 py-1.5 font-mono text-[#23408e]">#{(item as Material).materialCode}</td>
                                      <td className="px-2.5 py-1.5 text-right whitespace-nowrap">{(item as Material).currentStock.toLocaleString('en-IN')} {(item as Material).unit}</td>
                                      <td className="px-2.5 py-1.5 text-right whitespace-nowrap">{rs((item as Material).unitCost)}</td>
                                      <td className="px-2.5 py-1.5 text-right whitespace-nowrap font-medium">{rs((item as Material).currentStock * (item as Material).unitCost)}</td>
                                    </tr>
                                  ) : (
                                    <tr key={(item as Vendor).id} className="border-t border-slate-100 align-top">
                                      <td className="px-2.5 py-1.5"><NewTag isNew={isNew} /></td>
                                      <td className="px-2.5 py-1.5 font-medium text-slate-900">{(item as Vendor).name}</td>
                                      <td className="px-2.5 py-1.5 text-slate-600">{(item as Vendor).email}</td>
                                      <td className="px-2.5 py-1.5">
                                        <div className="flex flex-wrap gap-1">
                                          {(item as Vendor).suppliedMaterialCodes.map((c) => (
                                            <span key={c} title={resolveMaterialGroup(c)} className="font-mono font-semibold px-1.5 py-px rounded-full bg-[#eaf0fb] text-[#23408e] border border-[#c9d6f2]">#{c}</span>
                                          ))}
                                        </div>
                                      </td>
                                      <td className="px-2.5 py-1.5 text-slate-600 whitespace-nowrap">{(item as Vendor).standardCreditPeriod}</td>
                                    </tr>
                                  )
                                )}
                              </tbody>
                            </table>
                          </div>
                          {plan.add.length + plan.update.length > preview.length && (
                            <p className="px-3 py-1.5 text-[11px] text-slate-500 border-t border-slate-200">
                              Showing {preview.length} of {(plan.add.length + plan.update.length).toLocaleString('en-IN')}.
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            {view === 'directory'
              ? 'Vendors are invited to RFQs for the material codes they supply.'
              : plan && !blocked
              ? `${importCount.toLocaleString('en-IN')} ${kind} will be saved${plan.errors.length ? `; ${plan.errors.length} row${plan.errors.length === 1 ? '' : 's'} with errors will be skipped` : ''}.`
              : 'Existing data is not changed until you import.'}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={busy} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-sm font-semibold cursor-pointer disabled:opacity-50">
              {done ? 'Close' : 'Cancel'}
            </button>
            {view === 'upload' && (
              <button
                onClick={apply}
                disabled={blocked || busy}
                className="px-4 py-2 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload size={15} /> Import {importCount ? importCount.toLocaleString('en-IN') : ''} {label}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function NewTag({ isNew }: { isNew: boolean }) {
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-px rounded-full border whitespace-nowrap ${isNew ? 'bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
      {isNew ? 'New' : 'Update'}
    </span>
  );
}
