// Read the browser's source representation without invoking the function or its toString override.
const intrinsicToString = Function.prototype.toString;
const sourceCache = new WeakMap<Function, string>();
export function functionSource(value: Function): string {
  const cached = sourceCache.get(value);
  if (cached !== undefined) return cached;
  let source: string;
  try {
    source = intrinsicToString.call(value);
    if (/\{\s*\[native code\]\s*\}/.test(source)) source = '[Function source unavailable: native or bound function]';
    else if (source.length > 100_000) source = source.slice(0, 100_000) + '\n…[truncated]';
  } catch { source = '[Function source unavailable]'; }
  sourceCache.set(value, source);
  return source;
}
