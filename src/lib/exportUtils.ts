/**
 * CSV downloads and printable reports shared by the register / summary screens.
 *
 * CSV: RFC 4180 quoting (commas, quotes, line breaks), UTF-8 with a byte-order mark so Excel shows
 * ₹ and Indian names correctly, CRLF line endings, and a guard against spreadsheet formula injection.
 * Print: a separate, clean document (company header, title, filters, table, totals) printed from a
 * hidden frame, so navigation, buttons and coloured backgrounds never appear on paper.
 */

export type Cell = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV field: empty for null/undefined, quoted when needed, formulas neutralised */
export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let s = String(value);
  // Text that a spreadsheet would run as a formula (e.g. "=1+1", "@SUM") is kept as plain text
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** File-name safe text, e.g. "Grand Horizon (Pune)" -> "Grand_Horizon_Pune" */
export const fileSafe = (s: string) => s.replace(/[^\w-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'export';

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function downloadCsv(fileName: string, headers: string[], rows: Cell[][]) {
  const blob = new Blob(['﻿', toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const esc = (v: Cell) =>
  v === null || v === undefined ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface PrintColumn {
  header: string;
  /** right-align numbers */
  align?: 'left' | 'right' | 'center';
}

export interface PrintReport {
  title: string;
  subtitle?: string;
  /** label/value pairs shown under the title (project, filters, ...) */
  meta?: [string, string][];
  columns: PrintColumn[];
  rows: Cell[][];
  /** optional totals row (same number of cells as columns) */
  totals?: Cell[];
  /** summary figures printed above the table */
  summary?: [string, string][];
  landscape?: boolean;
}

/** Prints a clean report document (no app chrome) from a hidden frame */
export function printReport(report: PrintReport) {
  const logo = `${window.location.origin}/brickfour-logo.jpeg`;
  const align = (c: PrintColumn) => (c.align ? ` style="text-align:${c.align}"` : '');
  const generated = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(report.title)}</title>
<style>
  @page { size: A4 ${report.landscape ? 'landscape' : 'portrait'}; margin: 12mm 10mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Inter, Arial, Helvetica, sans-serif; color: #111827; font-size: 9pt; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 2px solid #23408e; padding-bottom: 8px; margin-bottom: 10px; }
  header img { height: 38px; width: auto; object-fit: contain; }
  header .co { text-align: right; font-size: 8pt; color: #4b5563; }
  h1 { font-size: 14pt; margin: 0 0 2px; color: #13294b; }
  .sub { color: #4b5563; margin: 0 0 8px; }
  .meta, .summary { display: flex; flex-wrap: wrap; gap: 4px 18px; margin: 0 0 8px; }
  .meta span b, .summary span b { color: #111827; }
  .meta span, .summary span { color: #4b5563; }
  .summary { border: 1px solid #d1d5db; border-radius: 4px; padding: 6px 8px; }
  table { width: 100%; border-collapse: collapse; table-layout: auto; }
  thead { display: table-header-group; }
  tfoot { display: table-row-group; }
  th, td { border: 1px solid #d1d5db; padding: 4px 5px; vertical-align: top; word-break: break-word; }
  th { background: #eef2f8; color: #13294b; font-weight: 700; text-align: left; font-size: 8pt; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  tbody tr:nth-child(even) td { background: #f9fafb; }
  tfoot td { font-weight: 700; background: #eef2f8; }
  .empty { text-align: center; color: #6b7280; padding: 16px; }
  footer { margin-top: 10px; font-size: 7.5pt; color: #6b7280; display: flex; justify-content: space-between; }
</style></head><body>
<header><img src="${logo}" alt="Brickfour"><div class="co"><b>Brickfour</b><br>Generated ${esc(generated)}</div></header>
<h1>${esc(report.title)}</h1>
${report.subtitle ? `<p class="sub">${esc(report.subtitle)}</p>` : ''}
${report.meta?.length ? `<div class="meta">${report.meta.map(([k, v]) => `<span>${esc(k)}: <b>${esc(v)}</b></span>`).join('')}</div>` : ''}
${report.summary?.length ? `<div class="summary">${report.summary.map(([k, v]) => `<span>${esc(k)}: <b>${esc(v)}</b></span>`).join('')}</div>` : ''}
<table>
<thead><tr>${report.columns.map((c) => `<th${align(c)}>${esc(c.header)}</th>`).join('')}</tr></thead>
<tbody>${
    report.rows.length
      ? report.rows.map((r) => `<tr>${r.map((v, i) => `<td${align(report.columns[i] || { header: '' })}>${esc(v)}</td>`).join('')}</tr>`).join('')
      : `<tr><td class="empty" colspan="${report.columns.length}">No records to show.</td></tr>`
  }</tbody>
${report.totals ? `<tfoot><tr>${report.totals.map((v, i) => `<td${align(report.columns[i] || { header: '' })}>${esc(v)}</td>`).join('')}</tr></tfoot>` : ''}
</table>
<footer><span>${report.rows.length} record${report.rows.length === 1 ? '' : 's'}</span><span>PRAVAH - Brickfour</span></footer>
</body></html>`;

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc || !frame.contentWindow) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const win = frame.contentWindow;
  const run = () => {
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), 1500);
  };
  // Print once the logo has loaded (or after a short wait if it cannot load)
  const img = doc.querySelector('img');
  if (img && !img.complete) {
    let done = false;
    const go = () => {
      if (!done) {
        done = true;
        run();
      }
    };
    img.addEventListener('load', go);
    img.addEventListener('error', go);
    setTimeout(go, 2500);
  } else {
    setTimeout(run, 100);
  }
}

export const inr = (n: number, digits = 2) =>
  `Rs. ${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: digits })}`;
