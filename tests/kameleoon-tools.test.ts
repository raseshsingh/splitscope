import test from 'node:test';
import assert from 'node:assert/strict';
import { kameleoonAdapter } from '../src/adapters/kameleoon';

function install(overrides: Record<string, unknown> = {}) {
  const calls: Array<[string, unknown[]]> = [];
  const record = (name: string) => (...args: unknown[]) => { calls.push([name, args]); };
  const experiments = [{ id: 11, name: 'Hero', active: true, triggered: true, activatedInVisit: true, associatedVariation: { id: 5, name: 'Bigger' }, variations: [{ id: 0, name: 'Original' }, { id: 5, name: 'Bigger' }] }, { id: 12, name: 'Footer', active: false, nonExpositionReason: 'TARGETING', variations: [{ id: 0, name: 'Original' }, { id: 6, name: 'Dark' }] }];
  const API: any = {
    Visitor: { code: 'abc123', numberOfVisits: 4, firstVisitStartDate: 1700000000000, experimentLegalConsent: true, personalizationLegalConsent: null, customData: { tier: 'gold', cart: ['a', 'b'] }, currentVisit: { index: 3, pageViews: 2, device: { type: 'DESKTOP' }, acquisitionChannel: 'Direct', landingPageURL: 'https://x.test/', customData: { page: 'home' }, conversions: { 9: { count: 1, revenue: 25 } } } },
    Core: { getConfiguration: () => ({ siteCode: 'zz9', singlePageSupport: true, goals: [{ id: 9, name: 'Purchase' }] }), enableLegalConsent: record('enable'), disableLegalConsent: record('disable') },
    Segments: { getAll: () => [{ id: 3, name: 'Gold' }], reevaluate: record('reevaluate') }, Triggers: { getAll: () => [{ id: 4, name: 'Exit intent' }] },
    Data: { setCustomData: record('setCustomData'), resetCustomData: record('resetCustomData') },
    Goals: { processConversion: record('processConversion') },
    Experiments: { getAll: () => experiments, getActive: () => [experiments[0]], block: record('block') },
    Personalizations: { getAll: () => [], getActive: () => [], disable: record('disable personalization') },
    ...overrides
  };
  Object.assign(globalThis, { window: { Kameleoon: { API } }, document: { cookie: '', querySelector: () => null } });
  return { calls };
}
const actions = kameleoonAdapter.actions!;

test('Visitor action reports code, consent, custom data, goals, segments and conversions', () => {
  install();
  const v: any = actions.visitor!({});
  assert.equal(v.code, 'abc123'); assert.equal(v.siteCode, 'zz9'); assert.equal(v.singlePageSupport, true);
  assert.equal(v.experimentConsent, true); assert.equal(v.personalizationConsent, null);
  assert.deepEqual(v.customData.map((d: any) => [d.name, d.scope, d.value]), [['tier', 'visitor', 'gold'], ['cart', 'visitor', '["a","b"]'], ['page', 'visit or page', 'home']]);
  assert.deepEqual(v.goals, [{ id: '9', name: 'Purchase' }]);
  assert.deepEqual(v.segments, [{ id: '3', name: 'Gold' }]); assert.deepEqual(v.triggers, [{ id: '4', name: 'Exit intent' }]);
  assert.deepEqual(v.visit.conversions, [{ goalId: '9', count: 1, revenue: 25 }]);
});

test('Visitor code falls back to the cookie when the API does not expose it', () => {
  install({ Visitor: {} });
  (globalThis as any).document.cookie = 'a=1; kameleoonVisitorCode=cookie%20code';
  assert.equal((actions.visitor!({}) as any).code, 'cookie code');
});

test('Experiments action keeps the reason a visitor is not exposed, and the adapter shows it as the status reason', () => {
  install();
  const list: any[] = actions.experiments!({}) as any[];
  assert.deepEqual(list.map(item => [item.id, item.active, item.reason]), [['11', true, undefined], ['12', false, 'TARGETING']]);
  const footer = kameleoonAdapter.listExperiments().find(item => item.id === '12')!;
  assert.match(footer.statusReason!, /TARGETING/);
  assert.equal(footer.variations.find(v => v.id === '0')!.isControl, true);
});

test('Write actions call the Kameleoon API with validated, typed values', () => {
  const { calls } = install();
  actions.setCustomData!({ name: 'tier', value: 'silver', valueType: 'string', overwrite: true });
  actions.setCustomData!({ name: '4', value: '7', valueType: 'number', overwrite: false });
  actions.resetCustomData!({ name: 'tier' });
  actions.processConversion!({ goal: '9', revenue: '12.5' });
  actions.setConsent!({ module: 'AB_TESTING', enabled: true });
  actions.setConsent!({ module: 'nonsense', enabled: false });
  actions.block!({ id: '11', kind: 'experiment', visit: true });
  actions.block!({ id: '2', kind: 'personalization' });
  actions.reevaluateSegment!({ id: '3' });
  assert.deepEqual(calls, [
    ['setCustomData', ['tier', 'silver', true]], ['setCustomData', [4, 7, false]], ['resetCustomData', ['tier']],
    ['processConversion', [9, 12.5]], ['enable', ['AB_TESTING']], ['disable', ['BOTH']],
    ['block', [11, true]], ['disable personalization', [2]], ['reevaluate', [3]]
  ]);
  assert.throws(() => actions.setCustomData!({ name: '', value: 'x' }), /custom data name/);
  assert.throws(() => actions.setCustomData!({ name: 'n', value: 'abc', valueType: 'number' }), /not a number/);
  assert.throws(() => actions.processConversion!({ goal: '' }), /Choose a goal/);
  assert.throws(() => actions.processConversion!({ goal: '9', revenue: 'lots' }), /Revenue/);
  assert.throws(() => actions.block!({ id: 'x' }), /must be a number/);
});

test('Actions explain clearly when Kameleoon is missing', () => {
  Object.assign(globalThis, { window: {}, document: { cookie: '' } });
  assert.throws(() => actions.visitor!({}), /not available/);
});
