import test from 'node:test';
import assert from 'node:assert/strict';
import { abTastyAdapter } from '../src/adapters/ab-tasty';
import { optimizelyAdapter } from '../src/adapters/optimizely';
import { vwoAdapter } from '../src/adapters/vwo';
import { kameleoonAdapter } from '../src/adapters/kameleoon';
import { dynamicYieldAdapter } from '../src/adapters/dynamic-yield';

const doc = { cookie: '', querySelector: () => null, scripts: [] };

test('AB Tasty: documented getTestsOnPage object and results decide Active here, variation and rejection', () => {
  Object.assign(globalThis, { document: doc, window: { ABTasty: {
    getTestsOnPage: () => ({ 101: { name: 'Hero', status: 'accepted', type: 'ab', variationID: 7, variationName: 'B' } }),
    results: { 101: { name: 'Hero', status: 'accepted', type: 'ab', variationID: 7 }, 202: { name: 'Footer', status: 'target_pages_rejected', type: 'subsegment' } },
    getCampaignHistory: () => ({ 303: 9 }), accountData: { tests: {} }
  } } });
  const list = abTastyAdapter.listExperiments();
  const hero = list.find(a => a.id === '101')!, footer = list.find(a => a.id === '202')!, old = list.find(a => a.id === '303')!;
  assert.deepEqual([hero.status, hero.assignedVariationId, hero.kind], ['running-in', '7', 'ab']);
  assert.equal(footer.status, 'not-on-page'); assert.match(footer.statusReason!, /target pages rejected/); assert.equal(footer.kind, 'personalization');
  assert.deepEqual([old.status, old.assignedVariationId], ['bucketed-elsewhere', '9']);
});

test('Optimizely: isGlobalHoldback as a State API method marks active experiments excluded', () => {
  const data = { experiments: { e: { id: 'e', variations: [{ id: 'v' }] } } };
  const state = { isGlobalHoldback: () => true, getActiveExperimentIds: () => ['e'], getExperimentStates: () => ({ e: { isActive: true, variation: { id: 'v' } } }) };
  Object.assign(globalThis, { document: doc, window: { optimizely: { get: (k: string) => k === 'data' ? data : state } } });
  const [activity] = optimizelyAdapter.listExperiments();
  assert.equal(activity.status, 'running-excluded');
});

test('VWO: VISUAL_AB is an A/B test and fractional combination weights show as percentages', () => {
  Object.assign(globalThis, { document: doc, window: { VWO: {}, _vwo_exp: { 7: { name: 'Hero', type: 'VISUAL_AB', combs: { 1: 0.5, 2: 0.5 }, comb_n: { 1: 'Control', 2: 'B' } } } } });
  const [activity] = vwoAdapter.listExperiments();
  assert.equal(activity.kind, 'ab');
  assert.deepEqual(activity.variations.map(v => v.weight), [50, 50]);
});

test('Kameleoon: documented exposure fields give not targeted, excluded, not on page and earlier in visit', () => {
  const experiments = [
    { id: 1, name: 'Active', variations: [] },
    { id: 2, name: 'Targeting', nonExpositionReason: 'TARGETING', variations: [] },
    { id: 3, name: 'Holdback', nonExpositionReason: 'GLOBAL_HOLDBACK', variations: [] },
    { id: 4, name: 'Not triggered', triggered: false, variations: [] },
    { id: 5, name: 'Earlier', activatedInVisit: true, triggered: true, variations: [] }
  ];
  Object.assign(globalThis, { document: doc, window: { Kameleoon: { API: { Experiments: { getAll: () => experiments, getActive: () => [{ id: 1 }] }, Personalizations: { getAll: () => [], getActive: () => [] } } } } });
  const status = Object.fromEntries(kameleoonAdapter.listExperiments().map(a => [a.id, a.status]));
  assert.deepEqual(status, { 1: 'running-in', 2: 'not-targeted', 3: 'running-excluded', 4: 'not-on-page', 5: 'bucketed-elsewhere' });
});

test('Dynamic Yield: only rendered objects are Active here; the allocation list is stored; no index IDs', () => {
  Object.assign(globalThis, { document: doc, window: { DYO: { getRenderedObjectsOnPage: () => null, getUserObjectsAndVariations: () => [{ campaignId: 9, name: 'Recs', variation: { variationId: 3 } }, { name: 'No id' }] } } });
  const list = dynamicYieldAdapter.listExperiments();
  assert.deepEqual(list.map(a => [a.id, a.status]), [['9', 'bucketed-elsewhere']]);
  Object.assign(globalThis, { window: { DYO: { getRenderedObjectsOnPage: () => [{ campaignId: 9, name: 'Recs', variation: { variationId: 3 } }] } } });
  assert.equal(dynamicYieldAdapter.listExperiments()[0].status, 'running-in');
});
