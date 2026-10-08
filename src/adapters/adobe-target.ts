import { enrichIntegrity } from '../core/adobe-target/integrity';
import type { TargetWire } from '../core/adobe-target/wire';
import { installTargetCapture } from '../core/adobe-target/capture';
import { mergeChanges } from '../core/changes';
import { activityKind } from '../core/activity-kind';
import type { NormalizedExperiment } from '../core/model';
import type { PageAdapter } from '../core/hooks/runtime';
import { detection, normalizedExperiment, variationChanges } from '../core/hooks/runtime';
import { sanitize } from '../core/sanitize';

type Evidence = 'cached' | 'delivered' | 'rendered' | 'failed';

/** Tokens may be an array on an at.js event, or metadata beside an offer. */
export function readTargetActivities(payload: unknown, evidence: Evidence = 'cached') {
  const found = new Map<string, NormalizedExperiment>();
  const seen = new WeakSet<object>();
  const visit = (value: any, depth = 0, parent?: any, prefetched = false, offer?: any) => {
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 16) return;
    seen.add(value);
    // Keep an offer/item beside its response metadata, without collecting sibling activities.
    const offerContext = (value.type && value.content != null) || (value.schema && value.data) ? value : offer;
    const tokens = value.responseTokens && !Array.isArray(value.responseTokens) ? value.responseTokens : value.tokens || value;
    if (value.scopeDetails?.decisionProvider && value.scopeDetails.decisionProvider !== 'TGT') return;
    const id = tokens['activity.id'] ?? tokens['campaign.id'] ?? value.activityId ?? value.activity?.id;
    if (id != null) {
      const variationId = tokens['experience.id'] ?? value.experienceId;
      const active = evidence === 'rendered' || (evidence === 'delivered' && !prefetched);
      const changes = mergeChanges(variationChanges(value), variationChanges(offerContext), !offerContext ? variationChanges(parent) : undefined);
      const activity = normalizedExperiment({
        platform: 'adobe-target', id: String(id),
        name: String(tokens['activity.name'] || tokens['campaign.name'] || value.activity?.name || `Activity ${id}`),
        kind: activityKind('adobe-target', { ...tokens, activityType: value.activity?.type ?? value.activityType ?? tokens['activity.type'] }),
        status: active ? 'running-in' : 'unknown',
        evidence: { state: evidence === 'rendered' ? 'applied' : active ? 'assigned' : evidence === 'failed' ? 'failed' : 'detected', observedAt: Date.now(), pageUrl: location.href },
        statusReason: evidence === 'rendered' ? 'Adobe confirmed successful content rendering on this page.' : active ? 'Adobe delivered this decision for the current page request. Visual rendering is not yet confirmed.' : evidence === 'failed' ? 'Adobe reported a rendering failure for this decision.' : 'Only cached or prefetched decision data is available; it does not confirm activity on this page.',
        variations: variationId != null ? [{ id: String(variationId), name: String(tokens['experience.name'] || 'Delivered experience'), changes }] : [],
        changes: variationId == null ? changes : undefined,
        assignedVariationId: variationId == null ? undefined : String(variationId),
        source: ['tokens'], raw: sanitize({ evidence, response: value, offer: parent }, 400_000, 14)
      });
      const previous = found.get(activity.id);
      if (previous) {
        const preferred = previous.status === 'running-in' && activity.status !== 'running-in' ? previous : activity;
        const variations = new Map(previous.variations.map(item => [item.id, item]));
        for (const item of activity.variations) variations.set(item.id, { ...variations.get(item.id), ...item, changes: mergeChanges(variations.get(item.id)?.changes, item.changes) });
        found.set(activity.id, { ...preferred, changes: mergeChanges(previous.changes, activity.changes), variations: [...variations.values()] });
      } else found.set(activity.id, activity);
    }
    for (const [key, child] of Object.entries(value).slice(0, 500)) visit(child, depth + 1, Array.isArray(value) ? parent : value, prefetched || key === 'prefetch', offerContext);
  };
  visit(payload); return [...found.values()];
}

