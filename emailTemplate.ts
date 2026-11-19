/**
 * Professional, email-client-safe HTML template (table layout + inline styles,
 * works in Gmail, Outlook, Apple Mail and on mobile).
 */

export interface EmailContent {
  heading: string;
  preheader?: string; // preview text shown in the inbox list
  greeting?: string;
  paragraphs?: string[];
  details?: { label: string; value: string }[];
  sections?: { title: string; text: string }[];
  cta?: { label: string; url: string; note?: string };
  closing?: string[]; // sign-off lines, e.g. ["Regards,", "Procurement Team"]
}

const FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif";
const COLORS = {
  page: '#f3f4f6',
  card: '#ffffff',
  border: '#e5e7eb',
  heading: '#111827',
  text: '#374151',
  muted: '#6b7280',
  accent: '#f59e0b',
  button: '#1f2937',
  rowAlt: '#f9fafb',
};

export const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const multiline = (value: string) => escapeHtml(value).replace(/\r?\n/g, '<br>');

/** Only http(s) links are allowed in buttons */
export function safeUrl(url: unknown): string {
  try {
    const parsed = new URL(String(url || ''));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

/** Accepts untrusted JSON from the client and keeps only well-formed fields */
export function sanitizeEmailContent(raw: any): EmailContent | null {
  if (!raw || typeof raw !== 'object' || typeof raw.heading !== 'string' || !raw.heading.trim()) return null;
  const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
  const strList = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean).slice(0, 20) : undefined);
  const url = safeUrl(raw.cta?.url);
  return {
    heading: str(raw.heading, 200),
    preheader: str(raw.preheader, 200) || undefined,
    greeting: str(raw.greeting, 200) || undefined,
    paragraphs: strList(raw.paragraphs),
    details: Array.isArray(raw.details)
      ? raw.details
          .filter((d: any) => d && str(d.label) && str(d.value))
          .slice(0, 30)
          .map((d: any) => ({ label: str(d.label, 100), value: str(d.value, 1000) }))
      : undefined,
    sections: Array.isArray(raw.sections)
      ? raw.sections
          .filter((s: any) => s && str(s.title) && str(s.text))
          .slice(0, 10)
          .map((s: any) => ({ title: str(s.title, 150), text: str(s.text, 3000) }))
      : undefined,
    cta: url && str(raw.cta?.label) ? { label: str(raw.cta.label, 60), url, note: str(raw.cta.note, 400) || undefined } : undefined,
    closing: strList(raw.closing),
  };
}

/**
 * Builds structured content from a legacy plain-text body:
 * "• Label: value" lines become a details table, separator lines are dropped,
 * and the remaining text becomes paragraphs.
 */
export function contentFromPlainText(heading: string, body: string): EmailContent {
  const details: { label: string; value: string }[] = [];
  const paragraphs: string[] = [];
  let current: string[] = [];
  const flush = () => {
    const text = current.join('\n').trim();
    if (text) paragraphs.push(text);
    current = [];
  };
  for (const rawLine of String(body || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^[=\-━_*]{4,}$/.test(line)) {
      flush();
      continue;
    }
    const detail = line.match(/^[•\-*]\s*([^:]{2,60}?)\s*:\s+(.+)$/);
    if (detail) {
      flush();
      details.push({ label: detail[1].trim(), value: detail[2].trim() });
      continue;
    }
    if (!line) {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();
  return { heading, paragraphs, details: details.length ? details : undefined };
}

export function renderEmailHtml(content: EmailContent, brandName: string): string {
  const p = (html: string, extra = '') =>
    `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:24px;color:${COLORS.text};${extra}">${html}</p>`;

  const details = content.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${COLORS.border};border-radius:6px;margin:8px 0 24px;">
        ${content.details
          .map(
            (d, i) => `<tr style="background:${i % 2 ? COLORS.rowAlt : COLORS.card};">
              <td style="padding:10px 14px;font-family:${FONT};font-size:14px;line-height:20px;color:${COLORS.muted};width:38%;vertical-align:top;border-bottom:1px solid ${COLORS.border};">${escapeHtml(d.label)}</td>
              <td style="padding:10px 14px;font-family:${FONT};font-size:14px;line-height:20px;color:${COLORS.heading};font-weight:bold;vertical-align:top;border-bottom:1px solid ${COLORS.border};">${multiline(d.value)}</td>
            </tr>`
          )
          .join('')}
      </table>`
    : '';

  const sections = (content.sections || [])
    .map(
      (s) => `<h2 style="margin:0 0 6px;font-family:${FONT};font-size:15px;line-height:22px;color:${COLORS.heading};font-weight:bold;">${escapeHtml(s.title)}</h2>
        ${p(multiline(s.text), 'margin-bottom:20px;')}`
    )
    .join('');

  const cta = content.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 12px;">
        <tr><td style="border-radius:6px;background:${COLORS.button};">
          <a href="${escapeHtml(content.cta.url)}" target="_blank" rel="noopener"
             style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:15px;font-weight:bold;line-height:20px;color:#ffffff;text-decoration:none;border-radius:6px;">${escapeHtml(content.cta.label)}</a>
        </td></tr>
      </table>
      ${content.cta.note ? `<p style="margin:0 0 24px;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};">${escapeHtml(content.cta.note)}</p>` : ''}`
    : '';

  const closing = content.closing?.length ? p(content.closing.map(escapeHtml).join('<br>'), 'margin:24px 0 0;') : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(content.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.page};">
${content.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(content.preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page};">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${COLORS.card};border:1px solid ${COLORS.border};border-top:4px solid ${COLORS.accent};border-radius:8px;">
      <tr><td style="padding:22px 32px;border-bottom:1px solid ${COLORS.border};font-family:${FONT};font-size:17px;font-weight:bold;color:${COLORS.heading};">${escapeHtml(brandName)}</td></tr>
      <tr><td style="padding:32px;">
        <h1 style="margin:0 0 20px;font-family:${FONT};font-size:22px;line-height:30px;color:${COLORS.heading};font-weight:bold;">${escapeHtml(content.heading)}</h1>
        ${content.greeting ? p(escapeHtml(content.greeting)) : ''}
        ${(content.paragraphs || []).map((t) => p(multiline(t))).join('')}
        ${details}
        ${sections}
        ${cta}
        ${closing}
      </td></tr>
      <tr><td style="padding:18px 32px;background:${COLORS.rowAlt};border-top:1px solid ${COLORS.border};border-radius:0 0 8px 8px;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.muted};">
        This is an automated message from ${escapeHtml(brandName)}. Please do not reply to this email.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** Plain-text alternative (for text-only email clients) */
export function renderEmailText(content: EmailContent): string {
  const out: string[] = [content.heading, ''];
  if (content.greeting) out.push(content.greeting, '');
  for (const t of content.paragraphs || []) out.push(t, '');
  for (const d of content.details || []) out.push(`${d.label}: ${d.value}`);
  if (content.details?.length) out.push('');
  for (const s of content.sections || []) out.push(s.title, s.text, '');
  if (content.cta) out.push(`${content.cta.label}: ${content.cta.url}`, ...(content.cta.note ? [content.cta.note] : []), '');
  if (content.closing?.length) out.push(...content.closing);
  return out.join('\n');
}
