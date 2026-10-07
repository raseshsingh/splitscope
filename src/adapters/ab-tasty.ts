import { activityKind } from '../core/activity-kind';
import type { PageAdapter } from '../core/hooks/runtime';
import { asArray, detection, normalizedExperiment, variationList, variationChanges } from '../core/hooks/runtime';
import { sanitize } from '../core/sanitize';

export const abTastyAdapter: PageAdapter = {
  id: 'ab-tasty', displayName: 'AB Tasty', category: 'experimentation',
  detect() {
    const win = window as any;
    if (win.ABTasty || win.abtasty) return detection('active', ['ABTasty tag global'], 1);
    if (document.querySelector('script[src*="abtasty"]')) return detection('loading', ['AB Tasty tag script'], 0.72);
    return detection('blocked', [], 0);
  },
  listExperiments() {
    const ab = (window as any).ABTasty;
    if (!ab) return [];
    const tests = ab.accountData?.tests || ab.tests || {};
    const results = ab.results || {};
    const history = (() => { try { return ab.getCampaignHistory?.() || {}; } catch { return {}; } })();
    const onPage = new Set(asArray(ab.getTestsOnPage?.()).map((item: any) => String(item.id ?? item)));
    const ids = new Set([...Object.keys(tests), ...Object.keys(results), ...Object.keys(history)]);
    return Array.from(ids).map((id) => {
      const raw: any = (tests as any)[id] || (results as any)[id] || {};
      const assigned = (history as any)[id];
      const variations = variationList(raw.variations || raw.variationsList, { weights: raw.traffic, names: raw.variationNames });
      return normalizedExperiment({
        platform: 'ab-tasty', id, name: raw.name || raw.label || `Campaign ${id}`,
        kind: activityKind('ab-tasty', raw),
        status: onPage.has(id) ? 'running-in' : assigned != null ? 'bucketed-elsewhere' : 'unknown',
        statusReason: raw.reason || raw.rejectionReason || raw.statusReason,
        variations, assignedVariationId: assigned == null ? undefined : String(assigned),
        trafficAllocation: raw.trafficAllocation ?? raw.traffic,
        changes: variationChanges(raw), source: ['runtime-api'], raw: { test: sanitize(raw), result: sanitize((results as any)[id]), assignment: assigned }
      });
    });
  },
  install(helpers) {
    helpers.listen('abtasty_executedCampaign', (event) => {
      const detail = (event as CustomEvent).detail;
      helpers.emit({ platform: 'ab-tasty', category: 'activation', name: 'executedCampaign', via: 'dom-event', experimentId: String(detail?.campaignId ?? ''), variationId: String(detail?.variationId ?? ''), properties: sanitize(detail) });
    });
    helpers.listen('abtasty_consentValid', () => helpers.emit({ platform: 'ab-tasty', category: 'consent', name: 'consentValid', via: 'dom-event' }));
    helpers.wrapMethod(() => (window as any).ABTasty, 'ClickTracking', 'ab-tasty', (args) => String(args[0] || 'ABTastyClickTracking'), 'goal');
    helpers.wrapMethod(() => (window as any).ABTasty, 'send', (window as any).ABTasty ? 'ab-tasty' : 'ab-tasty', (args) => String(args[0] || 'ABTasty.send'));
    helpers.wrapQueue('_abtasty', 'ab-tasty', (args) => String((args[0] as any)?.[0] || '_abtasty.push'));
  }
};
