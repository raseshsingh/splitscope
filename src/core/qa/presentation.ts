import type { CapturedEvent, NormalizedExperiment } from '../model';
export const platformNames: Record<string, string> = { optimizely: 'Optimizely', 'adobe-target': 'Adobe Target', vwo: 'VWO', kameleoon: 'Kameleoon', 'ab-tasty': 'AB Tasty', convert: 'Convert', 'dynamic-yield': 'Dynamic Yield', unbounce: 'Unbounce', monetate: 'Monetate', pagesense: 'PageSense', onesignal: 'OneSignal', ga4: 'Google tag / GA4', segment: 'Segment', 'adobe-analytics': 'Adobe Analytics', datalayer: 'Data layer', page: 'Page navigation' };
export const kindNames: Record<string, string> = { ab: 'A/B test', mvt: 'Multivariate', 'split-url': 'Split URL', personalization: 'Personalization', 'feature-flag': 'Feature test', survey: 'Survey', recommendation: 'Recommendations', other: 'Type not exposed' };
export const statusNames: Record<string, string> = { 'running-in': 'Active here', 'running-excluded': 'Holdback / excluded', 'bucketed-elsewhere': 'Stored assignment', 'not-on-page': 'Inactive here', 'not-targeted': 'Not targeted', preview: 'Preview', unknown: 'Unconfirmed' };
export const isActive = (item: Pick<NormalizedExperiment, 'status'>) => item.status === 'running-in';
export const activityKey = (item: Pick<NormalizedExperiment, 'platform' | 'id'>) => item.platform + ':' + item.id;
export const pretty = (value: unknown) => JSON.stringify(value, null, 2) ?? String(value);
export function relatedEvents(events: CapturedEvent[], activity: NormalizedExperiment) {
  return events.filter((event) => event.platform === activity.platform && event.experimentId === activity.id);
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
  if (item.status === 'running-in') return 'Assigned / delivered';
  if (item.status === 'unknown') return 'Detected only';
  return statusNames[item.status] || item.status;
}
