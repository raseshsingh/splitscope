import { activityKind } from '../core/activity-kind';
import type { PageAdapter } from '../core/hooks/runtime';
import { asArray, detection, mapSafely, normalizedExperiment, variationList } from '../core/hooks/runtime';
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
    // Rendered objects are what applied on this page; the user allocation list is site wide.
    let rawList: any[] = []; let source: 'rendered' | 'allocation' = 'rendered';
    try { rawList = asArray(dyo?.getRenderedObjectsOnPage?.()); } catch {}
    if (!rawList.length) { try { rawList = asArray(dyo?.getUserObjectsAndVariations?.()); source = 'allocation'; } catch {} }
    return mapSafely(rawList, (raw) => {
      const experimentId = raw?.campaignId ?? raw?.id ?? raw?.experienceId;
      if (experimentId == null || experimentId === '') return undefined;
      const variant = raw?.variation || raw?.variationObject || raw;
      return normalizedExperiment({ platform: 'dynamic-yield', id: String(experimentId), name: raw?.campaignName || raw?.name || `Experience ${experimentId}`, kind: activityKind('dynamic-yield', raw), status: source === 'rendered' ? 'running-in' : 'bucketed-elsewhere', statusReason: source === 'rendered' ? undefined : 'Allocated to this visitor across the site; not reported as rendered on this page.', variations: variationList(raw?.variations || [variant]), assignedVariationId: (variant?.variationId ?? variant?.id) == null ? undefined : String(variant?.variationId ?? variant?.id), source: ['runtime-api'], raw: raw });
    });
  },
  install(helpers) {
    helpers.wrapQueue('DY', 'dynamic-yield', (args) => String((args[0] as any)?.name || (args[0] as any)?.event || 'DY queue call'), 'lifecycle');
    // DY.API('event', { name }) reports a custom event; DY.API('context', ...) describes the page.
    helpers.wrapMethod(() => (window as any).DY, 'API', 'dynamic-yield', (args) => String((args[1] as any)?.name || (args[0] as any)?.name || args[0] || 'DY.API'), (args) => args[0] === 'event' ? 'custom' : args[0] === 'context' ? 'pageview' : 'lifecycle');
  }
};
