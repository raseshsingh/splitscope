import { EXTENSION_BUILD } from './extension/messages';
import { sanitize } from './sanitize';
export type Diagnostic = { t: number; scope: string; message: string; detail?: unknown };
const records: Diagnostic[] = [];
const recent = new Map<string, number>();
export function diagnostic(scope: string, message: string, detail?: unknown): Diagnostic | undefined {
  const key = `${scope}:${message}`;
  const now = Date.now();
  if (now - (recent.get(key) || 0) < 5000) return;
  recent.set(key, now);
  if (recent.size > 100) recent.clear();
  const record = { t: now, scope, message, detail: sanitize(detail, 12_000) };
  records.push(record); if (records.length > 100) records.shift();
  console.warn(`[Splitscope/${scope} v${EXTENSION_BUILD}] ${message}\n${record.detail === undefined ? '' : JSON.stringify(record.detail, null, 2)}`);
  return record;
}
export function diagnostics() { return records.slice(); }