export const adobeTargetAdapter: PageAdapter = {
  id: 'adobe-target', displayName: 'Adobe Target', category: 'experimentation',
  detect() {
    const target = (window as any).adobe?.target;
    if (target && ['getOffer', 'getOffers', 'applyOffers', 'trackEvent'].some(key => typeof target[key] === 'function')) return detection('active', ['Adobe Target API methods'], 1, target.VERSION == null ? undefined : String(target.VERSION));
    // The general alloy SDK and unrelated files called at.js are not evidence.
    if (this.listExperiments().length) return detection('detected', ['Adobe Target activity response tokens'], 0.95);
    return detection('blocked', [], 0);
  },
  listExperiments() {
    const win = window as any;
    return readTargetActivities(win.__targetTraces || win.___target_trace || win.__target_trace);
  },
  install(helpers) {
    const win = window as any;
    let page = location.href;
    const pending = new Map<string, NormalizedExperiment[]>();
    const latest = new Map<string, NormalizedExperiment>();
    const publish = (activities: NormalizedExperiment[], evidence: Evidence) => {
      if (page !== location.href) { page = location.href; pending.clear(); latest.clear(); }
      for (const activity of activities) {
        const prior = latest.get(activity.id);
        // A sparse request event must not erase already observed rendering or code.
        const merged = prior ? { ...activity,
          status: evidence === 'delivered' && prior.evidence?.state === 'applied' && prior.assignedVariationId === activity.assignedVariationId ? prior.status : activity.status,
          evidence: evidence === 'delivered' && prior.evidence?.state === 'applied' && prior.assignedVariationId === activity.assignedVariationId ? prior.evidence : activity.evidence,
          statusReason: evidence === 'delivered' && prior.evidence?.state === 'applied' && prior.assignedVariationId === activity.assignedVariationId ? prior.statusReason : activity.statusReason,
          variations: activity.variations.length ? activity.variations.map(v => ({ ...prior.variations.find(p => p.id === v.id), ...v, changes: mergeChanges(prior.variations.find(p => p.id === v.id)?.changes, v.changes) })) : prior.variations,
          changes: mergeChanges(prior.changes, activity.changes),
          raw: { latest: activity.raw, previousDecision: prior.raw && (prior.raw as any).latest || prior.raw }
        } : activity;
        latest.set(activity.id, merged); helpers.addExperiment(merged);
      }
    };
    installTargetCapture(helpers, data => publish(readTargetActivities(data, 'delivered'), 'delivered'));
    const monitor = {
      onCommandResolved: (result: any) => {
        // Only Target propositions (response tokens), never generic AEP commands.
        const data = result?.result ?? result;
        const propositions = Array.isArray(data?.propositions) ? data.propositions : [data];
        let targetObserved = false;
        for (const proposition of propositions) {
          const evidence: Evidence = proposition?.renderAttempted === true ? 'delivered' : 'cached';
          const activities = readTargetActivities(proposition, evidence);
          if (!activities.length) continue;
          targetObserved = true;
          publish(activities, evidence);
        }
        if (targetObserved) helpers.emit({ platform: 'adobe-target', category: 'decision', name: 'Web SDK Target decisions', via: 'listener', properties: sanitize(result) });
      }
    };
    win.__alloyMonitors = win.__alloyMonitors || [];
    if (Array.isArray(win.__alloyMonitors)) {
      win.__alloyMonitors.push(monitor);
      helpers.addCleanup(() => { const i = win.__alloyMonitors.indexOf(monitor); if (i >= 0) win.__alloyMonitors.splice(i, 1); });
    }
    for (const method of ['getOffer', 'getOffers', 'applyOffer', 'applyOffers', 'trackEvent', 'triggerView', 'sendNotifications']) helpers.wrapMethod(() => win.adobe?.target, method, 'adobe-target', () => `adobe.target.${method}`, undefined, (args, result) => {
      if (method === 'getOffers') publish(readTargetActivities(result, 'delivered'), 'delivered');
      if (method === 'applyOffers' || method === 'applyOffer') publish(readTargetActivities(args, 'delivered'), 'delivered');
    });
    for (const name of ['at-library-loaded', 'at-request-start', 'at-request-succeeded', 'at-request-failed', 'at-content-rendering-succeeded', 'at-content-rendering-failed', 'at-content-rendering-no-offers', 'at-content-rendering-redirect']) {
      helpers.listen(name, event => {
        if (page !== location.href) { page = location.href; pending.clear(); latest.clear(); }
        const detail = (event as CustomEvent).detail;
        if(name==='at-content-rendering-succeeded'){
          const at=Date.now(),page=location.href;
          void enrichIntegrity({response:detail,request:{}} as TargetWire).then(integrity=>{if(integrity.served.length)helpers.emit({platform:'adobe-target',category:'lifecycle',name:'Target rendered credential evidence',via:'listener',properties:{schema:'target-render-v1',at,page,served:integrity.served}});}).catch(()=>{});
        }
        const evidence: Evidence = name === 'at-content-rendering-succeeded' || name === 'at-content-rendering-redirect' ? 'rendered' : name.includes('failed') || name.endsWith('no-offers') ? 'failed' : 'delivered';
        const activities = readTargetActivities(detail, evidence);
        const key = detail?.requestId ? `request:${detail.requestId}` : detail?.mbox ? `mbox:${detail.mbox}` : undefined;
        if (key && name === 'at-request-succeeded') { pending.set(key, activities); if (pending.size > 100) pending.delete(pending.keys().next().value!); }
        // Rendering events can omit the response tokens; only correlate an explicit request/mbox.
        if (!activities.length && key && (evidence === 'rendered' || evidence === 'failed')) {
          for (const prior of pending.get(key) || []) activities.push({ ...prior, evidence: { state: evidence === 'rendered' ? 'applied' : 'failed', observedAt: Date.now(), pageUrl: location.href }, status: evidence === 'rendered' ? 'running-in' : 'unknown', statusReason: evidence === 'rendered' ? 'Adobe confirmed successful content rendering for this request on this page.' : 'Adobe reported no rendered content or a rendering failure for this request.' });
          pending.delete(key);
        }
        publish(activities, evidence);
        helpers.emit({ platform: 'adobe-target', category: evidence === 'failed' ? 'error' : 'lifecycle', name, via: 'dom-event', properties: sanitize(detail) });
      });
    }
  }
};
