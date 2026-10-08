import { sanitize } from '../sanitize';
import type { NormalizedExperiment } from '../model';
import { parseSnapshot } from './protocol';

/** Total serialized detail target. The bridge accepts 4,000,000 characters, so this leaves headroom for escaping. */
const TOTAL_LIMIT = 3_300_000;
const MAX_TEXT = 20_000;
const MAX_CODE = 100_000;
const DETAIL_CAP = 1_500_000;
const CHANGE_TYPES = new Set(['js', 'css', 'html', 'attribute', 'redirect', 'offer', 'unknown']);

const sizeOf = (value: unknown) => { try { return JSON.stringify(value)?.length ?? 0; } catch { return Number.MAX_SAFE_INTEGER; } };
const clamp = (value: unknown, max = MAX_TEXT) => typeof value === 'string' && value.length > max ? value.slice(0, max) : value;

/** Keep only change records that satisfy the bridge schema; never let one malformed item hide the others. */
export function fitChanges(value: unknown): { changes: unknown[]; dropped: number } {
  if (!Array.isArray(value)) return { changes: [], dropped: 0 };
  const changes: unknown[] = [];
  let dropped = 0;
  for (const item of value) {
    if (!item || typeof item !== 'object' || !CHANGE_TYPES.has((item as any).type)) { dropped++; continue; }
    const change: Record<string, unknown> = { ...(item as Record<string, unknown>) };
    for (const key of ['selector', 'url', 'label']) {
      if (change[key] === undefined) continue;
      if (typeof change[key] !== 'string') delete change[key]; else change[key] = clamp(change[key]);
    }
    if (change.code !== undefined) { if (typeof change.code !== 'string') delete change.code; else change.code = clamp(change.code, MAX_CODE); }
    changes.push(change);
  }
  return { changes, dropped };
}

interface Unit { value: unknown; apply: (detail: unknown) => void; limited: () => void; }

/**
 * Share one byte allowance fairly. Small payloads always fit completely, so a large
 * sibling can never take the room a small change needs. Only genuinely large payloads
 * are clipped, and they are clipped in place (long strings keep their first characters).
 */
function allocate(units: Unit[], available: number): number {
  const sized = units.map(unit => {
    const detail = unit.value === undefined ? undefined : sanitize(unit.value, DETAIL_CAP, 16);
    return { unit, detail, size: detail === undefined ? 0 : sizeOf(detail) };
  }).filter(entry => entry.detail !== undefined).sort((a, b) => a.size - b.size);
  let remaining = available;
  sized.forEach((entry, index) => {
    const share = remaining / (sized.length - index);
    if (entry.size <= share) { entry.unit.apply(entry.detail); remaining -= entry.size; return; }
    if (share < 512) { entry.unit.limited(); return; }
    const clipped = sanitize(entry.unit.value, Math.floor(share * 0.8), 16);
    const size = sizeOf(clipped);
    if (size <= share) { entry.unit.apply(clipped); remaining -= size; }
    entry.unit.limited();
  });
  return remaining;
}

/** Bound detail independently; never let raw snippet data consume the snapshot envelope. */
export function serializeSnapshot(input: {url:string;capturedAt:number;page:{title:string;referrer:string;readyState:string};platforms:unknown[];experiments:NormalizedExperiment[]}) {
  const envelope = {
    url: String(sanitize(input.url)).slice(0,20000), capturedAt: input.capturedAt,
    page: {title:String(sanitize(input.page.title)).slice(0,20000),referrer:String(sanitize(input.page.referrer)).slice(0,20000),readyState:input.page.readyState},
    platforms: sanitize(input.platforms,100000,16) as unknown[], experiments: [] as unknown[]
  };
  const activities = input.experiments.slice(0, 1000);

  // Pass 1: structural summaries for every activity. These are always kept.
  type Entry = { source: NormalizedExperiment; clean: any };
  const entries: Entry[] = [];
  let used = sizeOf(envelope);
  for (const source of activities) {
    const { raw, changes, variations, ...metadata } = source;
    const summary = { ...metadata, variations: variations.map(({ changes, raw, ...variation }) => variation) };
    const clean = sanitize(summary, 64_000, 16) as any;
    if (typeof clean?.id === 'string') clean.id = clamp(clean.id);
    if (typeof clean?.name === 'string') clean.name = clamp(clean.name);
    if (typeof clean?.statusReason === 'string') clean.statusReason = clamp(clean.statusReason);
    for (const variation of clean?.variations || []) { if (variation && typeof variation === 'object') { variation.id = clamp(variation.id); variation.name = clamp(variation.name); } }
    if (parseSnapshot({ ...envelope, experiments: [clean] })?.experiments.length !== 1) continue;
    const size = sizeOf(clean);
    if (used + size > TOTAL_LIMIT) break;
    used += size;
    entries.push({ source, clean });
  }

  // Pass 2: change code. Reserve a share for raw detail, but give code first claim on the rest.
  const available = Math.max(0, TOTAL_LIMIT - used);
  const rawReserve = Math.floor(available * 0.25);
  const units: Unit[] = [];
  for (const { source, clean } of entries) {
    const limited = () => { clean.detailLimit = 'Some change details were shortened to fit the capture limit.'; };
    const apply = (owner: any) => (detail: unknown) => {
      const fitted = fitChanges(detail);
      if (fitted.dropped) limited();
      if (fitted.changes.length) owner.changes = fitted.changes;
    };
    if (source.changes?.length) units.push({ value: source.changes, apply: apply(clean), limited });
    source.variations.forEach((variation, index) => {
      if (variation.changes?.length && clean.variations[index]) units.push({ value: variation.changes, apply: apply(clean.variations[index]), limited });
    });
  }
  const afterCode = allocate(units, available - rawReserve);

  // Pass 3: raw detail gets everything that is left.
  const rawUnits: Unit[] = entries.filter(({ source }) => source.raw !== undefined).map(({ source, clean }) => ({
    value: source.raw,
    apply: (detail) => { clean.raw = detail; },
    limited: () => { clean.rawLimit = 'Raw platform data was shortened to fit the capture limit.'; }
  }));
  allocate(rawUnits, afterCode + rawReserve);

  for (const { clean } of entries) {
    if (parseSnapshot({ ...envelope, experiments: [clean] })?.experiments.length !== 1) {
      // Optional detail must never invalidate a summary.
      delete clean.changes; for (const variation of clean.variations) delete variation.changes;
      clean.detailLimit = 'Change details exceeded the capture limit.';
      if (parseSnapshot({ ...envelope, experiments: [clean] })?.experiments.length !== 1) { delete clean.raw; delete clean.rawLimit; }
      if (parseSnapshot({ ...envelope, experiments: [clean] })?.experiments.length !== 1) continue;
    }
    envelope.experiments.push(clean);
  }
  return envelope;
}
