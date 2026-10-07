import { activityKind } from '../core/activity-kind';
import type { PageAdapter } from '../core/hooks/runtime';
import { asArray, detection, normalizedExperiment, variationList, variationChanges } from '../core/hooks/runtime';
import { sanitize } from '../core/sanitize';

export const vwoAdapter: PageAdapter = {
  id: 'vwo', displayName: 'VWO', category: 'experimentation',
  detect() {
    const win = window as any;
    if (win.VWO || win._vwo_exp || win._vwo_code || win._vis_opt_queue) return detection(win.VWO ? 'active' : 'loading', ['VWO runtime global'], win.VWO ? 0.98 : 0.82);
    if (document.querySelector('script[src*="visualwebsiteoptimizer"],script[src*="dev.visualwebsiteoptimizer.com"]')) return detection('loading', ['VWO SmartCode script'], 0.7);
    return detection('blocked', [], 0);
  },
  listExperiments() {
    const win = window as any;
    const configs = win._vwo_exp;
    if (!configs || typeof configs !== 'object') return [];
    const cookies = new Map(document.cookie.split(';').map((part) => part.trim().split('=').map(decodeURIComponent) as [string, string]));
    return Object.entries(configs).map(([id, value]: [string, any]) => {
      const cookie = cookies.get(`_vis_opt_exp_${id}_combi`) || cookies.get(`debug_vis_opt_exp_${id}_combi`);
      const selected = value.combination_chosen ?? cookie;
      const combs = value.combs || value.combinations || {};
      const names = value.comb_n || value.combination_names || {};
      const variants = variationList(combs, { names, changes: (variant) => {
        const payload = variant?.sections?.[0]?.variations || variant?.changes;
        const parsed = typeof payload === 'string' ? (() => { try { return JSON.parse(payload); } catch { return payload; } })() : payload;
        return variationChanges(parsed) || (parsed ? [{ type: 'unknown', label: 'VWO variation changes', data: sanitize(parsed) }] : undefined);
      } });
      const selectedVariation = variants.find((item) => item.id === String(selected));
      const controlId = String(value.control_variation_id ?? 0);
      const traffic = Number(value.pc_traffic);
      const weights = variants.map((variation) => Number((combs as any)[variation.id]?.weight ?? (combs as any)[variation.id]));
      return normalizedExperiment({
        platform: 'vwo', id, name: value.name || `Experiment ${id}`, kind: activityKind('vwo', value),
        status: selectedVariation ? value.combination_chosen != null ? 'running-in' : 'bucketed-elsewhere' : 'unknown',
        statusReason: value.status_reason,
        variations: variants.map((variation, index) => ({ ...variation, isControl: variation.id === controlId, weight: Number.isFinite(weights[index]) ? weights[index] : variation.weight })),
        assignedVariationId: selectedVariation?.id, trafficAllocation: Number.isFinite(traffic) ? traffic : undefined,
        targeting: { urls: [value.url, value.urlRegex].filter(Boolean) }, source: ['snippet-data', ...(cookie ? ['cookie' as const] : [])], raw: value
      });
    });
  },
  install(helpers) {
    helpers.wrapQueue('VWO', 'vwo', (args) => String((args[0] as any)?.[0] || 'VWO.push'), 'custom');
    helpers.wrapQueue('_vis_opt_queue', 'vwo', (args) => String((args[0] as any)?.[0] || '_vis_opt_queue.push'), 'custom');
  },
  force(experimentId, variationId, pageUrl) {
    const url = new URL(pageUrl);
    const config = (window as any)._vwo_exp?.[experimentId];
    if (!config) throw new Error('VWO has not exposed this experiment configuration.');
    url.searchParams.set('__splitscope_vwo', `${experimentId}:${variationId}`);
    return { method: 'url', url: url.href, tracking: 'counted', explanation: 'Splitscope queues VWO setVariation before SmartCode loads. This visit may count in VWO reports. Splitscope must be enabled in the destination tab.' };
  }
};
