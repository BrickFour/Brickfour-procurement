import type { Material, InventoryTransaction } from '../types';

export interface StandardMaterialGroup {
  code: string;
  name: string;
  category: string;
  keywords: string[];
  defaultUnit: string;
}

export const STANDARD_MATERIAL_GROUPS: StandardMaterialGroup[] = [
  {
    code: '001',
    name: 'Cement & Binding Materials',
    category: 'Structural',
    keywords: ['cement', 'opc', 'ppc', 'white cement', 'grout', 'binding'],
    defaultUnit: 'Bags',
  },
  {
    code: '002',
    name: 'Steel & Structural Metals',
    category: 'Structural',
    keywords: ['steel', 'tmt', 'rebar', 'ms steel', 'fabrication', 'iron', 'rod'],
    defaultUnit: 'Tons',
  },
  {
    code: '003',
    name: 'Aggregates, Sand & Stone Crushes',
    category: 'Structural',
    keywords: ['sand', 'crush sand', 'm sand', 'plaster sand', 'aggregate', 'gravel', 'stone'],
    defaultUnit: 'Brass',
  },
  {
    code: '004',
    name: 'Masonry Blocks & Bricks',
    category: 'Masonry',
    keywords: ['brick', 'block', 'aac', 'flyash', 'sanla', 'block adhesive', 'red brick'],
    defaultUnit: 'Pieces',
  },
  {
    code: '005',
    name: 'Waterproofing & Construction Chemicals',
    category: 'Finishing',
    keywords: ['waterproofing', 'latex', 'sbr', 'hdpe', 'gsm cloth', 'chemical', 'sealant'],
    defaultUnit: 'Liters',
  },
  {
    code: '006',
    name: 'Tiles, Gypsum & Tile Adhesives',
    category: 'Finishing',
    keywords: ['tile', 'gypsum', 'tile adhesive', 'ceramic', 'vitrified', 'grouting'],
    defaultUnit: 'Boxes',
  },
  {
    code: '007',
    name: 'Flooring, Stone & Marble Works',
    category: 'Finishing',
    keywords: ['granite', 'marble', 'kadappa', 'kota stone', 'flooring', 'wooden flooring'],
    defaultUnit: 'Sq Ft',
  },
  {
    code: '008',
    name: 'Doors, Locks & Hardware',
    category: 'Finishing',
    keywords: ['door', 'lock', 'hinges', 'handle', 'tower bolt', 'stopper', 'digital lock', 'gi french door'],
    defaultUnit: 'Pieces',
  },
  {
    code: '009',
    name: 'Windows & Facade Systems',
    category: 'Finishing',
    keywords: ['window', 'aluminium', 'acp', 'shutter', 'facade', 'glazing'],
    defaultUnit: 'Pieces',
  },
  {
    code: '010',
    name: 'Electrical Cables & Switchgears',
    category: 'Electrical',
    keywords: ['electrical', 'wire', 'switch', 'switchgear', 'distribution', 'conduit', 'cable', 'mcb'],
    defaultUnit: 'Pieces',
  },
  {
    code: '011',
    name: 'Plumbing, Pipes & Sanitaryware',
    category: 'Plumbing',
    keywords: ['plumbing', 'pipe', 'fitting', 'cp', 'sanitary', 'sink', 'pump', 'drainage', 'valve'],
    defaultUnit: 'Pieces',
  },
  {
    code: '012',
    name: 'Paints & Wall Finishes',
    category: 'Finishing',
    keywords: ['paint', 'texture paint', 'primer', 'emulsion', 'distemper', 'putty'],
    defaultUnit: 'Liters',
  },
  {
    code: '013',
    name: 'Site Signage & Safety Equipment',
    category: 'Others',
    keywords: ['signage', 'safety', 'board', 'helmet', 'jacket', 'barricade'],
    defaultUnit: 'Pieces',
  },
];

/**
 * Formats a code into standardized 3-digit representation if numeric (e.g. 1 -> "001")
 */
