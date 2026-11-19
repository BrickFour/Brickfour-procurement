/**
 * Purchase Order generation (data + PDF), modelled on a standard Indian GST purchase order.
 */
import fs from 'fs';
import path from 'path';

export interface PartyBlock {
  name: string;
  lines: string[]; // address lines and other details, rendered one per line
}

export interface PurchaseOrderLine {
  description: string;
  qty: number;
  unit: string;
  rate: number;
  gstRate: number | null; // null = no GST on this line
  amount: number;
}

export interface PurchaseOrderData {
  poNumber: string;
  poDate: string; // ISO
  deliveryBy: string; // display date
  quotationRef: string;
  prId: string;
  company: { name: string; lines: string[] };
  vendor: PartyBlock;
  shipTo: PartyBlock;
  billTo: PartyBlock;
  paymentTerms: string;
  deliveryTerms: string;
  placeOfSupply: string;
  requestedBy: string;
  items: PurchaseOrderLine[];
  subTotal: number;
  taxes: { label: string; amount: number }[];
  roundOff: number;
  grandTotal: number;
  amountInWords: string;
  specialInstructions: string;
  terms: string[];
}

export const GST_STATES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
};
export const stateCodeOf = (gstin?: string) => {
  const code = String(gstin || '').trim().slice(0, 2);
  return GST_STATES[code] ? code : undefined;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
export const formatINR = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Indian-system amount in words, e.g. 539461 -> "Indian Rupees Five Lakh Thirty Nine Thousand Four Hundred Sixty One Only" */
export function amountInWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n: number) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}`);
  const three = (n: number) => {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return [h ? `${ones[h]} Hundred` : '', r ? two(r) : ''].filter(Boolean).join(' ');
  };
  const words = (n: number): string => {
    if (n === 0) return 'Zero';
    const parts: string[] = [];
    const crore = Math.floor(n / 10000000);
    const lakh = Math.floor((n % 10000000) / 100000);
    const thousand = Math.floor((n % 100000) / 1000);
    const rest = n % 1000;
    if (crore) parts.push(`${words(crore)} Crore`);
    if (lakh) parts.push(`${two(lakh)} Lakh`);
    if (thousand) parts.push(`${two(thousand)} Thousand`);
    if (rest) parts.push(three(rest));
    return parts.join(' ');
  };
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  return `Indian Rupees ${words(rupees)}${paise ? ` and ${two(paise)} Paise` : ''} Only`;
}

/** GST split: CGST + SGST for intra-state supply, IGST for inter-state, plain GST when a state is unknown */
export function gstLines(taxable: { amount: number; rate: number }[], companyState?: string, vendorState?: string) {
  const byRate = new Map<number, number>();
  for (const t of taxable) if (t.rate > 0) byRate.set(t.rate, (byRate.get(t.rate) || 0) + t.amount);
  const lines: { label: string; amount: number }[] = [];
  for (const [rate, base] of [...byRate.entries()].sort((a, b) => a[0] - b[0])) {
    const tax = round2((base * rate) / 100);
    if (companyState && vendorState && companyState === vendorState) {
      lines.push({ label: `CGST @ ${rate / 2}%`, amount: round2(tax / 2) }, { label: `SGST @ ${rate / 2}%`, amount: round2(tax - round2(tax / 2)) });
    } else if (companyState && vendorState) {
      lines.push({ label: `IGST @ ${rate}%`, amount: tax });
    } else {
      lines.push({ label: `GST @ ${rate}%`, amount: tax });
    }
  }
  return lines;
}

export function findLogoPath(): string | undefined {
  const candidates = [path.join(process.cwd(), 'dist', 'vyas-logo.png'), path.join(process.cwd(), 'public', 'vyas-logo.png')];
  return candidates.find((p) => fs.existsSync(p));
}

/** Renders the purchase order as an A4 PDF */
export async function renderPurchaseOrderPdf(po: PurchaseOrderData): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Purchase Order ${po.poNumber}`, Author: po.company.name } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const NAVY = '#23408e';
  const INK = '#111827';
  const MUTED = '#4b5563';
  const LIGHT = '#e8eef8';
  const BORDER = '#cbd5e1';
  const L = 40;
  const R = 555;
  const W = R - L;

  // ---- Header: logo + company, PURCHASE ORDER + meta ----
  const logo = findLogoPath();
  let x = L;
  if (logo) {
    doc.image(logo, L, 36, { height: 58 });
    x = L + 58 * (400 / 456) + 12; // logo aspect ratio 400x456
  }
  doc.font('Helvetica-Bold').fontSize(15).fillColor(NAVY).text(po.company.name.toUpperCase(), x, 40, { width: 270 });
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  for (const line of po.company.lines) doc.text(line, x, doc.y + 1, { width: 270 });

  doc.font('Helvetica-Bold').fontSize(18).fillColor(NAVY).text('PURCHASE ORDER', 330, 38, { width: R - 330, align: 'right' });
  const meta: [string, string][] = [
    ['PO Number', po.poNumber],
    ['PO Date', new Date(po.poDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })],
    ['Delivery By', po.deliveryBy],
    ['Quotation Ref.', po.quotationRef],
    ['PR Ref.', po.prId],
  ];
  let my = 64;
  for (const [k, v] of meta) {
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(k, 360, my, { width: 70, lineBreak: false });
    doc
      .font(k === 'PO Number' ? 'Helvetica-Bold' : 'Helvetica')
      .fillColor(INK)
      .text(v, 425, my, { width: R - 425, align: 'right', lineBreak: false, ellipsis: true, height: 11 });
    my += 12;
  }
  let y = Math.max(my, doc.y) + 8;
  doc.rect(L, y, W, 2.5).fill(NAVY);
  y += 12;

  // ---- Vendor / Ship to / Bill to ----
  const colW = (W - 16) / 3;
  const blocks: [string, PartyBlock][] = [['VENDOR', po.vendor], ['SHIP TO', po.shipTo], ['BILL TO', po.billTo]];
  const measure = (b: PartyBlock) => {
    doc.font('Helvetica-Bold').fontSize(9);
    let h = 14 + doc.heightOfString(b.name, { width: colW - 16 });
    doc.font('Helvetica').fontSize(8.5);
    for (const l of b.lines) h += doc.heightOfString(l, { width: colW - 16 }) + 1;
    return h + 14;
  };
  const boxH = Math.max(...blocks.map(([, b]) => measure(b)));
  blocks.forEach(([title, b], i) => {
    const bx = L + i * (colW + 8);
    doc.rect(bx, y, colW, boxH).fillAndStroke(LIGHT, BORDER);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY).text(title, bx + 8, y + 7);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(b.name, bx + 8, y + 19, { width: colW - 16 });
    doc.font('Helvetica').fontSize(8.5).fillColor(INK);
    for (const l of b.lines) doc.text(l, bx + 8, doc.y + 1, { width: colW - 16 });
  });
  y += boxH + 10;

  // ---- Terms row ----
  const terms: [string, string][] = [
    ['Payment Terms', po.paymentTerms],
    ['Delivery Terms', po.deliveryTerms],
    ['Place of Supply', po.placeOfSupply],
    ['Requested By', po.requestedBy],
  ];
  const tw = W / 4;
  doc.font('Helvetica').fontSize(8.5);
  const rowH = 14 + Math.max(...terms.map(([, v]) => doc.heightOfString(v, { width: tw - 12 })));
  terms.forEach(([k, v], i) => {
    const tx = L + i * tw;
    doc.rect(tx, y, tw, 16).fillAndStroke('#ffffff', BORDER);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY).text(k, tx + 6, y + 5, { width: tw - 12 });
    doc.rect(tx, y + 16, tw, rowH).stroke(BORDER);
    doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(v, tx + 6, y + 21, { width: tw - 12 });
  });
  y += 16 + rowH + 10;

  // ---- Items table ----
  const cols = [
    { k: '#', w: 22, a: 'center' },
    { k: 'Description', w: 242, a: 'left' },
    { k: 'Qty', w: 40, a: 'right' },
    { k: 'Unit', w: 38, a: 'center' },
    { k: 'Rate (Rs.)', w: 62, a: 'right' },
    { k: 'GST', w: 35, a: 'center' },
    { k: 'Amount (Rs.)', w: W - 22 - 242 - 40 - 38 - 62 - 35, a: 'right' },
  ] as const;
  doc.rect(L, y, W, 20).fill(NAVY);
  let cx = L;
  for (const c of cols) {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff').text(c.k, cx + 4, y + 6, { width: c.w - 8, align: c.a });
    cx += c.w;
  }
  y += 20;
  po.items.forEach((it, i) => {
    const cells = [
      String(i + 1),
      it.description,
      it.qty.toLocaleString('en-IN', { maximumFractionDigits: 3 }),
      it.unit,
      formatINR(it.rate),
      it.gstRate === null ? '-' : `${it.gstRate}%`,
      formatINR(it.amount),
    ];
    doc.font('Helvetica').fontSize(8.5);
    const h = Math.max(20, doc.heightOfString(it.description, { width: cols[1].w - 8 }) + 10);
    if (i % 2) doc.rect(L, y, W, h).fill('#f8fafc');
    doc.moveTo(L, y + h).lineTo(R, y + h).strokeColor(BORDER).lineWidth(0.5).stroke();
    let cx2 = L;
    cells.forEach((v, ci) => {
      doc.fillColor(INK).text(v, cx2 + 4, y + 5, { width: cols[ci].w - 8, align: cols[ci].a });
      cx2 += cols[ci].w;
    });
    y += h;
  });
  y += 12;

  // ---- Amount in words / instructions (left) and totals (right) ----
  const leftW = 290;
  const totX = L + leftW + 15;
  const totW = R - totX;
  const top = y;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY).text('AMOUNT IN WORDS', L, y);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(po.amountInWords, L, doc.y + 2, { width: leftW });
  if (po.specialInstructions) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY).text('SPECIAL INSTRUCTIONS', L, doc.y + 10);
    doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(po.specialInstructions, L, doc.y + 2, { width: leftW });
  }
  const leftBottom = doc.y;

  const rows: [string, string][] = [['Sub-total', formatINR(po.subTotal)], ...po.taxes.map((t) => [t.label, formatINR(t.amount)] as [string, string])];
  rows.push(['Round off', `${po.roundOff >= 0 ? '+' : '-'}${formatINR(Math.abs(po.roundOff))}`]);
  let ty = top;
  for (const [k, v] of rows) {
    doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(k, totX + 6, ty + 5, { width: totW / 2 });
    doc.text(v, totX + totW / 2, ty + 5, { width: totW / 2 - 6, align: 'right' });
    doc.moveTo(totX, ty + 18).lineTo(R, ty + 18).strokeColor(BORDER).lineWidth(0.5).stroke();
    ty += 18;
  }
  doc.rect(totX, ty + 2, totW, 22).fill(NAVY);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff').text('GRAND TOTAL', totX + 6, ty + 9, { width: totW / 2 });
  doc.text(`Rs. ${formatINR(po.grandTotal)}`, totX + totW / 2 - 20, ty + 9, { width: totW / 2 + 14, align: 'right' });
  y = Math.max(leftBottom, ty + 24) + 18;

  // ---- Terms & conditions ----
  doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY).text('TERMS & CONDITIONS', L, y);
  doc.font('Helvetica').fontSize(7.8).fillColor(MUTED);
  po.terms.forEach((t, i) => doc.text(`${i + 1}. ${t}`, L, doc.y + 2, { width: W }));
  y = doc.y + 40;

  // ---- Signatures ----
  if (y > 740) {
    doc.addPage();
    y = 80;
  }
  const sigW = (W - 30) / 3;
  const sigs: [string, string][] = [['Prepared By', 'Purchase Executive'], ['Approved By', 'Purchase Manager'], [`For ${po.company.name}`, 'Authorised Signatory']];
  sigs.forEach(([a, b], i) => {
    const sx = L + i * (sigW + 15);
    doc.moveTo(sx, y).lineTo(sx + sigW, y).strokeColor('#6b7280').lineWidth(0.7).stroke();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(a, sx, y + 6, { width: sigW, align: 'center' });
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(b, sx, doc.y + 1, { width: sigW, align: 'center' });
  });

  // ---- Footer ----
  doc.font('Helvetica').fontSize(7.5).fillColor('#9ca3af');
  doc.text(`This is a computer-generated purchase order.  ${po.poNumber}`, L, 805, { width: W / 2, lineBreak: false });
  doc.text('Page 1', L + W / 2, 805, { width: W / 2, align: 'right', lineBreak: false });

  doc.end();
  return done;
}
