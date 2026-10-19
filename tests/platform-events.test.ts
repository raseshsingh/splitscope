import test from 'node:test';
import assert from 'node:assert/strict';
import { kameleoonAdapter } from '../src/adapters/kameleoon';
import { vwoAdapter } from '../src/adapters/vwo';
import { abTastyAdapter } from '../src/adapters/ab-tasty';
import { convertAdapter } from '../src/adapters/convert';
import { activityEvents } from '../src/core/qa/presentation';

function fakeHelpers() {
  const emitted: any[] = []; const listeners = new Map<string, (event: any) => void>(); const queues: any[] = []; const methods: any[] = []; const cleanups: Array<() => void> = [];
  const helpers: any = {
    emit: (event: any) => emitted.push(event), listen: (name: string, handler: any) => listeners.set(name, handler),
    wrapQueue: (name: string, platform: string, eventName: any, category: any) => queues.push({ name, platform, eventName, category }),
    wrapMethod: (target: any, method: string, platform: string, eventName: any, category: any, observe: any, link: any) => methods.push({ method, platform, eventName, category, observe, link }),
    globals: new Map<string, (value: any) => void>(),
    onGlobal(name: string, apply: (value: any) => void) { helpers.globals.set(name, apply); const v = (globalThis as any).window?.[name]; if (v != null) apply(v); },
    clean: (v: unknown) => v, addExperiment() {}, invalidate() {}, addCleanup: (fn: () => void) => cleanups.push(fn)
  };
  return { helpers, emitted, listeners, queues, methods };
}
const cat = (category: any, args: unknown[]) => typeof category === 'function' ? category(args) : category;

test('Kameleoon: documented events link experiments and goals, the queue names conversions, and experiments expose their goals', () => {
  Object.assign(globalThis, { window: { setInterval, clearInterval } });
  const f = fakeHelpers(); kameleoonAdapter.install(f.helpers);
  f.listeners.get('Kameleoon::ExperimentActivated')!({ detail: { experiment: { id: 11, associatedVariation: { id: 5 } } } });
  f.listeners.get('Kameleoon::ConversionTriggered')!({ detail: { goal: { id: 9, name: 'Purchase', type: 'CUSTOM' } } });
  assert.deepEqual([f.emitted[0].experimentId, f.emitted[0].variationId, f.emitted[0].category], ['11', '5', 'activation']);
  assert.deepEqual([f.emitted[1].name, f.emitted[1].category, f.emitted[1].properties.goalId], ['Conversion: Purchase', 'goal', '9']);
  const queue = f.queues.find(q => q.name === 'kameleoonQueue');
  assert.equal(queue.eventName([['Kameleoon.API.Goals.processConversion', '9']]), 'Conversion: 9');
  assert.equal(cat(queue.category, [['Kameleoon.API.Goals.processConversion', '9']]), 'goal');
  assert.equal(queue.eventName([{ level: 'IMMEDIATE', command: () => {} }]), 'Queued command');
  assert.equal(cat(queue.category, [{ command: () => {} }]), 'lifecycle');
  Object.assign(globalThis, { window: { Kameleoon: { API: { Experiments: { getAll: () => [{ id: 11, name: 'Hero', mainGoal: { id: 9, name: 'Purchase' }, goals: [{ id: 9, name: 'Purchase' }, { id: 4, name: 'Click CTA' }], variations: [] }], getActive: () => [{ id: 11 }] }, Personalizations: { getAll: () => [] } } } }, document: { cookie: '', querySelector: () => null } });
  const [activity] = kameleoonAdapter.listExperiments();
  assert.deepEqual(activity.goals, [{ id: '9', name: 'Purchase' }, { id: '4', name: 'Click CTA' }]);
  const grouped = activityEvents([{ id: 'a', t: 1, platform: 'kameleoon', category: 'goal', via: 'listener', name: 'Conversion: Purchase', properties: { goalId: '9' } } as any, { id: 'b', t: 2, platform: 'kameleoon', category: 'goal', via: 'api-call', name: 'Conversion: 4', properties: [4] } as any], activity);
  assert.deepEqual(grouped.metric.map(e => e.id), ['a', 'b']);
});

