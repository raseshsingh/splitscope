import { mergeChanges } from '../core/changes';
import type { NormalizedExperiment, NormalizedVariation } from '../core/model';
import type { PageAdapter } from '../core/hooks/runtime';
import { asArray, detection, mapSafely, normalizedExperiment, variationList, variationChanges } from '../core/hooks/runtime';
import { sanitize } from '../core/sanitize';

type AnyRecord = Record<string, any>;
type IndexedExperiment = { raw: AnyRecord; campaign?: AnyRecord; campaignId?: string };

// The Web data object is static for a published snippet revision and is documented as
// relatively expensive to read. Reuse it across the adapter's short-interval page scans.
let cachedData: AnyRecord | null = null;
let cachedOwner: AnyRecord | null = null;

function getData(opt: AnyRecord): AnyRecord | null {
  if (cachedOwner !== opt) { cachedOwner = opt; cachedData = null; }
  if (cachedData) return cachedData;
  try {
    const data = typeof opt.get === 'function' ? opt.get('data') : opt.data;
    if (data && typeof data === 'object') cachedData = data;
  } catch {}
  return cachedData;
}

function entries(value: unknown): Array<[string, AnyRecord]> {
  if (Array.isArray(value)) return value.map((item, index) => [String(item?.id ?? index), item]);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as AnyRecord).filter((entry): entry is [string, AnyRecord] => Boolean(entry[1] && typeof entry[1] === 'object'));
}

function indexExperiments(data: AnyRecord): Map<string, IndexedExperiment> {
  const index = new Map<string, IndexedExperiment>();
  for (const [key, raw] of entries(data.experiments)) {
    const id = String(raw.id ?? key);
    index.set(id, { raw });
  }
  // Personalization experiences are nested inside campaigns in Optimizely Web data.
  const campaigns = new Map([...entries(data.campaign), ...entries(data.campaigns)]);
  for (const [campaignKey, campaign] of campaigns) {
    const campaignId = String(campaign.id ?? campaignKey);
    for (const reference of asArray(campaign.experiments)) {
      if (typeof reference !== 'string' && typeof reference !== 'number') continue;
      const prior = index.get(String(reference));
      if (prior) index.set(String(reference), { ...prior, campaign, campaignId });
    }
    for (const [experimentKey, raw] of entries(campaign.experiments)) {
      if (!raw || typeof raw !== 'object') continue;
      const id = String(raw.id ?? experimentKey);
      index.set(id, { raw: { ...index.get(id)?.raw, ...raw }, campaign, campaignId });
    }
  }
  return index;
}

function readState<T>(state: AnyRecord, method: string, fallback: T): T {
  try {
    const result = state?.[method]?.();
    return result == null ? fallback : result as T;
  } catch { return fallback; }
}

function strings(value: unknown): string[] {
  return asArray(value).map((item: any) => String(item?.id ?? item)).filter(Boolean);
}

function collectUrlConditions(value: unknown, output: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectUrlConditions(item, output);
  } else if (value && typeof value === 'object') {
    const item = value as AnyRecord;
    if (String(item.type || '').toLowerCase() === 'url' && typeof item.value === 'string') output.push(item.value);
    else for (const child of Object.values(item)) collectUrlConditions(child, output);
  }
  return output;
}

function experimentPageIds(raw: AnyRecord, campaign?: AnyRecord): string[] {
  const ids = new Set<string>([
    ...strings(raw.pageIds),
    ...strings(raw.viewIds),
    ...strings(campaign?.pageIds),
    ...strings(campaign?.viewIds)
  ]);
  for (const variation of asArray(raw.variations)) {
    for (const action of asArray((variation as AnyRecord)?.actions)) {
      const pageId = (action as AnyRecord)?.pageId ?? (action as AnyRecord)?.viewId;
      if (pageId != null) ids.add(String(pageId));
    }
  }
  return [...ids];
}

