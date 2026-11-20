/**
 * Bulk upload of materials and vendors (Excel .xlsx or .csv).
 *
 * Shared by the server (to build the downloadable templates / sample files) and the browser (to validate an
 * uploaded sheet and build the import plan). Pure TypeScript: no DOM and no Node APIs.
 *
 * Format rules (also written into the template's "Instructions" sheet):
 *  - Materials are uploaded per site: the site is chosen in the upload window, so the file has no site column.
 *  - Vendors pick what they can supply from dropdowns that list the uploaded materials ("Material List" sheet),
 *    so spelling mistakes cannot happen. Typed values are still accepted and matched (spelling-tolerant, then AI).
 *  - Header names are matched loosely (case, spaces, "*" and punctuation are ignored; common synonyms work).
 *  - Re-uploading is safe: an existing material (same site + name) or vendor (same email, else same name)
 *    is updated instead of duplicated. Up to BULK_MAX_ROWS rows per file.
 */
import type { Material, Project, Vendor, InventoryTransaction, ProjectRequirement, VendorQuotation, BillType } from '../types';
import { STANDARD_MATERIAL_GROUPS, formatMaterialCode, resolveMaterialCode, resolveMaterialGroup } from './materialCodes.js';

export const BULK_MAX_ROWS = 2000;
/** Upload size limit (the live server accepts requests up to ~4.5 MB; base64 adds a third). */
export const BULK_MAX_FILE_BYTES = 3 * 1024 * 1024;
/** Number of "Materials Can Supply" dropdown columns in the vendor template */
export const VENDOR_SUPPLY_COLUMNS = 6;

export type BulkKind = 'materials' | 'vendors';

export interface BulkColumn {
  key: string;
  header: string;
  required?: boolean;
  aliases: string[];
  note: string;
  width: number;
}

export const MATERIAL_CATEGORIES = ['Structural', 'Finishing', 'Masonry', 'Plumbing', 'Electrical', 'Others'] as const;
export const COMMON_UNITS = ['Bags', 'Tons', 'Kg', 'Brass', 'Cu M', 'Pieces', 'Nos', 'Liters', 'Boxes', 'Sq Ft', 'Sq M', 'Meters', 'Rmt', 'Sets', 'Rolls'];
export const GST_RATE_OPTIONS = [0, 5, 12, 18, 28];
export const VENDOR_STATUSES: Vendor['status'][] = ['Approved', 'Verified', 'Preferred', 'Under Review'];

export const MATERIAL_COLUMNS: BulkColumn[] = [
  { key: 'name', header: 'Material Name *', required: true, aliases: ['material', 'material name', 'item', 'item name', 'description', 'material description', 'resource'], note: 'Name shown everywhere in the app. The same name on the same site updates the existing material.', width: 34 },
  { key: 'code', header: 'Material Code', aliases: ['code', 'material code', 'item code', 'erp code', 'group code'], note: '3-digit code (see "Material Codes" sheet). Leave blank to detect it from the name. Vendors are matched to materials through this code.', width: 15 },
  { key: 'category', header: 'Category', aliases: ['category', 'material category', 'type'], note: `One of: ${MATERIAL_CATEGORIES.join(', ')}. Blank = taken from the material code.`, width: 14 },
  { key: 'unit', header: 'Unit *', required: true, aliases: ['unit', 'uom', 'unit of measure', 'unit of measurement', 'units'], note: `Unit of measurement, e.g. ${COMMON_UNITS.slice(0, 8).join(', ')}.`, width: 10 },
  { key: 'stock', header: 'Current Stock', aliases: ['stock', 'current stock', 'opening stock', 'quantity', 'qty', 'balance', 'stock qty', 'available stock'], note: 'Quantity on site now (opening stock). Number, default 0.', width: 14 },
  { key: 'minStock', header: 'Minimum Stock Level *', required: true, aliases: ['min stock', 'minimum stock', 'minimum stock level', 'min level', 'reorder level', 'safety stock', 'min threshold', 'threshold'], note: 'Low-stock alert level (number). Below this the material is flagged as Low Stock.', width: 20 },
  { key: 'rate', header: 'Unit Rate (Rs, excl. GST)', aliases: ['rate', 'unit rate', 'unit cost', 'cost', 'price', 'rate rs', 'unit price', 'purchase rate', 'unit rate rs excl gst'], note: 'Last purchase rate per unit, before GST. Used for stock value and estimation cost.', width: 20 },
  { key: 'billType', header: 'Bill Type (GST/URD)', aliases: ['bill type', 'gst urd', 'bill type gst urd', 'tax type'], note: 'GST for registered suppliers, URD for unregistered. Default GST.', width: 16 },
  { key: 'gstRate', header: 'GST Rate %', aliases: ['gst', 'gst rate', 'gst %', 'gst rate %', 'tax rate', 'gst percent'], note: `One of ${GST_RATE_OPTIONS.join(', ')}. Default 18 (0 for URD).`, width: 11 },
];

