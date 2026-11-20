/**
 * Keeps technical errors off the screen. Only messages written for users (the API's plain `error`
 * text, or the app's own wording) are ever shown; anything else (network failures, HTML error
 * pages, JSON parse errors, stack traces, database messages) is replaced by a friendly fallback.
 */

/** An error whose message is safe to show to users. */
export class UserFacingError extends Error {}

const TECHNICAL =
  /\b(TypeError|SyntaxError|ReferenceError|RangeError|Mongo\w*|ECONN\w*|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket|stack|undefined is not|cannot read propert|unexpected token|failed to fetch|networkerror|load failed|json|HTTP\s*\d{3}|status(?: code)?\s*\d{3}|internal server error|FUNCTION_INVOCATION|resend\.com|api[_ ]?key)\b|\bat\s+\S+\s+\(.+:\d+:\d+\)/i;

/** The text if it reads like a user-facing message, otherwise the fallback. */
export function safeText(text: unknown, fallback: string): string {
  const s = typeof text === 'string' ? text.trim() : '';
  return s && s.length <= 400 && !TECHNICAL.test(s) ? s : fallback;
}

/** Error for a failed API call: the server's plain message, or the fallback. */
export function apiError(json: any, fallback: string): UserFacingError {
  return new UserFacingError(safeText(json?.error, fallback));
}

/** Message safe to show on screen for any caught error. */
export function userMessage(err: unknown, fallback: string): string {
  return err instanceof UserFacingError ? safeText(err.message, fallback) : fallback;
}