export function formatMaterialCode(code: string | number | undefined): string {
  if (!code) return '001';
  const str = String(code).trim();
  if (/^\d+$/.test(str)) {
    return str.padStart(3, '0');
  }
  return str.toUpperCase();
}

/**
 * Resolves or auto-predicts material code based on material name and category
 */
export function resolveMaterialCode(mat: Partial<Material>): string {
  if (mat.materialCode && mat.materialCode.trim()) {
    return formatMaterialCode(mat.materialCode);
  }

  const nameLower = (mat.name || '').toLowerCase();
  const categoryLower = (mat.category || '').toLowerCase();

  // Try matching against standard group keywords
  for (const group of STANDARD_MATERIAL_GROUPS) {
    if (group.keywords.some((kw) => nameLower.includes(kw))) {
      return group.code;
    }
  }

  // Category fallback
  if (categoryLower.includes('masonry')) return '004';
  if (categoryLower.includes('plumb')) return '011';
  if (categoryLower.includes('elect')) return '010';
  if (categoryLower.includes('struct')) return '002';

  return '001';
}

/**
 * Resolves group name for a given code
 */
export function resolveMaterialGroup(code: string, sampleMaterial?: Partial<Material>): string {
  const normalizedCode = formatMaterialCode(code);
  const matched = STANDARD_MATERIAL_GROUPS.find((g) => g.code === normalizedCode);
  if (matched) return matched.name;
  if (sampleMaterial?.materialGroup) return sampleMaterial.materialGroup;
  if (sampleMaterial?.category) return `${sampleMaterial.category} Group (Code ${normalizedCode})`;
  return `Material Code ${normalizedCode}`;
}

export interface MaterialCodeSummaryGroup {
  code: string;
  groupName: string;
  category: string;
  materials: Material[];
  uniqueVariantNames: string[];
  totalVariantsCount: number;
  // Quantities
  totalCurrentStock: number;
  unitWiseStock: Record<string, number>;
  primaryUnit: string;
  unitSummaryText: string;
  // Financial valuations
  totalInvestedAmount: number; // Opening stock value + all inward additions
  currentStockValuation: number; // currentStock * unitCost
  totalInwardQty: number;
  totalInwardAmount: number;
  totalConsumedQty: number;
  totalConsumedAmount: number;
  averageUnitCost: number;
  // Alerts
  isLowStock: boolean;
  isCritical: boolean;
  lowStockCount: number;
  // Projects
  projectIds: string[];
}

/**
 * Aggregates all materials and their transactions into clean code-wise groups
 */
