import { ProjectRequirement } from '../types';

/** Path of the public page where a vendor submits their quotation. */
export const VENDOR_QUOTE_PATH = '/vendor-quote';

/** Cryptographically random, URL-safe token (works on http and https). */
export function generateQuoteToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Returns the PR with a secret quote token for every given vendor (existing tokens are kept). */
export function withVendorQuoteTokens(pr: ProjectRequirement, vendorIds: string[]): ProjectRequirement {
  const tokens = { ...(pr.vendorQuoteTokens || {}) };
  let changed = false;
  for (const vendorId of vendorIds) {
    if (!tokens[vendorId]) {
      tokens[vendorId] = generateQuoteToken();
      changed = true;
    }
  }
  return changed ? { ...pr, vendorQuoteTokens: tokens } : pr;
}

/** Full link a vendor opens to submit (or revise) their quotation for a PR. */
export function buildVendorQuoteUrl(prId: string, vendorId: string, token: string): string {
  const params = new URLSearchParams({ pr: prId, v: vendorId, t: token });
  return `${window.location.origin}${VENDOR_QUOTE_PATH}?${params.toString()}`;
}

export function isVendorQuotePage(): boolean {
  return window.location.pathname.replace(/\/+$/, '') === VENDOR_QUOTE_PATH;
}
