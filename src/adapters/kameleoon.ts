import type { AnyRecord, PageAdapter } from '../core/hooks/runtime';
import { asArray, detection, mapSafely, normalizedExperiment, variationList, variationChanges } from '../core/hooks/runtime';
import { sanitize } from '../core/sanitize';

function readCollection(kind: 'Experiments' | 'Personalizations'): any[] {
  const api = (window as any).Kameleoon?.API?.[kind];
  try { const data = api?.getAll?.() ?? api?.getActive?.(); return Array.isArray(data) ? data : Object.entries(data || {}).map(([id, value]) => ({ id, ...(value as object) })); } catch { return []; }
}

function kapi(): AnyRecord {
  const api = (window as any).Kameleoon?.API;
  if (!api) throw new Error('Kameleoon is not available on this page.');
  return api;
}
function attempt<T>(fn: () => T, fallback: T): T { try { const value = fn(); return value === undefined ? fallback : value; } catch { return fallback; } }
function plain(value: unknown): unknown {
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}
function namedList(value: unknown): Array<{ id: string; name: string }> {
  return (Array.isArray(value) ? value : []).slice(0, 300).map((item: any) => ({ id: String(item?.id ?? ''), name: String(item?.name ?? item?.id ?? '') })).filter(item => item.id);
}
function dataList(source: unknown, scope: string) {
  const entries = source && typeof source === 'object' ? Object.entries(source as AnyRecord) : [];
  return entries.slice(0, 200).map(([name, value]) => ({ name, scope, value: plain(value) }));
}
/** Read the visitor without changing anything. Names follow the Kameleoon Activation API and are read defensively. */
function readVisitor(api: AnyRecord) {
  const visitor: AnyRecord = attempt(() => api.Visitor, {});
  const visit: AnyRecord = attempt(() => visitor.currentVisit ?? api.CurrentVisit, {}) || {};
  const configuration: AnyRecord = attempt(() => api.Core?.getConfiguration?.(), {}) || {};
  let code = attempt(() => visitor.code, undefined);
  if (!code) { const match = document.cookie.match(/(?:^|;\s*)kameleoonVisitorCode=([^;]+)/); code = match ? decodeURIComponent(match[1]!) : undefined; }
  const conversions = visit.conversions && typeof visit.conversions === 'object' ? Object.entries(visit.conversions as AnyRecord).slice(0, 100).map(([goalId, value]: [string, any]) => ({ goalId, count: Number(value?.count) || 0, revenue: Number(value?.revenue) || 0 })) : [];
  return {
    code: code == null ? undefined : String(code),
    siteCode: configuration.siteCode == null ? undefined : String(configuration.siteCode),
    singlePageSupport: configuration.singlePageSupport === true,
    numberOfVisits: Number(visitor.numberOfVisits) || undefined,
    firstVisitStartDate: Number(visitor.firstVisitStartDate) || undefined,
    experimentConsent: visitor.experimentLegalConsent ?? null,
    personalizationConsent: visitor.personalizationLegalConsent ?? null,
    customData: [...dataList(visitor.customData, 'visitor'), ...dataList(visit.customData, 'visit or page')],
    visit: { index: visit.index, pageViews: Number(visit.pageViews) || undefined, duration: Number(visit.duration) || undefined, device: plain(visit.device), acquisitionChannel: plain(visit.acquisitionChannel), landingPageURL: visit.landingPageURL == null ? undefined : String(visit.landingPageURL), conversions },
    goals: (Array.isArray(configuration.goals) ? configuration.goals : []).slice(0, 300).map((goal: any) => ({ id: String(goal?.id ?? goal?.name ?? ''), name: String(goal?.name ?? goal?.id ?? '') })).filter((goal: any) => goal.id),
    segments: namedList(attempt(() => api.Segments?.getAll?.(), [])),
    triggers: namedList(attempt(() => api.Triggers?.getAll?.(), []))
  };
}
function describe(kind: 'experiment' | 'personalization', item: AnyRecord) {
  return { kind, id: String(item.id ?? ''), name: String(item.name ?? item.id ?? ''), active: item.active === true, triggered: item.triggered === true, activatedInVisit: item.activatedInVisit === true, variation: item.associatedVariation ? { id: String(item.associatedVariation.id ?? ''), name: String(item.associatedVariation.name ?? item.associatedVariation.id ?? '') } : undefined, reason: item.nonExpositionReason == null ? undefined : String(item.nonExpositionReason), redirected: item.redirectProcessed === true };
}
/** Experiment.goals and mainGoal are Goal objects ({ id, name, type }) in the Activation API. */
function activityGoals(value: AnyRecord): Array<{ id: string; name: string }> | undefined {
  const list = [value?.mainGoal, ...(Array.isArray(value?.goals) ? value.goals : [])].filter(Boolean);
  const seen = new Set<string>();
  const goals = list.map((goal: any) => typeof goal === 'object' ? { id: String(goal.id ?? goal.name ?? ''), name: String(goal.name ?? goal.id ?? '') } : { id: String(goal), name: String(goal) })
    .filter(goal => goal.id && !seen.has(goal.id) && (seen.add(goal.id), true));
  return goals.length ? goals.slice(0, 100) : undefined;
}
type CapturedCategory = import('../core/model').CapturedEvent['category'];
const numericId = (value: unknown, label: string) => { const id = Number(value); if (!Number.isInteger(id) || id < 0) throw new Error(`${label} must be a number.`); return id; };

