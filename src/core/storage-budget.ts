/**
 * Keeps Splitscope's chrome.storage.local use bounded. Chrome gives an extension 10 MB there; once it is full,
 * settings, workspace and preview saves all fail. Origin keyed data expires and the oldest goes first when space runs short.
 */
export const STORAGE_PREFIX = 'splitscope:';
export const SETTINGS_KEY = 'splitscope:settings';
/** Serialized bytes Splitscope may keep in local storage, well below the 10 MB quota. */
export const LOCAL_BUDGET = 6_000_000;
export const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_STORED_STRING = 20_000;

/** Clip every string in a value so one field (a DOM snapshot, a code body) cannot take the whole budget. */
export function capStrings<T>(value: T, max = MAX_STORED_STRING, depth = 0): T {
  if (typeof value === 'string') return (value.length > max ? value.slice(0, max) + '…[truncated]' : value) as T;
  if (!value || typeof value !== 'object' || depth > 20) return value;
  if (Array.isArray(value)) return value.map(item => capStrings(item, max, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = capStrings(item, max, depth + 1);
  return out as T;
}

const kind = (key: string) => key.slice(STORAGE_PREFIX.length).split(':')[0] || '';
const stamp = (item: any) => Math.max(0, ...['savedAt', 'lastSeen', 'updatedAt', 'observedAt', 'at'].map(field => typeof item?.[field] === 'number' ? item[field] : 0));

/** Newest timestamp found in a stored value (0 when it carries none). */
export function latestTime(value: unknown): number {
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) return Math.max(0, ...value.map(stamp));
  return stamp(value);
}

/** Drop entries older than 30 days from Target experience memory and saved QA links. Returns undefined when nothing is left. */
export function expireValue(key: string, value: unknown, now: number): unknown {
  const cutoff = now - EXPIRY_MS;
  switch (kind(key)) {
    case 'target-memory': case 'target-qa': {
      if (!Array.isArray(value)) return undefined;
      const kept = value.filter(item => stamp(item) >= cutoff);
      return kept.length ? kept : undefined;
    }
    case 'target-qa-observed': return typeof value === 'number' && value >= cutoff ? value : undefined;
    default: return value;
  }
}

// Automatic captures go first, then saved QA links, then the user's own workspaces and checks.
const tier = (key: string) => ({ 'target-memory': 0, 'target-qa-observed': 0, 'target-qa': 1 } as Record<string, number>)[kind(key)] ?? 2;
const sizeOf = (key: string, value: unknown) => { try { return key.length + (JSON.stringify(value)?.length ?? 0); } catch { return key.length; } };

export interface StorageUsage { bytes: number; keys: number; sites: number }
export function storageUsage(items: Record<string, unknown>): StorageUsage {
  const keys = Object.keys(items).filter(key => key.startsWith(STORAGE_PREFIX));
  const sites = new Set(keys.map(key => key.slice(STORAGE_PREFIX.length).split(':').slice(1).join(':')).filter(Boolean));
  return { bytes: keys.reduce((sum, key) => sum + sizeOf(key, items[key]), 0), keys: keys.length, sites: sites.size };
}

/** Work out which keys to rewrite (expired entries removed) and which to delete (expired or over budget). */
export function planStorageCleanup(items: Record<string, unknown>, now: number, budget = LOCAL_BUDGET): { set: Record<string, unknown>; remove: string[] } {
  const set: Record<string, unknown> = {}, remove: string[] = [];
  const live: Array<{ key: string; value: unknown }> = [];
  for (const [key, value] of Object.entries(items)) {
    if (!key.startsWith(STORAGE_PREFIX) || key === SETTINGS_KEY) continue;
    const next = expireValue(key, value, now);
    if (next === undefined) { remove.push(key); continue; }
    if (Array.isArray(value) && Array.isArray(next) && next.length !== value.length) set[key] = next;
    live.push({ key, value: next });
  }
  let total = sizeOf(SETTINGS_KEY, items[SETTINGS_KEY]) + live.reduce((sum, item) => sum + sizeOf(item.key, item.value), 0);
  if (total > budget) {
    for (const item of live.slice().sort((a, b) => tier(a.key) - tier(b.key) || latestTime(a.value) - latestTime(b.value))) {
      if (total <= budget) break;
      total -= sizeOf(item.key, item.value);
      remove.push(item.key); delete set[item.key];
    }
  }
  return { set, remove };
}
