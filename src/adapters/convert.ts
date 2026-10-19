import { activityKind } from '../core/activity-kind';
import { convertDashboardContext } from '../core/dashboard-links';
import type { PageAdapter } from '../core/hooks/runtime';
import { detection, mapSafely, normalizedExperiment, variationList } from '../core/hooks/runtime';
import { sanitize } from '../core/sanitize';

export const convertAdapter: PageAdapter = {
  id: 'convert', displayName: 'Convert', category: 'experimentation',
  detect() {
    const win = window as any;
    if (win.convert || win._conv_q) return detection(win.convert ? 'active' : 'loading', ['Convert global or command queue'], 1);
    if (document.querySelector('script[src*="convertexperiments.com"]')) return detection('loading', ['Convert tracking script'], 0.7);
    return detection('blocked', [], 0);
  },
  listExperiments() {
    const convert = (window as any).convert;
    const dashboardContext = convertDashboardContext(Array.from(document.scripts || [], script => script.src));
    const current = convert?.currentData?.experiences || convert?.currentData?.experiments;
    const data = convert?.data?.experiences || convert?.data?.experiments;
    const historical = convert?.historicalData?.experiences || {};
    const entries = Object.fromEntries([...new Set([...Object.keys(historical || {}), ...Object.keys(data || {}), ...Object.keys(current || {})])].map(id => [id, { ...(historical?.[id] || {}), ...(data?.[id] || {}), ...(current?.[id] || {}) }]));
    return mapSafely(Object.entries(entries), ([id, value]: [string, any]) => {
      const assigned = value?.variation || value?.currentVariation;
      const variations = variationList(value?.variations || value?.variationList);
      return normalizedExperiment({
        platform: 'convert', id: String(value?.id ?? id), name: value?.name || value?.key || `Experience ${id}`,
        kind: activityKind('convert', value), status: current?.[id] ? 'running-in' : assigned ? 'bucketed-elsewhere' : 'unknown',
        variations, assignedVariationId: assigned?.id == null ? undefined : String(assigned.id), trafficAllocation: value?.traffic_allocation,
        dashboardContext, source: ['runtime-api', 'snippet-data'], raw: value
      });
    });
  },
  install(helpers) {
    // Documented lifecycle listeners: _conv_q.push({ what: 'addListener', params: { event, handler } }).
    const listeners: Record<string, 'decision' | 'activation' | 'goal'> = { 'experience.variation_decided': 'decision', 'experience.activated': 'activation', 'goal.triggered': 'goal' };
    let listening = false;
    const register = (queue: any) => {
      if (listening || !queue || typeof queue.push !== 'function') return;
      listening = true;
      for (const [eventName, category] of Object.entries(listeners)) {
        const handler = (event: any) => {
          const data = event?.data ?? event ?? {};
          const experience = data.experience_name ?? data.experience_id;
          const name = eventName === 'goal.triggered' ? `Goal triggered: ${String(data.goal_id ?? '')}` : eventName === 'experience.activated' ? `Experience activated: ${String(experience ?? '')}` : `Variation decided: ${String(experience ?? '')}`;
          helpers.emit({ platform: 'convert', category, name, via: 'listener', experimentId: data.experience_id == null ? undefined : String(data.experience_id), variationId: data.variation_id == null ? undefined : String(data.variation_id), properties: { event: eventName, goalId: data.goal_id == null ? undefined : String(data.goal_id), data: sanitize(data) } });
        };
        Object.defineProperty(handler, '__splitscope', { value: true });
        try { queue.push({ what: 'addListener', params: { event: eventName, handler } }); } catch {}
      }
    };
    helpers.onGlobal('_conv_q', register);
    // The trap above attaches the moment the site assigns the global; this poll only covers sites
    // where the global cannot be trapped, and stops once registered or after 30 seconds.
    const startedAt = performance.now();
    const timer = window.setInterval(() => { register((window as any)._conv_q); if (listening || performance.now() - startedAt > 30000) window.clearInterval(timer); }, 500);
    helpers.addCleanup(() => window.clearInterval(timer));
    // Documented conversion command: _conv_q.push(['triggerConversion', goalId]).
    helpers.wrapQueue('_conv_q', 'convert', (args) => { const item = args[0] as any; if (Array.isArray(item)) return item[0] === 'triggerConversion' ? `Conversion: ${String(item[1] ?? '')}` : `_conv_q: ${String(typeof item[0] === 'function' ? 'function' : item[0] ?? 'command')}`; return item?.what ? `_conv_q: ${String(item.what)}` : '_conv_q.push'; }, (args) => { const item = args[0] as any; return Array.isArray(item) && item[0] === 'triggerConversion' ? 'goal' : 'lifecycle'; });
    helpers.wrapQueue('convert', 'convert', (args) => String((args[0] as any)?.what || 'convert.push'));
    helpers.wrapMethod(() => (window as any).convert, 'triggerConversion', 'convert', () => 'triggerConversion', 'goal');
    helpers.wrapMethod(() => (window as any).convert, 'triggerConversions', 'convert', () => 'triggerConversions', 'goal');
    helpers.wrapMethod(() => (window as any).convert, 'sendRevenue', 'convert', () => 'sendRevenue', 'revenue');
  },
  force(experimentId, variationId, pageUrl) {
    const url = new URL(pageUrl);
    url.searchParams.delete('_conv_eforce');
    url.searchParams.set('convert_action', 'convert_vpreview');
    url.searchParams.set('convert_e', experimentId);
    url.searchParams.set('convert_v', variationId);
    return { method: 'url', url: url.href, tracking: 'disabled', explanation: 'Convert preview mode requests this variation without reporting the visit. The project must be installed on this site and the page must be included in the experience location.' };
  }
};
