import { Vendor, VendorQuotation, MarketPriceBenchmark, ProjectRequirement } from '../types';

/**
 * Maps approved vendors by Material Code
 */
export function getVendorsForMaterialCode(materialCode: string, vendors: Vendor[]): Vendor[] {
  const codeFormatted = materialCode.padStart(3, '0');
  return vendors.filter((v) => 
    v.suppliedMaterialCodes.some((c) => c.padStart(3, '0') === codeFormatted)
  );
}

/** Ranking criteria shown to users and vendors */
export const EVALUATION_CRITERIA_TEXT =
  'Landed price (40%) • Delivery time (20%) • Payment terms (20%) • Supply coverage (10%) • Warranty & validity (10%)';

/**
 * All-in cost per unit actually supplied: total price (incl. GST, freight & loading) / quantity supplied.
 * Falls back to unit rate + GST when the total is missing.
 */
export function landedCostPerUnit(q: VendorQuotation): number {
  if (q.totalAmount > 0 && q.quantity > 0) return q.totalAmount / q.quantity;
  return (q.quotedRate || 0) * (1 + (q.gstRate || 0) / 100);
}

/** Credit days from free-text payment terms ("30 days credit" -> 30, "100% advance" -> 0) */
export function parseCreditDays(terms: string): number {
  const t = (terms || '').toLowerCase();
  if (/advance|cash on delivery|\bcod\b|against delivery|immediate/.test(t) && !/credit/.test(t)) return 0;
  const m = t.match(/(\d{1,3})\s*(?:days?|d\b)/);
  return m ? Math.min(Number(m[1]), 365) : 0;
}

const hasWarranty = (w: string) => Boolean(w && !/^\s*(none|nil|n\/?a|no|-|not applicable)\s*\.?\s*$/i.test(w));

/**
 * Computes the evaluation score (0-100) of a quotation against its peers:
 * Landed price 40 • Delivery 20 • Payment terms 20 • Supply coverage 10 • Warranty & validity 10
 */
export function calculateQuoteScore(
  quote: VendorQuotation,
  peerQuotes: VendorQuotation[],
  marketPrice?: number,
  requiredQty?: number
): {
  totalScore: number;
  priceScore: number;
  deliveryScore: number;
  creditScore: number;
  coverageScore: number;
  termsScore: number;
  reasoning: string;
} {
  // 1. Landed price (40)
  const landed = landedCostPerUnit(quote);
  const peerLanded = peerQuotes.map(landedCostPerUnit).filter((r) => r > 0);
  const minLanded = peerLanded.length ? Math.min(...peerLanded) : landed;
  const priceScore = landed > 0 ? (minLanded / landed) * 40 : 0;

  // 2. Delivery time (20)
  const peerDays = peerQuotes.map((q) => q.deliveryDays).filter((d) => d > 0);
  const minDays = peerDays.length ? Math.min(...peerDays) : quote.deliveryDays;
  const deliveryScore = quote.deliveryDays > 0 ? (minDays / quote.deliveryDays) * 20 : 10;

  // 3. Payment terms / credit (20)
  const cDays = quote.creditDays ?? parseCreditDays(quote.paymentTerms);
  const creditScore = cDays >= 45 ? 20 : cDays >= 30 ? 16 : cDays >= 15 ? 12 : cDays >= 7 ? 8 : 4;

  // 4. Supply coverage (10): can the vendor supply the full requirement?
  const target = requiredQty && requiredQty > 0 ? requiredQty : Math.max(...peerQuotes.map((q) => q.quantity || 0), 0);
  const coverageScore = target > 0 ? Math.min((quote.quantity || 0) / target, 1) * 10 : 10;

  // 5. Warranty & validity (10)
  const termsScore =
    (hasWarranty(quote.warranty) ? 5 : 2) + (quote.validityDays >= 15 ? 5 : quote.validityDays >= 7 ? 3 : 1);

  const totalScore = Number((priceScore + deliveryScore + creditScore + coverageScore + termsScore).toFixed(1));

  const reasons: string[] = [];
  if (landed <= minLanded) reasons.push('Lowest landed cost');
  else if (marketPrice && quote.quotedRate < marketPrice) reasons.push(`${((1 - quote.quotedRate / marketPrice) * 100).toFixed(1)}% below market rate`);
  if (quote.deliveryDays <= minDays) reasons.push(`Fastest delivery (${quote.deliveryDays}d)`);
  if (cDays >= 30) reasons.push(`${cDays}-day credit`);
  if (coverageScore < 10) reasons.push('Partial quantity only');

  return {
    totalScore,
    priceScore: Number(priceScore.toFixed(1)),
    deliveryScore: Number(deliveryScore.toFixed(1)),
    creditScore,
    coverageScore: Number(coverageScore.toFixed(1)),
    termsScore,
    reasoning: reasons.join(' • ') || 'Meets requirements',
  };
}

/**
 * Ranks the quotations from highest score to lowest (vendors who declined are not ranked)
 */
export function rankAndScoreQuotes(
  allQuotes: VendorQuotation[],
  marketPrice?: number,
  requiredQty?: number
): VendorQuotation[] {
  const quotes = allQuotes.filter((q) => q.status !== 'Declined');
  if (quotes.length === 0) return [];

  // Calculate scores
  const scored = quotes.map((quote) => {
    const { totalScore } = calculateQuoteScore(quote, quotes, marketPrice, requiredQty);
    return {
      ...quote,
      evaluationScore: totalScore,
    };
  });

  // Sort by score descending
  scored.sort((a, b) => (b.evaluationScore || 0) - (a.evaluationScore || 0));

  // Assign ranks
  return scored.map((quote, idx) => ({
    ...quote,
    rank: idx + 1,
    status: idx === 0 ? (quote.status === 'Awarded' ? 'Awarded' : 'Shortlisted') : (quote.status === 'Awarded' ? 'Awarded' : quote.status),
  }));
}

/** Typical GST rate for a material (used for defaults and simulations) */
export function defaultGstRate(materialName: string): number {
  const n = materialName.toLowerCase();
  if (n.includes('cement')) return 28;
  if (/sand|aggregate|brick|block|stone|metal/.test(n)) return 5;
  if (/pipe|fitting/.test(n)) return 18;
  return 18;
}

/** Total price incl. GST, freight & loading */
export function computeQuoteTotal(rate: number, qty: number, gstRate: number, freight: number, loading: number): number {
  return Math.round((rate * qty * (1 + gstRate / 100) + freight + loading) * 100) / 100;
}

/**
 * Returns market benchmark for a material code
 */
export function getMarketBenchmark(
  code: string,
  benchmarks: MarketPriceBenchmark[]
): MarketPriceBenchmark | undefined {
  const norm = code.padStart(3, '0');
  return benchmarks.find((b) => b.materialCode.padStart(3, '0') === norm);
}

/**
 * Formats price delta against market benchmark
 */
export function calculateMarketDelta(quotedRate: number, marketPrice?: number): {
  pct: number;
  isLower: boolean;
  formatted: string;
} {
  if (!marketPrice || marketPrice <= 0) {
    return { pct: 0, isLower: false, formatted: 'Market rate N/A' };
  }
  const diff = quotedRate - marketPrice;
  const pct = Number(((diff / marketPrice) * 100).toFixed(1));
  const isLower = pct <= 0;
  const formatted = isLower 
    ? `${Math.abs(pct)}% below market` 
    : `+${pct}% above market`;

  return { pct, isLower, formatted };
}
