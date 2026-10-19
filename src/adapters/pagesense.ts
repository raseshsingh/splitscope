import { activityKind } from '../core/activity-kind';
import type { PageAdapter } from '../core/hooks/runtime';
import { detection, mapSafely, normalizedExperiment, variationList } from '../core/hooks/runtime';
import { sanitize } from '../core/sanitize';

export const pageSenseAdapter: PageAdapter = {
  id: 'pagesense', displayName: 'Zoho PageSense', category: 'experimentation',
  detect() {
    const win = window as any;
    if (win.pagesense) return detection(Array.isArray(win.pagesense) ? 'loading' : 'active', ['window.pagesense'], 0.94);
    if (document.querySelector('script[src*="pagesense.io"]')) return detection('loading', ['PageSense tracking script'], 0.72);
    return detection('blocked', [], 0);
  },
  listExperiments() {
    const ps = (window as any).pagesense;
    const data = ps && !Array.isArray(ps) ? ps.experiments || ps.activities || ps.campaigns : null;
    if (!data) return [];
    const entries = Array.isArray(data) ? data : Object.values(data);
    return mapSafely(entries as any[], (raw: any) => normalizedExperiment({ platform: 'pagesense', id: String(raw.id ?? raw.experimentId ?? ''), name: raw.name || raw.experimentName || `Experiment ${raw.id}`, kind: activityKind('pagesense', raw), status: raw.variationId ? 'bucketed-elsewhere' : 'unknown', statusReason: raw.status === 'active' ? 'Running in the PageSense project. Whether it applied on this page is not exposed.' : undefined, variations: variationList(raw.variations), assignedVariationId: raw.variationId ? String(raw.variationId) : undefined, source: ['runtime-api'], raw: raw })).filter((item) => item.id);
  },
  install(helpers) {
    helpers.wrapQueue('pagesense', 'pagesense', (args) => String((args[0] as any)?.[0] || 'pagesense.push'), (args) => /event|goal|conversion/i.test(String((args[0] as any)?.[0] ?? '')) ? 'custom' : 'lifecycle');
  }
};
