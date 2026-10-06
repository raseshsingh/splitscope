import { sanitize } from '../sanitize';
export interface JourneyEntry { id: string; t: number; type: 'navigation' | 'decision' | 'event' | 'note'; name: string; url?: string; detail?: unknown }
export interface Journey { origin: string; startedAt: number; endedAt?: number; recording: boolean; lastUrl: string; lastDocument?: string; decisions: Record<string, string>; entries: JourneyEntry[]; omitted: number }
/** Storage and extension messages are runtime data, not guaranteed Journey objects. */
export function readJourney(value: unknown): Journey | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<Journey>;
  if (typeof item.origin !== 'string' || !Number.isFinite(item.startedAt) ||
      typeof item.recording !== 'boolean' || typeof item.lastUrl !== 'string' ||
      !Number.isFinite(item.omitted) || !item.decisions || typeof item.decisions !== 'object' || Array.isArray(item.decisions) ||
      !Object.values(item.decisions).every(decision => typeof decision === 'string') ||
      !Array.isArray(item.entries) || !item.entries.every(entry => entry &&
        typeof entry.id === 'string' && Number.isFinite(entry.t) && typeof entry.name === 'string' &&
        ['navigation', 'decision', 'event', 'note'].includes(entry.type) &&
        (entry.url === undefined || typeof entry.url === 'string'))) return null;
  return item as Journey;
}
export function beginJourney(origin: string): Journey { return { origin, startedAt: Date.now(), recording: true, lastUrl: '', decisions: {}, entries: [], omitted: 0 }; }
const entrySizes = new WeakMap<Journey, number[]>();
const encoder = new TextEncoder();
const sizeOf = (value: unknown) => encoder.encode(JSON.stringify(value)).length + 1;
export function appendJourney(journey: Journey, entry: Omit<JourneyEntry, 'id'> & { id?: string }): void {
  if (entry.id && journey.entries.some(item => item.id === entry.id)) return;
  const sizes = entrySizes.get(journey) || journey.entries.map(sizeOf);
  journey.entries.push({ ...entry, name: String(sanitize(entry.name)).slice(0, 500), url: entry.url ? String(sanitize(entry.url)) : undefined, detail: sanitize(entry.detail, 12000, 8), id: entry.id || crypto.randomUUID() });
  sizes.push(sizeOf(journey.entries.at(-1)));
  let bytes = sizes.reduce((sum, size) => sum + size, 2);
  while (journey.entries.length > 500 || bytes > 750000) { journey.entries.shift(); bytes -= sizes.shift() || 0; journey.omitted++; }
  entrySizes.set(journey, sizes);
}
export function recordSnapshot(journey: Journey, snapshot: any): boolean {
  if (!journey.recording || !snapshot || typeof snapshot.url !== 'string') return false;
  let origin: string; try { origin = new URL(snapshot.url).origin; } catch { return false; }
  if (origin !== journey.origin) return false;
  let changed = false;
  const url = String(sanitize(snapshot.url));
  if (journey.lastUrl !== url || journey.lastDocument !== snapshot.documentId) { appendJourney(journey, { t: Date.now(), type: 'navigation', name: 'Page / route visited', url }); journey.lastUrl = url; journey.lastDocument = snapshot.documentId; changed = true; }
  for (const item of Array.isArray(snapshot.experiments) ? snapshot.experiments.slice(0, 500) : []) {
    if (typeof item.id !== 'string' || typeof item.platform !== 'string') continue;
    const key = item.platform + ':' + item.id;
    const signature = JSON.stringify([item.status, item.assignedVariationId, item.evidence?.state, sanitize(item.evaluatedValue, 1000)]);
    const before = journey.decisions[key];
    if (before === signature) continue;
    appendJourney(journey, { t: Date.now(), type: 'decision', name: item.name || item.id, url, detail: { platform: item.platform, activityId: item.id, before: before ? decisionFields(JSON.parse(before)) : null, after: decisionFields(JSON.parse(signature)) } });
    journey.decisions[key] = signature; changed = true;
  }
  // Bound the comparison cache as well as the displayed history.
  const keys = Object.keys(journey.decisions); for (const key of keys.slice(0, Math.max(0, keys.length - 1000))) delete journey.decisions[key];
  return changed;
}

function decisionFields(values: unknown[]) { return { status: values[0], variationId: values[1], evidence: values[2], value: values[3] }; }