function variationWeights(raw: AnyRecord): Record<string, number> {
  const result: Record<string, number> = {};
  let previous = 0;
  for (const distribution of asArray(raw.weightDistributions)) {
    const end = Number((distribution as AnyRecord)?.endOfRange);
    const id = (distribution as AnyRecord)?.entityId;
    if (id == null || !Number.isFinite(end)) continue;
    result[String(id)] = Math.max(0, (end - previous) / 100);
    previous = end;
  }
  return result;
}

function activityKind(raw: AnyRecord, campaign?: AnyRecord): NormalizedExperiment['kind'] {
  const type = String(raw.type || '').toLowerCase().replace(/[ _-]/g, '');
  if (type === 'feature') return 'feature-flag';
  if (type === 'multivariate' || type === 'mvt' || raw.section_ids?.length || asArray(raw.sections).length) return 'mvt';
  if (type === 'spliturl' || type === 'redirect') return 'split-url';
  if (type === 'personalization' || String(campaign?.type || '').toLowerCase() === 'personalization' || ['random', 'ordered'].includes(String(campaign?.policy || '').toLowerCase())) return 'personalization';
  if (type === 'a/b' || type === 'ab' || String(campaign?.policy || '').toLowerCase() === 'single_experiment') return 'ab';
  return 'other';
}

function api(): AnyRecord {
  const opt = (window as any).optimizely;
  if (!opt || typeof opt.push !== 'function' || typeof opt.get !== 'function') throw new Error('Optimizely Web is not available on this page.');
  return opt;
}
function definitions(value: unknown): Map<string, AnyRecord> {
  const map = new Map<string, AnyRecord>();
  for (const [key, item] of entries(value)) map.set(String(item.id ?? key), item);
  return map;
}
function primitive(value: unknown): unknown {
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}
/** Read the visitor without changing anything. Field names follow the documented visitor object but are read defensively. */
function readVisitor(opt: AnyRecord, data: AnyRecord) {
  let visitor: AnyRecord = {};
  try { visitor = opt.get('visitor') || {}; } catch {}
  let idValue: any; try { idValue = opt.get('visitor_id'); } catch {}
  const visitorId = visitor.visitorId ?? (typeof idValue === 'string' ? idValue : idValue?.randomId ?? idValue?.visitorId);
  const defs = new Map([...definitions(data.visitorAttributes), ...definitions(data.attributes), ...definitions(data.customAttributes)]);
  const custom: AnyRecord = visitor.custom && typeof visitor.custom === 'object' ? visitor.custom : {};
  const attributes = Object.entries(custom).map(([key, item]: [string, any]) => {
    const id = String(item?.id ?? key);
    const def = defs.get(id);
    const value = item && typeof item === 'object' && 'value' in item ? item.value : item;
    return { id, name: String(def?.name || def?.apiName || def?.key || id), apiName: def?.apiName || def?.key ? String(def.apiName || def.key) : undefined, value: primitive(value), defined: Boolean(def) };
  });
  for (const [id, def] of defs) if (!attributes.some(item => item.id === id)) attributes.push({ id, name: String(def.name || def.apiName || def.key || id), apiName: def.apiName || def.key ? String(def.apiName || def.key) : undefined, value: undefined, defined: true });
  let pages: Array<Record<string, unknown>> = [];
  try { pages = Object.values(opt.get('state')?.getPageStates?.() || {}).map((page: any) => ({ id: String(page?.id ?? ''), name: String(page?.name ?? page?.id ?? ''), apiName: page?.apiName == null ? undefined : String(page.apiName), isActive: page?.isActive === true })).slice(0, 300); } catch {}
  if (!pages.length) pages = [...definitions(data.pages).values()].map(page => ({ id: String(page.id), name: String(page.name || page.id), apiName: page.apiName == null ? undefined : String(page.apiName), isActive: undefined })).slice(0, 300);
  const projectEvents = [...definitions(data.events).values()].map(event => ({ id: String(event.id), name: String(event.name || event.apiName || event.id), apiName: event.apiName == null ? undefined : String(event.apiName) })).filter(event => event.apiName).slice(0, 300);
  return { visitorId: visitorId == null ? undefined : String(visitorId), attributes: attributes.slice(0, 300), exposesAttributes: Boolean(visitor.custom && typeof visitor.custom === 'object'), pages, projectEvents, projectId: data.projectId == null ? undefined : String(data.projectId), revision: data.revision == null ? undefined : String(data.revision) };
}
function coerce(value: unknown, type: unknown): unknown {
  if (type === 'number') { const number = Number(value); if (!Number.isFinite(number)) throw new Error('That is not a number.'); return number; }
  if (type === 'boolean') return String(value).toLowerCase() === 'true';
  return String(value ?? '');
}

