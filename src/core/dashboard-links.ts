import type { NormalizedExperiment } from './model';

export interface DashboardDestination { url: string; label: string; direct: true; reason: string }

// Return only activity-specific management routes. Missing context means no link.
const numericId = (value: unknown): value is string => typeof value === 'string' && /^\d{1,30}$/.test(value);
export function dashboardDestination(activity: NormalizedExperiment): DashboardDestination | undefined {
  const context = activity.dashboardContext;
  if (activity.platform === 'kameleoon' && numericId(activity.id) && ['ab', 'personalization'].includes(activity.kind)) {
    const section = activity.kind === 'personalization' ? 'personalizations' : 'experiments';
    return { url: `https://app.kameleoon.com/${section}/results/${activity.id}`, label: 'Open activity results', direct: true, reason: 'Opens this activity’s Kameleoon results in a new tab.' };
  }
  if (activity.platform === 'optimizely' && numericId(activity.id)) {
    if (context?.runtime === 'classic') return { url: `https://www.optimizely.com/edit?experiment_id=${activity.id}`, label: 'Open Classic editor', direct: true, reason: 'Legacy Optimizely Classic route. Requires access to the legacy product.' };
    if (numericId(context?.projectId)) {
      const base = `https://app.optimizely.com/v2/projects/${context.projectId}`;
      if (activity.kind === 'personalization' && numericId(activity.campaignId)) return { url: `${base}/campaigns/${activity.campaignId}`, label: 'Open campaign', direct: true, reason: 'Opens the personalization campaign containing this experience in a new tab.' };
      if (['ab', 'mvt', 'split-url'].includes(activity.kind)) return { url: `${base}/experiments/${activity.id}`, label: 'Open experiment', direct: true, reason: 'Opens this experiment in Optimizely in a new tab.' };
    }
  }
  if (activity.platform === 'convert' && numericId(activity.id) && numericId(context?.projectId) && numericId(context?.accountId)) {
    return { url: `https://app.convert.com/accounts/${context.accountId}/projects/${context.projectId}/experiences/${activity.id}`, label: 'Open experience', direct: true, reason: 'Opens this Convert experience in a new tab.' };
  }
  return undefined;
}

export function convertDashboardContext(sources: string[]) {
  const contexts = sources.flatMap(source => {
    try {
      const url = new URL(source);
      if (!/^cdn-\d+\.convertexperiments\.com$/.test(url.hostname)) return [];
      const match = url.pathname.match(/^\/(?:v1\/)?js\/(\d+)-(\d+)\.js$/);
      return match ? [{ accountId: match[1], projectId: match[2] }] : [];
    } catch { return []; }
  });
  const unique = new Map(contexts.map(context => [`${context.accountId}:${context.projectId}`, context]));
  // Multiple snippets cannot be attributed to an experience without more evidence.
  return unique.size === 1 ? [...unique.values()][0] : undefined;
}
