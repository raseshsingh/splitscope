import type { CapturedEvent } from '../model';
export interface EventExpectation { id: string; name: string; platform: string; eventName: string; required: string[]; equals: Record<string, unknown> }
export interface CheckResult { id: string; name: string; status: 'waiting' | 'not-observed' | 'passed' | 'failed'; matches: number; failures: Array<{ eventId: string; issues: string[] }> }
export function field(value: unknown, path: string): unknown {
  return path.split('.').reduce((item: any, key) => item && typeof item === 'object' && Object.hasOwn(item, key) ? item[key] : undefined, value);
}
export function evaluateExpectations(rules: EventExpectation[], events: CapturedEvent[], start: number, end?: number): CheckResult[] {
  return rules.map(rule => {
    const matches = events.filter(event => event.t >= start && (end == null || event.t <= end) && event.via !== 'queued-before-load' && (rule.platform === 'all' || event.platform === rule.platform) && event.name === rule.eventName);
    const failures = matches.flatMap(event => {
      const issues = rule.required.filter(path => field(event.properties, path) === undefined).map(path => `Missing: ${path}`);
      for (const [path, expected] of Object.entries(rule.equals)) {
        const actual = field(event.properties, path);
        if (typeof actual === 'string' && /\[(redacted|payload truncated|depth limit|getter|unavailable)\]/.test(actual)) issues.push(`Value unavailable: ${path}`);
        else if (!equal(actual, expected)) issues.push(`Unexpected value: ${path}`);
      }
      return issues.length ? [{ eventId: event.id, issues }] : [];
    });
    return { id: rule.id, name: rule.name, status: !matches.length ? end == null ? 'waiting' : 'not-observed' : failures.length ? 'failed' : 'passed', matches: matches.length, failures };
  });
}
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal((a as any)[key], (b as any)[key]));
}
export function normalizeExpectations(input: unknown): EventExpectation[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 50).filter(item => item && typeof item.id === 'string' && typeof item.eventName === 'string').map(item => ({ id: item.id.slice(0, 100), name: String(item.name || item.eventName).slice(0, 150), platform: String(item.platform || 'all').slice(0, 40), eventName: item.eventName.slice(0, 300), required: Array.isArray(item.required) ? item.required.filter((v: unknown) => typeof v === 'string').slice(0, 50) : [], equals: item.equals && typeof item.equals === 'object' && !Array.isArray(item.equals) ? item.equals : {} }));
}
