import * as v from 'valibot';
import type { BridgeMessage } from '../model';

const MessageSchema = v.object({
  namespace: v.literal('__splitscope__'),
  nonce: v.pipe(v.string(), v.maxLength(128)),
  type: v.picklist(['hello', 'ready', 'snapshot', 'event', 'command', 'response', 'status']),
  requestId: v.optional(v.pipe(v.string(), v.maxLength(128))),
  payload: v.optional(v.unknown())
});

export function parseBridgeMessage(value: unknown): BridgeMessage | null {
  const parsed = v.safeParse(MessageSchema, value);
  if (!parsed.success) return null;
  try {
    if (JSON.stringify(parsed.output).length > (parsed.output.type === 'snapshot' ? 4_000_000 : 300_000)) return null;
  } catch { return null; }
  return parsed.output as BridgeMessage;
}

export function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const Platform = v.picklist(['optimizely', 'adobe-target', 'vwo', 'kameleoon', 'ab-tasty', 'convert', 'dynamic-yield', 'unbounce', 'monetate', 'pagesense', 'onesignal']);
const Text = v.pipe(v.string(), v.maxLength(20_100));
const Ref = v.object({ name: Text, id: v.optional(Text) });
const Change = v.looseObject({ type: v.picklist(['js', 'css', 'html', 'attribute', 'redirect', 'offer', 'unknown']), code: v.optional(v.pipe(v.string(), v.maxLength(100_100))), selector: v.optional(Text), url: v.optional(Text), label: v.optional(Text) });
const Variation = v.looseObject({ id: Text, name: Text, weight: v.optional(v.number()), changes: v.optional(v.array(Change)) });
const Activity = v.looseObject({ platform: Platform, id: Text, name: Text, kind: v.picklist(['ab', 'mvt', 'split-url', 'personalization', 'feature-flag', 'survey', 'recommendation', 'other']), status: v.picklist(['running-in', 'running-excluded', 'bucketed-elsewhere', 'not-targeted', 'not-on-page', 'preview', 'unknown']), statusReason: v.optional(Text), evidence: v.optional(v.object({ state: v.picklist(['applied', 'assigned', 'stored', 'detected', 'failed']), observedAt: v.pipe(v.number(), v.finite()), pageUrl: Text })), variations: v.array(Variation), changes: v.optional(v.array(Change)), assignedVariationId: v.optional(Text), campaignId: v.optional(Text), trafficAllocation: v.optional(v.number()), source: v.array(Text), goals: v.optional(v.array(Ref)), targeting: v.optional(v.object({ urls: v.optional(v.array(Text)), audiences: v.optional(v.array(Ref)), conditions: v.optional(v.array(Text)) })) });
const Detection = v.looseObject({ id: Platform, displayName: Text, result: v.looseObject({ state: Text, signals: v.array(Text), confidence: v.number(), version: v.optional(Text) }), capabilities: v.looseObject({ listAll: Text, forceVariation: Text, notes: v.record(v.string(), Text) }) });
const Snapshot = v.object({ url: Text, capturedAt: v.number(), platforms: v.array(v.unknown()), experiments: v.array(v.unknown()), page: v.object({ title: Text, referrer: Text, readyState: Text }) });
const EventData = v.looseObject({ id: Text, t: v.pipe(v.number(), v.finite()), platform: v.union([Platform, v.literal('page'), v.picklist(['datalayer', 'ga4', 'segment', 'adobe-analytics'])]), name: Text, category: v.picklist(['custom', 'goal', 'revenue', 'pageview', 'decision', 'activation', 'lifecycle', 'identity', 'data-feed', 'consent', 'network', 'error']), via: v.picklist(['api-call', 'listener', 'dom-event', 'network', 'queued-before-load']), caller: v.optional(Text), pageUrl: v.optional(Text), experimentId: v.optional(Text), variationId: v.optional(Text) });
export function parseSnapshot(value: unknown) {
  const result = v.safeParse(Snapshot, value);
  if (!result.success) return null;
  const platforms = result.output.platforms.flatMap(item => { const parsed = v.safeParse(Detection, item); return parsed.success ? [parsed.output] : []; });
  const experiments = result.output.experiments.flatMap(item => { const parsed = v.safeParse(Activity, item); return parsed.success ? [parsed.output] : []; });
  return { ...result.output, platforms, omittedPlatforms: result.output.platforms.length - platforms.length, experiments, omitted: result.output.experiments.length - experiments.length };
}
export function parseEvent(value: unknown) {
  const result = v.safeParse(EventData, value);
  return result.success ? result.output as unknown as import('../model').CapturedEvent : null;
}

export function snapshotIssues(value: unknown) {
  const result = v.safeParse(Snapshot, value);
  return result.success ? [] : result.issues.slice(0, 10).map(issue => ({ message: issue.message, path: issue.path?.map(item => String(item.key)).join('.') }));
}
