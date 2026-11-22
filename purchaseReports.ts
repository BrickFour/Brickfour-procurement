/**
 * Purchase analytics: automatic vendor rating, savings basis, and the pending / monthly / savings reports
 * (as JSON for the app and as Excel workbooks for download and scheduled emails).
 */
import type { Db } from 'mongodb';
import type { VendorPerformance, VendorCriterionScore } from './src/types.js';

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Calendar date (YYYY-MM-DD) of a moment in the given time zone */
export const localIso = (d: Date | string, timeZone: string) => new Date(d).toLocaleDateString('en-CA', { timeZone });
const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`)) / 86400000);

/** PO delivery date as YYYY-MM-DD (stored on new POs; parsed from the printed date on older ones) */
export function poDeliveryIso(po: any): string | undefined {
  if (typeof po?.deliveryByIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(po.deliveryByIso)) return po.deliveryByIso;
  const t = Date.parse(`${po?.deliveryBy || ''} 12:00:00 UTC`);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString().slice(0, 10);
}

/** Landed cost per unit actually supplied (total incl. GST, freight & loading / quantity) */
const landed = (q: any) =>
  q.totalAmount > 0 && q.quantity > 0 ? q.totalAmount / q.quantity : (Number(q.quotedRate) || 0) * (1 + (Number(q.gstRate) || 0) / 100);

/* ------------------------------------------------------------------ */
/* Automatic vendor rating                                             */
/* ------------------------------------------------------------------ */

export const QUALITY_SCORE: Record<string, number> = { Good: 100, Acceptable: 60, Poor: 0 };

/** The 7 rating criteria and their weights (%) */
export const RATING_CRITERIA: { key: VendorCriterionScore['key']; label: string; weight: number }[] = [
  { key: 'onTime', label: 'On-time delivery', weight: 25 },
  { key: 'quality', label: 'Material quality', weight: 20 },
  { key: 'price', label: 'Price competitiveness', weight: 20 },
  { key: 'fulfilment', label: 'Order fulfilment', weight: 10 },
  { key: 'responsiveness', label: 'RFQ responsiveness', weight: 10 },
  { key: 'invoiceAccuracy', label: 'Invoice accuracy', weight: 10 },
  { key: 'paymentTerms', label: 'Payment terms', weight: 5 },
];

const creditScore = (days: number) => (days >= 45 ? 100 : days >= 30 ? 80 : days >= 15 ? 60 : days >= 7 ? 40 : 20);

export async function computeVendorPerformance(db: Db, timeZone: string): Promise<VendorPerformance[]> {
  const today = localIso(new Date(), timeZone);
  const [vendors, prs, quotes, pos] = await Promise.all([
    db.collection('vendors').find({ deleted: { $ne: true } }, { projection: { _id: 0, id: 1, name: 1 } }).toArray(),
    db.collection('project_requirements').find({}, { projection: { _id: 0, id: 1, invitedVendorIds: 1, status: 1, quoteDeadline: 1 } }).toArray(),
    db
      .collection('vendor_quotations')
      .find({}, { projection: { _id: 0, prId: 1, vendorId: 1, quotedRate: 1, totalAmount: 1, quantity: 1, gstRate: 1, status: 1, creditDays: 1 } })
      .toArray(),
    db.collection('purchase_orders').find({ status: 'Issued' }, { projection: { _id: 0, pdf: 0, data: 0 } }).toArray(),
  ]);

  const valid = (q: any) => q.status !== 'Declined' && Number(q.quotedRate) > 0;
  const quotesByPr = new Map<string, any[]>();
  for (const q of quotes) if (valid(q)) quotesByPr.set(q.prId, [...(quotesByPr.get(q.prId) || []), q]);
  const respondedKeys = new Set(quotes.map((q: any) => `${q.prId}|${q.vendorId}`));

  return vendors.map((v: any) => {
    const vQuotes = quotes.filter((q: any) => q.vendorId === v.id && valid(q));
    const vPos = pos.filter((p: any) => p.vendorId === v.id);
    const receipts = vPos.flatMap((p: any) => (p.receipts || []).map((r: any) => ({ r, po: p })));

    // 1. On-time delivery: each delivery, plus overdue orders with nothing received yet
    const timeScores: number[] = [];
    let onTimeCount = 0;
    for (const { r, po } of receipts) {
      const due = poDeliveryIso(po);
      if (!due || !r.receivedOn) continue;
      const late = daysBetween(due, r.receivedOn);
      if (late <= 0) onTimeCount++;
      timeScores.push(late <= 0 ? 100 : Math.max(0, 100 - late * 10));
    }
    let overdueOpen = 0;
    for (const po of vPos) {
      const due = poDeliveryIso(po);
      if (!due || po.deliveryStatus === 'Received') continue;
      const late = daysBetween(due, today);
      if (late > 0 && !(po.receipts || []).length) {
        overdueOpen++;
        timeScores.push(Math.max(0, 100 - late * 10));
      }
    }
    const onTime = avg(timeScores);

    // 2. Quality: inspection grade + share of delivered quantity accepted
    const inspected = receipts.filter(({ r }) => r.quality);
    const gradeAvg = avg(inspected.map(({ r }) => QUALITY_SCORE[r.quality] ?? 60));
    const deliveredQty = inspected.reduce((s, { r }) => s + (Number(r.deliveredQty) || Number(r.receivedQty) || 0), 0);
    const acceptedQty = inspected.reduce((s, { r }) => s + (Number(r.receivedQty) || 0), 0);
    const acceptRate = deliveredQty > 0 ? (acceptedQty / deliveredQty) * 100 : null;
    const quality = gradeAvg === null ? null : acceptRate === null ? gradeAvg : gradeAvg * 0.5 + acceptRate * 0.5;

    // 3. Fulfilment: share of ordered quantity delivered, on orders that are complete or past their date
    const fulfilScores: number[] = [];
    let fullOrders = 0;
    for (const po of vPos) {
      const due = poDeliveryIso(po);
      const closed = po.deliveryStatus === 'Received' || (due && daysBetween(due, today) > 0);
      if (!closed || !(po.orderedQty > 0)) continue;
      const ratio = Math.min(1, (Number(po.receivedQty) || 0) / po.orderedQty);
      if (ratio >= 0.999) fullOrders++;
      fulfilScores.push(ratio * 100);
    }
    const fulfilment = avg(fulfilScores);

    // 4. Price: lowest landed price in the RFQ / this vendor's landed price (RFQs with 2+ quotes)
    const priceScores: number[] = [];
    let lowestCount = 0;
    for (const q of vQuotes) {
      const peers = quotesByPr.get(q.prId) || [];
      if (peers.length < 2) continue;
      const mine = landed(q);
      const lowest = Math.min(...peers.map(landed));
      if (mine <= 0) continue;
      if (mine <= lowest + 1e-9) lowestCount++;
      priceScores.push((lowest / mine) * 100);
    }
    const price = avg(priceScores);

    // 5. Responsiveness: invitations answered (quote or decline); open RFQs are not counted against the vendor
    let invited = 0;
    let answered = 0;
    for (const pr of prs) {
      if (!(pr.invitedVendorIds || []).includes(v.id)) continue;
      const replied = respondedKeys.has(`${pr.id}|${v.id}`);
      const decided = ['Pending Approval', 'Awarded', 'Closed'].includes(pr.status) || (pr.quoteDeadline && Date.parse(pr.quoteDeadline) < Date.now());
      if (!replied && !decided) continue;
      invited++;
      if (replied) answered++;
    }
    const responsiveness = invited ? (answered / invited) * 100 : null;

    // 6. Invoice accuracy: invoices matching the PO terms (within 0.5% or Rs. 1)
    const invoices = receipts.filter(({ r }) => Number(r.invoiceTotal) > 0);
    const accurate = invoices.filter(({ r }) => Math.abs(Number(r.variance) || 0) <= Math.max(1, 0.005 * (Number(r.computedTotal) || 0))).length;
    const invoiceAccuracy = invoices.length ? (accurate / invoices.length) * 100 : null;

    // 7. Payment terms offered (longer credit = better)
    const credits = vQuotes.map((q: any) => Number(q.creditDays) || 0);
    const paymentTerms = credits.length ? avg(credits.map(creditScore)) : null;
    const avgCredit = credits.length ? Math.round(avg(credits)!) : 0;

    const values: Record<string, { score: number | null; detail: string }> = {
      onTime: {
        score: onTime,
        detail: timeScores.length
          ? `${onTimeCount} of ${receipts.length} deliveries on time${overdueOpen ? `, ${overdueOpen} order${overdueOpen === 1 ? '' : 's'} overdue` : ''}`
          : 'No deliveries yet',
      },
      quality: {
        score: quality,
        detail: inspected.length
          ? `${inspected.length} inspection${inspected.length === 1 ? '' : 's'}${acceptRate !== null ? `, ${Math.round(acceptRate)}% of quantity accepted` : ''}`
          : 'No inspected deliveries yet',
      },
      price: {
        score: price,
        detail: priceScores.length ? `Lowest price in ${lowestCount} of ${priceScores.length} compared RFQs` : 'No compared RFQs yet',
      },
      fulfilment: {
        score: fulfilment,
        detail: fulfilScores.length ? `${fullOrders} of ${fulfilScores.length} orders delivered in full` : 'No completed orders yet',
      },
      responsiveness: {
        score: responsiveness,
        detail: invited ? `Answered ${answered} of ${invited} RFQs` : 'No closed RFQs yet',
      },
      invoiceAccuracy: {
        score: invoiceAccuracy,
        detail: invoices.length ? `${accurate} of ${invoices.length} invoices matched the PO` : 'No invoices yet',
      },
      paymentTerms: {
        score: paymentTerms,
        detail: credits.length ? `Average ${avgCredit} days credit offered` : 'No quotations yet',
      },
    };

    const criteria: VendorCriterionScore[] = RATING_CRITERIA.map((c) => ({
      key: c.key,
      label: c.label,
      weight: c.weight,
      score: values[c.key].score === null ? null : Math.round(values[c.key].score! * 10) / 10,
      detail: values[c.key].detail,
    }));
    const scored = criteria.filter((c) => c.score !== null);
    const weightSum = scored.reduce((s, c) => s + c.weight, 0);
    const score = weightSum ? Math.round((scored.reduce((s, c) => s + c.weight * (c.score as number), 0) / weightSum) * 10) / 10 : null;

    return {
      vendorId: v.id,
      vendorName: v.name,
      score,
      rating: score === null ? null : Math.round((score / 20) * 10) / 10,
      criteria,
      basis: { rfqsInvited: invited, quotes: vQuotes.length, purchaseOrders: vPos.length, deliveries: receipts.length },
    };
  });
}

/* ------------------------------------------------------------------ */
/* Savings basis (stored on each PO when it is issued)                 */
/* ------------------------------------------------------------------ */

export interface SavingsBasis {
  originalRate: number; // winning vendor's first quoted rate (before negotiation)
  finalRate: number; // rate on the PO
  avgQuoteRate: number | null; // average first-quoted rate of all vendors who quoted
  highestQuoteRate: number | null;
  quotesCompared: number;
  marketRate: number | null;
  targetRate: number | null; // PR target budget rate
  lastBuyRate: number | null; // material's last purchase rate before this order
}

export async function computeSavingsBasis(db: Db, pr: any, quote: any): Promise<SavingsBasis> {
  const quotes = await db
    .collection('vendor_quotations')
    .find({ prId: pr.id, status: { $ne: 'Declined' } }, { projection: { _id: 0, quotedRate: 1, negotiation: 1 } })
    .toArray();
  const firstRate = (q: any) => Number(q.negotiation?.originalRate) || Number(q.quotedRate) || 0;
  const rates = quotes.map(firstRate).filter((r) => r > 0);
  const benchmark: any = pr.materialCode
    ? await db.collection('market_benchmarks').findOne({ materialCode: String(pr.materialCode).padStart(3, '0') }, { projection: { _id: 0, currentMarketPrice: 1 } })
    : null;
  const material: any = pr.materialId ? await db.collection('materials').findOne({ id: pr.materialId }, { projection: { _id: 0, unitCost: 1 } }) : null;
  return {
    originalRate: firstRate(quote),
    finalRate: Number(quote.quotedRate) || 0,
    avgQuoteRate: rates.length ? round2(avg(rates)!) : null,
    highestQuoteRate: rates.length ? Math.max(...rates) : null,
    quotesCompared: rates.length,
    marketRate: Number(benchmark?.currentMarketPrice) > 0 ? Number(benchmark.currentMarketPrice) : null,
    targetRate: Number(pr.targetBudgetRate) > 0 ? Number(pr.targetBudgetRate) : null,
    lastBuyRate: Number(material?.unitCost) > 0 ? Number(material.unitCost) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

const OPEN_PR = ['Draft', 'Enquiry Sent', 'Quotes Received', 'Under Comparison', 'Shortlisted'];

export async function buildPendingReport(db: Db, timeZone: string) {
  const today = localIso(new Date(), timeZone);
  const [prs, quotes, pos] = await Promise.all([
    db.collection('project_requirements').find({ deleted: { $ne: true } }, { projection: { _id: 0 } }).toArray(),
    db.collection('vendor_quotations').find({}, { projection: { _id: 0, quoteText: 0 } }).toArray(),
    db.collection('purchase_orders').find({ status: 'Issued' }, { projection: { _id: 0, pdf: 0, data: 0 } }).toArray(),
  ]);
  const ageDays = (created: string) => {
    const t = Date.parse(created);
    return Number.isNaN(t) ? null : daysBetween(localIso(new Date(t), timeZone), today);
  };

  const rfqs = prs
    .filter((p: any) => OPEN_PR.includes(p.status))
    .map((p: any) => {
      const prQuotes = quotes.filter((q: any) => q.prId === p.id);
      return {
        prId: p.id,
        material: p.materialName,
        project: p.projectName,
        quantity: p.quantity,
        unit: p.unit,
        status: p.status,
        requiredDate: p.requiredDate || '',
        quoteDeadline: p.quoteDeadline ? localIso(p.quoteDeadline, timeZone) : '',
        invited: (p.invitedVendorIds || []).length,
        quotes: prQuotes.filter((q: any) => q.status !== 'Declined').length,
        declined: prQuotes.filter((q: any) => q.status === 'Declined').length,
        ageDays: ageDays(p.createdAt),
      };
    });

  const approvals = prs
    .filter((p: any) => p.status === 'Pending Approval' && p.approval?.status === 'Pending')
    .map((p: any) => ({
      prId: p.id,
      material: p.materialName,
      project: p.projectName,
      vendor: p.approval.vendorName,
      amount: p.approval.amount,
      requestedBy: p.approval.requestedBy,
      requestedOn: localIso(p.approval.requestedAt, timeZone),
      waitingDays: daysBetween(localIso(p.approval.requestedAt, timeZone), today),
    }));

  const prById = new Map(prs.map((p: any) => [p.id, p]));
  const negotiations = quotes
    .filter((q: any) => ['Offered', 'Countered'].includes(q.negotiation?.status) && OPEN_PR.includes(prById.get(q.prId)?.status))
    .map((q: any) => ({
      prId: q.prId,
      material: q.materialName,
      vendor: q.vendorName,
      originalRate: q.negotiation.originalRate,
      offeredRate: q.negotiation.targetRate,
      currentRate: q.quotedRate,
      status: q.negotiation.status === 'Offered' ? 'Waiting for vendor' : 'Vendor countered',
      updatedOn: localIso(q.negotiation.updatedAt, timeZone),
    }));

  const deliveries = pos
    .filter((po: any) => po.deliveryStatus !== 'Received')
    .map((po: any) => {
      const due = poDeliveryIso(po) || '';
      const overdue = due ? daysBetween(due, today) : 0;
      return {
        poNumber: po.poNumber,
        material: po.materialName,
        project: po.projectName,
        vendor: po.vendorName,
        ordered: po.orderedQty,
        received: round2(po.receivedQty || 0),
        pending: round2((po.orderedQty || 0) - (po.receivedQty || 0)),
        unit: po.unit,
        deliveryBy: due,
        daysOverdue: overdue,
        status: overdue > 0 ? `Overdue ${overdue}d` : overdue === 0 ? 'Due today' : `Due in ${-overdue}d`,
      };
    })
    .sort((a: any, b: any) => b.daysOverdue - a.daysOverdue);

  const payments = pos
    .flatMap((po: any) =>
      (po.receipts || [])
        .filter((r: any) => r.paymentStatus === 'Unpaid' && Number(r.invoiceTotal) > 0)
        .map((r: any) => {
          const overdue = r.dueDate ? daysBetween(r.dueDate, today) : 0;
          return {
            poNumber: po.poNumber,
            vendor: po.vendorName,
            invoiceNumber: r.invoiceNumber,
            invoiceDate: r.invoiceDate,
            amount: r.invoiceTotal,
            dueDate: r.dueDate || '',
            daysOverdue: overdue,
            status: overdue > 0 ? `Overdue ${overdue}d` : overdue === 0 ? 'Due today' : `Due in ${-overdue}d`,
          };
        })
    )
    .sort((a: any, b: any) => b.daysOverdue - a.daysOverdue);

  const overduePay = payments.filter((p: any) => p.daysOverdue > 0);
  return {
    type: 'pending' as const,
    title: 'Pending Purchase Report',
    period: today,
    generatedAt: new Date().toISOString(),
    summary: {
      openRfqs: rfqs.length,
      awaitingApproval: approvals.length,
      negotiations: negotiations.length,
      posAwaitingDelivery: deliveries.length,
      overdueDeliveries: deliveries.filter((d: any) => d.daysOverdue > 0).length,
      unpaidInvoices: payments.length,
      unpaidAmount: round2(payments.reduce((s: number, p: any) => s + p.amount, 0)),
      overduePayments: overduePay.length,
      overdueAmount: round2(overduePay.reduce((s: number, p: any) => s + p.amount, 0)),
    },
    rfqs,
    approvals,
    negotiations,
    deliveries,
    payments,
  };
}

function savingsLine(po: any, basis: SavingsBasis | undefined, timeZone: string) {
  const qty = Number(po.orderedQty) || 0;
  const final = Number(po.rate) || 0;
  const b = basis || ({} as SavingsBasis);
  const save = (ref: number | null | undefined) => (ref && ref > 0 ? round2((ref - final) * qty) : null);
  return {
    poNumber: po.poNumber,
    date: localIso(po.issuedAt, timeZone),
    material: po.materialName,
    project: po.projectName,
    vendor: po.vendorName,
    quantity: qty,
    unit: po.unit,
    finalRate: final,
    orderValue: Number(po.grandTotal) || 0,
    originalRate: b.originalRate || final,
    negotiationSaving: save(b.originalRate || final) || 0,
    avgQuoteRate: b.avgQuoteRate ?? null,
    vsAverageSaving: (b.quotesCompared || 0) >= 2 ? save(b.avgQuoteRate) : null,
    highestQuoteRate: b.highestQuoteRate ?? null,
    quotesCompared: b.quotesCompared || 0,
    marketRate: b.marketRate ?? null,
    vsMarketSaving: save(b.marketRate),
    targetRate: b.targetRate ?? null,
    vsTargetSaving: save(b.targetRate),
    lastBuyRate: b.lastBuyRate ?? null,
    vsLastBuySaving: save(b.lastBuyRate),
  };
}

/** Savings basis for POs issued before savings were recorded */
async function ensureBasis(db: Db, po: any): Promise<SavingsBasis | undefined> {
  if (po.savingsBasis) return po.savingsBasis;
  const pr = await db.collection('project_requirements').findOne({ id: po.prId }, { projection: { _id: 0 } });
  const quote = await db.collection('vendor_quotations').findOne({ prId: po.prId, vendorId: po.vendorId }, { projection: { _id: 0 } });
  if (!pr || !quote) return undefined;
  return { ...(await computeSavingsBasis(db, pr, quote)), finalRate: Number(po.rate) || 0 };
}

export async function buildSavingsReport(db: Db, from: string, to: string, timeZone: string) {
  const pos = await db.collection('purchase_orders').find({ status: 'Issued' }, { projection: { _id: 0, pdf: 0, data: 0 } }).toArray();
  const inRange = pos.filter((po: any) => {
    const d = localIso(po.issuedAt, timeZone);
    return d >= from && d <= to;
  });
  const lines = [];
  for (const po of inRange) lines.push(savingsLine(po, await ensureBasis(db, po), timeZone));
  lines.sort((a, b) => b.date.localeCompare(a.date));
  const sum = (k: keyof (typeof lines)[number]) => round2(lines.reduce((s, l: any) => s + (Number(l[k]) || 0), 0));
  const spend = sum('orderValue');
  const negotiation = sum('negotiationSaving');
  const vsAverage = sum('vsAverageSaving');
  return {
    type: 'savings' as const,
    title: 'Savings Report',
    period: `${from} to ${to}`,
    from,
    to,
    generatedAt: new Date().toISOString(),
    summary: {
      orders: lines.length,
      spend,
      negotiationSaving: negotiation,
      negotiatedOrders: lines.filter((l) => l.negotiationSaving > 0).length,
      vsAverageSaving: vsAverage,
      vsMarketSaving: sum('vsMarketSaving'),
      vsTargetSaving: sum('vsTargetSaving'),
      vsLastBuySaving: sum('vsLastBuySaving'),
      // Savings from competitive quotes + negotiation, as % of what would have been spent
      savingPct: spend > 0 ? round2((vsAverage / (spend + vsAverage)) * 100) : 0,
    },
    lines,
  };
}

export async function buildMonthlyReport(db: Db, month: string, timeZone: string) {
  const [y, m] = month.split('-').map(Number);
  const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const label = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const pos = await db.collection('purchase_orders').find({ status: 'Issued' }, { projection: { _id: 0, pdf: 0, data: 0 } }).toArray();
  const monthOf = (d: any) => (d ? localIso(d, timeZone).slice(0, 7) : '');

  const orders = pos
    .filter((po: any) => monthOf(po.issuedAt) === month)
    .map((po: any) => ({
      poNumber: po.poNumber,
      date: localIso(po.issuedAt, timeZone),
      material: po.materialName,
      project: po.projectName,
      vendor: po.vendorName,
      quantity: po.orderedQty,
      unit: po.unit,
      rate: po.rate,
      value: Number(po.grandTotal) || 0,
      deliveryStatus: po.deliveryStatus,
    }))
    .sort((a: any, b: any) => a.date.localeCompare(b.date));
  const prevValue = round2(pos.filter((po: any) => monthOf(po.issuedAt) === prevMonth).reduce((s: number, po: any) => s + (Number(po.grandTotal) || 0), 0));

  const group = (key: 'project' | 'vendor' | 'material') => {
    const map = new Map<string, { name: string; orders: number; value: number }>();
    for (const o of orders) {
      const g = map.get(o[key]) || { name: o[key], orders: 0, value: 0 };
      g.orders++;
      g.value = round2(g.value + o.value);
      map.set(o[key], g);
    }
    return [...map.values()].sort((a, b) => b.value - a.value);
  };

  const deliveries = pos
    .flatMap((po: any) =>
      (po.receipts || [])
        .filter((r: any) => (r.receivedOn || '').slice(0, 7) === month)
        .map((r: any) => ({
          grnNumber: r.grnNumber || r.id,
          poNumber: po.poNumber,
          date: r.receivedOn,
          material: po.materialName,
          vendor: po.vendorName,
          delivered: Number(r.deliveredQty) || Number(r.receivedQty) || 0,
          accepted: Number(r.receivedQty) || 0,
          rejected: Number(r.rejectedQty) || 0,
          unit: po.unit,
          quality: r.quality || 'Not inspected',
          onTime: (() => {
            const due = poDeliveryIso(po);
            return due ? (r.receivedOn <= due ? 'Yes' : 'No') : '-';
          })(),
          invoiceAmount: Number(r.invoiceTotal) || 0,
        }))
    )
    .sort((a: any, b: any) => a.date.localeCompare(b.date));

  const payments = pos
    .flatMap((po: any) =>
      (po.receipts || [])
        .filter((r: any) => r.paymentStatus === 'Paid' && (r.paidOn || '').slice(0, 7) === month)
        .map((r: any) => ({ poNumber: po.poNumber, vendor: po.vendorName, invoiceNumber: r.invoiceNumber, amount: Number(r.invoiceTotal) || 0, paidOn: r.paidOn, reference: r.paymentReference || '' }))
    )
    .sort((a: any, b: any) => a.paidOn.localeCompare(b.paidOn));

  const [from, to] = [`${month}-01`, `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`];
  const savings = await buildSavingsReport(db, from, to, timeZone);
  const value = round2(orders.reduce((s: number, o: any) => s + o.value, 0));

  return {
    type: 'monthly' as const,
    title: 'Monthly Purchase Report',
    period: label,
    month,
    generatedAt: new Date().toISOString(),
    summary: {
      orders: orders.length,
      value,
      previousMonthValue: prevValue,
      changePct: prevValue > 0 ? round2(((value - prevValue) / prevValue) * 100) : null,
      vendors: new Set(orders.map((o: any) => o.vendor)).size,
      deliveries: deliveries.length,
      rejectedDeliveries: deliveries.filter((d: any) => d.rejected > 0).length,
      lateDeliveries: deliveries.filter((d: any) => d.onTime === 'No').length,
      invoiced: round2(deliveries.reduce((s: number, d: any) => s + d.invoiceAmount, 0)),
      paid: round2(payments.reduce((s: number, p: any) => s + p.amount, 0)),
      negotiationSaving: savings.summary.negotiationSaving,
      vsAverageSaving: savings.summary.vsAverageSaving,
    },
    orders,
    byProject: group('project'),
    byVendor: group('vendor'),
    byMaterial: group('material'),
    deliveries,
    payments,
  };
}

/* ------------------------------------------------------------------ */
/* Excel export                                                        */
/* ------------------------------------------------------------------ */

type Col = { header: string; key: string; width?: number; money?: boolean };
interface Sheet {
  name: string;
  columns: Col[];
  rows: any[];
}

function sheetsFor(report: any, performance?: VendorPerformance[]): Sheet[] {
  const summarySheet = (pairs: [string, any][]): Sheet => ({
    name: 'Summary',
    columns: [
      { header: 'Item', key: 'k', width: 38 },
      { header: 'Value', key: 'v', width: 22 },
    ],
    rows: pairs.map(([k, v]) => ({ k, v: v === null || v === undefined ? '-' : v })),
  });
  const s = report.summary || {};
  if (report.type === 'pending') {
    return [
      summarySheet([
        ['Report date', report.period],
        ['Open RFQs', s.openRfqs],
        ['Awaiting approval', s.awaitingApproval],
        ['Negotiations in progress', s.negotiations],
        ['POs awaiting delivery', s.posAwaitingDelivery],
        ['Overdue deliveries', s.overdueDeliveries],
        ['Unpaid invoices', s.unpaidInvoices],
        ['Unpaid amount (Rs.)', s.unpaidAmount],
        ['Overdue payments', s.overduePayments],
        ['Overdue amount (Rs.)', s.overdueAmount],
      ]),
      { name: 'Open RFQs', columns: [
        { header: 'PR', key: 'prId', width: 16 }, { header: 'Material', key: 'material', width: 30 }, { header: 'Project', key: 'project', width: 24 },
        { header: 'Qty', key: 'quantity', width: 10 }, { header: 'Unit', key: 'unit', width: 10 }, { header: 'Status', key: 'status', width: 18 },
        { header: 'Required by', key: 'requiredDate', width: 13 }, { header: 'Quote deadline', key: 'quoteDeadline', width: 14 },
        { header: 'Invited', key: 'invited', width: 9 }, { header: 'Quotes', key: 'quotes', width: 9 }, { header: 'Declined', key: 'declined', width: 9 }, { header: 'Age (days)', key: 'ageDays', width: 10 },
      ], rows: report.rfqs },
      { name: 'Awaiting Approval', columns: [
        { header: 'PR', key: 'prId', width: 16 }, { header: 'Material', key: 'material', width: 30 }, { header: 'Project', key: 'project', width: 24 },
        { header: 'Selected vendor', key: 'vendor', width: 28 }, { header: 'Amount (Rs.)', key: 'amount', width: 16, money: true },
        { header: 'Requested by', key: 'requestedBy', width: 20 }, { header: 'Requested on', key: 'requestedOn', width: 13 }, { header: 'Waiting (days)', key: 'waitingDays', width: 13 },
      ], rows: report.approvals },
      { name: 'Negotiations', columns: [
        { header: 'PR', key: 'prId', width: 16 }, { header: 'Material', key: 'material', width: 30 }, { header: 'Vendor', key: 'vendor', width: 28 },
        { header: 'Quoted rate', key: 'originalRate', width: 13, money: true }, { header: 'Our offer', key: 'offeredRate', width: 13, money: true },
        { header: 'Current rate', key: 'currentRate', width: 13, money: true }, { header: 'Status', key: 'status', width: 20 }, { header: 'Updated', key: 'updatedOn', width: 12 },
      ], rows: report.negotiations },
      { name: 'Pending Deliveries', columns: [
        { header: 'PO', key: 'poNumber', width: 16 }, { header: 'Material', key: 'material', width: 30 }, { header: 'Project', key: 'project', width: 24 },
        { header: 'Vendor', key: 'vendor', width: 28 }, { header: 'Ordered', key: 'ordered', width: 10 }, { header: 'Received', key: 'received', width: 10 },
        { header: 'Pending', key: 'pending', width: 10 }, { header: 'Unit', key: 'unit', width: 9 }, { header: 'Delivery by', key: 'deliveryBy', width: 12 }, { header: 'Status', key: 'status', width: 14 },
      ], rows: report.deliveries },
      { name: 'Unpaid Invoices', columns: [
        { header: 'PO', key: 'poNumber', width: 16 }, { header: 'Vendor', key: 'vendor', width: 28 }, { header: 'Invoice', key: 'invoiceNumber', width: 18 },
        { header: 'Invoice date', key: 'invoiceDate', width: 12 }, { header: 'Amount (Rs.)', key: 'amount', width: 15, money: true },
        { header: 'Due date', key: 'dueDate', width: 12 }, { header: 'Status', key: 'status', width: 14 },
      ], rows: report.payments },
    ];
  }
  const savingsCols: Col[] = [
    { header: 'PO', key: 'poNumber', width: 16 }, { header: 'Date', key: 'date', width: 12 }, { header: 'Material', key: 'material', width: 28 },
    { header: 'Project', key: 'project', width: 22 }, { header: 'Vendor', key: 'vendor', width: 26 }, { header: 'Qty', key: 'quantity', width: 9 }, { header: 'Unit', key: 'unit', width: 8 },
    { header: 'PO rate', key: 'finalRate', width: 11, money: true }, { header: 'Quoted rate', key: 'originalRate', width: 11, money: true },
    { header: 'Negotiation saving', key: 'negotiationSaving', width: 15, money: true }, { header: 'Avg quote rate', key: 'avgQuoteRate', width: 12, money: true },
    { header: 'Saving vs avg quote', key: 'vsAverageSaving', width: 15, money: true }, { header: 'Market rate', key: 'marketRate', width: 11, money: true },
    { header: 'Saving vs market', key: 'vsMarketSaving', width: 14, money: true }, { header: 'Target rate', key: 'targetRate', width: 11, money: true },
    { header: 'Saving vs target', key: 'vsTargetSaving', width: 14, money: true }, { header: 'Last buy rate', key: 'lastBuyRate', width: 12, money: true },
    { header: 'Saving vs last buy', key: 'vsLastBuySaving', width: 15, money: true },
  ];
  if (report.type === 'savings') {
    return [
      summarySheet([
        ['Period', report.period],
        ['Purchase orders', s.orders],
        ['Order value (Rs.)', s.spend],
        ['Negotiation saving (Rs.)', s.negotiationSaving],
        ['Orders with negotiated savings', s.negotiatedOrders],
        ['Saving vs average quotation (Rs.)', s.vsAverageSaving],
        ['Saving vs market rate (Rs.)', s.vsMarketSaving],
        ['Saving vs target budget rate (Rs.)', s.vsTargetSaving],
        ['Saving vs last purchase rate (Rs.)', s.vsLastBuySaving],
        ['Saving % (vs average quotation)', s.savingPct],
      ]),
      { name: 'Savings by Order', columns: savingsCols, rows: report.lines },
    ];
  }
  if (report.type === 'monthly') {
    const groupCols = (name: string): Col[] => [
      { header: name, key: 'name', width: 32 }, { header: 'Orders', key: 'orders', width: 9 }, { header: 'Value (Rs.)', key: 'value', width: 16, money: true },
    ];
    return [
      summarySheet([
        ['Month', report.period],
        ['Purchase orders', s.orders],
        ['Order value (Rs.)', s.value],
        ['Previous month value (Rs.)', s.previousMonthValue],
        ['Change vs previous month (%)', s.changePct],
        ['Vendors used', s.vendors],
        ['Deliveries received', s.deliveries],
        ['Deliveries with rejections', s.rejectedDeliveries],
        ['Late deliveries', s.lateDeliveries],
        ['Invoiced (Rs.)', s.invoiced],
        ['Paid (Rs.)', s.paid],
        ['Negotiation saving (Rs.)', s.negotiationSaving],
        ['Saving vs average quotation (Rs.)', s.vsAverageSaving],
      ]),
      { name: 'Purchase Orders', columns: [
        { header: 'PO', key: 'poNumber', width: 16 }, { header: 'Date', key: 'date', width: 12 }, { header: 'Material', key: 'material', width: 28 },
        { header: 'Project', key: 'project', width: 22 }, { header: 'Vendor', key: 'vendor', width: 26 }, { header: 'Qty', key: 'quantity', width: 9 },
        { header: 'Unit', key: 'unit', width: 8 }, { header: 'Rate', key: 'rate', width: 11, money: true }, { header: 'Value (Rs.)', key: 'value', width: 15, money: true },
        { header: 'Delivery', key: 'deliveryStatus', width: 17 },
      ], rows: report.orders },
      { name: 'By Project', columns: groupCols('Project'), rows: report.byProject },
      { name: 'By Vendor', columns: groupCols('Vendor'), rows: report.byVendor },
      { name: 'By Material', columns: groupCols('Material'), rows: report.byMaterial },
      { name: 'Deliveries (GRN)', columns: [
        { header: 'GRN', key: 'grnNumber', width: 18 }, { header: 'PO', key: 'poNumber', width: 16 }, { header: 'Date', key: 'date', width: 12 },
        { header: 'Material', key: 'material', width: 26 }, { header: 'Vendor', key: 'vendor', width: 24 }, { header: 'Delivered', key: 'delivered', width: 10 },
        { header: 'Accepted', key: 'accepted', width: 10 }, { header: 'Rejected', key: 'rejected', width: 10 }, { header: 'Unit', key: 'unit', width: 8 },
        { header: 'Quality', key: 'quality', width: 14 }, { header: 'On time', key: 'onTime', width: 9 }, { header: 'Invoice (Rs.)', key: 'invoiceAmount', width: 14, money: true },
      ], rows: report.deliveries },
      { name: 'Payments', columns: [
        { header: 'PO', key: 'poNumber', width: 16 }, { header: 'Vendor', key: 'vendor', width: 26 }, { header: 'Invoice', key: 'invoiceNumber', width: 18 },
        { header: 'Amount (Rs.)', key: 'amount', width: 15, money: true }, { header: 'Paid on', key: 'paidOn', width: 12 }, { header: 'Reference', key: 'reference', width: 20 },
      ], rows: report.payments },
    ];
  }
  // Vendor performance
  const perf = performance || [];
  return [
    {
      name: 'Vendor Rating',
      columns: [
        { header: 'Vendor', key: 'vendorName', width: 32 }, { header: 'Rating (of 5)', key: 'rating', width: 12 }, { header: 'Score (of 100)', key: 'score', width: 13 },
        ...RATING_CRITERIA.map((c) => ({ header: `${c.label} (${c.weight}%)`, key: c.key, width: 18 })),
        { header: 'RFQs', key: 'rfqs', width: 8 }, { header: 'Quotes', key: 'quotes', width: 8 }, { header: 'POs', key: 'pos', width: 8 }, { header: 'Deliveries', key: 'deliveries', width: 10 },
      ],
      rows: perf.map((p) => ({
        vendorName: p.vendorName,
        rating: p.rating ?? 'Not rated',
        score: p.score ?? '-',
        ...Object.fromEntries(p.criteria.map((c) => [c.key, c.score === null ? '-' : c.score])),
        rfqs: p.basis.rfqsInvited,
        quotes: p.basis.quotes,
        pos: p.basis.purchaseOrders,
        deliveries: p.basis.deliveries,
      })),
    },
  ];
}

export async function reportWorkbook(report: any, companyName: string, performance?: VendorPerformance[]): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = companyName;
  wb.created = new Date();
  for (const sheet of sheetsFor(report, performance)) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 3 }] });
    ws.mergeCells(1, 1, 1, Math.max(2, sheet.columns.length));
    const title = ws.getCell(1, 1);
    title.value = `${companyName} - ${report.title || 'Vendor Performance'} (${report.period || ''})`;
    title.font = { bold: true, size: 13, color: { argb: 'FF23408E' } };
    ws.getRow(3).values = sheet.columns.map((c) => c.header);
    ws.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(3).eachCell((cell: any) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF23408E' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    ws.getRow(3).height = 30;
    sheet.columns.forEach((c, i) => {
      ws.getColumn(i + 1).width = c.width || 14;
      if (c.money) ws.getColumn(i + 1).numFmt = '#,##0.00';
    });
    if (sheet.rows.length === 0) ws.addRow(['No records']);
    for (const r of sheet.rows) ws.addRow(sheet.columns.map((c) => (r[c.key] === null || r[c.key] === undefined ? '' : r[c.key])));
  }
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
