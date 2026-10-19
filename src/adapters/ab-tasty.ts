import { activityKind } from '../core/activity-kind';
import type { PageAdapter } from '../core/hooks/runtime';
import { asArray, detection, mapSafely, normalizedExperiment, variationList, variationChanges } from '../core/hooks/runtime';
import { sanitize } from '../core/sanitize';

/** Campaign types from the documented results object: ab, multipage, multivariate, mastersegment, subsegment. */
function abTastyKind(type: unknown, additional: unknown, raw: any) {
  const value = String(type ?? '').toLowerCase();
  if (String(additional ?? '').toLowerCase() === 'redirection') return 'split-url' as const;
  if (value === 'multivariate') return 'mvt' as const;
  if (value === 'mastersegment' || value === 'subsegment') return 'personalization' as const;
  if (value === 'ab' || value === 'multipage') return 'ab' as const;
  return activityKind('ab-tasty', raw);
}

export const abTastyAdapter: PageAdapter = {
  id: 'ab-tasty', displayName: 'AB Tasty', category: 'experimentation',
  detect() {
    const win = window as any;
    if (win.ABTasty || win.abtasty) return detection('active', ['ABTasty tag global'], 1);
    if (document.querySelector('script[src*="abtasty"]')) return detection('loading', ['AB Tasty tag script'], 0.72);
    return detection('blocked', [], 0);
  },
  listExperiments() {
    const ab = (window as any).ABTasty || (window as any).abtasty;
    if (!ab) return [];
    const tests = ab.accountData?.tests || ab.tests || {};
    const results = ab.results || {};
    const history = (() => { try { return ab.getCampaignHistory?.() || {}; } catch { return {}; } })();
    // getTestsOnPage() and results are documented as objects keyed by campaign ID.
    const onPageRaw = (() => { try { return ab.getTestsOnPage?.(); } catch { return undefined; } })();
    const onPageMap: Record<string, any> = onPageRaw && typeof onPageRaw === 'object' && !Array.isArray(onPageRaw) ? onPageRaw : Object.fromEntries(asArray(onPageRaw).map((item: any) => [String(item?.id ?? item), item]));
    const onPage = new Set(Object.keys(onPageMap));
    const ids = new Set([...Object.keys(tests), ...Object.keys(results), ...Object.keys(history), ...onPage]);
    return mapSafely(Array.from(ids), (id) => {
      const raw: any = (tests as any)[id] || (results as any)[id] || {};
      const result: any = (results as any)[id];
      const live: any = onPageMap[id];
      const resultStatus = String(live?.status ?? result?.status ?? '');
      const accepted = onPage.has(id) || /^accepted/.test(resultStatus);
      const stored = (history as any)[id];
      const current = live?.variationID ?? (accepted ? result?.variationID : undefined);
      const assigned = current ?? stored;
      const variations = variationList(raw.variations || raw.variationsList, { weights: raw.traffic, names: raw.variationNames });
      return normalizedExperiment({
        platform: 'ab-tasty', id, name: raw.name || raw.label || live?.name || result?.name || `Campaign ${id}`,
        kind: abTastyKind(result?.type ?? live?.type ?? raw.type, result?.additionalType, raw),
        status: accepted ? 'running-in' : stored != null ? 'bucketed-elsewhere' : resultStatus ? 'not-on-page' : 'unknown',
        statusReason: !accepted && resultStatus ? `AB Tasty reports this campaign as "${resultStatus.replace(/_/g, ' ')}" for this visitor on this page.` : raw.reason || raw.rejectionReason || raw.statusReason,
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
    // Documented tracking calls: ABTastyClickTracking(name, null, campaignId), abtasty.send(hitType, params) and the deprecated _abtasty.push(data).
    const campaign = (value: unknown) => value == null || value === '' ? undefined : { experimentId: String(value) };
    helpers.wrapMethod(() => window as any, 'ABTastyClickTracking', 'ab-tasty', (args) => String(args[0] || 'Action tracking'), 'goal', undefined, (args) => campaign(args[2]));
    helpers.wrapMethod(() => window as any, 'ABTastyEvent', 'ab-tasty', (args) => String(args[0] || 'Action tracking'), 'goal', undefined, (args) => campaign(args[2]));
    const hitName = (args: unknown[]) => {
      const type = String(args[0] ?? 'hit'); const params = (args[1] || {}) as any;
      const label = params.ea ?? params.ec ?? params.tid ?? params.name;
      return label != null ? `${type}: ${String(label)}` : type;
    };
    helpers.wrapMethod(() => (window as any).abtasty, 'send', 'ab-tasty', hitName, (args) => /transaction/i.test(String(args[0])) ? 'revenue' : /pageview|screenview/i.test(String(args[0])) ? 'pageview' : 'custom');
    helpers.wrapQueue('_abtasty', 'ab-tasty', (args) => { const data = args[0] as any; return Array.isArray(data) ? `${String(data[0] ?? 'push')}: ${String(data[1] ?? '')}`.replace(/: $/, '') : '_abtasty.push'; }, (args) => { const data = args[0] as any; return Array.isArray(data) && data[0] === 'transaction' ? 'revenue' : 'custom'; });
  }
};
