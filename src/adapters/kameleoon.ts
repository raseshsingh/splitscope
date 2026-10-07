import type { PageAdapter } from '../core/hooks/runtime';
import { asArray, detection, normalizedExperiment, variationList, variationChanges } from '../core/hooks/runtime';
import { sanitize } from '../core/sanitize';

function readCollection(kind: 'Experiments' | 'Personalizations'): any[] {
  const api = (window as any).Kameleoon?.API?.[kind];
  try { const data = api?.getAll?.() ?? api?.getActive?.(); return Array.isArray(data) ? data : Object.entries(data || {}).map(([id, value]) => ({ id, ...(value as object) })); } catch { return []; }
}

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
    return entries.map(({ value, kind }) => {
      const variations = variationList(value.variations, { weights: value.trafficDeviation || value.deviations || value.trafficAllocation });
      // The public API returns names/IDs only. Read optional loaded definitions without executing them.
      const definitions = asArray((window as any).Kameleoon?.Internals?.runtime?.variations);
      for (const variation of variations) {
        const definition = definitions.find((item: any) => String(item.id) === variation.id && (item.actionId != null ? String(item.actionId) === String(value.id ?? value.experimentId) : variation.id !== '0'));
        if (definition) {
          variation.changes = variationChanges(definition) || variation.changes;
          variation.raw = { api: variation.raw, loadedDefinition: sanitize(definition) };
        }
      }
      const assignedId = value.associatedVariation?.id ?? value.associatedVariationId;
      const api = (window as any).Kameleoon?.API?.[kind === 'personalization' ? 'Personalizations' : 'Experiments'];
      let active = value.isActive === true || value.active === true;
      try { if (typeof api?.getActive === 'function') active = asArray(api.getActive()).some((item: any) => String(item.id ?? item.experimentId) === String(value.id ?? value.experimentId)); } catch {};
      return normalizedExperiment({
        platform: 'kameleoon', id: String(value.id ?? value.experimentId ?? value.key ?? ''), name: value.name || `Experiment ${value.id}`,
        kind, status: active ? 'running-in' : assignedId != null ? 'bucketed-elsewhere' : 'unknown', variations, assignedVariationId: assignedId != null ? String(assignedId) : undefined,
        trafficAllocation: typeof value.trafficAllocation === 'number' ? value.trafficAllocation : undefined, targeting: { urls: asArray(value.targeting?.urls).map(String) },
        source: variations.some(v => v.changes?.length) ? ['runtime-api', 'snippet-data'] : ['runtime-api'], raw: value
      });
    }).filter((experiment) => experiment.id);
  },
  install(helpers) {
    for (const name of ['Kameleoon::Loaded', 'Kameleoon::Aborted', 'Kameleoon::Started', 'Kameleoon::ExperimentTriggered', 'Kameleoon::ExperimentActivated', 'Kameleoon::PersonalizationTriggered', 'Kameleoon::PersonalizationActivated', 'Kameleoon::ConversionTriggered', 'Kameleoon::LegalConsentUpdated']) {
      helpers.listen(name, (event) => {
        const detail = (event as CustomEvent).detail;
        helpers.emit({ platform: 'kameleoon', category: name.includes('Conversion') ? 'goal' : 'lifecycle', name, via: 'dom-event', properties: sanitize(detail) });
      });
    }
    helpers.wrapQueue('kameleoonQueue', 'kameleoon', (args) => String((args[0] as any)?.[0] || 'kameleoonQueue.push'));
    helpers.wrapMethod(() => (window as any).Kameleoon?.API?.Goals, 'processConversion', 'kameleoon', () => 'Goals.processConversion', 'goal');
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
