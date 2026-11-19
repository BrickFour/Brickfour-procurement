import { Material, InventoryTransaction, BillType } from '../types';

export const STANDARD_GST_RATES = [
  { rate: 18, label: '18% Standard GST (Steel, Cement, Tiles, Paints, Hardware)' },
  { rate: 28, label: '28% Luxury / Heavy (Certain High-end fittings, Glazing, AC)' },
  { rate: 12, label: '12% Work Contracts / Specified Materials' },
  { rate: 5, label: '5% Basic Construction (Certain aggregates, basic sand, bricks)' },
  { rate: 0, label: '0% Nil Rated / Exempted' },
];

export interface BillCalculationResult {
  billType: BillType;
  quantity: number;
  unitRate: number;
  baseAmount: number; // Taxable value
  gstRate: number; // %
  gstAmount: number; // Total GST
  cgstAmount: number; // Central GST (50% of GST)
  sgstAmount: number; // State GST (50% of GST)
  totalAmount: number; // Invoiced Grand Total
}

export function calculateBillFinancials(
  billType: BillType,
  quantity: number,
  unitRate: number,
  gstRate: number = 18,
  overrideTotal?: number
): BillCalculationResult {
  const safeQty = Math.max(0, quantity || 0);
  const safeRate = Math.max(0, unitRate || 0);
  const computedBase = safeQty * safeRate;

  if (billType === 'URD') {
    const total = overrideTotal !== undefined && overrideTotal > 0 ? overrideTotal : computedBase;
    return {
      billType: 'URD',
      quantity: safeQty,
      unitRate: safeRate,
      baseAmount: total,
      gstRate: 0,
      gstAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      totalAmount: total,
    };
  }

  // GST Bill
  const safeGstRate = typeof gstRate === 'number' && !isNaN(gstRate) ? gstRate : 18;
  
  if (overrideTotal !== undefined && overrideTotal > 0) {
    // If total amount was entered inclusive of tax
    const total = overrideTotal;
    const base = safeGstRate > 0 ? total / (1 + safeGstRate / 100) : total;
    const gst = total - base;
    return {
      billType: 'GST',
      quantity: safeQty,
      unitRate: safeRate,
      baseAmount: Math.round(base * 100) / 100,
      gstRate: safeGstRate,
      gstAmount: Math.round(gst * 100) / 100,
      cgstAmount: Math.round((gst / 2) * 100) / 100,
      sgstAmount: Math.round((gst / 2) * 100) / 100,
      totalAmount: Math.round(total * 100) / 100,
    };
  }

  const base = computedBase;
  const gst = base * (safeGstRate / 100);
  const total = base + gst;

  return {
    billType: 'GST',
    quantity: safeQty,
    unitRate: safeRate,
    baseAmount: Math.round(base * 100) / 100,
    gstRate: safeGstRate,
    gstAmount: Math.round(gst * 100) / 100,
    cgstAmount: Math.round((gst / 2) * 100) / 100,
    sgstAmount: Math.round((gst / 2) * 100) / 100,
    totalAmount: Math.round(total * 100) / 100,
  };
}

export function resolveMaterialBillType(material: Partial<Material>): BillType {
  if (material.billType) return material.billType;
  
  // Smart default based on material name or code:
  const name = (material.name || '').toLowerCase();
  if (
    name.includes('sand') ||
    name.includes('sanla') ||
    name.includes('rubble') ||
    name.includes('murrum') ||
    name.includes('crush') ||
    name.includes('flyash') ||
    name.includes('local')
  ) {
    return 'URD';
  }
  return 'GST';
}

export function resolveTransactionBillType(tx: Partial<InventoryTransaction>, parentMat?: Partial<Material>): BillType {
  if (tx.billType) return tx.billType;
  if (parentMat) return resolveMaterialBillType(parentMat);
  return 'GST';
}

export function generateBillNumber(type: BillType, index: number = 1): string {
  const yr = new Date().getFullYear();
  const pad = String(index).padStart(4, '0');
  return type === 'GST' ? `GST-${yr}/${pad}` : `URD-VCH-${pad}`;
}