test('VWO: registers the documented onEventReceive hooks and links conversions to campaigns', () => {
  const pushed: any[] = [];
  Object.assign(globalThis, { window: { Wingify: { push: (item: any) => pushed.push(item) }, setInterval: () => 0, clearInterval: () => {} } });
  const f = fakeHelpers(); vwoAdapter.install(f.helpers);
  assert.deepEqual(pushed.map(p => [p[0], p[1]]), [['onEventReceive', 'vA'], ['onEventReceive', 'vAE'], ['onEventReceive', 'rC'], ['onEventReceive', 'tNR']]);
  assert.equal(pushed[0][2].__splitscope, true, 'own registrations are marked so they are not logged as site calls');
  pushed.find(p => p[1] === 'rC')[2](['rC', 77, 5]);
  pushed.find(p => p[1] === 'vA')[2](['vA', 77, 2]);
  assert.deepEqual([f.emitted[0].name, f.emitted[0].experimentId, f.emitted[0].properties.goalId, f.emitted[0].category], ['Goal conversion: 5', '77', '5', 'goal']);
  assert.deepEqual([f.emitted[1].experimentId, f.emitted[1].variationId, f.emitted[1].category], ['77', '2', 'activation']);
  const event = f.methods.find(m => m.method === 'event');
  assert.equal(event.eventName(['add_to_cart', {}]), 'add_to_cart');
  assert.equal(event.category, 'custom');
});

test('AB Tasty: wraps the documented tracking functions, links action tracking to its campaign and types hits', () => {
  Object.assign(globalThis, { window: {} });
  const f = fakeHelpers(); abTastyAdapter.install(f.helpers);
  const click = f.methods.find(m => m.method === 'ABTastyClickTracking');
  assert.equal(click.eventName(['Add to cart', null, 1234]), 'Add to cart');
  assert.deepEqual(click.link(['Add to cart', null, 1234]), { experimentId: '1234' });
  assert.equal(click.link(['Add to cart']), undefined);
  const send = f.methods.find(m => m.method === 'send');
  assert.equal(send.eventName(['TRANSACTION', { tid: 'T1', tr: 20 }]), 'TRANSACTION: T1');
  assert.equal(cat(send.category, ['TRANSACTION', {}]), 'revenue');
  assert.equal(cat(send.category, ['EVENT', { ea: 'click' }]), 'custom');
  assert.ok(!f.methods.some(m => m.method === 'ClickTracking'), 'the undocumented ABTasty.ClickTracking wrapper is gone');
  const legacy = f.queues.find(q => q.name === '_abtasty');
  assert.equal(legacy.eventName([['transaction', 'Order', 'T1', 20, 1]]), 'transaction: Order');
  assert.equal(cat(legacy.category, [['transaction']]), 'revenue');
});

test('Convert: adds the documented lifecycle listeners and names triggerConversion commands', () => {
  const pushed: any[] = [];
  Object.assign(globalThis, { window: { _conv_q: { push: (item: any) => pushed.push(item) }, setInterval: () => 0, clearInterval: () => {} }, document: { scripts: [] } });
  const f = fakeHelpers(); convertAdapter.install(f.helpers);
  assert.deepEqual(pushed.map(p => [p.what, p.params.event]), [['addListener', 'experience.variation_decided'], ['addListener', 'experience.activated'], ['addListener', 'goal.triggered']]);
  pushed[2].params.handler({ data: { experience_id: 100, variation_id: 200, goal_id: 300 } });
  assert.deepEqual([f.emitted[0].name, f.emitted[0].experimentId, f.emitted[0].variationId, f.emitted[0].properties.goalId], ['Goal triggered: 300', '100', '200', '300']);
  const queue = f.queues.find(q => q.name === '_conv_q');
  assert.equal(queue.eventName([['triggerConversion', '1003654']]), 'Conversion: 1003654');
  assert.equal(cat(queue.category, [['triggerConversion', '1003654']]), 'goal');
  assert.equal(queue.eventName([{ what: 'addListener' }]), '_conv_q: addListener');
});

