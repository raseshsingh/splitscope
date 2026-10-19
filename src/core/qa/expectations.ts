import type { CapturedEvent } from '../model';
export interface EventExpectation { id: string; name: string; platform: string; eventName: string; required: string[]; equals: Record<string, unknown>; minCount?: number; maxCount?: number }
export interface CheckResult { id: string; name: string; status: 'waiting' | 'not-observed' | 'passed' | 'failed' | 'unverifiable'; matches: number; failures: Array<{ eventId: string; issues: string[] }> }
export function field(value: unknown, path: string): unknown {
  return path.split('.').reduce((item: any, key) => item && typeof item === 'object' && Object.hasOwn(item, key) ? item[key] : undefined, value);
}
/** Start an expectation from a captured event: same name and source, top-level properties required, no values pinned. */
export function draftFromEvent(event: Pick<CapturedEvent, 'name' | 'platform' | 'properties'>): Pick<EventExpectation, 'eventName' | 'platform' | 'required' | 'equals'> {
  const props = event.properties;
  const unavailable = (value: unknown) => typeof value === 'string' && /\[(redacted|payload truncated|depth limit|getter|unavailable)\]/.test(value);
  const required = props && typeof props === 'object' && !Array.isArray(props)
    ? Object.entries(props as Record<string, unknown>).filter(([key, value]) => key.length <= 200 && value !== undefined && !unavailable(value)).map(([key]) => key).slice(0, 10)
    : [];
  return { eventName: String(event.name).slice(0, 300), platform: event.platform === 'page' ? 'all' : event.platform, required, equals: {} };
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
    const base: CheckResult = { id: rule.id, name: rule.name, status: !matches.length ? end == null ? 'waiting' : 'not-observed' : failures.length ? failures.every(failure => failure.issues.every(issue => issue.startsWith('Value unavailable:'))) ? 'unverifiable' : 'failed' : 'passed', matches: matches.length, failures };
    return applyCounts(rule, base, end != null);
  });
}
/** Count limits: maxCount fails as soon as it is exceeded; minCount (and minCount 0) are judged when the check ends. */
export function countIssue(rule: Pick<EventExpectation, 'minCount' | 'maxCount'>, matches: number, final: boolean): string | null {
  if (rule.maxCount != null && matches > rule.maxCount) return `Seen ${matches} times, expected at most ${rule.maxCount}`;
  if (final && rule.minCount != null && rule.minCount > 1 && matches > 0 && matches < rule.minCount) return `Seen ${matches} times, expected at least ${rule.minCount}`;
  return null;
}
export function applyCounts(rule: EventExpectation, result: CheckResult, final: boolean): CheckResult {
  const issue = countIssue(rule, result.matches, final);
  if (issue) return { ...result, status: 'failed', failures: [...result.failures.filter(failure => failure.eventId !== 'count'), { eventId: 'count', issues: [issue] }].slice(0, 20) };
  if (final && result.matches === 0 && rule.minCount === 0) return { ...result, status: 'passed' };
  return result;
}
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal((a as any)[key], (b as any)[key]));
}
export function normalizeExpectations(input: unknown): EventExpectation[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input.slice(0, 50).flatMap(item => {
    if (!item || typeof item.id !== 'string' || typeof item.eventName !== 'string' || seen.has(item.id)) return [];
    seen.add(item.id);
    const equals: Record<string, unknown> = Object.create(null);
    if (item.equals && typeof item.equals === 'object' && !Array.isArray(item.equals)) {
      for (const [key, value] of Object.entries(item.equals).slice(0, 50)) {
        try { if (JSON.stringify(value)?.length <= 2000) equals[key.slice(0, 200)] = value; } catch {}
      }
    }
    return [{ id: item.id.slice(0, 100), name: String(item.name || item.eventName).slice(0, 150), platform: String(item.platform || 'all').slice(0, 40), eventName: item.eventName.trim().slice(0, 300), required: Array.isArray(item.required) ? [...new Set<string>(item.required.filter((v: unknown) => typeof v === 'string').map((v: string) => v.trim().slice(0, 200)).filter(Boolean))].slice(0, 50) : [], equals, ...count(item.minCount, item.maxCount) }];
  });
}

function count(min: unknown, max: unknown): { minCount?: number; maxCount?: number } {
  const clean = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1000 ? value : undefined;
  const minCount = clean(min), maxCount = clean(max);
  if (minCount != null && maxCount != null && minCount > maxCount) return { minCount: maxCount, maxCount };
  return { ...(minCount != null ? { minCount } : {}), ...(maxCount != null ? { maxCount } : {}) };
}
