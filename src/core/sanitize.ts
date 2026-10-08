import { functionSource } from './function-source';
const SECRET_KEY = /password|authorization|cookie|token|secret|email|phone|mobile|external.?id/i;
const SECRET_QUERY = /([?&](?:access_token|auth|authorization|code|email|id_token|password|refresh_token|secret|session|token)=)[^&#\s]*/gi;
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
      // Bound email matching so a long minified identifier cannot cause quadratic scanning.
      const text = (input.includes('@') ? input.replace(/[\w.+-]{1,64}@[\w.-]{1,253}\.[A-Za-z]{2,63}/g, '[email]') : input).replace(SECRET_QUERY, '$1[redacted]');
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
