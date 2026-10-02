import test from 'node:test';
import assert from 'node:assert/strict';
import { readTargetActivities, adobeTargetAdapter } from '../src/adapters/adobe-target';
import { isTargetEndpoint } from '../src/core/target-evidence';
import { sanitize } from '../src/core/sanitize';
import { normalizedExperiment, variationChanges } from '../src/core/hooks/runtime';
import { activityDetails } from '../src/core/qa/activity-details';
import { queueKameleoonPreview } from '../src/core/hooks/kameleoon-preview';
import { parseSnapshot } from '../src/core/bridge/protocol';
const tokens = { 'activity.id': 831395, 'activity.name': 'Homepage selector', 'activity.type': 'xt', 'experience.id': 2, 'experience.name': 'Experience C' };
test('Adobe endpoint detection excludes Analytics, AEP and lookalike URLs', () => {
  assert.equal(isTargetEndpoint('https://client.tt.omtrdc.net/rest/v1/delivery?client=x'), true);
  for (const url of ['https://client.sc.omtrdc.net/b/ss/id', 'https://edge.adobedc.net/ee/v1/interact', 'https://adobe.com/x', 'https://evil.test/?u=https://client.tt.omtrdc.net/rest/v1/delivery', 'https://client.tt.omtrdc.net.evil.test/m2/x']) assert.equal(isTargetEndpoint(url), false, url);
});
test('General alloy and empty adobe.target globals do not detect Target', () => {
  Object.assign(globalThis, { window: { alloy() {}, adobe: { target: {} } } });
  assert.equal(adobeTargetAdapter.detect().confidence, 0);
});
test('Adobe tokens identify activity, personalization and current decision', () => {
  const [activity] = readTargetActivities({ responseTokens: [tokens] }, 'delivered');
  assert.equal(activity.id, '831395'); assert.equal(activity.kind, 'personalization'); assert.equal(activity.status, 'running-in'); assert.equal(activity.assignedVariationId, '2');
  assert.equal(readTargetActivities({ responseTokens: [tokens] })[0].status, 'unknown');
});
test('Adobe prefetched decisions are not marked active', () => {
  assert.equal(readTargetActivities({ prefetch: { views: [{ options: [{ responseTokens: tokens }] }] } }, 'delivered')[0].status, 'unknown');
});
test('Adobe captured offer code is available on its experience', () => {
  const [activity] = readTargetActivities({ execute: { pageLoad: { options: [{ type: 'html', content: '<script>window.example = true</script>', responseTokens: tokens }] } } }, 'delivered');
  assert.ok(activity.variations[0].changes?.some(change => change.code?.includes('window.example')));
});
test('Adobe rendering events correlate request IDs, failures clear active status', () => {
  Object.assign(globalThis, { window: {}, location: { href: 'https://example.test/' } });
  const listeners = new Map(); const activities: any[] = [];
  adobeTargetAdapter.install({ emit() {}, wrapMethod() {}, addCleanup() {}, listen(name: string, fn: any) { listeners.set(name, fn); }, addExperiment(a: any) { activities.push(a); } } as any);
  listeners.get('at-request-succeeded')({ detail: { requestId: 'r1', responseTokens: [tokens] } });
  listeners.get('at-content-rendering-succeeded')({ detail: { requestId: 'r1' } });
  assert.match(activities.at(-1).statusReason, /confirmed successful/);
  listeners.get('at-content-rendering-failed')({ detail: { responseTokens: [tokens] } });
  assert.equal(activities.at(-1).status, 'unknown');
});
test('Generic AEP monitor events cannot create Target observations', () => {
  const win: any = {}; Object.assign(globalThis, { window: win, location: { href: 'https://example.test/' } });
  const events: any[] = [];
  adobeTargetAdapter.install({ emit(e: any) { events.push(e); }, wrapMethod() {}, addCleanup() {}, listen() {}, addExperiment() {} } as any);
  win.__alloyMonitors[0].onCommandResolved({ result: { identity: 'example' } });
  assert.equal(events.length, 0);
});
test('Response metadata remains inspectable while credentials stay redacted', () => {
  const data = sanitize({ responseTokens: tokens, access_token: 'secret', tokens: 'credential', email: 'private@example.test' }) as any;
  assert.equal(data.responseTokens['activity.id'], 831395); assert.equal(data.access_token, '[redacted]'); assert.equal(data.tokens, '[redacted]'); assert.equal(data.email, '[redacted]');
});
test('Activity tabs follow available fields', () => {
  const activity = normalizedExperiment({ platform: 'adobe-target', id: 'a' });
  assert.deepEqual(activityDetails(activity).tabs, ['overview', 'raw']);
  activity.changes = [{ type: 'js', code: 'example()' }]; activity.targeting = { urls: ['/'] };
  assert.deepEqual(activityDetails(activity).tabs, ['overview', 'changes', 'targeting', 'raw']);
});
test('Common custom-code fields are collected', () => {
  assert.equal(variationChanges({ customJs: 'example()' })?.[0].code, 'example()');
});
test('Kameleoon overwrites existing assignment and reloads only after confirmation', () => {
  let id = 1; const calls: any[] = []; const navigations: string[] = [];
  const win: any = { Kameleoon: { API: { Experiments: {
    getById: () => ({ variations: [{ id: 0 }, { id: 1 }, { id: 2 }], associatedVariation: { id } }),
    assignVariation: (experiment: number, variation: number, overwrite: boolean) => { calls.push([experiment, variation, overwrite]); if (overwrite) id = variation; }
  } } } };
  queueKameleoonPreview(win, '42:2', 'https://example.test/', url => navigations.push(url), () => {});
  assert.equal(calls.length, 0); win.kameleoonQueue[0]();
  assert.deepEqual(calls, [[42, 2, true]]); assert.deepEqual(navigations, ['https://example.test/']);
  queueKameleoonPreview(win, '42:0', 'https://example.test/', url => navigations.push(url), () => {}); win.kameleoonQueue[1](); assert.equal(id, 0);
});
test('Kameleoon does not navigate or claim success on unavailable variation', () => {
  const win: any = { Kameleoon: { API: { Experiments: { getById: () => ({ variations: [] }) } } } }; const errors: any[] = [];
  queueKameleoonPreview(win, '42:2', 'https://example.test/', () => assert.fail('must not navigate'), (message, error) => errors.push(error)); win.kameleoonQueue[0](); assert.equal(errors.length, 1);
});
test('Long custom code survives bridge validation', () => {
  const activity = normalizedExperiment({ platform: 'optimizely', id: 'a', changes: [{ type: 'js', code: 'x'.repeat(40_000) }] });
  const result = parseSnapshot({ url: 'https://example.test/', capturedAt: 1, platforms: [], experiments: [activity], page: { title: '', referrer: '', readyState: 'complete' } });
  assert.equal(result?.omitted, 0);
});

test('Kameleoon loaded JavaScript and CSS are inspectable without execution', () => {
  const changes = variationChanges({ javaScriptCode: { code: 'window.example = true', evaluated: true }, css: '.hero {color: blue}' });
  assert.deepEqual(changes?.map(c => c.type), ['js', 'css']);
  assert.match(changes![0].code!, /window.example/);
});
