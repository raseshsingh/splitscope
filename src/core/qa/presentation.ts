import type { CapturedEvent, NormalizedExperiment } from '../model';
export const platformNames: Record<string, string> = { growthbook: 'GrowthBook', statsig: 'Statsig', posthog: 'PostHog', optimizely: 'Optimizely', 'adobe-target': 'Adobe Target', vwo: 'VWO', kameleoon: 'Kameleoon', 'ab-tasty': 'AB Tasty', convert: 'Convert', 'dynamic-yield': 'Dynamic Yield', unbounce: 'Unbounce', monetate: 'Monetate', pagesense: 'PageSense', onesignal: 'OneSignal', ga4: 'Google tag / GA4', segment: 'Segment', 'adobe-analytics': 'Adobe Analytics', datalayer: 'Data layer', page: 'Page navigation' };
export const platformColors: Record<string, string> = { optimizely: '#2f6bff', 'adobe-target': '#e5392c', vwo: '#f08a1c', kameleoon: '#17b890', 'ab-tasty': '#d4b106', convert: '#8a5cf6', 'dynamic-yield': '#1fa3d9', unbounce: '#4b5bd6', monetate: '#c2185b', pagesense: '#6d7c8a', growthbook: '#7c4dff', statsig: '#3a8dde', posthog: '#f54e00', onesignal: '#e54b4d' };
export const kindNames: Record<string, string> = { layer: 'Layer', configuration: 'Configuration', ab: 'A/B test', mvt: 'Multivariate', 'split-url': 'Split URL', personalization: 'Personalization', 'feature-flag': 'Feature flag', survey: 'Survey', recommendation: 'Recommendations', other: 'Type not exposed' };
export const statusNames: Record<string, string> = { 'running-in': 'Active on this page', 'running-excluded': 'Holdback / excluded', 'bucketed-elsewhere': 'Stored assignment', 'not-on-page': 'Inactive here', 'not-targeted': 'Not targeted', preview: 'Preview', unknown: 'Unconfirmed' };
export const isActive = (item: Pick<NormalizedExperiment, 'status'>) => item.status === 'running-in';
export const activityKey = (item: Pick<NormalizedExperiment, 'platform' | 'id'>) => item.platform + ':' + item.id;
export const pretty = (value: unknown) => JSON.stringify(value, null, 2) ?? String(value);
export function relatedEvents(events: CapturedEvent[], activity: NormalizedExperiment) {
  return events.filter((event) => event.platform === activity.platform && event.experimentId === activity.id);
}
const businessCategories = ['custom', 'goal', 'revenue'];
/**
 * Events that belong to an activity, split by how sure the link is:
 * linked (the event names this activity), metric (the event name matches one of the activity's goals),
 * and platform (goal or custom events sent to the same platform while this activity is active on the page,
 * which the platform credits to every active activity that tracks them).
 */