import { optimizelyAdapter } from '../src/adapters/optimizely';
test('Optimizely: listeners go into the documented pre-snippet queue as soon as the site creates it, once', () => {
  Object.assign(globalThis, { window: { setInterval: () => 0, clearInterval: () => {} }, performance: { now: () => 0 } });
  const f = fakeHelpers(); optimizelyAdapter.install(f.helpers);
  const queue: any[] = [];
  f.helpers.globals.get('optimizely')!(queue);
  assert.equal(queue.filter(item => item.type === 'addListener').length, 7);
  assert.ok(queue.some(item => item.filter?.name === 'campaignDecided'));
  const api: any[] = []; const apiObject = { push: (item: any) => api.push(item), get: () => undefined };
  f.helpers.globals.get('optimizely')!(apiObject);
  assert.equal(api.length, 0, 'no second registration when the snippet replaces the queue with the API');
});

import { growthbookAdapter } from '../src/adapters/growthbook';
import { targetCategory } from '../src/adapters/adobe-target';
import { posthogAdapter } from '../src/adapters/posthog';
import { confirmedCallIndex } from '../src/core/qa/presentation';
test('GrowthBook: one evaluation is one listener row named like the run() call, so the call absorbs it', () => {
  let subscriber: any;
  const gb = { getFeatures: () => ({}), getAllResults: () => new Map(), subscribe: (fn: any) => { subscriber = fn; return () => {}; }, run: () => {}, evalFeature: () => {}, logEvent: () => {} };
  Object.assign(globalThis, { window: { _growthbook: gb }, document: { scripts: [] }, location: { href: 'https://x.test/' } });
  const f = fakeHelpers(); f.helpers.addExperiment = () => {};
  const realSetInterval = globalThis.setInterval; (globalThis as any).setInterval = () => 0;
  try { growthbookAdapter.install(f.helpers); } finally { (globalThis as any).setInterval = realSetInterval; }
  const exp = { key: 'hero', variations: [0, 1] }, result = { inExperiment: true, variationId: 1 };
  subscriber(exp, result);
  f.methods.find(m => m.method === 'run').observe([exp], result);
  assert.equal(f.emitted.length, 1);
  const run = f.methods.find(m => m.method === 'run');
  const call = { id: 'c', t: 1, platform: 'growthbook', category: 'decision', via: 'api-call', name: run.eventName([exp]) } as any;
  assert.equal(confirmedCallIndex([call], { ...f.emitted[0], id: 'l', t: 2 }), 0);
});
test('Adobe Target and PostHog calls get categories by purpose instead of custom', () => {
  assert.deepEqual(['getOffers', 'applyOffers', 'triggerView', 'trackEvent', 'sendNotifications'].map(targetCategory), ['decision', 'activation', 'pageview', 'goal', 'lifecycle']);
  const ph = { capture() {}, featureFlags: { getFlagVariants: () => ({}) }, getFeatureFlag() {}, isFeatureEnabled() {} };
  Object.assign(globalThis, { window: { posthog: ph }, document: { scripts: [] } });
  const g = fakeHelpers(); const realSetInterval = globalThis.setInterval; (globalThis as any).setInterval = () => 0;
  try { posthogAdapter.install(g.helpers); } finally { (globalThis as any).setInterval = realSetInterval; }
  const capture = g.methods.find(m => m.method === 'capture');
  assert.deepEqual([cat(capture.category, ['$pageview']), cat(capture.category, ['$feature_flag_called']), cat(capture.category, ['$autocapture']), cat(capture.category, ['signup'])], ['pageview', 'decision', 'lifecycle', 'custom']);
});
