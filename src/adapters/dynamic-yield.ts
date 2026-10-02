import { activityKind } from '../core/activity-kind';
import type { PageAdapter } from '../core/hooks/runtime';
import { asArray, detection, normalizedExperiment, variationList } from '../core/hooks/runtime';
import { sanitize } from '../core/sanitize';

export const dynamicYieldAdapter: PageAdapter = {
  id: 'dynamic-yield', displayName: 'Dynamic Yield', category: 'experimentation',
  detect() {
    const win = window as any;
    if (win.DY || win.DYO) return detection('active', [win.DY ? 'window.DY' : 'window.DYO'], 0.96);
    if (document.querySelector('script[src*="dynamicyield.com"]')) return detection('loading', ['Dynamic Yield script'], 0.74);
    return detection('blocked', [], 0);
  },
  listExperiments() {
    const win = window as any;
    const dyo = win.DYO;
    let rawList: any[] = [];
    try { rawList = asArray(dyo?.getRenderedObjectsOnPage?.() || dyo?.getUserObjectsAndVariations?.()); } catch {}
    return rawList.map((raw, index) => {
      const experimentId = raw?.campaignId ?? raw?.id ?? raw?.experienceId ?? index;
      const variant = raw?.variation || raw?.variationObject || raw;
      return normalizedExperiment({ platform: 'dynamic-yield', id: String(experimentId), name: raw?.campaignName || raw?.name || `Experience ${experimentId}`, kind: activityKind('dynamic-yield', raw), status: typeof dyo?.getRenderedObjectsOnPage === 'function' ? 'running-in' : 'unknown', variations: variationList(raw?.variations || [variant]), assignedVariationId: String(variant?.variationId ?? variant?.id ?? ''), source: ['runtime-api'], raw: sanitize(raw) });
    });
  },
  install(helpers) {
    helpers.wrapQueue('DY', 'dynamic-yield', (args) => String((args[0] as any)?.name || (args[0] as any)?.event || 'DY queue call'));
    helpers.wrapMethod(() => (window as any).DY, 'API', 'dynamic-yield', (args) => String((args[0] as any)?.name || (args[1] as any)?.name || args[0] || 'DY.API'));
  }
};
