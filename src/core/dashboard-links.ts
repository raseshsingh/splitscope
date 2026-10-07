import type { NormalizedExperiment, PlatformId } from './model';

export type DashboardLinks = Record<string, string>;
export interface DashboardDestination { url?: string; label: string; direct: boolean; reason: string; saved?: boolean }

// Only dashboard destinations belong here. Delivery endpoints and public website
// URLs are not management links. Routes without documented context use saved URLs.
export const dashboardPlatforms: Record<PlatformId, { home?: string; reason: string }> = {
  optimizely: { home: 'https://app.optimizely.com/', reason: 'A direct link needs the project ID and, for personalization, the campaign ID.' },
  convert: { home: 'https://app.convert.com/', reason: 'A direct link needs the account and project IDs from the Convert snippet.' },
  'adobe-target': { home: 'https://experience.adobe.com/', reason: 'Adobe dashboard links need your organization route and the exact activity type. Client codes and IMS IDs cannot safely substitute for them.' },
  vwo: { home: 'https://app.vwo.com/', reason: 'The dashboard route depends on the account and test type. Save a link from your VWO dashboard.' },
  kameleoon: { home: 'https://app.kameleoon.com/', reason: 'Save a link from your Kameleoon account; a reliable activity route was not established from the public SDK data.' },
  'ab-tasty': { home: 'https://auth.abtasty.com/login', reason: 'Save a campaign link from your account. The public campaign ID alone does not establish the dashboard route.' },
  'dynamic-yield': { reason: 'Dynamic Yield has US and EU consoles and section-specific campaigns. Save the link from your console.' },
  unbounce: { home: 'https://app.unbounce.com/', reason: 'The page runtime does not reliably expose the dashboard account path. Save the page overview link.' },
  monetate: { reason: 'Save the experience link from your Monetate account; the delivery data does not establish a management URL.' },
  pagesense: { reason: 'PageSense links depend on your data center, portal and project. Save the experiment link from your account.' },
  onesignal: { home: 'https://dashboard.onesignal.com/', reason: 'OneSignal currently exposes events here, not an experiment catalog. A message link requires its app and message IDs.' },
  growthbook: { reason: 'GrowthBook can be cloud or self-hosted. Experiment tracking keys can differ from dashboard IDs. Save the link from your instance.' },
  statsig: { home: 'https://console.statsig.com/', reason: 'SDK evaluation names do not establish your console project route. Save the link from your project.' },
  posthog: { reason: 'PostHog needs your region or self-hosted address, project ID and dashboard flag ID. A flag key is not that numeric ID.' },
};

const contextKey = (activity: NormalizedExperiment) => [activity.dashboardContext?.accountId || '', activity.dashboardContext?.projectId || ''].map(encodeURIComponent).join(':');
export const activityLinkKey = (activity: NormalizedExperiment) => `activity:${activity.platform}:${encodeURIComponent(activity.id)}:${contextKey(activity)}`;
export const templateLinkKey = (activity: NormalizedExperiment) => `type:${activity.platform}:${activity.kind}:${contextKey(activity)}`;

export function safeDashboardUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 4000 || /[\u0000-\u0020\\{}]/.test(value)) return;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) return;
    return url.href;
  } catch { return; }
}

export function dashboardVariables(activity: NormalizedExperiment): Record<string, string | undefined> {
  return { id: activity.id, campaignId: activity.campaignId, projectId: activity.dashboardContext?.projectId, accountId: activity.dashboardContext?.accountId };
}

export function resolveDashboardTemplate(template: string, activity: NormalizedExperiment): { url?: string; error?: string } {
  const variables = dashboardVariables(activity);
  let error: string | undefined;
  // Host placeholders would let untrusted page IDs change the destination domain.
  if (!/^https:\/\/[^/{}?#]+(?:[/?#]|$)/.test(template)) return { error: 'Use a complete HTTPS URL with a fixed dashboard domain.' };
  const expanded = template.replace(/\{([^{}]+)\}/g, (_, key: string) => {
    const value = variables[key];
    if (!Object.hasOwn(variables, key)) error = `Unknown placeholder: {${key}}.`;
    else if (!value || value === '.' || value === '..') error = `This activity does not expose {${key}}.`;
    return value ? encodeURIComponent(value) : '';
  });
  const url = safeDashboardUrl(expanded);
  return error ? { error } : url ? { url } : { error: 'Enter a valid HTTPS dashboard URL without credentials or spaces.' };
}

export function normalizeDashboardLinks(value: unknown): DashboardLinks {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(-200).filter(([key, url]) =>
    /^(activity|type):[a-z-]+:.{1,300}$/.test(key) && typeof url === 'string' && url.length <= 4000 &&
    /^https:\/\/[^/{}?#]+(?:[/?#]|$)/.test(url) && safeDashboardUrl(url.replace(/\{(?:id|campaignId|projectId|accountId)\}/g, '1'))
  ));
}

const numericId = (value: unknown): value is string => typeof value === 'string' && /^\d{1,30}$/.test(value);
export function dashboardDestination(activity: NormalizedExperiment, links: DashboardLinks = {}): DashboardDestination {
  const template = links[activityLinkKey(activity)] || links[templateLinkKey(activity)];
  if (template) {
    const result = resolveDashboardTemplate(template, activity);
    if (result.url) return { url: result.url, label: 'Open saved link', direct: true, saved: true, reason: 'Your saved dashboard link. Opens in a new tab; sign-in and account access may be required.' };
    return { label: 'Fix dashboard link', direct: false, saved: true, reason: result.error! };
  }
  const context = activity.dashboardContext;
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
  const platform = dashboardPlatforms[activity.platform];
  return { url: platform?.home, label: platform?.home ? 'Open dashboard' : 'Add dashboard link', direct: false, reason: platform?.reason || 'Save a dashboard link for this activity.' };
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
