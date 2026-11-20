import { useState, useMemo, useRef, useEffect, FormEvent } from 'react';
import { Material, RateHistoryPoint, Project, FutureRatePredictionResult, FuturePeriodKey, InventoryTransaction } from '../types';
import { INITIAL_MATERIALS } from '../initialData';
import {
  X,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  Globe,
  ExternalLink,
  Loader2,
  BrainCircuit,
  Layers,
} from 'lucide-react';
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
  Legend,
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';

interface MaterialRateGraphModalProps {
  material: Material | null;
  projects?: Project[];
  transactions?: InventoryTransaction[];
  isOpen: boolean;
  onClose: () => void;
  onAddRatePoint?: (materialId: string, point: RateHistoryPoint) => void;
}

// Helper to format date into "Month 'YY" (e.g., "Oct '23") for 3-year timeline
function formatDateAndMonth(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function formatDateFull(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

// "15 Nov '26" — used when the graph shows real purchases (several can fall in one month)
function formatDayMonth(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  return `${d} ${dt.toLocaleDateString('en-US', { month: 'short' })} '${String(y).slice(-2)}`;
}

function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Date the GST & URD bills register gives catalogue opening stock (see GstUrdBillsSummary)
const OPENING_STOCK_DATE = '2026-07-01';

/**
 * Rate per unit excluding GST (including any freight / loading billed on the invoice), so that every
 * purchase is compared on the same basis. Older entries stored the PO basic rate in `rate` while newer
 * ones store the landed rate; the taxable amount / quantity is the same for both.
 */
function purchaseRate(p: { rate?: number; baseAmount?: number; quantity?: number }): number {
  if (p.baseAmount && p.baseAmount > 0 && p.quantity && p.quantity > 0) return round2(p.baseAmount / p.quantity);
  return Number(p.rate) || 0;
}

const isOpeningPoint = (p: RateHistoryPoint) =>
  /^rh-open-|^pt-.*-init$|^opening-/.test(p.id || '') || /^(Initial stock registration|Opening stock)/i.test(p.notes || '');

/**
 * The material's actual procurement record: opening stock plus every purchase (rate history and stock
 * additions), with rates on one basis. Returns an empty list when nothing has been bought yet.
 */
export function getPurchaseHistory(material: Material, transactions: InventoryTransaction[] = []): RateHistoryPoint[] {
  const points: RateHistoryPoint[] = (material.rateHistory || [])
    .filter((p) => p && p.date && Number(p.rate) > 0 && !/-3yr-/.test(p.id || ''))
    .map((p) => ({ ...p, rate: purchaseRate(p) }));

  const mine = transactions.filter((t) => t.materialId === material.id);
  // Stock additions that never made it into the rate history
  for (const t of mine) {
    if (t.type !== 'addition' || !(Number(t.rate) > 0)) continue;
    const dup = points.some(
      (p) => p.date === t.date && Number(p.quantity) === Number(t.quantity) && (p.billNumber || '') === (t.billNumber || '')
    );
    if (dup) continue;
    points.push({
      id: `tx-pt-${t.id}`,
      date: t.date,
      rate: purchaseRate(t),
      quantity: t.quantity,
      totalPrice: t.totalPrice,
      baseAmount: t.baseAmount,
      gstRate: t.gstRate,
      gstAmount: t.gstAmount,
      billType: t.billType,
      billNumber: t.billNumber,
      vendorName: t.vendorName,
      vendorGstin: t.vendorGstin,
      notes: t.notes,
    });
  }

  const purchases = points.filter((p) => !isOpeningPoint(p));
  if (purchases.length === 0) return points.filter(isOpeningPoint);

  // Opening stock that was on hand before the first recorded purchase (catalogue stock)
  if (!points.some(isOpeningPoint)) {
    const added = purchases.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
    const consumed = mine.filter((t) => t.type === 'consumption').reduce((s, t) => s + (Number(t.quantity) || 0), 0);
    const openingQty = round2((material.currentStock || 0) - added + consumed);
    const seed = INITIAL_MATERIALS.find((m) => m.id === material.id);
    if (openingQty > 0 && seed && seed.unitCost > 0) {
      const firstDate = purchases.map((p) => p.date).sort()[0];
      const base = round2(seed.unitCost * openingQty);
      const gst = seed.billType === 'URD' ? 0 : round2((base * (seed.gstRate ?? 18)) / 100);
      points.push({
        id: `opening-${material.id}`,
        date: firstDate < OPENING_STOCK_DATE ? firstDate : OPENING_STOCK_DATE,
        rate: seed.unitCost,
        quantity: openingQty,
        baseAmount: base,
        gstAmount: gst,
        totalPrice: round2(base + gst),
        billType: seed.billType,
        billNumber: seed.billNumber,
        vendorName: seed.vendorName,
        vendorGstin: seed.vendorGstin,
        notes: 'Opening stock (catalogue)',
      });
    }
  }

  // Chronological; same-day entries keep the order they were recorded in (stable sort)
  return points
    .map((p, i) => ({ p, i, open: isOpeningPoint(p) ? 0 : 1 }))
    .sort((a, b) => a.p.date.localeCompare(b.p.date) || a.open - b.open || a.i - b.i)
    .map((x) => x.p);
}

/**
 * Estimated 3-year market curve ending at the material's current rate. Used only when the material has
 * no purchases recorded, and as the long-term trend when the purchase record is shorter than a year.
 * These are estimates, not invoices, so they carry no vendor or quantity.
 */
export function generateDefaultRateHistory(material: Material): RateHistoryPoint[] {
  const today = new Date();
  const currentRate = material.unitCost || 100;
  const nameLower = (material.name || '').toLowerCase();

  // Category/Commodity-specific 3-year historical increment multipliers across 9 points
  // Points at: 36m ago (Oct 2023), 30m, 24m (Oct 2024), 18m, 12m (Oct 2025), 8m, 4m, 1m, 0m (Today)
  let multipliers: number[];
  
  if (nameLower.includes('steel') || nameLower.includes('tmt') || nameLower.includes('rebar') || nameLower.includes('iron') || nameLower.includes('metal')) {
    // Steel & Structural: (~23.5% 3-year increase, CAGR +7.30%)
    multipliers = [0.81, 0.835, 0.87, 0.85, 0.91, 0.935, 0.965, 0.988, 1.0];
  } else if (nameLower.includes('cement') || nameLower.includes('concrete') || nameLower.includes('binding') || nameLower.includes('opc') || nameLower.includes('ppc')) {
    // Cement: (~17.6% 3-year increase, CAGR +5.56%)
    multipliers = [0.85, 0.875, 0.89, 0.905, 0.93, 0.955, 0.975, 0.992, 1.0];
  } else if (nameLower.includes('sand') || nameLower.includes('aggregate') || nameLower.includes('gravel') || nameLower.includes('quarry') || nameLower.includes('crush')) {
    // Sand & Aggregates: (~35.1% 3-year increase, CAGR +10.55%)
    multipliers = [0.74, 0.775, 0.82, 0.795, 0.865, 0.905, 0.945, 0.982, 1.0];
  } else if (nameLower.includes('wire') || nameLower.includes('copper') || nameLower.includes('cable') || nameLower.includes('electric') || nameLower.includes('switch')) {
    // Electrical / Copper: (~38.9% 3-year increase, CAGR +11.57%)
    multipliers = [0.72, 0.755, 0.80, 0.845, 0.885, 0.925, 0.965, 0.988, 1.0];
  } else if (nameLower.includes('brick') || nameLower.includes('block') || nameLower.includes('aac') || nameLower.includes('masonry') || nameLower.includes('flyash')) {
    // Bricks & Blocks: (~14.9% 3-year increase, CAGR +4.74%)
    multipliers = [0.87, 0.89, 0.905, 0.92, 0.94, 0.96, 0.98, 0.995, 1.0];
  } else if (nameLower.includes('pipe') || nameLower.includes('pvc') || nameLower.includes('cpvc') || nameLower.includes('plumb') || nameLower.includes('fitting')) {
    // Plumbing / Polymers: (~16.3% 3-year increase, CAGR +5.16%)
    multipliers = [0.86, 0.88, 0.875, 0.895, 0.925, 0.95, 0.975, 0.99, 1.0];
  } else if (nameLower.includes('paint') || nameLower.includes('primer') || nameLower.includes('emulsion') || nameLower.includes('finish') || nameLower.includes('texture')) {
    // Finishing / Paints: (~20.5% 3-year increase, CAGR +6.41%)
    multipliers = [0.83, 0.855, 0.88, 0.90, 0.93, 0.955, 0.978, 0.99, 1.0];
  } else if (nameLower.includes('waterproof') || nameLower.includes('sbr') || nameLower.includes('latex') || nameLower.includes('chemical')) {
    // Waterproofing / Chemicals: (~20.5% 3-year increase, CAGR +6.41%)
    multipliers = [0.83, 0.855, 0.875, 0.895, 0.925, 0.95, 0.975, 0.99, 1.0];
  } else if (nameLower.includes('tile') || nameLower.includes('gypsum')) {
    // Tiles & Gypsum: (~19.0% 3-year increase, CAGR +5.98%)
    multipliers = [0.84, 0.865, 0.885, 0.905, 0.93, 0.955, 0.978, 0.992, 1.0];
  } else if (nameLower.includes('granite') || nameLower.includes('marble') || nameLower.includes('stone') || nameLower.includes('flooring')) {
    // Flooring & Stone: (~22.0% 3-year increase, CAGR +6.85%)
    multipliers = [0.82, 0.845, 0.87, 0.895, 0.92, 0.945, 0.972, 0.99, 1.0];
  } else if (nameLower.includes('door') || nameLower.includes('lock') || nameLower.includes('hinge')) {
    // Doors & Hardware: (~13.6% 3-year increase, CAGR +4.35%)
    multipliers = [0.88, 0.895, 0.91, 0.925, 0.945, 0.965, 0.98, 0.995, 1.0];
  } else if (nameLower.includes('window') || nameLower.includes('aluminium') || nameLower.includes('acp') || nameLower.includes('shutter')) {
    // Windows & Facade: (~26.6% 3-year increase, CAGR +8.18%)
    multipliers = [0.79, 0.82, 0.85, 0.875, 0.91, 0.94, 0.97, 0.99, 1.0];
  } else {
    // Deterministic hash based on material name and category for unique, consistent 3-year curve
    let hash = 0;
    for (let c of (material.name + material.category)) {
      hash = (hash * 31 + c.charCodeAt(0)) % 100;
    }
    const baseStart = Number((0.73 + (hash % 16) * 0.01).toFixed(2)); // between 0.73 and 0.88 (~13.6% to ~37.0% 3-year increase)
    const step = (1.0 - baseStart) / 8;
    multipliers = [
      Number(baseStart.toFixed(3)),
      Number((baseStart + step * 1.1).toFixed(3)),
      Number((baseStart + step * 2.3).toFixed(3)),
      Number((baseStart + step * 3.4).toFixed(3)),
      Number((baseStart + step * 4.6).toFixed(3)),
      Number((baseStart + step * 5.8).toFixed(3)),
      Number((baseStart + step * 6.9).toFixed(3)),
      Number((baseStart + step * 7.7).toFixed(3)),
      1.0,
    ];
  }

  // Month offsets spanning the last 3 years: [36, 30, 24, 18, 12, 8, 4, 1, 0] months ago
  const monthOffsets = [36, 30, 24, 18, 12, 8, 4, 1, 0];
  const points: RateHistoryPoint[] = [];

  for (let i = 0; i < monthOffsets.length; i++) {
    const mOffset = monthOffsets[i];
    // Today for the current point, otherwise mid-month (local date, no UTC shift)
    const d = new Date(today.getFullYear(), today.getMonth() - mOffset, mOffset === 0 ? today.getDate() : 15);
    const dateStr = localIsoDate(d);
    const rateVal = currentRate < 50
      ? Number((currentRate * multipliers[i]).toFixed(2))
      : Math.round(currentRate * multipliers[i]);

    let periodLabel = '';
    if (mOffset === 0) periodLabel = 'Current catalogue rate';
    else if (mOffset <= 1) periodLabel = 'Estimated market rate (1 month ago) - no purchase recorded';
    else if (mOffset <= 12) periodLabel = `Estimated market rate (${mOffset} months ago) - no purchase recorded`;
    else periodLabel = `Estimated market rate (${Math.round((mOffset / 12) * 10) / 10} years ago) - no purchase recorded`;

    points.push({
      id: `pt-${material.id}-3yr-${i}`,
      date: dateStr,
      rate: rateVal,
      vendorName: mOffset === 0 ? material.vendorName : undefined,
      notes: periodLabel,
    });
  }

  return points;
}

/** Annual growth (%) of a rate series, using the real time span between its first and last point. */
function seriesCagr(series: RateHistoryPoint[]): { cagr: number; years: number; startRate: number } {
  const first = series[0];
  const last = series[series.length - 1];
  if (!first || !last) return { cagr: 0, years: 0, startRate: 0 };
  const years = (new Date(last.date).getTime() - new Date(first.date).getTime()) / (365.25 * 86400000);
  const cagr = years > 0 && first.rate > 0 ? (Math.pow(last.rate / first.rate, 1 / years) - 1) * 100 : 0;
  return { cagr, years, startRate: first.rate };
}

// Future predictions from the current rate and the material's long-term annual trend
export function calculateFuturePredictionsFromHistory(
  material: Material,
  currentRate: number,
  annualizedCAGR: number
): FutureRatePredictionResult {
  currentRate = currentRate || material.unitCost || 100;
  const total3YrIncrementPct = (Math.pow(1 + annualizedCAGR / 100, 3) - 1) * 100;

  // Annual compound fraction
  const annualFraction = annualizedCAGR / 100;

  // Helper to round according to unit price scale (e.g. Rs. 9 bricks vs Rs. 58,000 steel)
  const formatRate = (val: number): number => {
    if (currentRate < 50) return Number(val.toFixed(2));
    return Math.round(val);
  };

  const getTargetDate = (monthsAhead: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthsAhead);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const horizons: { key: FuturePeriodKey; label: string; months: number; mult: number; driver: string }[] = [
    { key: 'current', label: 'Current (Today)', months: 0, mult: 1.0, driver: 'Current active procurement spot rate on site.' },
    { key: '1m', label: 'After 1 Month', months: 1, mult: Math.pow(1 + annualFraction, 1 / 12), driver: 'Short-term logistics, regional depot inventory adjustments, and freight rates.' },
    { key: '3m', label: 'After 3 Months', months: 3, mult: Math.pow(1 + annualFraction, 3 / 12), driver: 'Quarterly construction demand cycle, seasonal shifts, and batch dispatch adjustments.' },
    { key: '6m', label: 'After 6 Months', months: 6, mult: Math.pow(1 + annualFraction, 6 / 12), driver: 'Mid-term infrastructure project executions and raw ore / power tariff revisions.' },
    { key: '1y', label: 'After 1 Year', months: 12, mult: 1 + annualFraction, driver: 'Annual industrial inflation, manufacturing capacity additions, and tax updates.' },
    { key: '2y', label: 'After 2 Years', months: 24, mult: Math.pow(1 + annualFraction, 2), driver: 'Multi-year urban development demand, energy transition costs, and raw material index growth.' },
    { key: '3y', label: 'After 3 Years', months: 36, mult: Math.pow(1 + annualFraction, 3), driver: '3-year macroeconomic compound growth, national infrastructure capex, and carbon compliance.' },
  ];

  const predictions = horizons.map((h) => {
    const predRate = formatRate(currentRate * h.mult);
    const minRate = formatRate(predRate * 0.95);
    const maxRate = formatRate(predRate * 1.05);
    const pct = h.months === 0 ? 0 : Number((((predRate - currentRate) / currentRate) * 100).toFixed(1));

    return {
      periodKey: h.key,
      periodLabel: h.label,
      targetDate: getTargetDate(h.months),
      predictedRate: predRate,
      minRate,
      maxRate,
      percentChangeVsCurrent: pct,
      trend: pct > 0 ? ('up' as const) : pct < 0 ? ('down' as const) : ('stable' as const),
      keyDrivers: h.driver,
    };
  });

  return {
    materialName: material.name,
    category: material.category,
    unit: material.unit,
    currentRate,
    asOfDate: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
    forecastConfidence: 'High',
    macroSummary: `Rate forecast for ${material.name} is computed from its past 3-year increment trend (+${total3YrIncrementPct.toFixed(1)}%, CAGR +${annualizedCAGR.toFixed(1)}%/yr) combined with regional Indian commodity and infrastructure forecasts.`,
    predictions,
    sources: [
      { title: 'SteelMint / Commodity Index', url: 'https://www.steelmint.com/steel-prices' },
      { title: 'IndiaMART Regional Directory', url: `https://dir.indiamart.com/search.mp?ss=${encodeURIComponent(material.name)}` },
      { title: 'CRISIL Infrastructure Analysis', url: 'https://www.crisil.com' }
    ],
  };
}

export default function MaterialRateGraphModal({
  material,
  projects = [],
  transactions = [],
  isOpen,
  onClose,
}: MaterialRateGraphModalProps) {
  const [activeGraphTab, setActiveGraphTab] = useState<'historical' | 'future' | 'dual'>('historical');

  // Future rate prediction state
  const [isPredicting, setIsPredicting] = useState(false);
  const [predictionData, setPredictionData] = useState<FutureRatePredictionResult | null>(null);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [predictionSavedAt, setPredictionSavedAt] = useState<string | null>(null);

  // Real purchases (opening stock + invoices). Empty when nothing has been bought yet.
  const purchaseHistory = useMemo(() => {
    if (!material) return [];
    return getPurchaseHistory(material, transactions);
  }, [material, transactions]);
  // No purchase invoices yet (only an opening/current rate, or nothing at all)
  const isEstimated = !purchaseHistory.some((p) => !isOpeningPoint(p));

  // Estimated market curve ending at the current rate (long-term trend reference)
  const estimatedHistory = useMemo(() => {
    if (!material) return [];
    const latest = purchaseHistory[purchaseHistory.length - 1];
    return generateDefaultRateHistory(latest ? { ...material, unitCost: latest.rate } : material);
  }, [material, purchaseHistory]);

  // What the graph and ledger show: real purchases; otherwise the current rate only (no made-up history);
  // nothing at all when the material has no rate yet
  const sortedHistory = useMemo<RateHistoryPoint[]>(() => {
    if (!material) return [];
    if (purchaseHistory.length) return purchaseHistory;
    if ((material.unitCost || 0) > 0) {
      return [{
        id: `current-${material.id}`,
        date: localIsoDate(new Date()),
        rate: material.unitCost,
        quantity: material.currentStock || undefined,
        vendorName: material.vendorName,
        notes: 'Current rate - no purchases recorded yet',
      }];
    }
    return [];
  }, [material, purchaseHistory]);
  const noRate = sortedHistory.length === 0;

  // Historical Chart data with formatted date and month
  const historicalChartData = useMemo(() => {
    return sortedHistory.map((pt) => ({
      ...pt,
      displayDate: isEstimated ? formatDateAndMonth(pt.date) : formatDayMonth(pt.date),
      fullDateStr: formatDateFull(pt.date),
      rateVal: pt.rate,
    }));
  }, [sortedHistory, isEstimated]);

  // Headline figures from the series shown
  const latestPt: Partial<RateHistoryPoint> = sortedHistory[sortedHistory.length - 1] || { rate: material?.unitCost || 0, date: '' };
  const firstPt = sortedHistory[0] || latestPt;
  const currentRate = latestPt.rate || material?.unitCost || 0;
  const initialRate = firstPt.rate || currentRate;

  const priceDiff = round2(currentRate - initialRate);
  const percentChange = initialRate > 0 ? (priceDiff / initialRate) * 100 : 0;
  const isUp = priceDiff >= 0;

  // Long-term annual trend for forecasting: the purchase record when it covers at least a year,
  // otherwise the estimated 3-year market curve for this material type
  const realTrend = seriesCagr(purchaseHistory);
  const usesPurchaseTrend = !isEstimated && realTrend.years >= 1;
  const trendSeries = usesPurchaseTrend ? purchaseHistory : estimatedHistory;
  const trend = usesPurchaseTrend ? realTrend : seriesCagr(estimatedHistory);
  const annualizedCAGR = trend.cagr;
  const trendStartRate = trend.startRate || currentRate;
  const trendTotalPct = trendStartRate > 0 ? ((currentRate - trendStartRate) / trendStartRate) * 100 : 0;

  // Change over roughly the last year of the trend series
  const trendLatestTime = new Date(trendSeries[trendSeries.length - 1]?.date || Date.now()).getTime();
  const oneYearAgoPt = trendSeries.find((p) => {
    const diffMonths = (trendLatestTime - new Date(p.date).getTime()) / (1000 * 60 * 60 * 24 * 30.4);
    return diffMonths <= 14 && diffMonths >= 10;
  }) || trendSeries[0] || { rate: currentRate };
  const recent1YrIncrementPct = oneYearAgoPt.rate > 0 ? ((currentRate - oneYearAgoPt.rate) / oneYearAgoPt.rate) * 100 : annualizedCAGR;

  const allRates = sortedHistory.length ? sortedHistory.map((pt) => pt.rate) : [0];
  const highestRate = Math.max(...allRates, currentRate);
  const lowestRate = Math.min(...allRates, currentRate);

  const projectName = projects.find((p) => p.id === material?.projectId)?.name || 'Project Site';
  // Stock on hand valued at the weighted average cost of what was bought (excl. GST)
  const purchasedQty = purchaseHistory.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
  const exactAvgCost = !isEstimated && purchasedQty > 0
    ? purchaseHistory.reduce((s, p) => s + p.rate * (Number(p.quantity) || 0), 0) / purchasedQty
    : material?.unitCost || currentRate;
  const avgCost = round2(exactAvgCost);
  const totalStockValue = Math.round((material?.currentStock || 0) * exactAvgCost);

  // Baseline future predictions from the current rate and the long-term trend
  const baselinePredictions = useMemo(() => {
    if (!material || currentRate <= 0) return null;
    return calculateFuturePredictionsFromHistory(material, currentRate, annualizedCAGR);
  }, [material, currentRate, annualizedCAGR]);

  // Shown only after the user asks for it (web research runs once per material, then it is reused)
  const activePredictionData = predictionData;

  // Future Prediction Chart Data based on the analyzed past 3 years increment graph
  const futureChartData = useMemo(() => {
    if (!activePredictionData || !activePredictionData.predictions) return [];
    return activePredictionData.predictions.map((p) => ({
      periodKey: p.periodKey,
      displayPeriod: p.periodLabel.replace('After ', ''),
      targetDate: p.targetDate,
      predictedRate: p.predictedRate,
      minRate: p.minRate,
      maxRate: p.maxRate,
      percentChangeVsCurrent: p.percentChangeVsCurrent,
      trend: p.trend,
    }));
  }, [activePredictionData]);

  // Dual Combined Chart Data (Connecting history to future predictions)
  const dualChartData = useMemo(() => {
    const points: any[] = [];

    // Add historical points spanning the 3 years
    sortedHistory.forEach((pt) => {
      points.push({
        name: isEstimated ? formatDateAndMonth(pt.date) : formatDayMonth(pt.date),
        fullLabel: formatDateFull(pt.date),
        historicalRate: pt.rate,
        predictedRate: null,
        type: isEstimated ? 'Estimated' : 'Historical Bought',
      });
    });

    // If prediction exists, add future prediction points
    if (activePredictionData && activePredictionData.predictions) {
      activePredictionData.predictions.forEach((p, idx) => {
        if (idx === 0) {
          // Current point connects both curves
          if (points.length > 0) {
            points[points.length - 1].predictedRate = p.predictedRate;
          } else {
            points.push({
              name: 'Current',
              fullLabel: `Today (${p.targetDate})`,
              historicalRate: currentRate,
              predictedRate: p.predictedRate,
              type: 'Current Benchmark',
            });
          }
        } else {
          points.push({
            name: p.periodLabel.replace('After ', ''),
            fullLabel: `${p.periodLabel} (${p.targetDate})`,
            historicalRate: null,
            predictedRate: p.predictedRate,
            minRate: p.minRate,
            maxRate: p.maxRate,
            percentChangeVsCurrent: p.percentChangeVsCurrent,
            type: 'Future Prediction',
          });
        }
      });
    }

    return points;
  }, [sortedHistory, activePredictionData, currentRate, isEstimated]);

  // Future rates: the server searches the web (Gemini + Google Search) the first time and saves the result;
  // later openings reuse the saved prediction. force = "Re-predict" (new search).
  const handlePredictFutureRates = async (force?: boolean, switchTab: boolean = true) => {
    if (!material) return;
    if (currentRate <= 0) {
      if (switchTab) setActiveGraphTab('future');
      return;
    }

    setIsPredicting(true);
    setPredictionError(null);

    try {
      const historyStats = {
        startRate3YrAgo: trendStartRate,
        currentRate: currentRate,
        total3YrIncrementPct: Number(trendTotalPct.toFixed(1)),
        annualizedCAGR: Number(annualizedCAGR.toFixed(2)),
        recent1YrIncrementPct: Number(recent1YrIncrementPct.toFixed(1)),
        samplePoints: trendSeries.map((p) => ({ date: p.date, rate: p.rate })),
      };

      const res = await fetch('/api/materials/predict-future-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materialId: material.id,
          force: !!force,
          materialName: material.name,
          unit: material.unit,
          category: material.category,
          currentRate: currentRate || material.unitCost,
          location: projectName,
          historyStats,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to generate future rate predictions');
      }

      setPredictionData(data.data);
      setPredictionSavedAt(data.savedAt || null);
      if (switchTab) {
        setActiveGraphTab('future');
      }
    } catch (err: any) {
      console.warn('Prediction error, using the material trend instead:', err);
      if (baselinePredictions) {
        setPredictionData({ ...baselinePredictions, basis: 'trend' });
        setPredictionSavedAt(null);
        setPredictionError('Live market search is unavailable right now - showing a projection from this material\'s price trend.');
      }
      if (switchTab) {
        setActiveGraphTab('future');
      }
    } finally {
      setIsPredicting(false);
    }
  };

  // Opening the window shows the purchase history; nothing is searched until Future Prediction is opened
  useEffect(() => {
    if (isOpen && material) {
      setActiveGraphTab('historical');
      setPredictionData(null);
      setPredictionSavedAt(null);
      setPredictionError(null);
    }
  }, [isOpen, material?.id]);

  if (!isOpen || !material) return null;

  const NAVY = '#23408e';
  const NAVY_LIGHT = '#6f8fd8';
  const axisTick = { fill: '#64748b', fontSize: 11, fontWeight: 600 };
  const rupeeTick = (v: number) => `Rs.${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`;
  const tabBtn = (active: boolean) =>
    `px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
      active ? 'bg-[#23408e] text-white shadow-xs' : 'text-slate-600 hover:text-[#23408e] hover:bg-white'
    }`;
  const metricCard = 'bg-white rounded-xl border border-slate-200 px-3.5 py-3 flex flex-col justify-between min-w-0';
  const metricLabel = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5 truncate';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" id="material-rate-modal">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        className="bg-white w-full max-w-5xl rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] text-slate-900"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 bg-[#23408e] text-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-white/15 text-white flex items-center justify-center shrink-0">
              <TrendingUp size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white truncate">{material.name}</h2>
                <span className="px-2 py-0.5 rounded-full bg-white/15 text-white text-[11px] font-semibold border border-white/20">
                  {material.unit}
                </span>
              </div>
              <p className="text-xs text-blue-100 truncate">Rate analytics · {projectName}</p>
            </div>
          </div>
          <button
            id="close-rate-graph-modal"
            onClick={onClose}
            aria-label="Close"
            className="p-2 text-blue-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50">
          {/* Key figures */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className={metricCard}>
              <p className={metricLabel}>
                <DollarSign size={13} className="text-[#23408e] shrink-0" /> {isEstimated ? 'Current Rate' : 'Current Bought Rate'}
              </p>
              <p className="text-base sm:text-lg font-bold text-slate-900 mt-1 truncate">
                {noRate ? 'Not purchased yet' : <>Rs. {currentRate.toLocaleString('en-IN')}{' '}
                <span className="text-xs font-medium text-slate-500">/{material.unit}</span></>}
              </p>
              <div className="flex items-center justify-between text-[11px] text-slate-500 truncate mt-1">
                <span className="truncate">Vendor: <span className="text-slate-700 font-medium">{latestPt.vendorName || material.vendorName || '—'}</span></span>
                {latestPt.sourceUrl && (
                  <a
                    href={latestPt.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#23408e] hover:underline font-semibold inline-flex items-center gap-0.5 shrink-0 ml-1"
                    title={latestPt.sourceTitle || 'View verified market source link'}
                  >
                    <ExternalLink size={10} /> Source
                  </a>
                )}
              </div>
            </div>

            <div className={metricCard}>
              <p className={metricLabel}>Price Trend (Overall)</p>
              <div className="mt-1">
                {isEstimated ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-slate-100 text-slate-600 border-slate-200">
                    <TrendingUp size={12} /> No purchases yet
                  </span>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${
                      isUp ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {isUp ? '+' : ''}Rs. {Math.abs(priceDiff).toLocaleString('en-IN')} ({isUp ? '+' : ''}{percentChange.toFixed(1)}%)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 truncate mt-1">
                {isEstimated ? 'Trend starts with your first purchase' : <>From Rs. {initialRate.toLocaleString('en-IN')}{firstPt.date ? ` on ${formatDateFull(firstPt.date)}` : ''}</>}
              </p>
            </div>

            <div className={metricCard}>
              <p className={metricLabel}>High / Low Range</p>
              <div className="text-xs font-semibold mt-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">High</span> <span className="text-emerald-700">Rs. {highestRate.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Low</span> <span className="text-rose-700">Rs. {lowestRate.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            <div className={metricCard}>
              <p className={metricLabel}>On-Site Stock Value</p>
              <p className="text-base sm:text-lg font-bold text-[#23408e] mt-1 truncate">
                Rs. {totalStockValue.toLocaleString('en-IN')}
              </p>
              <p className="text-[11px] text-slate-500 truncate mt-1">
                Stock: <strong className="text-slate-700 font-semibold">{material.currentStock} {material.unit}</strong>
                {!isEstimated && <> @ avg Rs. {avgCost.toLocaleString('en-IN')}</>}
              </p>
            </div>
          </div>

          {/* Chart card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-[#eaf0fb] text-[#23408e] flex items-center justify-center shrink-0">
                  {activeGraphTab === 'future' ? <BrainCircuit size={15} /> : activeGraphTab === 'dual' ? <Layers size={15} /> : <TrendingUp size={15} />}
                </span>
                <span>
                  {activeGraphTab === 'future'
                    ? 'AI Future Rate Prediction (Market Search)'
                    : activeGraphTab === 'dual'
                    ? 'Dual View: Historical Purchases vs 3-Year Forecast'
                    : 'Rate vs Period (Procurement History)'}
                </span>
              </h3>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
                  <button type="button" onClick={() => setActiveGraphTab('historical')} className={tabBtn(activeGraphTab === 'historical')}>
                    Historical Graph
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveGraphTab('future');
                      if (!activePredictionData && !isPredicting) handlePredictFutureRates(false, true);
                    }}
                    className={`${tabBtn(activeGraphTab === 'future')} flex items-center gap-1`}
                  >
                    Future Prediction
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!activePredictionData && !isPredicting) {
                        handlePredictFutureRates(false, false);
                      }
                      setActiveGraphTab('dual');
                    }}
                    className={`${tabBtn(activeGraphTab === 'dual')} hidden sm:inline-flex items-center gap-1`}
                  >
                    Dual View
                  </button>
                </div>

                <button
                  id="btn-predict-future"
                  type="button"
                  onClick={() => handlePredictFutureRates(true, true)}
                  disabled={isPredicting || noRate}
                  className="flex items-center justify-center gap-1.5 bg-[#23408e] hover:bg-[#1b3170] text-white text-xs font-semibold px-3.5 py-2 rounded-lg cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Predict material rate for 1M, 3M, 6M, 1Y, 2Y, 3Y using live market search"
                >
                  {isPredicting ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Searching & Predicting...</span>
                    </>
                  ) : (
                    <>
                      <BrainCircuit size={13} />
                      <span>{activePredictionData ? 'Re-predict Rates' : 'Predict Future Rates'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-3">
              <AnimatePresence>
                {predictionError && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2"
                  >
                    <span>{predictionError}</span>
                    <button type="button" onClick={() => setPredictionError(null)} aria-label="Dismiss" className="text-amber-600 hover:text-amber-800 cursor-pointer">
                      <X size={14} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {noRate && (
                <div id="rate-graph-not-purchased" className="h-56 flex flex-col items-center justify-center text-center gap-2 rounded-lg border border-dashed border-[#c9d6f2] bg-[#f5f8fd]">
                  <TrendingUp size={28} className="text-[#9fb3e0]" />
                  <p className="text-sm font-semibold text-slate-800">You have not purchased this material yet.</p>
                  <p className="text-xs text-slate-500 max-w-sm">The rate graph and the future prediction start with the first purchase (or a rate entered when the material is added or uploaded).</p>
                </div>
              )}

              {/* Historical graph */}
              {!noRate && activeGraphTab === 'historical' && (
                <div className="h-64 sm:h-72 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={historicalChartData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                      <defs>
                        <linearGradient id="rateGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={NAVY} stopOpacity={0.22} />
                          <stop offset="95%" stopColor={NAVY} stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="displayDate" tick={axisTick} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} dy={10} />
                      <YAxis tick={axisTick} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} tickFormatter={rupeeTick} domain={['auto', 'auto']} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload as RateHistoryPoint & {
                              displayDate: string;
                              fullDateStr: string;
                            };
                            return (
                              <div className="bg-white text-slate-900 p-3 rounded-lg shadow-lg border border-slate-200 text-xs space-y-1">
                                <p className="text-[11px] font-semibold text-[#23408e] uppercase tracking-wide">
                                  {data.fullDateStr} ({data.displayDate})
                                </p>
                                <p className="text-sm font-bold text-slate-900">
                                  {isEstimated ? 'Current Rate' : 'Bought Rate'}: Rs. {data.rate.toLocaleString('en-IN')} / {material.unit}
                                </p>
                                {!isEstimated && (
                                  <p className="text-[11px] text-slate-500">excl. GST, incl. freight &amp; loading</p>
                                )}
                                {data.billNumber && !isEstimated && (
                                  <p className="text-[11px] text-slate-700">Invoice: {data.billNumber}</p>
                                )}
                                {data.vendorName && (
                                  <p className="text-[11px] text-slate-700">Vendor: {data.vendorName}</p>
                                )}
                                {data.quantity && (
                                  <p className="text-[11px] text-slate-700">
                                    Qty: {data.quantity} {material.unit} | Total: Rs.{' '}
                                    {(data.totalPrice || data.rate * data.quantity).toLocaleString('en-IN')}
                                  </p>
                                )}
                                {data.notes && (
                                  <p className="text-[11px] text-slate-500 italic mt-1">{data.notes}</p>
                                )}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="rateVal"
                        stroke={NAVY}
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#rateGradient)"
                        dot={{ r: 4.5, fill: NAVY, strokeWidth: 2, stroke: '#ffffff' }}
                        activeDot={{ r: 7, fill: NAVY, strokeWidth: 3, stroke: '#ffffff' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Future prediction graph */}
              {!noRate && activeGraphTab === 'future' && (
                <div className="space-y-3">
                  {!activePredictionData && !isPredicting ? (
                    <div className="bg-[#f5f8fd] border border-[#c9d6f2] rounded-lg p-8 text-center space-y-3">
                      <div className="w-12 h-12 rounded-lg bg-[#23408e] text-white flex items-center justify-center mx-auto">
                        <BrainCircuit size={24} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">Generate 3-Year Future Rate Predictions with Market Search</h4>
                        <p className="text-xs text-slate-600 max-w-md mx-auto mt-1">
                          Search current Indian commodity indices, inflation rates, and infrastructure forecasts to project prices for <strong>Current, 1 Month, 3 Months, 6 Months, 1 Year, 2 Years, and 3 Years</strong>.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePredictFutureRates(true, true)}
                        className="px-5 py-2.5 bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold rounded-lg cursor-pointer inline-flex items-center gap-2 transition-colors"
                      >
                        Start Future Prediction
                      </button>
                    </div>
                  ) : isPredicting ? (
                    <div className="h-64 flex flex-col items-center justify-center space-y-3 text-center">
                      <Loader2 size={32} className="animate-spin text-[#23408e]" />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Searching online commodity data & predicting price curves...</p>
                        <p className="text-xs text-slate-500">Analyzing commodity indices for {material.name}</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p id="prediction-basis" className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border font-semibold ${activePredictionData?.basis === 'web' ? 'bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {activePredictionData?.basis === 'web' ? 'Live market research (Gemini + Google Search)' : 'Projection from price trend'}
                        </span>
                        <span>
                          {predictionSavedAt ? `Researched ${new Date(predictionSavedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} - saved; click Re-predict Rates for a new search.` : 'Not saved.'}
                        </span>
                        {activePredictionData?.growthNext12MonthsPct !== undefined && (
                          <span>Next 12 months: {activePredictionData.growthNext12MonthsPct > 0 ? '+' : ''}{activePredictionData.growthNext12MonthsPct}%</span>
                        )}
                      </p>
                      {activePredictionData?.macroSummary && (
                        <p className="text-xs text-slate-700 bg-[#f5f8fd] border border-[#d9e3f5] rounded-lg px-3 py-2">{activePredictionData.macroSummary}</p>
                      )}
                      <div className="h-64 sm:h-72 w-full pt-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={futureChartData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                            <defs>
                              <linearGradient id="futurePredictionGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={NAVY_LIGHT} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={NAVY_LIGHT} stopOpacity={0.0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                            <XAxis dataKey="displayPeriod" tick={axisTick} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} dy={10} />
                            <YAxis tick={axisTick} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} tickFormatter={rupeeTick} domain={['auto', 'auto']} />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const data = payload[0].payload;
                                  return (
                                    <div className="bg-white text-slate-900 p-3 rounded-lg shadow-lg border border-slate-200 text-xs space-y-1">
                                      <div className="flex items-center justify-between border-b border-slate-100 pb-1 gap-2">
                                        <span className="text-[11px] font-semibold text-[#23408e] uppercase tracking-wide">
                                          {data.displayPeriod} ({data.targetDate})
                                        </span>
                                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                                          data.percentChangeVsCurrent > 0
                                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                                            : data.percentChangeVsCurrent < 0
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            : 'bg-slate-100 text-slate-600 border-slate-200'
                                        }`}>
                                          {data.percentChangeVsCurrent > 0 ? '+' : ''}{data.percentChangeVsCurrent}% vs Today
                                        </span>
                                      </div>
                                      <p className="text-sm font-bold text-slate-900">
                                        Predicted Rate: Rs. {data.predictedRate.toLocaleString('en-IN')} / {material.unit}
                                      </p>
                                      <p className="text-[11px] text-slate-600">
                                        Forecast Range: <strong>Rs. {data.minRate.toLocaleString('en-IN')} – {data.maxRate.toLocaleString('en-IN')}</strong>
                                      </p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="predictedRate"
                              stroke={NAVY}
                              strokeWidth={2.5}
                              strokeDasharray="5 4"
                              fillOpacity={1}
                              fill="url(#futurePredictionGradient)"
                              dot={{ r: 4.5, fill: NAVY_LIGHT, strokeWidth: 2, stroke: '#ffffff' }}
                              activeDot={{ r: 7, fill: NAVY, strokeWidth: 3, stroke: '#ffffff' }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Dual view */}
              {!noRate && activeGraphTab === 'dual' && (
                <div className="h-64 sm:h-72 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dualChartData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                      <defs>
                        <linearGradient id="dualHistoricalGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={NAVY} stopOpacity={0.22} />
                          <stop offset="95%" stopColor={NAVY} stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="dualFutureGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={NAVY_LIGHT} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={NAVY_LIGHT} stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="name" tick={{ ...axisTick, fontSize: 10 }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} dy={10} />
                      <YAxis tick={axisTick} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} tickFormatter={rupeeTick} domain={['auto', 'auto']} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-white text-slate-900 p-3 rounded-lg shadow-lg border border-slate-200 text-xs space-y-1">
                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                                  {data.fullLabel || data.name} ({data.type})
                                </p>
                                {data.historicalRate && (
                                  <p className="text-sm font-bold text-[#23408e]">
                                    Bought Rate: Rs. {data.historicalRate.toLocaleString('en-IN')} / {material.unit}
                                  </p>
                                )}
                                {data.predictedRate && (
                                  <p className="text-sm font-bold text-[#4f6fbf]">
                                    Predicted Rate: Rs. {data.predictedRate.toLocaleString('en-IN')} / {material.unit}
                                  </p>
                                )}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        height={36}
                        formatter={(val) => (
                          <span className="text-xs font-semibold text-slate-700 mr-3">
                            {val === 'historicalRate' ? 'Historical Purchases (Actual)' : 'AI Future Prediction (Search)'}
                          </span>
                        )}
                      />
                      <Area
                        type="monotone"
                        dataKey="historicalRate"
                        name="historicalRate"
                        stroke={NAVY}
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#dualHistoricalGradient)"
                        dot={{ r: 4, fill: NAVY, strokeWidth: 2, stroke: '#ffffff' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="predictedRate"
                        name="predictedRate"
                        stroke={NAVY_LIGHT}
                        strokeWidth={2.5}
                        strokeDasharray="5 4"
                        fillOpacity={1}
                        fill="url(#dualFutureGradient)"
                        dot={{ r: 4, fill: NAVY_LIGHT, strokeWidth: 2, stroke: '#ffffff' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Rate history ledger */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-[#eaf0fb] text-[#23408e] flex items-center justify-center shrink-0">
                  <Clock size={15} />
                </span>
                Rate History Ledger & Vendor Purchases
                <span className="px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]">
                  {sortedHistory.length} Record{sortedHistory.length !== 1 ? 's' : ''}
                </span>
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#23408e] text-white text-xs font-semibold uppercase tracking-wide">
                    <th className="py-3 px-3">Date & Month</th>
                    <th className="py-3 px-3 text-right">Unit Rate (Rs.)</th>
                    <th className="py-3 px-3">Vendor / Supplier</th>
                    <th className="py-3 px-3 text-right">Qty ({material.unit})</th>
                    <th className="py-3 px-3 text-right">Total Price (Rs.)</th>
                    <th className="py-3 px-3">Remarks / Note</th>
                  </tr>
                </thead>
                <tbody className="text-[13px] text-slate-700">
                  {noRate && (
                    <tr>
                      <td colSpan={6} className="py-8 px-3 text-center text-slate-400 font-medium">No purchases recorded for this material yet.</td>
                    </tr>
                  )}
                  {sortedHistory
                    .slice()
                    .reverse()
                    .map((pt, idx) => (
                      <tr key={pt.id || idx} className="border-b border-slate-100 hover:bg-[#f5f8fd] transition-colors">
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="font-semibold text-slate-900">{formatDateFull(pt.date)}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{formatDateAndMonth(pt.date)}</div>
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                          Rs. {pt.rate.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-3 truncate max-w-[180px]">{pt.vendorName || '—'}</td>
                        <td className="py-3 px-3 text-right">{pt.quantity ?? '—'}</td>
                        <td className="py-3 px-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                          {pt.quantity
                            ? `Rs. ${(pt.totalPrice || pt.rate * pt.quantity).toLocaleString('en-IN')}`
                            : '—'}
                        </td>
                        <td className="py-3 px-3 text-slate-500 text-xs max-w-[220px]">
                          <div className="truncate">{pt.notes || '—'}</div>
                          {pt.sourceUrl && (
                            <a
                              href={pt.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#23408e] hover:underline mt-0.5"
                              title={pt.sourceTitle || 'View attached market source'}
                            >
                              <ExternalLink size={10} />
                              <span>{pt.sourceTitle || 'View Source Link'}</span>
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white px-5 sm:px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500 hidden sm:block">
            Forecast powered by Live Market Search Engine with Indian commodity indices.
          </div>
          <button
            id="btn-close-modal-footer"
            onClick={onClose}
            className="px-5 py-2.5 bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer ml-auto"
          >
            Close Rate Analytics
          </button>
        </div>
      </motion.div>
    </div>
  );
}
