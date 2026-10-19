import { activityKind } from '../core/activity-kind';
import type { PageAdapter } from '../core/hooks/runtime';
import { asArray, detection, mapSafely, normalizedExperiment, variationList, variationChanges } from '../core/hooks/runtime';
import { sanitize } from '../core/sanitize';

export const vwoAdapter: PageAdapter = {
  id: 'vwo', displayName: 'VWO', category: 'experimentation',
  detect() {
    const win = window as any;
    if (win.VWO || win.Wingify || win._vwo_exp || win._vwo_code || win._vis_opt_queue) return detection(win.VWO || win.Wingify ? 'active' : 'loading', [win.Wingify ? 'Wingify (VWO) runtime global' : 'VWO runtime global'], win.VWO || win.Wingify ? 0.98 : 0.82);
    if (document.querySelector('script[src*="visualwebsiteoptimizer"],script[src*="dev.visualwebsiteoptimizer.com"]')) return detection('loading', ['VWO SmartCode script'], 0.7);
    return detection('blocked', [], 0);
  },
  listExperiments() {
    const win = window as any;
    const configs = win._vwo_exp;
    if (!configs || typeof configs !== 'object') return [];
    const cookies = new Map<string, string>();
    for (const part of document.cookie.split(';')) {
      const at = part.indexOf('=');
      if (at < 1) continue;
      const decode = (text: string) => { try { return decodeURIComponent(text); } catch { return text; } };
      cookies.set(decode(part.slice(0, at).trim()), decode(part.slice(at + 1).trim()));
    }
    return mapSafely(Object.entries(configs), ([id, value]: [string, any]) => {
      if (!value || typeof value !== 'object') return undefined;
      const cookie = cookies.get(`_vis_opt_exp_${id}_combi`) || cookies.get(`debug_vis_opt_exp_${id}_combi`);
      const selected = value.combination_chosen ?? cookie;
      const combs = value.combs || value.combinations || {};
      const names = value.comb_n || value.combination_names || {};
      // VWO keeps the code of every combination under sections[sectionId].variations[combinationId].
      const sections = Object.entries(value.sections && typeof value.sections === 'object' ? value.sections : {});
      const variants = variationList(combs, { names, changes: (variant, key) => {
        const payloads: unknown[] = [variant?.changes, ...sections.map(([, section]: [string, any]) => section?.variations?.[key])].filter(item => item != null && item !== '');
        const found = payloads.flatMap((payload, index) => {
          const parsed = typeof payload === 'string' ? (() => { try { const json = JSON.parse(payload); return json && typeof json === 'object' ? json : payload; } catch { return payload; } })() : payload;
          if (typeof parsed === 'string') {
            const text = parsed.trim();
            const type = /^<\s*(?:!|[a-z])/i.test(text) ? 'html' : /^[^{}]*\{[^}]*:[^}]*\}/.test(text) && !/\b(function|var|let|const|=>)\b/.test(text) ? 'css' : 'js';
            return [{ type: type as 'html' | 'css' | 'js', sourcePath: `definition.sections[${index}].variations[${key}]`, code: String(sanitize(text)) }];
          }
          return variationChanges(parsed) || [{ type: 'unknown' as const, label: 'VWO variation changes', data: sanitize(parsed) }];
        });
        return found.length ? found : undefined;
      } });
      const selectedVariation = variants.find((item) => item.id === String(selected));
      const controlId = value.control_variation_id == null ? undefined : String(value.control_variation_id);
      const traffic = Number(value.pc_traffic);
      const weights = variants.map((variation) => Number((combs as any)[variation.id]?.weight ?? (combs as any)[variation.id]));
      return normalizedExperiment({
        platform: 'vwo', id, name: value.name || `Experiment ${id}`, kind: activityKind('vwo', value),
        status: selectedVariation ? value.combination_chosen != null ? 'running-in' : 'bucketed-elsewhere' : 'unknown',
        statusReason: value.status_reason,
        variations: variants.map((variation, index) => ({ ...variation, isControl: variation.isControl || variation.id === controlId, weight: Number.isFinite(weights[index]) ? weights[index] : variation.weight })),
        assignedVariationId: selectedVariation?.id, trafficAllocation: Number.isFinite(traffic) ? traffic : undefined,
        targeting: { urls: [value.url, value.urlRegex].filter(Boolean) }, source: ['snippet-data', ...(cookie ? ['cookie' as const] : [])], raw: value
      });
    });
  },
  install(helpers) {
    // Lifecycle hooks follow the documented onEventReceive API: push(['onEventReceive', code, callback]),
    // where the callback receives [eventName, campaignId, third], third being the variation for vA/vAE and the goal for rC.
    const lifecycle: Record<string, { name: string; category: 'activation' | 'goal' | 'error' | 'decision' }> = { vA: { name: 'Variation applied', category: 'activation' }, vAE: { name: 'Variation could not be applied', category: 'error' }, rC: { name: 'Goal conversion', category: 'goal' }, tNR: { name: 'Test not running', category: 'decision' } };
    const registered = new Set<string>();
    const targets = new WeakSet<object>();
    const register = () => {
      for (const space of ['Wingify', 'VWO']) {
        const target = (window as any)[space];
        if (registered.has(space) || !target || typeof target.push !== 'function') continue;
        registered.add(space);
        // Both names can point at the same object; register once per object.
        if (targets.has(target)) continue;
        targets.add(target);
        for (const [code, info] of Object.entries(lifecycle)) {
          const callback = (data: unknown) => {
            const values = Array.isArray(data) ? data : [];
            const campaignId = values[1] == null ? undefined : String(values[1]);
            const third = values[2] == null ? undefined : String(values[2]);
            helpers.emit({ platform: 'vwo', category: info.category, name: code === 'rC' && third ? `Goal conversion: ${third}` : info.name, via: 'listener', experimentId: campaignId, variationId: code === 'vA' || code === 'vAE' ? third : undefined, properties: { code, goalId: code === 'rC' ? third : undefined, data: sanitize(values) } });
          };
          Object.defineProperty(callback, '__splitscope', { value: true });
          try { target.push(['onEventReceive', code, callback]); } catch {}
        }
      }
    };
    register();
    const timer = window.setInterval(register, 500);
    helpers.addCleanup(() => window.clearInterval(timer));
    const queueName = (space: string) => (args: unknown[]) => { const item = args[0] as any; return Array.isArray(item) ? `${space}.push: ${String(item[0] ?? 'command')}` : typeof item === 'function' ? `${space}.push: function` : `${space}.push`; };
    helpers.wrapQueue('Wingify', 'vwo', queueName('Wingify'), 'lifecycle');
    helpers.wrapQueue('VWO', 'vwo', queueName('VWO'), 'lifecycle');
    helpers.wrapQueue('_vis_opt_queue', 'vwo', queueName('_vis_opt_queue'), 'lifecycle');
    // Documented custom event call: Wingify.event(eventName, attributes).
    for (const space of ['Wingify', 'VWO']) helpers.wrapMethod(() => (window as any)[space], 'event', 'vwo', (args) => String(args[0] ?? 'Custom event'), 'custom');
  },
  force(experimentId, variationId, pageUrl) {
    const url = new URL(pageUrl);
    const config = (window as any)._vwo_exp?.[experimentId];
    if (!config) throw new Error('VWO has not exposed this experiment configuration.');
    url.searchParams.set('__splitscope_vwo', `${experimentId}:${variationId}`);
    return { method: 'url', url: url.href, tracking: 'counted', explanation: 'Splitscope queues VWO setVariation before SmartCode loads. This visit may count in VWO reports. Splitscope must be enabled in the destination tab.' };
  }
};
