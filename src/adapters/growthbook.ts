import type { PageAdapter } from '../core/hooks/runtime';
import { detection, normalizedExperiment, variationChanges } from '../core/hooks/runtime';
import type { NormalizedExperiment } from '../core/model';
function instance(): any {
  const win = window as any;
  return [win._growthbook, win.growthbook].find(value => typeof value?.getFeatures === 'function' && typeof value?.getAllResults === 'function');
}
function experiment(exp: any, result?: any, current = false): NormalizedExperiment {
  return normalizedExperiment({ platform: 'growthbook', id: String(exp.key), name: exp.name || String(exp.key), kind: exp.urlPatterns && exp.variations?.some((v: any) => v?.url) ? 'split-url' : 'ab',
    status: current ? result?.inExperiment === true ? 'running-in' : 'not-targeted' : result?.inExperiment === true ? 'bucketed-elsewhere' : 'unknown',
    statusReason: current ? 'Observed an SDK evaluation on this page. It does not confirm rendering or delivery of an exposure.' : 'Loaded configuration or a previous SDK result; current-page evaluation is unconfirmed.',
    assignedVariationId: result?.inExperiment === true && result?.variationId != null ? String(exp.meta?.[result.variationId]?.key ?? result.variationId) : undefined,
    variations: (Array.isArray(exp.variations) ? exp.variations : []).map((value: any, index: number) => ({ id: String(exp.meta?.[index]?.key ?? index), name: exp.meta?.[index]?.name || exp.meta?.[index]?.key || `Variation ${index + 1}`, weight: typeof exp.weights?.[index] === 'number' ? exp.weights[index] * 100 : undefined, changes: variationChanges(value), raw: value })),
    trafficAllocation: typeof exp.coverage === 'number' ? exp.coverage * 100 : undefined,
    targeting: exp.condition ? { conditions: [JSON.stringify(exp.condition)] } : undefined,
    evidence: current ? { state: result?.inExperiment ? 'assigned' : 'detected', observedAt: Date.now(), pageUrl: location.href } : undefined,
    raw: { experiment: exp, result }
  });
}
export const growthbookAdapter: PageAdapter = {
  id: 'growthbook', displayName: 'GrowthBook', category: 'experimentation',
  detect() {
    if (instance()) return detection('active', ['Exposed GrowthBook instance with read APIs']);
    if ([...document.scripts].some(script => /(^|\.)growthbook\.io$/.test((() => { try { return new URL(script.src).hostname; } catch { return ''; } })()))) return detection('loading', ['GrowthBook script; SDK instance may be private'], 0.7);
    return detection('blocked', [], 0);
  },
  listExperiments() {
    const gb = instance(); if (!gb) return [];
    const output = new Map<string, NormalizedExperiment>();
    for (const exp of gb.getExperiments?.() || []) if (exp?.key) output.set(String(exp.key), experiment(exp));
    const results = gb.getAllResults();
    if (results instanceof Map) for (const entry of results.values()) if (entry?.experiment?.key) output.set(String(entry.experiment.key), experiment(entry.experiment, entry.result));
    for (const [key, definition] of Object.entries(gb.getFeatures() || {})) output.set(`flag:${key}`, normalizedExperiment({ platform: 'growthbook', id: `flag:${key}`, name: key, kind: 'feature-flag', status: 'unknown', statusReason: 'Feature definition loaded. Splitscope does not evaluate it or trigger an exposure.', raw: { featureKey: key, definition } }));
    return [...output.values()];
  },
  install(helpers) {
    const seen = new WeakSet<object>();
    // subscribe() and the wrapped run() both report the same evaluation; emit it once, named like the call so the call row absorbs it.
    const recent = new Map<string, number>();
    const observe = (exp: any, result: any) => { if (!exp?.key) return; helpers.addExperiment(experiment(exp, result, true)); const key = `${exp.key}:${result?.inExperiment}:${result?.variationId}`, now = Date.now(); if (now - (recent.get(key) || 0) < 1000) return; recent.set(key, now); if (recent.size > 200) recent.clear(); helpers.emit({ platform: 'growthbook', category: 'decision', name: `Experiment evaluation: ${String(exp.key)}`, experimentId: String(exp.key), variationId: result?.inExperiment ? String(exp.meta?.[result.variationId]?.key ?? result.variationId) : undefined, properties: { experiment: exp, result }, via: 'listener' }); };
    const attach = () => {
      const gb = instance(); if (!gb || seen.has(gb)) return; seen.add(gb);
      if (typeof gb.subscribe === 'function') { const remove = gb.subscribe(observe); if (typeof remove === 'function') helpers.addCleanup(remove); }
      helpers.wrapMethod(gb, 'evalFeature', 'growthbook', args => `evalFeature: ${args[0]}`, 'decision', (args, value: any) => {
        if (value?.experiment) observe(value.experiment, value.experimentResult);
        helpers.addExperiment(normalizedExperiment({ platform: 'growthbook', id: `flag:${args[0]}`, name: String(args[0]), kind: 'feature-flag', status: 'running-in', statusReason: 'Observed the site evaluating this feature. A flag is not necessarily an experiment.', evaluatedValue: value?.value, variations: [], raw: value }));
      });
      helpers.wrapMethod(gb, 'run', 'growthbook', args => `Experiment evaluation: ${String((args[0] as any)?.key ?? '')}`, 'decision', (args, result) => observe(args[0], result));
      helpers.wrapMethod(gb, 'logEvent', 'growthbook', args => String(args[0]), 'custom');
    };
    helpers.poll(attach);
  }
};