/** Name and classify optimizely.push calls: custom events are metrics; page, user and other commands are not. */
function pushName(args: unknown[]): string {
  const command = args[0] as AnyRecord | undefined;
  const type = String(command?.type || '');
  if (type === 'event') return String(command?.eventName || 'Custom event');
  if (type === 'page') return `Page ${command?.isActive === false ? 'deactivated' : 'activated'}: ${String(command?.pageName || '')}`.trim();
  if (type === 'user') return 'Set visitor attributes';
  return type ? `optimizely.push: ${type}` : 'optimizely.push';
}
function pushCategory(args: unknown[]) {
  const type = String((args[0] as AnyRecord | undefined)?.type || '');
  if (type === 'event') return (args[0] as AnyRecord)?.tags?.revenue != null ? 'revenue' as const : 'custom' as const;
  if (type === 'user') return 'identity' as const;
  if (type === 'optOut') return 'consent' as const;
  return 'lifecycle' as const;
}

export const optimizelyAdapter: PageAdapter = {
  id: 'optimizely', displayName: 'Optimizely', category: 'experimentation',
  detect() {
    const opt = (window as any).optimizely;
    if (opt && typeof opt.get === 'function') {
      const revision = getData(opt)?.revision;
      return detection('active', ['window.optimizely.get'], 1, revision == null ? undefined : String(revision));
    }
    if (opt?.data?.experiments) return detection('active', ['Optimizely Classic data'], 0.95, String(opt.data.revision ?? 'Classic'));
    if ((window as any).optimizelyEdge) return detection('active', ['window.optimizelyEdge'], 0.95);
    if (document.querySelector('script[src*="cdn.optimizely.com/js/"]')) return detection('loading', ['Optimizely project script'], 0.7);
    return detection('blocked', [], 0);
  },
  listExperiments() {
    const opt = (window as any).optimizely;
    if (!opt || (typeof opt.get !== 'function' && !opt.data)) return [];
    const data = getData(opt);
    if (!data) return [];

    let state: AnyRecord;
    try { state = (typeof opt.get === 'function' ? opt.get('state') : data.state) || {}; } catch { state = {}; }
    // isGlobalHoldback is a State API method; older data exposed a boolean.
    const globalHoldback = typeof state.isGlobalHoldback === 'function' ? readState<boolean>(state, 'isGlobalHoldback', false) === true : state.isGlobalHoldback === true;
    const index = indexExperiments(data);
    const experimentStates = readState<AnyRecord>(state, 'getExperimentStates', {});
    const campaignStates = readState<AnyRecord>(state, 'getCampaignStates', {});
    const variationMap = readState<AnyRecord>(state, 'getVariationMap', state.variationMap || state.variationIdsMap || {});
    const activeResult = readState<unknown[] | null>(state, 'getActiveExperimentIds', Array.isArray(state.activeExperiments) ? state.activeExperiments : null);
    const activeIds = new Set(strings(activeResult));
    const pages = data.pages || {};

    return mapSafely([...index.entries()], ([id, indexed]) => {
      const { raw, campaign, campaignId } = indexed;
      const experimentState = experimentStates[id] || {};
      const campaignState = Object.values(campaignStates).find((item: any) => String(item?.experiment?.id ?? '') === id)
        || {}; // A campaign decision belongs only to its selected experience.
      const assignmentValue = experimentState.isActive === true && experimentState.variation != null ? experimentState.variation
        : campaignState?.isActive === true && campaignState.variation != null ? campaignState.variation
        : experimentState.variation ?? campaignState?.variation ?? variationMap[id];
      const assignment = Array.isArray(assignmentValue) ? (assignmentValue.length === 1 ? { id: assignmentValue[0] } : undefined) : assignmentValue != null && typeof assignmentValue !== 'object' ? { id: assignmentValue } : assignmentValue;
      const pageIds = experimentPageIds(raw, campaign);
      const pageRecords = pageIds.map((pageId) => pages[pageId]).filter(Boolean);
      const urls = [...new Set(pageRecords.flatMap((page: AnyRecord) => collectUrlConditions(page.staticConditions)))];
      const weights = variationWeights(raw);
      const variationSource = raw.variations ?? (raw.variation_ids || raw.variationIds || []);
      const variationEntries = Array.isArray(variationSource) ? variationSource.map((value: any, index: number) => [String(index), value]) : Object.entries(variationSource || {});
      const variations = variationList(variationEntries.map(([key, value]: any) => {
        const reference = value != null && typeof value === 'object' ? value : { id: value ?? key };
        const variationId = String(reference.id ?? key);
        const definition = data.variations?.[variationId];
        return { ...definition, ...reference, id: variationId, changes: mergeChanges(variationChanges(definition), variationChanges(reference)) };
      }), { weights, changes: item => item.changes });
      const selected = variations.find((variation) => variation.id === String(assignment?.id));
      const isActiveHere = activeResult !== null ? activeIds.has(id) : experimentState.isActive === true || campaignState?.isActive === true;
      const inHoldback = globalHoldback || experimentState.isInExperimentHoldback === true || campaignState?.isInCampaignHoldback === true;
      const kind = activityKind(raw, campaign);
      const status = inHoldback && isActiveHere ? 'running-excluded' : isActiveHere ? 'running-in' : assignment ? 'bucketed-elsewhere' : activeResult !== null ? 'not-on-page' : 'unknown';
      const statusReason = activeResult === null && !isActiveHere ? 'The runtime did not expose a current active list. Activity on this page is unknown.' : inHoldback
        ? 'Optimizely reports a global, campaign or experiment holdback. A holdback is not an ordinary variation.'
        : isActiveHere
          ? undefined
          : assignment
            ? 'This visitor has a stored assignment, but Optimizely does not report the activity active on this page.'
            : 'This activity is present in the published project data but is not active for this visitor on this page.';
      const pageNames = pageRecords.map((page: AnyRecord) => String(page.name || page.id)).filter(Boolean);
      const audienceIds = [...new Set([...strings(raw.audienceIds), ...strings(campaign?.audienceIds)])];
      const audienceNames = asArray(raw.audienceName).map((item: any) => String(item?.name ?? item)).filter(Boolean);
      // Resolve audience IDs to the names shown in the Optimizely dashboard.
      const audiences = audienceIds.length || audienceNames.length
        ? [...new Map([...audienceNames.map(name => [name, { name }] as const), ...audienceIds.map(audienceId => { const record = data.audiences?.[audienceId]; return [audienceId, { id: audienceId, name: String(record?.name || audienceId) }] as const; })]).values()]
        : [];
      // Page activation code runs when the page activates and is part of what QA needs to read.
      const activationChanges = pageRecords.flatMap((page: AnyRecord) => typeof page.activationCode === 'string' && page.activationCode.trim()
        ? [{ type: 'js' as const, label: `Page activation code: ${page.name || page.id}`, sourcePath: `pages[${page.id}].activationCode`, code: String(sanitize(page.activationCode)) }] : []);


      return normalizedExperiment({
        platform: 'optimizely', id,
        campaignId: campaignId || ((raw.campaignId ?? raw.layerId) == null ? undefined : String(raw.campaignId ?? raw.layerId)),
        dashboardContext: { projectId: data.projectId == null ? undefined : String(data.projectId), runtime: typeof opt.get === 'function' ? 'web' : 'classic' },
        name: raw.name || experimentState.experimentName || campaignState?.experiment?.name || (kind === 'personalization' ? campaign?.name : undefined) || `Experiment ${id}`,
        kind,
        status,
        statusReason,
        variations,
        assignedVariationId: assignment?.id == null ? undefined : String(assignment.id),
        trafficAllocation: typeof (raw.trafficAllocation ?? raw.percentageIncluded) === 'number' ? raw.trafficAllocation ?? raw.percentageIncluded : undefined,
        changes: [...(variationChanges(raw) || []), ...(variationChanges(campaign) || []), ...activationChanges],
        targeting: {
          urls,
          audiences,
          conditions: pageNames.length ? pageNames.map((name) => `Optimizely page: ${name}`) : undefined
        },
        goals: asArray(raw.metrics).map((goal: any) => { const event = data.events?.[goal?.event_id ?? goal?.eventId ?? goal?.id]; return { id: String(event?.apiName ?? goal?.id ?? goal?.event_id ?? ''), name: String(goal?.name || event?.name || event?.apiName || goal?.eventName || goal?.field || 'Goal') }; }),
        source: ['snippet-data', 'runtime-api'],
        raw: sanitize({ experiment: raw, campaign, state: experimentState, campaignState, assignment, assignmentValue, selectedVariation: selected, pageIds, sections: raw.sections || raw.section_ids?.map((sectionId: string) => data.sections?.[sectionId]), runtime: typeof opt.get === 'function' ? 'web' : 'classic', globalHoldback, revision: data.revision })
      });
    });
  },
  actions: {
    visitor() { const opt = api(); return readVisitor(opt, getData(opt) || {}); },
    setAttribute(args) {
      const opt = api(); const id = String(args.id || '');
      if (!/^[\w.:-]{1,100}$/.test(id)) throw new Error('Choose an attribute first.');
      opt.push({ type: 'user', attributes: { [id]: coerce(args.value, args.valueType) } });
      return readVisitor(opt, getData(opt) || {});
    },
    setPage(args) {
      const opt = api(); const name = String(args.apiName || '');
      if (!name) throw new Error('This page has no API name, so Optimizely cannot activate it from here.');
      opt.push({ type: 'page', pageName: name, isActive: args.isActive === true });
      return readVisitor(opt, getData(opt) || {});
    },
    trackEvent(args) {
      const opt = api(); const name = String(args.eventName || '');
      if (!name) throw new Error('Choose an event first.');
      opt.push({ type: 'event', eventName: name });
      return { ok: true };
    },
    audiences(args) {
      const opt = api(); const data = getData(opt) || {};
      const indexed = indexExperiments(data).get(String(args.experimentId));
      if (!indexed) throw new Error('That experiment is no longer in the project data.');
      const ids = [...new Set([...strings(indexed.raw.audienceIds), ...strings(indexed.campaign?.audienceIds)])];
      const defs = definitions(data.audiences);
      const audiences = ids.map(id => { const def = defs.get(id); return { id, name: String(def?.name || id), conditions: def?.conditions ?? null, known: Boolean(def) }; });
      return { audiences, visitor: readVisitor(opt, data) };
    }
  },
  install(helpers) {
    // The documented pre-snippet queue (window.optimizely = window.optimizely || []) accepts addListener,
    // so listeners attach before the snippet fires initialized, activated and campaignDecided.
    let registered = false;
    const disposers: Array<() => void> = [];
    const register = (opt: any) => {
      if (registered || !opt || typeof opt.push !== 'function') return;
      registered = true;
      for (const [type, name] of [['lifecycle', 'initialized'], ['lifecycle', 'activated'], ['lifecycle', 'campaignDecided'], ['lifecycle', 'pageActivated'], ['lifecycle', 'pageDeactivated'], ['lifecycle', 'applied'], ['analytics', 'trackEvent']]) {
        const token = `splitscope:${type}:${name}:${Math.random().toString(36).slice(2)}`;
        const handler = (event: any) => {
          if (name === 'initialized') cachedData = null;
          const decision = event?.data?.decision;
          helpers.emit({ platform: 'optimizely', category: type === 'analytics' ? 'custom' : name === 'campaignDecided' ? 'decision' : 'lifecycle', name: type === 'analytics' ? String(event?.data?.name || name) : String(name), via: 'listener', experimentId: decision?.experimentId == null ? undefined : String(decision.experimentId), variationId: decision?.variationId == null ? undefined : String(decision.variationId), properties: sanitize(event) });
        };
        try { opt.push({ type: 'addListener', filter: { type, name }, token, handler }); disposers.push(() => { try { (window as any).optimizely?.push?.({ type: 'removeListener', token }); } catch {} }); } catch {}
      }
    };
    helpers.onGlobal('optimizely', register);
    helpers.addCleanup(() => { for (const dispose of disposers) dispose(); });
    // The trap above attaches the moment the site assigns the global; this poll only covers sites
    // where the global cannot be trapped, and stops once registered or after 30 seconds.
    const startedAt = performance.now();
    const timer = window.setInterval(() => { register((window as any).optimizely); if (registered || performance.now() - startedAt > 30000) window.clearInterval(timer); }, 500);
    helpers.addCleanup(() => window.clearInterval(timer));
    helpers.wrapQueue('optimizely', 'optimizely', pushName, pushCategory);
    helpers.wrapMethod(() => (window as any).optimizely, 'push', 'optimizely', pushName, pushCategory);
  },
  force(experimentId, variationId, pageUrl) {
    const url = new URL(pageUrl);
    const ids = url.searchParams.getAll('optimizely_x').flatMap(value => value.split(',')).map(id => id.trim()).filter(Boolean);
    const experiment = this.listExperiments().find((item) => item.id === experimentId);
    const variation = experiment?.variations.find((item) => item.id === variationId);
    if (!variation) throw new Error('This variation is not present in Optimizely project data.');
    if (typeof (window as any).optimizely?.get !== 'function') throw new Error('Variation preview is supported for Optimizely Web. Classic data can be inspected, but its forcing mechanism is not verified.');
    const forceAllowed = getData((window as any).optimizely)?.enableForceParameters;
    if (forceAllowed === false) throw new Error('This Optimizely project disables force variation parameters. A project owner must enable them in Settings → Implementation and publish the snippet, or provide an official QA preview link.');
    if (url.searchParams.get('optimizely_disable') === 'true') throw new Error('Optimizely is disabled in this URL. Remove optimizely_disable before previewing.');
    const competing = new Set(this.listExperiments().filter(item => item.id === experimentId || (experiment?.campaignId && item.campaignId === experiment.campaignId)).flatMap(item => item.variations.map(v => v.id)));
    const next = ids.filter(id => !competing.has(id)); next.push(variationId);
    // Remove obsolete Classic-style overrides for the same experiment.
    url.searchParams.delete('optimizely_x' + experimentId);
    url.searchParams.set('optimizely_x', [...new Set(next)].join(','));
    const tracked = url.searchParams.get('optimizely_force_tracking') === 'true';
    return { method: 'url', url: url.href, tracking: tracked ? 'counted' : forceAllowed === true ? 'disabled' : 'unknown', explanation: 'Reloads using Optimizely’s variation-ID force parameter. Replaces earlier selections for this experiment or campaign and preserves other experiments. ' + (tracked ? 'The existing force-tracking parameter enables tracking.' : 'When Optimizely accepts force parameters, tracking is disabled. If forcing is disabled in the project, the normal assignment and tracking remain in effect.') + ' The project must allow force parameters; verify the reported assignment after loading.' };
  }
};
