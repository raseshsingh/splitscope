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
    helpers.wrapQueue('_conv_q', 'convert', (args) => String((args[0] as any)?.what || (args[0] as any)?.[0] || '_conv_q.push'));
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
