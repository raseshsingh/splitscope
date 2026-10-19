import test from 'node:test';
import assert from 'node:assert/strict';
import { activityEvents } from '../src/core/qa/presentation';

const event = (id: string, extra: Record<string, unknown>) => ({ id, t: Number(id), platform: 'optimizely', category: 'custom', via: 'api-call', name: 'x', ...extra }) as any;
const activity = (status: string) => ({ platform: 'optimizely', id: 'e1', name: 'Menu test', kind: 'ab', status, variations: [], source: [], goals: [{ id: 'at-2927__menu_opens', name: 'Menu opens' }] }) as any;

test('Activity events separate explicit links, metric matches and other events sent while active', () => {
  const events = [
    event('1', { experimentId: 'e1', category: 'decision', name: 'campaignDecided' }),
    event('2', { name: 'at-2927__menu_opens' }),
    event('3', { name: 'add_to_cart', category: 'goal' }),
    event('4', { name: 'Page activated: home', category: 'lifecycle' }),
    event('5', { name: 'other', experimentId: 'e2' }),
    event('6', { platform: 'kameleoon', name: 'at-2927__menu_opens' })
  ];
  const active = activityEvents(events, activity('running-in'));
  assert.deepEqual(active.linked.map(e => e.id), ['1']);
  assert.deepEqual(active.metric.map(e => e.id), ['2']);
  assert.deepEqual(active.platform.map(e => e.id), ['3']);
  const inactive = activityEvents(events, activity('not-on-page'));
  assert.deepEqual(inactive.metric.map(e => e.id), ['2'], 'a metric match is shown even when the activity is not active');
  assert.deepEqual(inactive.platform, [], 'unrelated events are not attributed to an inactive activity');
});

import { confirmedCallIndex, mergeConfirmation } from '../src/core/qa/presentation';
test('A platform listener confirming an API call folds into one event; unrelated or late events stay separate', () => {
  const call = { id: 'c', t: 1000, platform: 'optimizely', category: 'custom', via: 'api-call', name: 'at-2927__menu_opens', properties: [{ type: 'event' }] } as any;
  const other = { id: 'o', t: 1100, platform: 'optimizely', category: 'custom', via: 'api-call', name: 'add_to_cart' } as any;
  const listener = { id: 'l', t: 1200, platform: 'optimizely', category: 'custom', via: 'listener', name: 'at-2927__menu_opens', properties: { data: { name: 'at-2927__menu_opens' } } } as any;
  assert.equal(confirmedCallIndex([call, other], listener), 0);
  const merged = mergeConfirmation(call, listener);
  assert.equal(merged.id, 'c'); assert.equal(merged.confirmedBy, 'listener'); assert.deepEqual(merged.confirmation, listener.properties);
  assert.equal(confirmedCallIndex([merged], { ...listener, id: 'l2' }), -1, 'a call is confirmed only once, so a real second event still shows');
  assert.equal(confirmedCallIndex([call], { ...listener, t: 5000 }), -1, 'too late to be the same action');
  assert.equal(confirmedCallIndex([call], { ...listener, platform: 'kameleoon' }), -1);
  assert.equal(confirmedCallIndex([call], { ...listener, via: 'api-call' }), -1, 'two API calls are two actions');
  // Kameleoon and Convert name the API call by goal ID and the listener event carries the goal ID.
  const kCall = { id: 'k', t: 1000, platform: 'kameleoon', category: 'goal', via: 'api-call', name: 'Conversion: 9' } as any;
  assert.equal(confirmedCallIndex([kCall], { id: 'kl', t: 1050, platform: 'kameleoon', category: 'goal', via: 'dom-event', name: 'Conversion: Purchase', properties: { goalId: '9', goalName: 'Purchase' } } as any), 0);
  const cCall = { id: 'v', t: 1000, platform: 'convert', category: 'goal', via: 'api-call', name: 'Conversion: 300' } as any;
  assert.equal(confirmedCallIndex([cCall], { id: 'vl', t: 1300, platform: 'convert', category: 'goal', via: 'listener', name: 'Goal triggered: 300', experimentId: '100', properties: { goalId: '300' } } as any), 0);
  assert.equal(mergeConfirmation(cCall, { id: 'vl', t: 1300, platform: 'convert', category: 'goal', via: 'listener', name: 'x', experimentId: '100', variationId: '200' } as any).experimentId, '100', 'the listener can add the activity link the call lacked');
});
