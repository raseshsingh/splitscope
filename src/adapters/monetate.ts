import { activityKind } from '../core/activity-kind';
import type { PageAdapter } from '../core/hooks/runtime';
import { asArray, detection, normalizedExperiment } from '../core/hooks/runtime';
import { sanitize } from '../core/sanitize';

export const monetateAdapter: PageAdapter = {
  id: 'monetate', displayName: 'Monetate', category: 'experimentation',
  detect() {
    const win = window as any;
    if (win.monetateQ || win.monetateT || win.monetate?.campaigns) return detection('active', ['Monetate JavaScript API'], 0.96);
    if (document.querySelector('script[src*="monetate.net"]')) return detection('loading', ['Monetate tag'], 0.72);
    return detection('blocked', [], 0);
  },
  listExperiments() {
    const campaigns = (window as any).monetate?.campaigns;
    if (!Array.isArray(campaigns)) return [];
    return campaigns.map((raw: any) => normalizedExperiment({ platform: 'monetate', id: String(raw.id ?? ''), name: raw.key || raw.name || `Experience ${raw.id}`, kind: activityKind('monetate', raw), status: 'running-in', variations: raw.split ? [{ id: String(raw.split), name: String(raw.split) }] : [], assignedVariationId: raw.split ? String(raw.split) : undefined, source: ['runtime-api'], raw: raw }));
  },
  install(helpers) {
    helpers.wrapQueue('monetateQ', 'monetate', (args) => String((args[0] as any)?.[0] || 'monetateQ.push'), 'data-feed');
    helpers.wrapQueue('monetateq', 'monetate', (args) => String((args[0] as any)?.[0] || 'monetateq.push'), 'data-feed');
    helpers.wrapQueue('monetateT', 'monetate', (args) => String((args[0] as any)?.[0] || 'monetateT.push'), 'data-feed');
    helpers.wrapMethod(() => (window as any).monetate, 'trackData', 'monetate', (args) => `trackData ${String((args[0] as any)?.pageType || '')}`, 'data-feed');
  }
};