/** A goal event matches by its name (with or without a "Conversion:" style prefix) or by a goal ID or name recorded in its properties. */
/** Goals, revenue and custom events: what the Events tab shows by default and counts on its badge. */
export const isBusinessEvent = (event: Pick<CapturedEvent, 'category'>) => event.category === 'custom' || event.category === 'goal' || event.category === 'revenue';
export function eventKeys(event: CapturedEvent): string[] {
  const p = (event.properties && typeof event.properties === 'object' && !Array.isArray(event.properties) ? event.properties : {}) as Record<string, unknown>;
  return [event.name, event.name.replace(/^[^:]+:\s*/, ''), p.goalId, p.goalName, p.goal_id].filter(value => value != null && value !== '').map(value => String(value).toLowerCase());
}
/** For each goal of an activity: the matching events on this page (newest first). */
export function goalHits(events: CapturedEvent[], activity: NormalizedExperiment): Array<{ goal: { id?: string; name: string }; hits: CapturedEvent[] }> {
  const own = events.filter(event => event.platform === activity.platform && (!event.experimentId || event.experimentId === activity.id) && businessCategories.includes(event.category));
  return (activity.goals || []).map(goal => {
    const keys = [goal.id, goal.name].filter((value): value is string => Boolean(value)).map(value => value.toLowerCase());
    return { goal, hits: own.filter(event => eventKeys(event).some(key => keys.includes(key))).sort((a, b) => b.t - a.t) };
  });
}
export function activityEvents(events: CapturedEvent[], activity: NormalizedExperiment) {
  const linked = relatedEvents(events, activity);
  const goalKeys = new Set((activity.goals || []).flatMap(goal => [goal.id, goal.name]).filter((value): value is string => Boolean(value)).map(value => value.toLowerCase()));
  const rest = events.filter(event => event.platform === activity.platform && !linked.includes(event) && !event.experimentId);
  const metric = goalKeys.size ? rest.filter(event => eventKeys(event).some(key => goalKeys.has(key))) : [];
  const platform = isActive(activity) ? rest.filter(event => !metric.includes(event) && businessCategories.includes(event.category)) : [];
  return { linked, metric, platform };
}
export function mergeEvents(...batches: CapturedEvent[][]): CapturedEvent[] {
  const byId = new Map<string, CapturedEvent>();
  for (const events of batches) for (const event of events) byId.set(event.id, event);
  return [...byId.values()].sort((a, b) => a.t - b.t).slice(-5000);
}
export function selectorConflicts(activities: NormalizedExperiment[]) {
  const uses = new Map<string, Map<string, string>>();
  for (const activity of activities.filter(isActive)) {
    // Compare only the visitor's assigned variation; alternatives are not simultaneous changes.
    const variation = activity.variations.find((item) => item.id === activity.assignedVariationId);
    for (const change of variation?.changes || []) {
      const selector = change.selector?.trim();
      if (!selector) continue;
      const owners = uses.get(selector) || new Map<string, string>();
      owners.set(activityKey(activity), activity.name);
      uses.set(selector, owners);
    }
  }
  return [...uses].filter(([, owners]) => owners.size > 1).map(([selector, owners]) => ({ selector, activities: [...owners.values()] }));
}

export function activityStatus(item: NormalizedExperiment): string {
  if (item.evidence?.state === 'applied') return 'Applied on this page';
  if (item.evidence?.state === 'failed') return 'Application failed';
  if (item.status === 'running-in') return 'Active on this page';
  if (item.status === 'unknown') return 'Detected only';
  return statusNames[item.status] || item.status;
}

/**
 * Many platforms report one action twice: the site's API call (which Splitscope observes) and the platform's own
 * listener or DOM event a moment later (for example Optimizely's trackEvent listener, Kameleoon::ConversionTriggered
 * or Convert's goal.triggered). Return the index of the API call an incoming listener event confirms, or -1.
 */
export function confirmedCallIndex(events: CapturedEvent[], incoming: CapturedEvent, windowMs = 2000): number {
  if (incoming.via !== 'listener' && incoming.via !== 'dom-event') return -1;
  const props = (incoming.properties && typeof incoming.properties === 'object' && !Array.isArray(incoming.properties) ? incoming.properties : {}) as Record<string, unknown>;
  const keys = new Set([incoming.name, props.goalId, props.goalName].filter(value => value != null && value !== '').map(value => String(value).toLowerCase()));
  const tail = (name: string) => name.replace(/^[^:]+:\s*/, '').toLowerCase();
  for (let index = events.length - 1; index >= 0 && index >= events.length - 50; index--) {
    const event = events[index]!;
    if (incoming.t - event.t > windowMs) break;
    if (event.via !== 'api-call' || event.platform !== incoming.platform || event.confirmedBy || Math.abs(incoming.t - event.t) > windowMs) continue;
    if (event.experimentId && incoming.experimentId && event.experimentId !== incoming.experimentId) continue;
    if (keys.has(event.name.toLowerCase()) || keys.has(tail(event.name))) return index;
  }
  return -1;
}
export function mergeConfirmation(call: CapturedEvent, incoming: CapturedEvent): CapturedEvent {
  return { ...call, experimentId: call.experimentId ?? incoming.experimentId, variationId: call.variationId ?? incoming.variationId, confirmedBy: incoming.via === 'dom-event' ? 'dom-event' : 'listener', confirmation: incoming.properties };
}