const supplyColumns: BulkColumn[] = Array.from({ length: VENDOR_SUPPLY_COLUMNS }, (_, i) =>
  i === 0
    ? {
        key: 'materials',
        header: 'Materials Can Supply *',
        required: true,
        aliases: ['materials can supply', 'can supply', 'materials supplied', 'materials', 'items supplied', 'products', 'supplies', 'material codes', 'material supplied'],
        note: 'Pick from the dropdown (it lists your materials and material groups from the "Material List" sheet). Use the next columns for more materials, or type several separated by commas.',
        width: 36,
      }
    : {
        key: `materials${i + 1}`,
        header: `Materials Can Supply ${i + 1}`,
        aliases: [`materials can supply ${i + 1}`, `can supply ${i + 1}`, `material ${i + 1}`],
        note: 'Optional: another material this vendor can supply (pick from the dropdown).',
        width: 30,
      }
);

export const VENDOR_COLUMNS: BulkColumn[] = [
  { key: 'name', header: 'Vendor Name *', required: true, aliases: ['vendor', 'vendor name', 'supplier', 'supplier name', 'company', 'company name', 'firm', 'firm name', 'name'], note: 'Company / firm name.', width: 30 },
  { key: 'email', header: 'Email *', required: true, aliases: ['email', 'email id', 'e mail', 'mail', 'email address'], note: 'RFQ emails and quote links are sent here. The same email updates the existing vendor.', width: 30 },
  ...supplyColumns,
  { key: 'contact', header: 'Contact Person', aliases: ['contact', 'contact person', 'contact name', 'person'], note: 'Optional.', width: 20 },
  { key: 'phone', header: 'Phone', aliases: ['phone', 'mobile', 'phone number', 'mobile number', 'contact number'], note: 'Optional.', width: 18 },
  { key: 'gstin', header: 'GSTIN', aliases: ['gstin', 'gst no', 'gst number', 'gst'], note: 'Optional. 15-character GSTIN.', width: 18 },
  { key: 'address', header: 'Address', aliases: ['address', 'city', 'location', 'office address'], note: 'Optional.', width: 26 },
  { key: 'terms', header: 'Payment Terms', aliases: ['payment terms', 'credit period', 'credit', 'terms', 'payment'], note: 'e.g. 15 Days, 30 Days, 45 Days, Advance. Default 30 Days.', width: 16 },
  { key: 'leadDays', header: 'Lead Time (Days)', aliases: ['lead time', 'lead days', 'lead time days', 'delivery days', 'lead'], note: 'Usual delivery time in days. Default 3.', width: 15 },
  { key: 'rating', header: 'Rating (0-5)', aliases: ['rating', 'score', 'vendor rating'], note: 'Default 4.0.', width: 12 },
  { key: 'status', header: 'Status', aliases: ['status', 'vendor status', 'approval status'], note: `One of: ${VENDOR_STATUSES.join(', ')}. Default Approved.`, width: 14 },
];

export const columnsFor = (kind: BulkKind) => (kind === 'materials' ? MATERIAL_COLUMNS : VENDOR_COLUMNS);

