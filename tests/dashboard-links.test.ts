import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardDestination, convertDashboardContext } from '../src/core/dashboard-links';
import { normalizedExperiment } from '../src/core/hooks/runtime';
import { parseSnapshot } from '../src/core/bridge/protocol';
import { optimizelyAdapter } from '../src/adapters/optimizely';
import { convertAdapter } from '../src/adapters/convert';
const experiment = normalizedExperiment({ platform: 'optimizely', id: '123', kind: 'ab', dashboardContext: { projectId: '456', runtime: 'web' } });

test('Automatic links require exact activity context', () => {
  assert.equal(dashboardDestination(experiment)?.url, 'https://app.optimizely.com/v2/projects/456/experiments/123');
  assert.equal(dashboardDestination({ ...experiment, kind: 'personalization', campaignId: '789' })?.url, 'https://app.optimizely.com/v2/projects/456/campaigns/789');
  for (const patch of [{kind:'personalization'}, {dashboardContext:undefined}, {id:'123/../../bad'}]) assert.equal(dashboardDestination({...experiment,...patch} as typeof experiment), undefined);
  assert.equal(dashboardDestination({...experiment, platform:'adobe-target'}), undefined);
  assert.equal(dashboardDestination({...experiment, platform:'kameleoon'})?.url, 'https://app.kameleoon.com/experiments/results/123');
  assert.equal(dashboardDestination({...experiment, platform:'kameleoon', kind:'personalization'})?.url, 'https://app.kameleoon.com/personalizations/results/123');
  assert.equal(dashboardDestination({...experiment, platform:'kameleoon', kind:'unknown'}), undefined);
});
test('Convert requires unambiguous account and project identifiers', () => {
 const source='https://cdn-4.convertexperiments.com/v1/js/111-222.js';
 const context=convertDashboardContext([source]);
 assert.deepEqual(context,{accountId:'111',projectId:'222'});
 assert.equal(dashboardDestination({...experiment,platform:'convert',dashboardContext:context})?.url,'https://app.convert.com/accounts/111/projects/222/experiences/123');
 assert.equal(convertDashboardContext([source,'https://cdn-3.convertexperiments.com/js/333-444.js']),undefined);
 assert.equal(convertDashboardContext(['https://cdn-4.convertexperiments.com.evil.test/js/111-222.js']),undefined);
});
test('Adapters retain dashboard context through normalized bridge snapshots', () => {
  Object.assign(globalThis, { window: { optimizely: { get(name: string) { return name === 'data' ? { projectId: 456, experiments: { 123: { id: 123, name: 'Example', type: 'ab', layerId: 789, variations: [] } } } : {}; } } }, document: { scripts: [{ src: 'https://cdn-4.convertexperiments.com/v1/js/111-222.js' }] } });
  const activity = optimizelyAdapter.listExperiments()[0];
  assert.equal(activity.dashboardContext?.projectId, '456'); assert.equal(activity.campaignId, '789');
  const parsed = parseSnapshot({ url: 'https://example.com', capturedAt: Date.now(), platforms: [], experiments: [activity], page: { title: '', referrer: '', readyState: 'complete' } });
  assert.equal(parsed?.experiments[0].dashboardContext?.projectId, '456');
  (globalThis as any).window.convert = { data: { experiences: { 123: { id: 123 } } } };
  assert.equal(dashboardDestination(convertAdapter.listExperiments()[0])?.url, 'https://app.convert.com/accounts/111/projects/222/experiences/123');
});
