import type { PageAdapter } from '../core/hooks/runtime';
import { detection, normalizedExperiment } from '../core/hooks/runtime';
function clients(): any[] {
  const win = window as any;
  return [...new Set([win.statsig, ...(Object.values(win.__STATSIG__?.instances || {}))])].filter((value: any) => typeof value?.getExperiment === 'function' && typeof value?.on === 'function');
}
export const statsigAdapter: PageAdapter = {
  id: 'statsig', displayName: 'Statsig', category: 'experimentation',
  detect() {
    if (clients().length) return detection('active', ['Statsig client registry / exposed client']);
    if ([...document.scripts].some(script => /\/(@statsig\/js-client|statsig-js)(@|\/)/.test(script.src))) return detection('loading', ['Statsig SDK script'], 0.7);
    return detection('blocked', [], 0);
  },
  listExperiments() { return []; },
  install(helpers) {
    const seen = new WeakSet<object>(); let index = 0;
    const attach = () => { for (const client of clients()) {
      if (seen.has(client)) continue; seen.add(client); const instance = ++index;
      function observe(method: string, value: any) {
        if (!value || typeof value.name !== 'string') return;
        const kind = method === 'getExperiment' ? 'ab' : method === 'getFeatureGate' ? 'feature-flag' : method === 'getLayer' ? 'layer' : 'configuration';
        const variant = value.groupName ?? (method === 'getFeatureGate' && typeof value.value === 'boolean' ? String(value.value) : undefined);
        const fallback = /uninitialized|unrecognized|error/i.test(String(value.details?.reason || ''));
        const unallocated = method === 'getExperiment' && value.groupName == null;
        helpers.addExperiment(normalizedExperiment({ platform: 'statsig', id: `${instance}:${method}:${value.name}`, name: value.name, kind, status: fallback ? 'unknown' : unallocated ? 'not-targeted' : 'running-in', statusReason: fallback ? 'SDK returned a fallback or unrecognized evaluation.' : unallocated ? `Statsig evaluated this experiment but did not allocate this user to a group${value.ruleID ? ' (rule ' + String(value.ruleID) + ')' : ''}.` : 'Observed the site reading this SDK value. Layers and configurations are not classified as experiments.', assignedVariationId: variant == null ? undefined : String(variant), variations: variant == null ? [] : [{ id: String(variant), name: String(variant), raw: value.value }], evaluatedValue: value.value, raw: { client: instance, sdkType: method, evaluation: value } }));
      }
      // Read the return values of the site's calls; do not evaluate flags ourselves.
      for (const method of ['getExperiment', 'getFeatureGate', 'getDynamicConfig', 'getLayer']) helpers.wrapMethod(client, method, 'statsig', args => `${method}: ${args[0]}`, 'decision', (_args, value) => observe(method, value));
      const listener = (event: any) => {
        if (event?.name === 'values_updated') helpers.invalidate('statsig');
        if (event?.name === 'log_event_called') helpers.emit({ platform: 'statsig', category: 'custom', name: String(event.event?.eventName || 'Statsig event'), properties: event.event, via: 'listener' });
        else if (['gate_evaluation', 'experiment_evaluation', 'dynamic_config_evaluation', 'layer_evaluation'].includes(event?.name)) {
          const mapping: Record<string, [string, string]> = { gate_evaluation: ['getFeatureGate', 'gate'], experiment_evaluation: ['getExperiment', 'experiment'], dynamic_config_evaluation: ['getDynamicConfig', 'dynamicConfig'], layer_evaluation: ['getLayer', 'layer'] };
          const [method, field] = mapping[event.name]!; observe(method, event[field]);
          helpers.emit({ platform: 'statsig', category: 'decision', name: `${method}: ${String(event[field]?.name ?? '')}`, experimentId: `${instance}:${method}:${event[field]?.name}`, properties: event[field], via: 'listener' });
        }
      };
      client.on('*', listener); helpers.addCleanup(() => client.off?.('*', listener));
    } };
    const safeAttach = () => { try { attach(); } catch {} }; safeAttach(); const timer = setInterval(safeAttach, 500); helpers.addCleanup(() => clearInterval(timer));
  }
};
