import { functionSource } from './function-source';
// Keys whose values are credentials or personal data. Matched on the field name, so experiment and change data keep their names.
const SECRET_KEY = /password|passwd|^pwd$|authorization|^auth$|cookie|token|secret|api.?key|private.?key|credential|session.?id|^sid$|email|e.?mail|phone|mobile|external.?id|(?:first|last|full|given|family|sur).?name|street|address|postal.?code|zip.?code|birth|^dob$|^ssn$|social.?security|card.?number|^cvv$|^cvc$|iban/i;
const SECRET_QUERY = /([?&#;](?:access_token|api_?key|apikey|auth|authorization|client_secret|code|email|id_token|key|password|refresh_token|secret|session|session_?id|sid|token)=)[^&#\s]*/gi;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g;
const JWT = /\beyJ[\w-]{5,}\.eyJ[\w-]{5,}\.[\w-]{5,}/g;
const ENCODED_EMAIL = /[\w.+-]{1,64}%40[\w.-]{1,253}\.[A-Za-z]{2,63}/gi;
/** Redact secrets that appear inside a string value: emails (plain and URL encoded), secret query parameters, bearer and basic credentials, JWTs. */
export function redactText(input: string): string {
  let text = input;
  // Bound email matching so a long minified identifier cannot cause quadratic scanning.
  if (text.includes('@')) text = text.replace(/[\w.+-]{1,64}@[\w.-]{1,253}\.[A-Za-z]{2,63}/g, '[email]');
  if (text.includes('%40')) text = text.replace(ENCODED_EMAIL, '[email]');
  if (text.includes('=')) text = text.replace(SECRET_QUERY, '$1[redacted]');
  if (/Bearer|Basic/.test(text)) text = text.replace(BEARER, '$1 [redacted]');
  if (text.includes('eyJ')) text = text.replace(JWT, '[jwt]');
  return text;
}
const MAX_DEPTH = 14;
const MAX_STRING = 100_000;
const MAX_ITEMS = 500;

export function sanitize(value: unknown, maxBytes = 256_000, maxDepth = MAX_DEPTH): unknown {
  const seen = new WeakSet<object>();
  let budget = maxBytes;
  const visit = (input: unknown, depth: number, key = ''): unknown => {
    if (budget <= 0) return '[payload truncated]';
    budget -= 8 + key.length;
    if (!(key === 'responseTokens' && input && typeof input === 'object') && SECRET_KEY.test(key)) return '[redacted]';
    if (input === null || input === undefined || typeof input === 'boolean' || typeof input === 'number') return input;
    if (typeof input === 'bigint') return `${input}n`;
    if (typeof input === 'string') {
      const text = redactText(input);
      const clipped = text.length > MAX_STRING ? `${text.slice(0, MAX_STRING)}…[truncated]` : text;
      if (clipped.length <= budget) { budget -= clipped.length; return clipped; }
      // Keep the start of an oversized string (usually code or markup) instead of discarding it.
      if (budget < 64) { budget = 0; return '[payload truncated]'; }
      const kept = `${clipped.slice(0, budget)}…[truncated]`;
      budget = 0;
      return kept;
    }
    if (typeof input === 'function') return visit(functionSource(input), depth, key);
    if (typeof Node !== 'undefined' && input instanceof Node) {
      if (input instanceof Element) {
        const id = input.id ? `#${input.id}` : '';
        const classes = typeof input.className === 'string' ? input.className.trim().split(/\s+/).slice(0, 3).map((part) => `.${part}`).join('') : '';
        return `<${input.tagName.toLowerCase()}${id}${classes}>`;
      }
      return `[${input.nodeName}]`;
    }
    if (input instanceof Error || Object.prototype.toString.call(input) === '[object Error]') return { name: visit((input as Error).name, depth + 1, 'name'), message: visit((input as Error).message, depth + 1, 'message'), stack: visit((input as Error).stack, depth + 1, 'stack') };
    if (depth >= maxDepth) return '[depth limit]';
    if (typeof input !== 'object' || input === null) return String(input);
    if (seen.has(input)) return '[circular]';
    seen.add(input);
    if (input instanceof Map) return visit(Array.from(input.entries()).slice(0, MAX_ITEMS), depth + 1);
    if (input instanceof Set) return visit(Array.from(input.values()).slice(0, MAX_ITEMS), depth + 1);
    if (Array.isArray(input)) {
      // Header pairs such as ['Authorization', 'Bearer …'] or ['Cookie', '…'] keep the name and lose the value.
      if (input.length === 2 && typeof input[0] === 'string' && input[0].length < 100 && SECRET_KEY.test(input[0])) return [visit(input[0], depth + 1), '[redacted]'];
      const result: unknown[] = [];
      for (let index = 0; index < Math.min(input.length, MAX_ITEMS); index++) {
        if (budget <= 0) { result.push('[payload truncated]'); break; }
        const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
        result.push(descriptor && !('value' in descriptor) ? '[getter]' : visit(descriptor?.value, depth + 1));
      }
      if (input.length > MAX_ITEMS) result.push(`[${input.length - MAX_ITEMS} additional items omitted]`);
      return result;
    }
    const output: Record<string, unknown> = Object.create(null);
    let keys: string[];
    try { const allKeys = Object.keys(input as object); keys = allKeys.slice(0, MAX_ITEMS); if (allKeys.length > MAX_ITEMS) output.__truncated = `${allKeys.length - MAX_ITEMS} additional fields omitted`; } catch { return '[unavailable]'; }
    for (const childKey of keys) {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(input, childKey);
        output[childKey] = descriptor && !('value' in descriptor) ? '[getter]' : visit(descriptor?.value, depth + 1, childKey);
      }
      catch { output[childKey] = '[getter threw]'; }
      if (budget <= 0) { output.__truncated = true; break; }
    }
    return output;
  };
  return visit(value, 0);
}

export function cloneSanitized<T>(value: T): T {
  return sanitize(value) as T;
}
