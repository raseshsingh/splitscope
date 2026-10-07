import test from 'node:test';
import assert from 'node:assert/strict';
import { startCheck, recordCheck, finishCheck } from '../src/core/qa/check-run';
import { createPreview, resetPreviewUrl, previewOutcome } from '../src/core/qa/preview';
import { beginJourney, appendJourney, recordSnapshot } from '../src/core/qa/journey';
import { emptyWorkspace, normalizeWorkspace } from '../src/core/qa/workspace';
import { searchExperiments } from '../src/core/search';
import { normalizedExperiment } from '../src/core/hooks/runtime';
import { emptyPageState } from '../src/core/state';
import { eventsCsv, createReport, markdownReport } from '../src/core/qa/export';
import { convertAdapter } from '../src/adapters/convert';
const rule = { id: 'r', name: 'Checkout event', eventName: 'purchase', platform: 'all', required: ['value'], equals: { currency: 'USD' } };
const event = (id: string, properties: unknown, t = Date.now()) => ({ id, t, platform: 'optimizely' as const, category: 'custom' as const, via: 'api-call' as const, name: 'purchase', properties });
test('Checks freeze their rules, deduplicate events and retain failure after later valid events', () => {
  let run = startCheck([rule]);
  run = recordCheck(run, event('1', { value: 42, currency: 'EUR' }, run.startedAt))!;
  run = recordCheck(run, event('1', { value: 42, currency: 'USD' }, run.startedAt))!;
  run = recordCheck(run, event('2', { value: 42, currency: 'USD' }, run.startedAt))!;
  const final = finishCheck(run);
  assert.equal(final.results[0].status, 'failed'); assert.equal(final.results[0].matches, 2);
  assert.equal(recordCheck(final, event('3', {})), final);
  assert.equal(finishCheck(startCheck([rule])).results[0].status, 'not-observed');
});
test('Redacted expected values remain unverifiable and pre-start events are ignored', () => {
  const initial = startCheck([rule]);
  assert.equal(recordCheck(initial, event('old', {}, initial.startedAt - 1)), initial);
  const run = recordCheck(initial, event('new', { value: 42, currency: '[redacted]' }, initial.startedAt))!;
  assert.equal(run.results[0].status, 'unverifiable');
});
const request = { platform: 'optimizely' as const, experimentId: 'e', variationId: 'v', experiment: 'Exp', variation: 'Variant' };
const plan = (url: string) => ({ method: 'url' as const, url, explanation: 'fixture', tracking: 'disabled' as const });
test('Repeated previews restore original values while retaining later user edits', () => {
  const first = createPreview(request, plan('https://example.test/b?preview=one&keep=yes'), 'https://example.test/a?preview=original&keep=yes');
  const second = createPreview(request, plan('https://example.test/b?preview=two&keep=yes'), 'https://example.test/b?preview=one&keep=yes', first);
  assert.equal(resetPreviewUrl(second, 'https://example.test/b?preview=two&keep=changed'), 'https://example.test/a?keep=changed&preview=original');
  assert.throws(() => resetPreviewUrl(second, 'https://other.test/'));
  assert.throws(() => createPreview(request, plan('https://other.test/'), 'https://example.test/'));
});
test('Preview confirmation requires current activity and correct assignment', () => {
  const preview = createPreview(request, plan('https://example.test/?v=1'), 'https://example.test/');
  const activity = normalizedExperiment({ id: 'e', platform: 'optimizely', status: 'running-in', assignedVariationId: 'v' });
  assert.equal(previewOutcome(preview, [activity]), 'Requested assignment observed');
  assert.match(previewOutcome(preview, [{ ...activity, status: 'bucketed-elsewhere' }]), /unconfirmed/);
  const converted = convertAdapter.force!('1', '2', 'https://example.test/?keep=1') as any;
  assert.equal(new URL(converted.url).searchParams.get('convert_v'), '2');
  assert.equal(new URL(converted.url).searchParams.get('keep'), '1');
});
test('Journey scopes observations to origin and bounds retained history', () => {
  const journey = beginJourney('https://example.test');
  assert.equal(recordSnapshot(journey, { url: 'https://other.test/', experiments: [] }), false);
  assert.equal(recordSnapshot(journey, { url: 'https://example.test/a', documentId: 'a', experiments: [] }), true);
  assert.equal(recordSnapshot(journey, { url: 'https://example.test/a', documentId: 'a', experiments: [] }), false);
  assert.equal(recordSnapshot(journey, { url: 'https://example.test/a', documentId: 'b', experiments: [] }), true);
  for (let n = 0; n < 600; n++) appendJourney(journey, { t: n, type: 'event', name: `event ${n}` });
  assert.equal(journey.entries.length, 500); assert.equal(journey.omitted, 102);
});
test('Search matches activity names, IDs and variation IDs; workspace remains bounded', () => {
  const activity = normalizedExperiment({ id: 'abc', platform: 'optimizely', name: 'Checkout promise', variations: [{ id: 'xyz', name: 'Fast delivery' }] });
  for (const q of ['abc', 'checkout', 'XYZ']) assert.equal(searchExperiments([activity], q).length, 1);
  assert.equal(searchExperiments([activity], 'unknown').length, 0);
  assert.equal(searchExperiments([activity], 'xyz')[0].matchedVariationName, 'Fast delivery');
  const workspace = normalizeWorkspace({ ...emptyWorkspace(), pinned: ['p', 'p'], scope: 'bad' });
  assert.deepEqual(workspace.pinned, ['p']); assert.equal(workspace.scope, 'all');
});
test('Reports and CSV preserve source text, escape cells, and redact secret properties', () => {
  const state = emptyPageState('https://example.test/');
  state.experiments = [normalizedExperiment({ id: 'e', platform: 'optimizely', name: 'Fixture', changes: [{ type: 'js', code: 'sourceBody()' }] })];
  state.events = [event('1', { password: 'secret', amount: 42 })];
  const report = createReport(state, 'QA notes');
  assert.equal((report.activities[0] as any).changes[0].code, 'sourceBody()');
  assert.equal((report.events[0] as any).properties.password, '[redacted]');
  assert.match(markdownReport(state, 'QA notes'), /Fixture/);
  assert.match(eventsCsv([{ ...state.events[0], name: '=danger,"value"' }]), /"'=danger,""value"""/);
});
