import type { PageAdapter } from '../core/hooks/runtime';
import { detection, normalizedExperiment } from '../core/hooks/runtime';
function instance() { const value = (window as any).posthog; return typeof value?.capture === 'function' && typeof value?.featureFlags?.getFlagVariants === 'function' ? value : undefined; }
function flag(key: string, value: unknown, evaluated = false) {
  return normalizedExperiment({ platform: 'posthog', id: key, name: key, kind: 'feature-flag', status: evaluated ? 'running-in' : 'unknown', statusReason: evaluated ? 'Observed the site reading this feature flag. A flag value does not establish that an experiment exists or a change rendered.' : 'Loaded flag value; use on the current page is unconfirmed. Experiment metadata is not exposed by this API.', variations: typeof value === 'string' || typeof value === 'boolean' ? [{ id: String(value), name: String(value), raw: value }] : [], assignedVariationId: evaluated && (typeof value === 'string' || typeof value === 'boolean') ? String(value) : undefined, evaluatedValue: value, raw: { flagKey: key, value } });
}
export const posthogAdapter: PageAdapter = {
  id: 'posthog', displayName: 'PostHog', category: 'experimentation',
  detect() {
    if (instance()) return detection('active', ['PostHog runtime with feature flag read API']);
    if ([...document.scripts].some(script => { try { return new URL(script.src).hostname.endsWith('.posthog.com'); } catch { return false; } })) return detection('loading', ['PostHog script; flags may not be exposed'], 0.7);
    return detection('blocked', [], 0);
  },
  listExperiments() { const ph = instance(); return ph ? Object.entries(ph.featureFlags.getFlagVariants() || {}).map(([key, value]) => flag(key, value)) : []; },
  install(helpers) {
    const seen = new WeakSet<object>();
    const attach = () => {
      const ph = instance(); if (!ph || seen.has(ph)) return; seen.add(ph);
      helpers.wrapMethod(ph, 'capture', 'posthog', args => String(args[0]), args => { const name = String(args[0] ?? ''); return name === '$pageview' ? 'pageview' : name === '$feature_flag_called' ? 'decision' : name.startsWith('$') ? 'lifecycle' : 'custom'; });
      // getFlagVariants reads cached values without emitting $feature_flag_called.
      for (const method of ['getFeatureFlag', 'isFeatureEnabled']) helpers.wrapMethod(ph, method, 'posthog', args => `${method}: ${args[0]}`, 'decision', (args, result) => {
        if (typeof args[0] === 'string' && result !== undefined) {
          const value = ph.featureFlags.getFlagVariants()?.[args[0]];
          helpers.addExperiment(flag(args[0], value === undefined ? result : value, true));
        }
      });
      if (typeof ph.onFeatureFlags === 'function') { const remove = ph.onFeatureFlags((_keys: unknown, variants: unknown, context: any) => { helpers.invalidate('posthog'); helpers.emit({ platform: 'posthog', category: context?.errorsLoading ? 'error' : 'lifecycle', name: 'Feature flags loaded', properties: { variants, context }, via: 'listener' }); }); if (typeof remove === 'function') helpers.addCleanup(remove); }
    };
    const safeAttach = () => { try { attach(); } catch {} }; safeAttach(); const timer = setInterval(safeAttach, 500); helpers.addCleanup(() => clearInterval(timer));
  }
};