/** "Unit Rate (Rs, excl. GST) *" -> "unit rate rs excl gst" */
export function normalizeHeader(h: string): string {
  return String(h || '')
    .toLowerCase()
    .replace(/[*()[\]/\\.,:%_\-–#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parsed sheet as returned by /api/bulk/parse: headers as written and each row as header -> text. */
export interface ParsedSheet {
  headers: string[];
  rows: { rowNumber: number; values: Record<string, string> }[];
}

/** Maps a sheet's headers to template column keys. */
export function mapColumns(kind: BulkKind, headers: string[]) {
  const cols = columnsFor(kind);
  const mapping: Record<string, string> = {}; // column key -> sheet header
  for (const header of headers) {
    const n = normalizeHeader(header);
    if (!n) continue;
    const col =
      cols.find((c) => normalizeHeader(c.header) === n && !mapping[c.key]) ||
      cols.find((c) => !mapping[c.key] && c.aliases.some((a) => normalizeHeader(a) === n));
    if (col) mapping[col.key] = header;
  }
  const missing = cols.filter((c) => c.required && !mapping[c.key]).map((c) => c.header.replace(' *', ''));
  return { mapping, missing };
}

export interface RowIssue {
  rowNumber: number;
  message: string;
}

const num = (raw: string | undefined): number | null => {
  const t = String(raw ?? '').replace(/[,₹\s]|rs\.?/gi, '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};
const clean = (s: string | undefined, max = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
export const nameKey = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const round2 = (n: number) => Math.round(n * 100) / 100;
const GSTIN_RE = /^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]Z[0-9A-Z]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ------------------------------------------------------------------ */
/* Sample (demo) data detection                                        */
/* ------------------------------------------------------------------ */

/**
 * Sample materials that can be removed safely: bundled demo records (of one site when projectId is given)
 * with no real activity (no stock movement other than the bundled demo movements).
 */
export function findRemovableSampleMaterials(
  materials: Material[],
  transactions: InventoryTransaction[],
  sampleMaterialIds: Set<string>,
  sampleTransactionIds: Set<string>,
  projectId?: string
) {
  const usedByRealActivity = new Set(
    transactions.filter((t) => !sampleTransactionIds.has(t.id)).map((t) => t.materialId)
  );
  const inScope = materials.filter((m) => sampleMaterialIds.has(m.id) && (!projectId || m.projectId === projectId));
  const removable = inScope.filter((m) => !usedByRealActivity.has(m.id));
  const removableIds = new Set(removable.map((m) => m.id));
  const transactionIds = transactions.filter((t) => removableIds.has(t.materialId)).map((t) => t.id);
  const keptSamples = inScope.filter((m) => usedByRealActivity.has(m.id));
  return { removable, transactionIds, keptSamples };
}

/** Sample vendors that can be removed safely: demo vendors never invited to, quoting on or awarded an RFQ. */
export function findRemovableSampleVendors(
  vendors: Vendor[],
  prs: ProjectRequirement[],
  quotes: VendorQuotation[],
  sampleVendorIds: Set<string>
) {
  const inUse = new Set<string>();
  for (const pr of prs) {
    (pr.invitedVendorIds || []).forEach((id) => inUse.add(id));
    if (pr.selectedVendorId) inUse.add(pr.selectedVendorId);
  }
  quotes.forEach((q) => inUse.add(q.vendorId));
  const removable = vendors.filter((v) => sampleVendorIds.has(v.id) && !inUse.has(v.id));
  const keptSamples = vendors.filter((v) => sampleVendorIds.has(v.id) && inUse.has(v.id));
  return { removable, keptSamples };
}

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

export interface MaterialImportPlan {
  add: Material[];
  update: Material[];
  removeMaterialIds: string[];
  removeTransactionIds: string[];
  errors: RowIssue[];
  warnings: RowIssue[];
  totalRows: number;
}

const randomId = () => Math.random().toString(36).slice(2, 8);

export function buildMaterialImportPlan(
  sheet: ParsedSheet,
  ctx: {
    project: Project;
    materials: Material[];
    transactions: InventoryTransaction[];
    sampleMaterialIds: Set<string>;
    sampleTransactionIds: Set<string>;
    removeSamples: boolean;
    today: string;
  }
): MaterialImportPlan & { missingColumns: string[] } {
  const { mapping, missing } = mapColumns('materials', sheet.headers);
  const plan: MaterialImportPlan & { missingColumns: string[] } = {
    add: [], update: [], removeMaterialIds: [], removeTransactionIds: [], errors: [], warnings: [], totalRows: 0, missingColumns: missing,
  };
  if (missing.length) return plan;
  const project = ctx.project;
  const get = (row: Record<string, string>, key: string) => (mapping[key] ? row[mapping[key]] : '');

  const removal = ctx.removeSamples
    ? findRemovableSampleMaterials(ctx.materials, ctx.transactions, ctx.sampleMaterialIds, ctx.sampleTransactionIds, project.id)
    : { removable: [], transactionIds: [] as string[] };
  const removedIds = new Set(removal.removable.map((m) => m.id));

  // Existing materials of this site that stay, by name
  const existing = new Map<string, Material>();
  ctx.materials.filter((m) => m.projectId === project.id && !removedIds.has(m.id)).forEach((m) => existing.set(nameKey(m.name), m));
  const seenInFile = new Map<string, number>();
  const updatedById = new Map<string, Material>();

  for (const { rowNumber, values } of sheet.rows) {
    const name = clean(get(values, 'name'), 120);
    if (!name && Object.values(values).every((v) => !String(v || '').trim())) continue;
    plan.totalRows++;

    const rowErrors: string[] = [];
    if (!name) rowErrors.push('Material Name is empty');
    const unit = clean(get(values, 'unit'), 30);
    if (!unit) rowErrors.push('Unit is empty');

    const stock = num(get(values, 'stock'));
    const minStock = num(get(values, 'minStock'));
    const rate = num(get(values, 'rate'));
    const gstRaw = num(get(values, 'gstRate'));
    if (Number.isNaN(stock) || (stock ?? 0) < 0) rowErrors.push('Current Stock must be a number of 0 or more');
    if (minStock === null) rowErrors.push('Minimum Stock Level is empty');
    else if (Number.isNaN(minStock) || minStock < 0) rowErrors.push('Minimum Stock Level must be a number of 0 or more');
    if (Number.isNaN(rate) || (rate ?? 0) < 0) rowErrors.push('Unit Rate must be a number of 0 or more');
    if (Number.isNaN(gstRaw)) rowErrors.push('GST Rate must be a number');

    if (rowErrors.length) {
      plan.errors.push({ rowNumber, message: rowErrors.join('; ') });
      continue;
    }

    const key = nameKey(name);
    if (seenInFile.has(key)) {
      plan.warnings.push({ rowNumber, message: `Same material as row ${seenInFile.get(key)} - the later row is used` });
    }
    seenInFile.set(key, rowNumber);

    const codeRaw = clean(get(values, 'code'), 12).replace(/^#/, '');
    const categoryRaw = clean(get(values, 'category'), 30);
    const code = codeRaw ? formatMaterialCode(codeRaw) : resolveMaterialCode({ name, category: categoryRaw as any });
    const std = STANDARD_MATERIAL_GROUPS.find((g) => g.code === code);
    const category =
      (MATERIAL_CATEGORIES.find((c) => c.toLowerCase() === categoryRaw.toLowerCase()) as string) ||
      (categoryRaw ? categoryRaw : std?.category || 'Others');
    if (categoryRaw && !MATERIAL_CATEGORIES.some((c) => c.toLowerCase() === categoryRaw.toLowerCase())) {
      plan.warnings.push({ rowNumber, message: `Category "${categoryRaw}" is not a standard one - kept as a custom category` });
    }

    const billRaw = clean(get(values, 'billType'), 10).toUpperCase();
    const billType: BillType = billRaw === 'URD' ? 'URD' : 'GST';
    let gstRate = billType === 'URD' ? 0 : gstRaw ?? 18;
    if (billType === 'GST' && !GST_RATE_OPTIONS.includes(gstRate)) {
      const nearest = GST_RATE_OPTIONS.reduce((b, o) => (Math.abs(o - gstRate) < Math.abs(b - gstRate) ? o : b), 18);
      plan.warnings.push({ rowNumber, message: `GST Rate ${gstRate}% is not standard - ${nearest}% used` });
      gstRate = nearest;
    }

    const qty = round2(stock ?? 0);
    const unitCost = round2(rate ?? 0);
    const baseAmount = round2(qty * unitCost);
    const gstAmount = round2((baseAmount * gstRate) / 100);
    const fields: Partial<Material> = {
      name,
      category: category as Material['category'],
      unit,
      currentStock: qty,
      minThreshold: round2(minStock ?? 0),
      unitCost,
      totalPrice: round2(baseAmount + gstAmount),
      baseAmount,
      gstAmount,
      gstRate,
      billType,
      materialCode: code,
      materialGroup: resolveMaterialGroup(code, { category: category as any, materialGroup: std?.name }),
    };

    const existingMat = existing.get(key);
    const current = (existingMat && updatedById.get(existingMat.id)) || existingMat;
    if (current) {
      updatedById.set(current.id, { ...current, ...fields } as Material);
    } else {
      const addIdx = plan.add.findIndex((m) => nameKey(m.name) === key);
      const id = addIdx >= 0 ? plan.add[addIdx].id : `mat-${project.id}-${Date.now().toString(36)}-${randomId()}`;
      const material: Material = {
        id,
        projectId: project.id,
        ...(fields as Omit<Material, 'id' | 'projectId'>),
        billNumber: 'OPENING-STOCK',
        rateHistory:
          qty > 0 && unitCost > 0
            ? [{ id: `rh-open-${id}`, date: ctx.today, rate: unitCost, quantity: qty, totalPrice: round2(baseAmount + gstAmount), baseAmount, gstAmount, gstRate, billType, notes: 'Opening stock (bulk upload)' }]
            : [],
      };
      if (addIdx >= 0) plan.add[addIdx] = material;
      else plan.add.push(material);
    }
  }

  plan.update = [...updatedById.values()];
  plan.removeMaterialIds = [...removedIds];
  plan.removeTransactionIds = removal.transactionIds;
  if (plan.totalRows > BULK_MAX_ROWS) {
    plan.errors.unshift({ rowNumber: 0, message: `The file has ${plan.totalRows} rows; the limit is ${BULK_MAX_ROWS} per upload. Split it into smaller files.` });
  }
  return plan;
}

/* ------------------------------------------------------------------ */
/* Material list for the vendor template's dropdowns                   */
/* ------------------------------------------------------------------ */

export interface SupplyOption {
  /** Exactly what appears in the dropdown */
  label: string;
  code: string;
}

/** "All Cement & Binding Materials (#001)" */
export const groupOptionLabel = (code: string, name: string) => `All ${name} (#${code})`;

/**
 * Dropdown entries for "Materials Can Supply": every distinct material name in the catalogue (all sites)
 * plus one "All <group>" entry per material code. Each maps to a material code.
 */
export function buildSupplyOptions(materials: Pick<Material, 'name' | 'materialCode' | 'category' | 'materialGroup'>[]): SupplyOption[] {
  const byName = new Map<string, SupplyOption>();
  const codes = new Map<string, string>();
  for (const m of materials) {
    const code = resolveMaterialCode(m);
    const label = clean(m.name, 120);
    if (label && !byName.has(nameKey(label))) byName.set(nameKey(label), { label, code });
    if (!codes.has(code)) codes.set(code, resolveMaterialGroup(code, m));
  }
  STANDARD_MATERIAL_GROUPS.forEach((g) => !codes.has(g.code) && codes.set(g.code, g.name));
  const groups = [...codes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, name]) => ({ label: groupOptionLabel(code, name), code }));
  const names = [...byName.values()].sort((a, b) => a.label.localeCompare(b.label));
  return [...groups, ...names];
}

/* ------------------------------------------------------------------ */
/* Vendors                                                             */
/* ------------------------------------------------------------------ */

/** Edit distance (for spelling mistakes such as "Cemnt" or "TMT Stel") */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const allowedTypos = (len: number) => (len >= 8 ? 2 : len >= 5 ? 1 : 0);

/**
 * Turns supply entries (dropdown labels or typed text like "Cement, TMT Steel; 011") into material codes.
 * Order: dropdown label / "(#001)" -> 3-digit code -> exact material or group name -> group keywords ->
 * material name containment -> spelling-tolerant match -> AI suggestions (aiMatches, computed on the server).
 */
export function matchSuppliedMaterials(text: string, materials: Material[], aiMatches: Record<string, string> = {}) {
  const items = String(text || '')
    .split(/[,;\n|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const codes = new Set<string>();
  const matched: { item: string; code: string; label: string; how: 'list' | 'exact' | 'fuzzy' | 'ai' }[] = [];
  const unmatched: string[] = [];
  const catalogue = materials.map((m) => ({ n: nameKey(m.name), code: resolveMaterialCode(m), group: m.materialGroup || '' }));
  const groupWords = STANDARD_MATERIAL_GROUPS.flatMap((g) => [...g.keywords, ...nameKey(g.name).split(/\s|&/).filter((w) => w.length >= 5)].map((k) => ({ k: nameKey(k), code: g.code })));

  for (const item of items) {
    const n = nameKey(item);
    let code: string | undefined;
    let how: 'list' | 'exact' | 'fuzzy' | 'ai' = 'exact';
    const tagged = item.match(/\(#\s*(\d{1,3})\)\s*$/) || item.match(/^#\s*(\d{1,3})\b/);
    if (tagged) { code = formatMaterialCode(tagged[1]); how = 'list'; }
    if (!code && /^\d{1,3}$/.test(item)) code = formatMaterialCode(item);
    if (!code) code = catalogue.find((c) => c.n === n)?.code;
    if (!code) code = STANDARD_MATERIAL_GROUPS.find((g) => nameKey(g.name) === n)?.code;
    if (!code) code = STANDARD_MATERIAL_GROUPS.find((g) => g.keywords.some((k) => (` ${n} `).includes(` ${k} `) || n === k))?.code;
    if (!code) code = catalogue.find((c) => c.n.includes(n) && n.length >= 4)?.code || catalogue.find((c) => n.includes(c.n) && c.n.length >= 4)?.code;
    if (!code) code = STANDARD_MATERIAL_GROUPS.find((g) => g.keywords.some((k) => k.length >= 4 && n.includes(k)))?.code;
    if (!code) {
      // Spelling mistakes: compare each typed word with group keywords and catalogue names
      const words = n.split(/\s+/).filter((w) => w.length >= 4);
      outer: for (const w of words) {
        const tol = allowedTypos(w.length);
        if (!tol) continue;
        for (const g of groupWords) if (g.k.length >= 4 && editDistance(w, g.k, tol) <= tol) { code = g.code; break outer; }
        for (const c of catalogue) for (const cw of c.n.split(/\s+/)) if (cw.length >= 4 && editDistance(w, cw, tol) <= tol) { code = c.code; break outer; }
      }
      if (code) how = 'fuzzy';
    }
    if (!code && aiMatches[n]) { code = formatMaterialCode(aiMatches[n]); how = 'ai'; }
    if (code) {
      codes.add(code);
      const label = STANDARD_MATERIAL_GROUPS.find((g) => g.code === code)?.name || catalogue.find((c) => c.code === code)?.group || `Code ${code}`;
      matched.push({ item, code, label, how });
    } else {
      unmatched.push(item);
    }
  }
  return { codes: [...codes].sort(), matched, unmatched };
}

const supplyText = (get: (key: string) => string) =>
  [get('materials'), ...Array.from({ length: VENDOR_SUPPLY_COLUMNS - 1 }, (_, i) => get(`materials${i + 2}`))]
    .map((s) => clean(s, 500))
    .filter(Boolean)
    .join(', ');

/** Typed supply entries that the rules cannot match (sent to the AI matcher). */
export function collectUnmatchedSupplyItems(sheet: ParsedSheet, materials: Material[]): string[] {
  const { mapping, missing } = mapColumns('vendors', sheet.headers);
  if (missing.length) return [];
  const out = new Set<string>();
  for (const { values } of sheet.rows) {
    const text = supplyText((key) => (mapping[key] ? values[mapping[key]] : ''));
    matchSuppliedMaterials(text, materials).unmatched.forEach((u) => out.add(u));
  }
  return [...out].slice(0, 200);
}

export interface VendorImportPlan {
  add: Vendor[];
  update: Vendor[];
  removeVendorIds: string[];
  errors: RowIssue[];
  warnings: RowIssue[];
  totalRows: number;
  /** Number of vendors that will supply each material code after the import */
  coverage: Record<string, number>;
}

export function buildVendorImportPlan(
  sheet: ParsedSheet,
  ctx: {
    vendors: Vendor[];
    materials: Material[];
    prs: ProjectRequirement[];
    quotes: VendorQuotation[];
    sampleVendorIds: Set<string>;
    removeSamples: boolean;
    aiMatches?: Record<string, string>;
  }
): VendorImportPlan & { missingColumns: string[] } {
  const { mapping, missing } = mapColumns('vendors', sheet.headers);
  const plan: VendorImportPlan & { missingColumns: string[] } = {
    add: [], update: [], removeVendorIds: [], errors: [], warnings: [], totalRows: 0, coverage: {}, missingColumns: missing,
  };
  if (missing.length) return plan;

  const removal = ctx.removeSamples
    ? findRemovableSampleVendors(ctx.vendors, ctx.prs, ctx.quotes, ctx.sampleVendorIds)
    : { removable: [] };
  const removedIds = new Set(removal.removable.map((v) => v.id));
  const remaining = ctx.vendors.filter((v) => !removedIds.has(v.id));
  const byEmail = new Map(remaining.filter((v) => v.email).map((v) => [v.email.toLowerCase(), v]));
  const byName = new Map(remaining.map((v) => [nameKey(v.name), v]));
  const updatedById = new Map<string, Vendor>();
  const addedByEmail = new Map<string, Vendor>();

  for (const { rowNumber, values } of sheet.rows) {
    const get = (key: string) => (mapping[key] ? values[mapping[key]] : '');
    const name = clean(get('name'), 120);
    const email = clean(get('email'), 120).toLowerCase();
    const materialsText = supplyText(get);
    if (!name && !email && !materialsText && Object.values(values).every((v) => !String(v || '').trim())) continue;
    plan.totalRows++;

    const rowErrors: string[] = [];
    if (!name) rowErrors.push('Vendor Name is empty');
    if (!email) rowErrors.push('Email is empty');
    else if (!EMAIL_RE.test(email)) rowErrors.push(`Email "${email}" is not valid`);
    const supplied = matchSuppliedMaterials(materialsText, ctx.materials, ctx.aiMatches);
    if (!materialsText) rowErrors.push('Materials Can Supply is empty');
    else if (!supplied.codes.length) rowErrors.push(`"${materialsText}" could not be matched to any material - pick from the dropdown`);
    const lead = num(get('leadDays'));
    const rating = num(get('rating'));
    if (Number.isNaN(lead) || (lead ?? 0) < 0) rowErrors.push('Lead Time must be a number of days');
    if (Number.isNaN(rating) || (rating ?? 0) < 0 || (rating ?? 0) > 5) rowErrors.push('Rating must be between 0 and 5');
    if (rowErrors.length) {
      plan.errors.push({ rowNumber, message: rowErrors.join('; ') });
      continue;
    }
    if (supplied.unmatched.length) plan.warnings.push({ rowNumber, message: `Not matched (ignored): ${supplied.unmatched.join(', ')}` });
    const corrected = supplied.matched.filter((m) => m.how === 'fuzzy' || m.how === 'ai');
    if (corrected.length) {
      plan.warnings.push({ rowNumber, message: `Spelling corrected${corrected.some((c) => c.how === 'ai') ? ' (AI)' : ''}: ${corrected.map((c) => `"${c.item}" -> ${c.label} (#${c.code})`).join(', ')}` });
    }

    const gstin = clean(get('gstin'), 20).toUpperCase();
    if (gstin && !GSTIN_RE.test(gstin)) plan.warnings.push({ rowNumber, message: `GSTIN "${gstin}" does not look valid - imported as written` });
    const statusRaw = clean(get('status'), 20);
    const status = VENDOR_STATUSES.find((s) => s.toLowerCase() === statusRaw.toLowerCase()) || 'Approved';
    const termsRaw = clean(get('terms'), 40);
    const terms = termsRaw ? (/^\d+$/.test(termsRaw) ? `${termsRaw} Days` : termsRaw) : '30 Days';

    const fields: Omit<Vendor, 'id'> = {
      name,
      email,
      contactPerson: clean(get('contact'), 80),
      phone: clean(get('phone'), 30),
      address: clean(get('address'), 200),
      gstin,
      rating: rating === null ? 4 : round2(rating),
      suppliedMaterialCodes: supplied.codes,
      standardCreditPeriod: terms,
      avgLeadDays: lead === null ? 3 : Math.round(lead),
      status,
    };

    // The same vendor on several rows: merge what they can supply
    const sameInFile = addedByEmail.get(email);
    const existingVendor = byEmail.get(email) || byName.get(nameKey(name));
    const current = sameInFile || (existingVendor && (updatedById.get(existingVendor.id) || existingVendor));
    if (sameInFile) {
      plan.warnings.push({ rowNumber, message: `Same email as an earlier row - materials combined` });
      const merged = { ...sameInFile, ...fields, suppliedMaterialCodes: [...new Set([...sameInFile.suppliedMaterialCodes, ...supplied.codes])].sort() };
      addedByEmail.set(email, merged);
      if (updatedById.has(merged.id)) updatedById.set(merged.id, merged);
    } else if (current) {
      const merged: Vendor = {
        ...current,
        ...fields,
        contactPerson: fields.contactPerson || current.contactPerson,
        phone: fields.phone || current.phone,
        address: fields.address || current.address,
        gstin: fields.gstin || current.gstin,
      };
      updatedById.set(current.id, merged);
      addedByEmail.set(email, merged);
    } else {
      const vendor: Vendor = { id: `ven-${Date.now().toString(36)}-${randomId()}`, ...fields };
      addedByEmail.set(email, vendor);
    }
  }

  const existingIds = new Set(ctx.vendors.map((v) => v.id));
  const finalByEmail = [...addedByEmail.values()];
  plan.update = finalByEmail.filter((v) => existingIds.has(v.id));
  plan.add = finalByEmail.filter((v) => !existingIds.has(v.id));
  plan.removeVendorIds = [...removedIds];
  if (plan.totalRows > BULK_MAX_ROWS) {
    plan.errors.unshift({ rowNumber: 0, message: `The file has ${plan.totalRows} rows; the limit is ${BULK_MAX_ROWS} per upload. Split it into smaller files.` });
  }

  // Supplier coverage per material code after the import
  const updatedIds = new Set(plan.update.map((v) => v.id));
  const finalVendors = [...remaining.filter((v) => !updatedIds.has(v.id)), ...plan.update, ...plan.add];
  for (const v of finalVendors) for (const c of v.suppliedMaterialCodes || []) plan.coverage[formatMaterialCode(c)] = (plan.coverage[formatMaterialCode(c)] || 0) + 1;
  return plan;
}

/* ------------------------------------------------------------------ */
/* Sample files (download and try)                                     */
/* ------------------------------------------------------------------ */

/** [name, code, category, unit, stock, minStock, rate, billType, gst] */
export const SAMPLE_MATERIAL_ROWS: (string | number)[][] = [
  ['OPC CEMENT 53 GRADE', '001', 'Structural', 'Bags', 420, 150, 385, 'GST', 28],
  ['PPC CEMENT', '001', 'Structural', 'Bags', 260, 100, 365, 'GST', 28],
  ['WHITE CEMENT', '001', 'Finishing', 'Bags', 40, 15, 880, 'GST', 28],
  ['NON SHRINK GROUT', '001', 'Structural', 'Bags', 55, 20, 650, 'GST', 18],
  ['TMT BAR FE550D 8MM', '002', 'Structural', 'Tons', 6.5, 3, 56500, 'GST', 18],
  ['TMT BAR FE550D 12MM', '002', 'Structural', 'Tons', 9, 4, 57200, 'GST', 18],
  ['TMT BAR FE550D 16MM', '002', 'Structural', 'Tons', 7, 4, 57000, 'GST', 18],
  ['MS ANGLE 50X50X5', '002', 'Structural', 'Tons', 1.2, 0.5, 61000, 'GST', 18],
  ['BINDING WIRE', '002', 'Structural', 'Kg', 180, 60, 78, 'GST', 18],
  ['CRUSH SAND', '003', 'Structural', 'Brass', 12, 6, 5400, 'URD', 0],
  ['PLASTER SAND', '003', 'Structural', 'Brass', 8, 4, 5600, 'URD', 0],
  ['AGGREGATE 20MM', '003', 'Structural', 'Brass', 15, 8, 4700, 'URD', 0],
  ['AGGREGATE 10MM', '003', 'Structural', 'Brass', 10, 6, 4800, 'URD', 0],
  ['AAC BLOCK 600X200X150', '004', 'Masonry', 'Pieces', 3200, 1500, 68, 'GST', 12],
  ['RED CLAY BRICK', '004', 'Masonry', 'Pieces', 8000, 3000, 9, 'URD', 0],
  ['BLOCK ADHESIVE', '004', 'Masonry', 'Bags', 70, 30, 420, 'GST', 18],
  ['SBR LATEX WATERPROOFING', '005', 'Finishing', 'Liters', 120, 50, 230, 'GST', 18],
  ['VITRIFIED TILE 600X600', '006', 'Finishing', 'Boxes', 260, 100, 690, 'GST', 18],
  ['TILE ADHESIVE C2', '006', 'Finishing', 'Bags', 90, 40, 480, 'GST', 18],
  ['GRANITE 18MM', '007', 'Finishing', 'Sq Ft', 900, 300, 185, 'GST', 18],
  ['FLUSH DOOR 32MM', '008', 'Finishing', 'Pieces', 36, 12, 4600, 'GST', 18],
  ['ALUMINIUM SLIDING WINDOW', '009', 'Finishing', 'Pieces', 28, 10, 3900, 'GST', 18],
  ['FR CABLE 2.5 SQMM', '010', 'Electrical', 'Meters', 2500, 800, 28, 'GST', 18],
  ['MODULAR SWITCH 6A', '010', 'Electrical', 'Pieces', 400, 150, 65, 'GST', 18],
  ['CPVC PIPE 1 INCH', '011', 'Plumbing', 'Meters', 600, 200, 96, 'GST', 18],
  ['UPVC FITTINGS SET', '011', 'Plumbing', 'Sets', 120, 40, 240, 'GST', 18],
  ['EXTERIOR EMULSION', '012', 'Finishing', 'Liters', 200, 80, 265, 'GST', 18],
  ['WALL PUTTY', '012', 'Finishing', 'Bags', 110, 40, 720, 'GST', 18],
  ['SAFETY HELMET', '013', 'Others', 'Pieces', 60, 25, 180, 'GST', 18],
  ['SAFETY SIGNAGE BOARD', '013', 'Others', 'Pieces', 25, 10, 750, 'GST', 18],
];

/** Sample vendors whose "Materials Can Supply" entries come from the dropdown list built from the materials. */
export function buildSampleVendorRows(options: SupplyOption[]): string[][] {
  const pick = (want: string) => options.find((o) => o.label === want)?.label || want;
  const groupLabel = (code: string) => options.find((o) => o.code === code && o.label.startsWith('All '))?.label || `#${code}`;
  const v = (name: string, email: string, supplies: string[], contact: string, phone: string, gstin: string, address: string, terms: string, lead: number, rating: number, status: string) => {
    const s = [...supplies, ...Array(VENDOR_SUPPLY_COLUMNS).fill('')].slice(0, VENDOR_SUPPLY_COLUMNS);
    return [name, email, ...s, contact, phone, gstin, address, terms, String(lead), String(rating), status];
  };
  return [
    v('Shree Ganesh Cement Traders', 'replace-with-real-email-1@example.com', [pick('OPC CEMENT 53 GRADE'), pick('PPC CEMENT'), pick('WHITE CEMENT')], 'Rakesh Jain', '+91 98200 11111', '27AABCS1234A1Z5', 'Bhiwandi, Thane', '30 Days', 2, 4.6, 'Preferred'),
    v('UltraBuild Cement Depot', 'replace-with-real-email-2@example.com', [groupLabel('001')], 'Meena Shah', '+91 98200 22222', '', 'Wakad, Pune', '15 Days', 1, 4.2, 'Approved'),
    v('Mahalaxmi Steel Suppliers', 'replace-with-real-email-3@example.com', [pick('TMT BAR FE550D 8MM'), pick('TMT BAR FE550D 12MM'), pick('TMT BAR FE550D 16MM'), pick('BINDING WIRE')], 'Sunil Patil', '+91 98200 33333', '27AABCM5678B1Z2', 'Chakan MIDC, Pune', '45 Days', 3, 4.7, 'Preferred'),
    v('Tata Steel Stockist Pune', 'replace-with-real-email-4@example.com', [groupLabel('002')], 'Anil Kulkarni', '+91 98200 44444', '', 'Bhosari, Pune', 'Advance', 2, 4.4, 'Approved'),
    v('Om Sai Sand & Aggregates', 'replace-with-real-email-5@example.com', [pick('CRUSH SAND'), pick('PLASTER SAND'), pick('AGGREGATE 20MM'), pick('AGGREGATE 10MM')], 'Ganpat More', '+91 98200 55555', '', 'Wagholi, Pune', 'Advance', 1, 4.0, 'Approved'),
    v('Siporex Block Centre', 'replace-with-real-email-6@example.com', [pick('AAC BLOCK 600X200X150'), pick('BLOCK ADHESIVE')], 'Vikas Rao', '+91 98200 66666', '27AABCS9012C1Z9', 'Talegaon, Pune', '30 Days', 3, 4.3, 'Verified'),
    v('Krishna Bricks Kiln', 'replace-with-real-email-7@example.com', [pick('RED CLAY BRICK')], 'Krishna Pawar', '+91 98200 77777', '', 'Shirur, Pune', 'Advance', 2, 3.9, 'Approved'),
    v('Dr. Fixit Waterproofing Dealer', 'replace-with-real-email-8@example.com', [pick('SBR LATEX WATERPROOFING'), groupLabel('005')], 'Priya Joshi', '+91 98200 88888', '', 'Kothrud, Pune', '30 Days', 2, 4.5, 'Approved'),
    v('Kajaria Tile Gallery', 'replace-with-real-email-9@example.com', [pick('VITRIFIED TILE 600X600'), pick('TILE ADHESIVE C2')], 'Rahul Mehta', '+91 98200 99999', '27AABCK3456D1Z1', 'Baner, Pune', '45 Days', 4, 4.6, 'Preferred'),
    v('Granite House', 'replace-with-real-email-10@example.com', [pick('GRANITE 18MM')], 'Imran Shaikh', '+91 98201 10101', '', 'Kondhwa, Pune', '30 Days', 5, 4.1, 'Approved'),
    v('Woodcraft Doors & Hardware', 'replace-with-real-email-11@example.com', [pick('FLUSH DOOR 32MM'), groupLabel('008')], 'Nitin Deshpande', '+91 98201 20202', '', 'Hadapsar, Pune', '30 Days', 7, 4.2, 'Approved'),
    v('Alufit Windows', 'replace-with-real-email-12@example.com', [pick('ALUMINIUM SLIDING WINDOW')], 'Sameer Khan', '+91 98201 30303', '', 'Pimpri, Pune', 'Advance', 10, 4.0, 'Under Review'),
    v('Polycab Electricals Distributor', 'replace-with-real-email-13@example.com', [pick('FR CABLE 2.5 SQMM'), pick('MODULAR SWITCH 6A')], 'Deepak Agarwal', '+91 98201 40404', '27AABCP7890E1Z4', 'Budhwar Peth, Pune', '30 Days', 2, 4.5, 'Preferred'),
    v('Astral Pipes Stockist', 'replace-with-real-email-14@example.com', [pick('CPVC PIPE 1 INCH'), pick('UPVC FITTINGS SET')], 'Kiran Bhosale', '+91 98201 50505', '', 'Nigdi, Pune', '15 Days', 2, 4.3, 'Approved'),
    v('Asian Paints Colour World', 'replace-with-real-email-15@example.com', [pick('EXTERIOR EMULSION'), pick('WALL PUTTY')], 'Swati Kale', '+91 98201 60606', '', 'Aundh, Pune', '30 Days', 2, 4.4, 'Approved'),
    v('SafeSite Safety Supplies', 'replace-with-real-email-16@example.com', [pick('SAFETY HELMET'), pick('SAFETY SIGNAGE BOARD')], 'Rohit Nair', '+91 98201 70707', '', 'Swargate, Pune', 'Advance', 1, 4.1, 'Approved'),
    // Typed by hand with spelling mistakes: shows the automatic spelling correction / AI matching
    v('Balaji Building Materials', 'replace-with-real-email-17@example.com', ['Cemnt, TMT Stel bars, Plaster sannd'], 'Balaji Shinde', '+91 98201 80808', '', 'Moshi, Pune', '30 Days', 2, 4.0, 'Approved'),
  ];
}