export function aggregateMaterialsByCode(
  materials: Material[],
  transactions: InventoryTransaction[] = [],
  selectedProjectId: string = 'all'
): MaterialCodeSummaryGroup[] {
  // Filter materials for selected project if not 'all'
  const filteredMaterials = selectedProjectId === 'all'
    ? materials
    : materials.filter((m) => m.projectId === selectedProjectId);

  const groupsMap = new Map<string, {
    code: string;
    materials: Material[];
  }>();

  // Group materials by code
  filteredMaterials.forEach((mat) => {
    const code = resolveMaterialCode(mat);
    if (!groupsMap.has(code)) {
      groupsMap.set(code, {
        code,
        materials: [],
      });
    }
    groupsMap.get(code)!.materials.push(mat);
  });

  // Calculate summaries for each group
  const result: MaterialCodeSummaryGroup[] = [];

  groupsMap.forEach(({ code, materials: groupMats }) => {
    const groupName = resolveMaterialGroup(code, groupMats[0]);
    const category = groupMats[0]?.category || 'General';

    const unitWiseStock: Record<string, number> = {};
    let currentStockValuation = 0;
    let totalInvestedAmount = 0;
    let totalInwardQty = 0;
    let totalInwardAmount = 0;
    let totalConsumedQty = 0;
    let totalConsumedAmount = 0;
    let lowStockCount = 0;
    let isCritical = false;
    let totalCostWeightSum = 0;
    let totalUnitsSum = 0;

    const uniqueVariantsSet = new Set<string>();
    const projectIdsSet = new Set<string>();

    groupMats.forEach((mat) => {
      uniqueVariantsSet.add(mat.name);
      projectIdsSet.add(mat.projectId);

      // Quantities
      const unit = mat.unit || 'Units';
      unitWiseStock[unit] = (unitWiseStock[unit] || 0) + (mat.currentStock || 0);

      // Stock valuation
      const matStockValuation = (mat.currentStock || 0) * (mat.unitCost || 0);
      currentStockValuation += matStockValuation;

      // Weight for average cost
      totalCostWeightSum += (mat.currentStock || 0) * (mat.unitCost || 0);
      totalUnitsSum += (mat.currentStock || 0);

      // Alert status
      if (mat.currentStock <= mat.minThreshold) {
        lowStockCount++;
      }
      if (mat.currentStock === 0) {
        isCritical = true;
      }

      // Related transactions
      const matTx = transactions.filter((t) => t.materialId === mat.id);
      
      let matInwardQty = 0;
      let matInwardAmt = 0;
      let matConsumedQty = 0;
      let matConsumedAmt = 0;

      matTx.forEach((tx) => {
        if (tx.type === 'addition') {
          matInwardQty += tx.quantity;
          matInwardAmt += tx.totalPrice || (tx.rate ? tx.rate * tx.quantity : mat.unitCost * tx.quantity);
        } else if (tx.type === 'consumption') {
          matConsumedQty += tx.quantity;
          matConsumedAmt += tx.totalPrice || (tx.rate ? tx.rate * tx.quantity : mat.unitCost * tx.quantity);
        }
      });

      totalInwardQty += matInwardQty;
      totalInwardAmount += matInwardAmt;
      totalConsumedQty += matConsumedQty;
      totalConsumedAmount += matConsumedAmt;

      // Total Price Invested = Opening Stock Investment + All Inward Purchases
      // If transactions exist, opening stock = currentStock + consumed - inward
      // Total invested = (currentStock + consumedQty) * unitCost
      const effectiveLifetimeProcured = (mat.currentStock || 0) + matConsumedQty;
      const matLifetimeInvested = mat.totalPrice && mat.totalPrice > 0 
        ? Math.max(mat.totalPrice, effectiveLifetimeProcured * mat.unitCost)
        : effectiveLifetimeProcured * mat.unitCost;

      totalInvestedAmount += matLifetimeInvested;
    });

    const isLowStock = lowStockCount > 0;
    const primaryUnit = groupMats[0]?.unit || 'Units';

    // Build human readable unit summary
    const unitEntries = Object.entries(unitWiseStock);
    let unitSummaryText = '';
    if (unitEntries.length === 1) {
      unitSummaryText = `${unitEntries[0][1].toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${unitEntries[0][0]}`;
    } else {
      unitSummaryText = unitEntries
        .map(([unit, qty]) => `${qty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${unit}`)
        .join(' + ');
    }

    const totalCurrentStock = Object.values(unitWiseStock).reduce((sum, q) => sum + q, 0);
    const averageUnitCost = totalUnitsSum > 0 ? Math.round(totalCostWeightSum / totalUnitsSum) : (groupMats[0]?.unitCost || 0);

    result.push({
      code,
      groupName,
      category,
      materials: groupMats,
      uniqueVariantNames: Array.from(uniqueVariantsSet),
      totalVariantsCount: groupMats.length,
      totalCurrentStock,
      unitWiseStock,
      primaryUnit,
      unitSummaryText,
      totalInvestedAmount,
      currentStockValuation,
      totalInwardQty,
      totalInwardAmount,
      totalConsumedQty,
      totalConsumedAmount,
      averageUnitCost,
      isLowStock,
      isCritical,
      lowStockCount,
      projectIds: Array.from(projectIdsSet),
    });
  });

  // Sort by code ascending by default (e.g. 001, 002, 003...)
  result.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  return result;
}
