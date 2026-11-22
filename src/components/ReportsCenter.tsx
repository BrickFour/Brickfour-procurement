import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Download, Mail, Loader2, RefreshCw, X, CalendarClock } from 'lucide-react';
import type { User, VendorPerformance } from '../types';
import { apiError, userMessage } from '../lib/userError';

type ReportType = 'pending' | 'monthly' | 'savings' | 'vendors';

const TABS: { id: ReportType; label: string; schedule: string }[] = [
  { id: 'pending', label: 'Pending Purchases', schedule: 'Emailed automatically every day at 8 AM.' },
  { id: 'monthly', label: 'Monthly Purchases', schedule: "Last month's report is emailed automatically on the 1st." },
  { id: 'savings', label: 'Savings', schedule: "Last month's savings report is emailed automatically on the 1st." },
  { id: 'vendors', label: 'Vendor Performance', schedule: 'Ratings update automatically from deliveries, inspections, quotes and invoices.' },
];

const rs = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `Rs. ${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtDate = (v?: string) => {
  if (!v) return '—';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type Col = { key: string; label: string; right?: boolean; render?: (row: any) => React.ReactNode };

function Table({ title, cols, rows, empty }: { title: string; cols: Col[]; rows: any[]; empty: string }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <h3 className="px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900">
        {title} <span className="text-slate-400 font-normal">({rows.length})</span>
      </h3>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500 text-center">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#23408e] text-white text-left text-xs uppercase tracking-wide">
                {cols.map((c) => (
                  <th key={c.key} className={`px-3 py-2.5 font-semibold whitespace-nowrap ${c.right ? 'text-right' : ''}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  {cols.map((c) => (
                    <td key={c.key} className={`px-3 py-2 ${c.right ? 'text-right' : ''} text-slate-800`}>
                      {c.render ? c.render(r) : r[c.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
      <p className={`text-xl font-bold mt-1 ${tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-rose-700' : 'text-slate-900'}`}>{value}</p>
      {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
    </div>
  );
}

const savingCell = (v: number | null) =>
  v === null || v === undefined ? '—' : <span className={v > 0 ? 'text-emerald-700 font-semibold' : v < 0 ? 'text-rose-700' : ''}>{rs(v)}</span>;

const statusCell = (s: string) => (
  <span className={/Overdue/.test(s) ? 'text-rose-700 font-semibold' : /today/.test(s) ? 'text-amber-700 font-semibold' : ''}>{s}</span>
);

export default function ReportsCenter({ currentUser }: { currentUser: User }) {
  const [tab, setTab] = useState<ReportType>('pending');
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [from, setFrom] = useState(`${todayIso().slice(0, 4)}-01-01`);
  const [to, setTo] = useState(todayIso());
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState(currentUser.email || '');
  const [emailBusy, setEmailBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const params = useCallback((): Record<string, string> => {
    if (tab === 'monthly') return { month };
    if (tab === 'savings') return { from, to };
    return {};
  }, [tab, month, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${tab}?${new URLSearchParams(params()).toString()}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw apiError(json, 'Could not load this report.');
      setReport(json.report);
    } catch (err) {
      setReport(null);
      setError(userMessage(err, 'Could not load this report. Please check your internet connection and try again.'));
    } finally {
      setLoading(false);
    }
  }, [tab, params]);

  useEffect(() => {
    setReport(null);
    load();
  }, [load]);

  const sendEmail = async () => {
    setEmailBusy(true);
    try {
      const res = await fetch(`/api/reports/${tab}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params(), to: emailTo }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw apiError(json, 'The report could not be emailed. Please try again.');
      setNotice(`Report emailed to ${json.sentTo.join(', ')} with the Excel file attached.`);
      setEmailOpen(false);
    } catch (err) {
      setNotice(null);
      setError(userMessage(err, 'The report could not be emailed. Please check your internet connection and try again.'));
    } finally {
      setEmailBusy(false);
    }
  };

  const downloadUrl = `/api/reports/${tab}?${new URLSearchParams({ ...params(), format: 'xlsx' }).toString()}`;
  const s = report?.summary || {};
  const field = 'px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#23408e]/30';
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div className="space-y-5">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#23408e] text-white flex items-center justify-center">
            <ClipboardList size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Purchase Reports</h1>
            <p className="text-xs text-slate-500 inline-flex items-center gap-1"><CalendarClock size={12} /> {active.schedule}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={load} disabled={loading} className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <a href={downloadUrl} className="px-3 py-2 rounded-lg border border-[#23408e] text-[#23408e] hover:bg-[#f5f8fd] text-sm font-semibold inline-flex items-center gap-1.5">
            <Download size={14} /> Download Excel
          </a>
          <button onClick={() => setEmailOpen(true)} className="px-3 py-2 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer">
            <Mail size={14} /> Email Report
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap cursor-pointer ${tab === t.id ? 'border-[#23408e] text-[#23408e]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {(tab === 'monthly' || tab === 'savings') && (
        <div className="flex flex-wrap items-end gap-3">
          {tab === 'monthly' ? (
            <label className="text-sm font-medium text-slate-700">
              Month
              <input id="report-month" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={`${field} block mt-1`} />
            </label>
          ) : (
            <>
              <label className="text-sm font-medium text-slate-700">
                From
                <input id="report-from" type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className={`${field} block mt-1`} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                To
                <input id="report-to" type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className={`${field} block mt-1`} />
              </label>
            </>
          )}
        </div>
      )}

      {notice && (
        <div role="status" className="flex items-start justify-between gap-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-lg px-4 py-2.5">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="text-emerald-700 cursor-pointer"><X size={15} /></button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{error}</p>}
      {loading && !report && (
        <div className="p-10 text-center text-sm text-slate-500 inline-flex w-full justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Preparing report…</div>
      )}

      {report?.type === 'pending' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Kpi label="Open RFQs" value={s.openRfqs} hint="Awaiting quotes / comparison" />
            <Kpi label="Awaiting Approval" value={s.awaitingApproval} hint={`${s.negotiations} negotiation(s) open`} />
            <Kpi label="Awaiting Delivery" value={s.posAwaitingDelivery} hint={`${s.overdueDeliveries} overdue`} tone={s.overdueDeliveries ? 'bad' : undefined} />
            <Kpi label="Unpaid Invoices" value={rs(s.unpaidAmount)} hint={`${s.unpaidInvoices} invoice(s)`} />
            <Kpi label="Overdue Payments" value={rs(s.overdueAmount)} hint={`${s.overduePayments} invoice(s)`} tone={s.overduePayments ? 'bad' : undefined} />
          </div>
          <Table
            title="Open RFQs"
            empty="No open RFQs."
            rows={report.rfqs}
            cols={[
              { key: 'prId', label: 'PR' },
              { key: 'material', label: 'Material' },
              { key: 'project', label: 'Project' },
              { key: 'quantity', label: 'Qty', right: true, render: (r) => `${r.quantity} ${r.unit}` },
              { key: 'status', label: 'Status' },
              { key: 'quotes', label: 'Quotes', right: true, render: (r) => `${r.quotes} / ${r.invited}` },
              { key: 'quoteDeadline', label: 'Quote deadline', render: (r) => fmtDate(r.quoteDeadline) },
              { key: 'ageDays', label: 'Age', right: true, render: (r) => (r.ageDays === null ? '—' : `${r.ageDays}d`) },
            ]}
          />
          <Table
            title="Waiting for approval"
            empty="Nothing is waiting for approval."
            rows={report.approvals}
            cols={[
              { key: 'prId', label: 'PR' },
              { key: 'material', label: 'Material' },
              { key: 'vendor', label: 'Selected vendor' },
              { key: 'amount', label: 'Amount', right: true, render: (r) => rs(r.amount) },
              { key: 'requestedBy', label: 'Requested by' },
              { key: 'waitingDays', label: 'Waiting', right: true, render: (r) => `${r.waitingDays}d` },
            ]}
          />
          <Table
            title="Negotiations in progress"
            empty="No negotiations in progress."
            rows={report.negotiations}
            cols={[
              { key: 'prId', label: 'PR' },
              { key: 'material', label: 'Material' },
              { key: 'vendor', label: 'Vendor' },
              { key: 'originalRate', label: 'Quoted', right: true, render: (r) => rs(r.originalRate) },
              { key: 'offeredRate', label: 'Our offer', right: true, render: (r) => rs(r.offeredRate) },
              { key: 'currentRate', label: 'Current', right: true, render: (r) => rs(r.currentRate) },
              { key: 'status', label: 'Status' },
            ]}
          />
          <Table
            title="Purchase orders awaiting delivery"
            empty="All purchase orders are fully delivered."
            rows={report.deliveries}
            cols={[
              { key: 'poNumber', label: 'PO' },
              { key: 'material', label: 'Material' },
              { key: 'vendor', label: 'Vendor' },
              { key: 'pending', label: 'Pending', right: true, render: (r) => `${r.pending} of ${r.ordered} ${r.unit}` },
              { key: 'deliveryBy', label: 'Delivery by', render: (r) => fmtDate(r.deliveryBy) },
              { key: 'status', label: 'Status', render: (r) => statusCell(r.status) },
            ]}
          />
          <Table
            title="Unpaid invoices"
            empty="No unpaid invoices."
            rows={report.payments}
            cols={[
              { key: 'poNumber', label: 'PO' },
              { key: 'vendor', label: 'Vendor' },
              { key: 'invoiceNumber', label: 'Invoice' },
              { key: 'amount', label: 'Amount', right: true, render: (r) => rs(r.amount) },
              { key: 'dueDate', label: 'Due date', render: (r) => fmtDate(r.dueDate) },
              { key: 'status', label: 'Status', render: (r) => statusCell(r.status) },
            ]}
          />
        </>
      )}

      {report?.type === 'monthly' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Kpi
              label={`Purchases - ${report.period}`}
              value={rs(s.value)}
              hint={`${s.orders} PO(s)${s.changePct !== null ? ` • ${s.changePct > 0 ? '+' : ''}${s.changePct}% vs last month` : ''}`}
            />
            <Kpi label="Vendors Used" value={s.vendors} />
            <Kpi label="Deliveries" value={s.deliveries} hint={`${s.lateDeliveries} late • ${s.rejectedDeliveries} with rejections`} tone={s.lateDeliveries || s.rejectedDeliveries ? 'bad' : undefined} />
            <Kpi label="Invoiced / Paid" value={rs(s.invoiced)} hint={`Paid ${rs(s.paid)}`} />
            <Kpi label="Savings" value={rs(s.vsAverageSaving)} hint={`Negotiation ${rs(s.negotiationSaving)}`} tone={s.vsAverageSaving > 0 ? 'good' : undefined} />
          </div>
          <Table
            title="Purchase orders issued"
            empty="No purchase orders were issued this month."
            rows={report.orders}
            cols={[
              { key: 'poNumber', label: 'PO' },
              { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
              { key: 'material', label: 'Material' },
              { key: 'project', label: 'Project' },
              { key: 'vendor', label: 'Vendor' },
              { key: 'quantity', label: 'Qty', right: true, render: (r) => `${r.quantity} ${r.unit}` },
              { key: 'value', label: 'Value', right: true, render: (r) => rs(r.value) },
              { key: 'deliveryStatus', label: 'Delivery' },
            ]}
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {(['byProject', 'byVendor', 'byMaterial'] as const).map((k) => (
              <div key={k}>
                <Table
                  title={k === 'byProject' ? 'By project' : k === 'byVendor' ? 'By vendor' : 'By material'}
                  empty="—"
                  rows={report[k]}
                  cols={[
                    { key: 'name', label: 'Name' },
                    { key: 'orders', label: 'POs', right: true },
                    { key: 'value', label: 'Value', right: true, render: (r) => rs(r.value) },
                  ]}
                />
              </div>
            ))}
          </div>
          <Table
            title="Deliveries received (GRN)"
            empty="No deliveries this month."
            rows={report.deliveries}
            cols={[
              { key: 'grnNumber', label: 'GRN' },
              { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
              { key: 'material', label: 'Material' },
              { key: 'vendor', label: 'Vendor' },
              { key: 'accepted', label: 'Accepted', right: true, render: (r) => `${r.accepted} ${r.unit}` },
              { key: 'rejected', label: 'Rejected', right: true, render: (r) => (r.rejected ? <span className="text-rose-700 font-semibold">{r.rejected}</span> : '0') },
              { key: 'quality', label: 'Quality' },
              { key: 'onTime', label: 'On time' },
            ]}
          />
        </>
      )}

      {report?.type === 'savings' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Kpi label="Order Value" value={rs(s.spend)} hint={`${s.orders} PO(s)`} />
            <Kpi label="Negotiation Saving" value={rs(s.negotiationSaving)} hint={`${s.negotiatedOrders} negotiated order(s)`} tone={s.negotiationSaving > 0 ? 'good' : undefined} />
            <Kpi label="vs Average Quote" value={rs(s.vsAverageSaving)} hint={`${s.savingPct}% saved`} tone={s.vsAverageSaving > 0 ? 'good' : s.vsAverageSaving < 0 ? 'bad' : undefined} />
            <Kpi label="vs Market Rate" value={rs(s.vsMarketSaving)} tone={s.vsMarketSaving > 0 ? 'good' : s.vsMarketSaving < 0 ? 'bad' : undefined} />
            <Kpi label="vs Target Rate" value={rs(s.vsTargetSaving)} tone={s.vsTargetSaving > 0 ? 'good' : s.vsTargetSaving < 0 ? 'bad' : undefined} />
          </div>
          <p className="text-xs text-slate-500">
            Savings = (reference rate − PO rate) × quantity. Negotiation saving compares with the vendor's first quoted rate; "vs average quote" compares with the average of all
            vendors' quotes on the same RFQ. Negative values mean the PO rate was higher than the reference.
          </p>
          <Table
            title="Savings by purchase order"
            empty="No purchase orders in this period."
            rows={report.lines}
            cols={[
              { key: 'poNumber', label: 'PO' },
              { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
              { key: 'material', label: 'Material' },
              { key: 'vendor', label: 'Vendor' },
              { key: 'finalRate', label: 'PO rate', right: true, render: (r) => rs(r.finalRate) },
              { key: 'originalRate', label: 'Quoted', right: true, render: (r) => rs(r.originalRate) },
              { key: 'negotiationSaving', label: 'Negotiation', right: true, render: (r) => savingCell(r.negotiationSaving) },
              { key: 'vsAverageSaving', label: 'vs avg quote', right: true, render: (r) => savingCell(r.vsAverageSaving) },
              { key: 'vsMarketSaving', label: 'vs market', right: true, render: (r) => savingCell(r.vsMarketSaving) },
              { key: 'vsTargetSaving', label: 'vs target', right: true, render: (r) => savingCell(r.vsTargetSaving) },
              { key: 'vsLastBuySaving', label: 'vs last buy', right: true, render: (r) => savingCell(r.vsLastBuySaving) },
            ]}
          />
        </>
      )}

      {report?.type === 'vendors' && (
        <>
          <p className="text-sm text-slate-600">
            Each vendor is rated automatically out of 5 from 7 measured criteria. Criteria without data yet are left out and the remaining weights are scaled up.
          </p>
          <Table
            title="Vendor ratings"
            empty="No vendors yet."
            rows={report.vendors}
            cols={[
              { key: 'vendorName', label: 'Vendor' },
              {
                key: 'rating',
                label: 'Rating',
                render: (r: VendorPerformance) =>
                  r.rating === null ? <span className="text-slate-400">Not rated yet</span> : <span className="font-bold text-amber-700">★ {r.rating.toFixed(1)}</span>,
              },
              ...((report.vendors[0]?.criteria || []) as VendorPerformance['criteria']).map((c, i) => ({
                key: c.key,
                label: `${c.label} (${c.weight}%)`,
                right: true,
                render: (r: VendorPerformance) => {
                  const cr = r.criteria[i];
                  return cr.score === null ? (
                    <span className="text-slate-400" title={cr.detail}>—</span>
                  ) : (
                    <span title={cr.detail} className={cr.score >= 80 ? 'text-emerald-700' : cr.score < 50 ? 'text-rose-700' : 'text-slate-800'}>
                      {Math.round(cr.score)}
                    </span>
                  );
                },
              })),
              { key: 'basis', label: 'History', render: (r: VendorPerformance) => `${r.basis.quotes} quotes • ${r.basis.purchaseOrders} POs • ${r.basis.deliveries} deliveries` },
            ]}
          />
          <p className="text-xs text-slate-500">Hover a score to see how it was measured (e.g. "4 of 5 deliveries on time").</p>
        </>
      )}

      {emailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div role="dialog" aria-label="Email report" className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">Email {active.label} report</h3>
              <button onClick={() => setEmailOpen(false)} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Send to (comma-separated)
                <input id="report-email-to" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} className={`${field} w-full mt-1`} placeholder="name@company.com" />
              </label>
              <p className="text-xs text-slate-500">Leave empty to send to the configured report recipients. The Excel file is attached.</p>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <button onClick={() => setEmailOpen(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-200 cursor-pointer">Cancel</button>
              <button onClick={sendEmail} disabled={emailBusy} className="px-5 py-2 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60 cursor-pointer">
                {emailBusy && <Loader2 size={15} className="animate-spin" />} Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
