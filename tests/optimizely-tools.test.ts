import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizelyAdapter } from '../src/adapters/optimizely';
import { normalizeWorkspace, emptyWorkspace } from '../src/core/qa/workspace';

function install() {
  const pushed: any[] = [];
  const data = {
    projectId: '99', revision: '1234',
    experiments: { e: { id: 'e', audienceIds: ['a1', 'missing'], variations: [{ id: 'v' }] } },
    audiences: { a1: { id: 'a1', name: 'Gold members', conditions: '["and",["or",["or",{"type":"custom_attribute","name":"tier","value":"gold","match":"exact"}]]]' } },
    visitorAttributes: { 7: { id: '7', name: 'Tier', apiName: 'tier' }, 8: { id: '8', name: 'Plan' } },
    pages: { p1: { id: 'p1', name: 'Home', apiName: 'home' }, p2: { id: 'p2', name: 'URL page' } },
    events: { x: { id: 'x', name: 'Add to cart', apiName: 'add_to_cart' }, y: { id: 'y', name: 'Hidden' } }
  };
  const visitor = { visitorId: 'oeu123', custom: { 7: { id: '7', value: 'gold' } } };
  const state = { getPageStates: () => ({ p1: { id: 'p1', name: 'Home', apiName: 'home', isActive: true } }), getActiveExperimentIds: () => ['e'] };
  Object.assign(globalThis, { window: { optimizely: { push: (item: any) => pushed.push(item), get: (key: string) => key === 'data' ? data : key === 'visitor' ? visitor : key === 'state' ? state : undefined } } });
  return { pushed, data, visitor };
}

test('Visitor action reports ID, named attributes, pages and API named events without changing anything', () => {
  const { pushed } = install();
  const result: any = optimizelyAdapter.actions!.visitor!({});
  assert.equal(result.visitorId, 'oeu123');
  assert.equal(result.projectId, '99'); assert.equal(result.revision, '1234');
  assert.deepEqual(result.attributes.map((a: any) => [a.id, a.name, a.value]), [['7', 'Tier', 'gold'], ['8', 'Plan', undefined]]);
  assert.equal(result.exposesAttributes, true);
  assert.deepEqual(result.pages.map((p: any) => [p.name, p.isActive]), [['Home', true]]);
  assert.deepEqual(result.projectEvents.map((e: any) => e.apiName), ['add_to_cart']);
  assert.equal(pushed.length, 0);
});

test('Set attribute, page and event use Optimizely push with validated input', () => {
  const { pushed } = install();
  optimizelyAdapter.actions!.setAttribute!({ id: '8', value: '42', valueType: 'number' });
  optimizelyAdapter.actions!.setPage!({ apiName: 'home', isActive: false });
  optimizelyAdapter.actions!.trackEvent!({ eventName: 'add_to_cart' });
  assert.deepEqual(pushed, [{ type: 'user', attributes: { '8': 42 } }, { type: 'page', pageName: 'home', isActive: false }, { type: 'event', eventName: 'add_to_cart' }]);
  assert.throws(() => optimizelyAdapter.actions!.setAttribute!({ id: '', value: 'x' }), /Choose an attribute/);
  assert.throws(() => optimizelyAdapter.actions!.setAttribute!({ id: '8', value: 'abc', valueType: 'number' }), /not a number/);
  assert.throws(() => optimizelyAdapter.actions!.setPage!({ apiName: '' }), /no API name/);
  assert.throws(() => optimizelyAdapter.actions!.trackEvent!({ eventName: '' }), /Choose an event/);
});

test('Audience action returns definitions for the experiment and flags unknown audiences', () => {
  install();
  const result: any = optimizelyAdapter.actions!.audiences!({ experimentId: 'e' });
  assert.deepEqual(result.audiences.map((a: any) => [a.id, a.name, a.known]), [['a1', 'Gold members', true], ['missing', 'missing', false]]);
  assert.equal(result.visitor.attributes[0].value, 'gold');
  assert.throws(() => optimizelyAdapter.actions!.audiences!({ experimentId: 'nope' }), /no longer in the project data/);
});

test('Workspace keeps the last seen snippet revision per project and ignores junk', () => {
  const stored = normalizeWorkspace({ ...emptyWorkspace(), revisions: { 'optimizely:99': { revision: '12', at: 5 }, bad: { revision: 3, at: 'x' } } });
  assert.deepEqual(stored.revisions, { 'optimizely:99': { revision: '12', at: 5 } });
  assert.deepEqual(normalizeWorkspace(null).revisions, {});
});