export const kameleoonAdapter: PageAdapter = {
  id: 'kameleoon', displayName: 'Kameleoon', category: 'experimentation',
  detect() {
    const api = (window as any).Kameleoon?.API;
    if (api) return detection('active', ['window.Kameleoon.API'], 1);
    if (document.querySelector('script[src*="kameleoon"]')) return detection('loading', ['Kameleoon engine script'], 0.72);
    return detection('blocked', [], 0);
  },
  listExperiments() {
    const entries = [
      ...readCollection('Experiments').map((value) => ({ value, kind: 'ab' as const })),
      ...readCollection('Personalizations').map((value) => ({ value, kind: 'personalization' as const }))
    ];
    // Read once per scan, not once per activity.
    const activeIds = (kind: 'Experiments' | 'Personalizations'): Set<string> | null => {
      try { const api = (window as any).Kameleoon?.API?.[kind]; return typeof api?.getActive === 'function' ? new Set(asArray(api.getActive()).map((item: any) => String(item?.id ?? item?.experimentId))) : null; } catch { return null; }
    };
    const active = { ab: activeIds('Experiments'), personalization: activeIds('Personalizations') };
    // The public API returns names/IDs only. Read optional loaded definitions without executing them.
    const definitions = asArray((window as any).Kameleoon?.Internals?.runtime?.variations);
    return mapSafely(entries.filter(({ value }) => value && typeof value === 'object'), ({ value, kind }) => {
      const variations = variationList(value.variations, { weights: value.trafficDeviation || value.deviations || value.trafficAllocation });
      for (const variation of variations) {
        const definition = definitions.find((item: any) => String(item.id) === variation.id && (item.actionId != null ? String(item.actionId) === String(value.id ?? value.experimentId) : variation.id !== '0'));
        if (definition) {
          variation.changes = variationChanges(definition) || variation.changes;
          variation.raw = { api: variation.raw, loadedDefinition: sanitize(definition) };
        }
      }
      const assignedId = value.associatedVariation?.id ?? value.associatedVariationId;
      const activeSet = active[kind];
      const isActive = activeSet ? activeSet.has(String(value.id ?? value.experimentId)) : value.isActive === true || value.active === true;
      const reason = value.nonExpositionReason == null || value.nonExpositionReason === '' ? '' : String(value.nonExpositionReason);
      // Documented Experiment fields: triggered, activatedInVisit, nonExpositionReason.
      const status = isActive ? 'running-in'
        : reason && /hold.?back|exclu|realloc|traffic|deviation|sample/i.test(reason) ? 'running-excluded'
        : reason ? 'not-targeted'
        : value.activatedInVisit === true || assignedId != null ? 'bucketed-elsewhere'
        : value.triggered === false ? 'not-on-page'
        : 'unknown';
      return normalizedExperiment({
        platform: 'kameleoon', id: String(value.id ?? value.experimentId ?? value.key ?? ''), name: value.name || `Experiment ${value.id}`,
        kind, status,
        statusReason: !isActive && reason ? `Kameleoon reports why this visitor is not exposed: ${reason}.` : status === 'not-on-page' ? 'Kameleoon has not triggered this activity on this page.' : status === 'bucketed-elsewhere' && value.activatedInVisit === true ? 'Activated earlier in this visit, not on this page.' : undefined,
        variations: variations.map(variation => ({ ...variation, isControl: variation.isControl || variation.id === '0' })), assignedVariationId: assignedId != null ? String(assignedId) : undefined,
        trafficAllocation: typeof value.trafficAllocation === 'number' ? value.trafficAllocation : undefined, targeting: { urls: asArray(value.targeting?.urls).map(String) },
        goals: activityGoals(value), source: variations.some(v => v.changes?.length) ? ['runtime-api', 'snippet-data'] : ['runtime-api'], raw: value
      });
    }).filter((experiment) => experiment.id);
  },
  actions: {
    visitor() { return readVisitor(kapi()); },
    experiments() {
      const api = kapi();
      return [...readCollection('Experiments').map(item => describe('experiment', item)), ...readCollection('Personalizations').map(item => describe('personalization', item))].filter(item => item.id).slice(0, 300);
    },
    setCustomData(args) {
      const api = kapi(); const name = String(args.name ?? '').trim();
      if (!name || name.length > 200) throw new Error('Enter the custom data name or index.');
      const value = args.valueType === 'number' ? Number(args.value) : args.valueType === 'boolean' ? String(args.value).toLowerCase() === 'true' : String(args.value ?? '');
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('That is not a number.');
      api.Data.setCustomData(/^\d+$/.test(name) ? Number(name) : name, value, args.overwrite !== false);
      return readVisitor(api);
    },
    resetCustomData(args) {
      const api = kapi(); const name = String(args.name ?? '').trim();
      if (!name) throw new Error('Choose the custom data to reset.');
      api.Data.resetCustomData(name);
      return readVisitor(api);
    },
    processConversion(args) {
      const api = kapi(); const goal = String(args.goal ?? '').trim();
      if (!goal) throw new Error('Choose a goal.');
      const revenue = args.revenue === undefined || args.revenue === '' ? undefined : Number(args.revenue);
      if (revenue !== undefined && !Number.isFinite(revenue)) throw new Error('Revenue must be a number.');
      api.Goals.processConversion(/^\d+$/.test(goal) ? Number(goal) : goal, revenue);
      return readVisitor(api);
    },
    setConsent(args) {
      const api = kapi(); const module = ['AB_TESTING', 'PERSONALIZATION', 'BOTH'].includes(String(args.module)) ? String(args.module) : 'BOTH';
      if (args.enabled === true) api.Core.enableLegalConsent(module); else api.Core.disableLegalConsent(module);
      return readVisitor(api);
    },
    block(args) {
      const api = kapi(); const id = numericId(args.id, 'The experiment ID');
      if (args.kind === 'personalization') api.Personalizations.disable(id); else api.Experiments.block(id, args.visit === true);
      return { ok: true };
    },
    reevaluateSegment(args) {
      const api = kapi(); api.Segments.reevaluate(numericId(args.id, 'The segment ID'));
      return readVisitor(api);
    }
  },
  install(helpers) {
    // Event names and detail fields follow the Kameleoon Activation API events reference.
    const ref = (value: any) => value == null ? undefined : typeof value === 'object' ? (value.id == null ? undefined : String(value.id)) : String(value);
    const events: Record<string, CapturedCategory> = {
      'Kameleoon::Loaded': 'lifecycle', 'Kameleoon::Aborted': 'error', 'Kameleoon::Started': 'lifecycle', 'Kameleoon::DataGathered': 'lifecycle',
      'Kameleoon::ExperimentTriggered': 'activation', 'Kameleoon::ExperimentActivated': 'activation', 'Kameleoon::PersonalizationTriggered': 'activation', 'Kameleoon::PersonalizationActivated': 'activation',
      'Kameleoon::ConversionTriggered': 'goal', 'Kameleoon::CustomDataSet': 'identity', 'Kameleoon::SegmentTriggered': 'decision', 'Kameleoon::LegalConsentUpdated': 'consent'
    };
    for (const [type, category] of Object.entries(events)) {
      helpers.listen(type, (event) => {
        const detail = (event as CustomEvent).detail;
        const owner = detail?.experiment ?? detail?.personalization;
        const goal = type === 'Kameleoon::ConversionTriggered' ? detail?.goal : undefined;
        const name = goal ? `Conversion: ${String(goal.name ?? goal.id ?? 'goal')}` : type === 'Kameleoon::CustomDataSet' && detail?.name != null ? `Custom data set: ${String(detail.name)}` : type;
        helpers.emit({ platform: 'kameleoon', category, name, via: 'dom-event', experimentId: ref(owner), variationId: ref(owner?.associatedVariation), properties: { type, goalId: goal ? ref(goal) : undefined, goalName: goal?.name == null ? undefined : String(goal.name), detail: sanitize(detail) } });
      });
    }
    // Command queue: array form ['Kameleoon.API.Goals.processConversion', 'GOAL_ID'] or object form { level, command }.
    const queueName = (args: unknown[]) => {
      const item = args[0] as any;
      if (Array.isArray(item)) {
        const method = String(item[0] ?? '').replace(/^Kameleoon\.API\./, '');
        return method === 'Goals.processConversion' ? `Conversion: ${String(item[1] ?? '')}` : `Queued: ${method || 'command'}`;
      }
      return typeof item === 'function' || typeof item?.command === 'function' ? 'Queued command' : 'kameleoonQueue.push';
    };
    const queueCategory = (args: unknown[]) => { const item = args[0] as any; return Array.isArray(item) && /Goals\.processConversion$/.test(String(item[0] ?? '')) ? 'goal' as const : 'lifecycle' as const; };
    helpers.wrapQueue('kameleoonQueue', 'kameleoon', queueName, queueCategory);
    helpers.wrapMethod(() => (window as any).Kameleoon?.API?.Goals, 'processConversion', 'kameleoon', (args) => `Conversion: ${String(args[0] ?? '')}`, (args) => args[1] != null ? 'revenue' : 'goal');
  },
  force(experimentId, variationId, pageUrl) {
    const activity = this.listExperiments().find(item => item.id === experimentId);
    if (activity?.kind === 'personalization') throw new Error('Use a Kameleoon simulation link for personalizations. The Experiments assignment API only supports A/B experiments.');
    if (!/^\d+$/.test(experimentId) || !/^\d+$/.test(variationId)) throw new Error('Kameleoon requires numeric experiment and variation IDs.');
    const url = new URL(pageUrl);
    url.searchParams.set('__splitscope_kameleoon', `${experimentId}:${variationId}`);
    return { method: 'url', url: url.href, tracking: 'counted', explanation: 'Splitscope waits for Kameleoon, overwrites the saved assignment, verifies it, then reloads the page to apply it. The experiment must still be available and eligible on the destination page. This is a visitor assignment, not simulation mode; it may count in reports and share visitor state with other tabs. Splitscope must be enabled in the destination tab.' };
  }
};
