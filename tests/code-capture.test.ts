import test from 'node:test';
import assert from 'node:assert/strict';
import { variationChanges } from '../src/core/changes';
import { sanitize } from '../src/core/sanitize';
import { readTargetActivities } from '../src/adapters/adobe-target';
import { optimizelyAdapter } from '../src/adapters/optimizely';
import { messageListener } from '../src/core/extension/messages';
import { beginJourney, readJourney } from '../src/core/qa/journey';
import { parseSnapshot } from '../src/core/bridge/protocol';
Object.assign(globalThis, { location: { href: 'https://example.test/' } });
const tokens = { 'activity.id': 'a', 'experience.id': 'v', 'activity.name': 'Code fixture' };

test('Function source survives sanitization without invoking function or custom toString', () => {
  let called = 0;
  function customCode() { called++; return 'actual variation body'; }
  customCode.toString = () => { throw new Error('Do not invoke'); };
  assert.match((sanitize({ customCode }) as any).customCode, /actual variation body/);
  assert.match(variationChanges({ code: customCode })![0].code!, /actual variation body/);
  assert.equal(called, 0);
  assert.match(variationChanges({ code: customCode.bind(null) })![0].codeUnavailable!, /unavailable/);
});
test('Nested Optimizely custom_code and attribute HTML keep source and selectors', () => {
  const changes = variationChanges({ actions: [{ pageId: 'p', changes: [{ type: 'custom_code', value: function () { return 'custom body'; } }, { type: 'attribute', selector: '.hero', attributes: { html: '<b>Title</b>', title: 'Accessible title' } }] }] })!;
  assert.ok(changes.some(c => c.type === 'js' && c.code?.includes('custom body')));
  assert.ok(changes.some(c => c.type === 'html' && c.selector === '.hero' && c.code === '<b>Title</b>'));
  assert.ok(changes.some(c => c.type === 'attribute' && (c.data as any).title === 'Accessible title'));
});
test('Extraction skips getters and unrelated SDK methods, and bounds cyclic data', () => {
  const value: any = { get code() { throw new Error('getter executed'); }, target() { return 'not variation code'; }, customJs: 'hello()' };
  value.changes = [value];
  assert.deepEqual(variationChanges(value)?.map(c => c.code), ['hello()']);
});
test('Adobe multiple offers and repeated metadata preserve all code without sibling leakage', () => {
  const activities = readTargetActivities({ execute: { pageLoad: { options: [
    { type: 'html', content: '<script>first()</script>', responseTokens: tokens },
    { type: 'actions', content: [{ type: 'setHtml', selector: '#hero', content: '<style>.hero{color:red}</style>' }], responseTokens: tokens },
    { type: 'html', content: '<b>different activity</b>', responseTokens: { ...tokens, 'activity.id': 'b' } }
  ] } }, responseTokens: [tokens] }, 'delivered');
  const changes = activities.find(a => a.id === 'a')!.variations[0].changes!;
  assert.ok(changes.some(c => c.code?.includes('first()')));
  assert.ok(changes.some(c => c.code?.includes('color:red')));
  assert.ok(!changes.some(c => c.code?.includes('different activity')));
});
test('Adobe Web SDK keeps item data associated with response tokens in metadata', () => {
  const [a] = readTargetActivities({ items: [{ schema: 'https://ns.adobe.com/personalization/dom-action', data: { type: 'setHtml', selector: '#banner', content: '<script>webSdkCode()</script>' }, meta: { 'activity.id': 'a', 'experience.id': 'v' } }] }, 'delivered');
  assert.ok(a.variations[0].changes?.some(c => c.code?.includes('webSdkCode')));
});
test('Optimizely resolves shared variation definitions plus local and campaign code', () => {
  const data = { experiments: { e: { id: 'e', variations: [{ id: 'v', customJs: 'localCode()' }] } }, campaigns: { c: { id: 'c', experiments: ['e'], changes: [{ type: 'custom_code', value: 'sharedCode()' }] } }, variations: { v: { id: 'v', actions: [{ changes: [{ type: 'custom_code', value: function () { return 'loadedBody'; } }] }] } } };
  Object.assign(globalThis, { window: { optimizely: { get: (key: string) => key === 'data' ? data : { getActiveExperimentIds: () => ['e'] } } } });
  const [activity] = optimizelyAdapter.listExperiments();
  assert.ok(activity.variations[0].changes?.some(c => c.code?.includes('loadedBody')));
  assert.ok(activity.variations[0].changes?.some(c => c.code === 'localCode()'));
  assert.ok(activity.changes?.some(c => c.code === 'sharedCode()'));
});
test('Large source is marked truncated and survives the complete serialized snapshot', () => {
  const changes = variationChanges({ code: 'x'.repeat(150000) })!;
  assert.match(changes[0].code!, /truncated/);
  const activity = { platform: 'optimizely', id: 'e', name: 'Large code', kind: 'ab', status: 'unknown', source: ['runtime-api'], variations: [], changes };
  const result = parseSnapshot(sanitize({ url: location.href, capturedAt: 1, platforms: [], experiments: [activity], page: { title: '', referrer: '', readyState: 'complete' } }, 2000000, 16));
  assert.equal(result?.omitted, 0);
  assert.match((result?.experiments[0] as any).changes[0].code, /truncated/);
});
test('Null journey messages stay null; acknowledgements cannot become recordings', async () => {
  for (const [value, expected] of [[null, null], [undefined, { ok: true }]]) {
    const listener = messageListener(() => true, () => value);
    const reply = await new Promise(resolve => listener({}, {} as any, resolve));
    assert.deepEqual(reply, expected);
  }
  assert.equal(readJourney({ ok: true }), null);
  assert.equal(readJourney({ ...beginJourney('https://example.test'), entries: [null] }), null);
  assert.equal(readJourney(beginJourney('https://example.test'))?.entries.length, 0);
});
