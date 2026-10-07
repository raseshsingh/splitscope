import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardDestination, dashboardPlatforms, activityLinkKey, templateLinkKey, resolveDashboardTemplate, normalizeDashboardLinks, safeDashboardUrl, convertDashboardContext } from '../src/core/dashboard-links';
import { normalizedExperiment } from '../src/core/hooks/runtime';
import { normalizeWorkspace } from '../src/core/qa/workspace';
import { parseSnapshot } from '../src/core/bridge/protocol';
import { optimizelyAdapter } from '../src/adapters/optimizely';
import { convertAdapter } from '../src/adapters/convert';
const experiment = normalizedExperiment({ platform: 'optimizely', id: '123', kind: 'ab', dashboardContext: { projectId: '456', runtime: 'web' } });

test('Dashboard routes distinguish experiments, personalization campaigns and Classic', () => {
  assert.equal(dashboardDestination(experiment).url, 'https://app.optimizely.com/v2/projects/456/experiments/123');
  assert.equal(dashboardDestination({ ...experiment, kind: 'personalization', campaignId: '789' }).url, 'https://app.optimizely.com/v2/projects/456/campaigns/789');
  assert.equal(dashboardDestination({ ...experiment, kind: 'personalization' }).direct, false);
  assert.equal(dashboardDestination({ ...experiment, dashboardContext: undefined }).direct, false);
  assert.equal(dashboardDestination({ ...experiment, id: '123/../../bad' }).direct, false);
  assert.equal(dashboardDestination({ ...experiment, dashboardContext: { runtime: 'classic' } }).url, 'https://www.optimizely.com/edit?experiment_id=123');
});

test('Convert uses documented script IDs and refuses ambiguous snippets', () => {
  const sources = ['https://cdn-4.convertexperiments.com/v1/js/111-222.js', 'https://cdn-4.convertexperiments.com/v1/js/111-222.js?v=1'];
  const context = convertDashboardContext(sources);
  assert.deepEqual(context, { accountId: '111', projectId: '222' });
  assert.equal(dashboardDestination({ ...experiment, platform: 'convert', dashboardContext: context }).url, 'https://app.convert.com/accounts/111/projects/222/experiences/123');
  assert.equal(convertDashboardContext([...sources, 'https://cdn-3.convertexperiments.com/js/333-444.js']), undefined);
  assert.equal(convertDashboardContext(['https://cdn-4.convertexperiments.com.evil.test/js/111-222.js']), undefined);
  assert.equal(convertDashboardContext(['https://custom.example.com/js/111-222.js']), undefined);
});

test('All supported platforms have an honest fallback, never inventing direct routes', () => {
  assert.equal(Object.keys(dashboardPlatforms).length, 14);
  for (const platform of Object.keys(dashboardPlatforms) as Array<keyof typeof dashboardPlatforms>) {
    const result = dashboardDestination({ ...experiment, platform, dashboardContext: undefined });
    assert.equal(result.direct, false, platform);
    assert.ok(result.reason, platform);
    if (result.url) assert.ok(safeDashboardUrl(result.url));
  }
});

test('Saved exact links override templates; templates encode IDs and fail closed', () => {
  const links = { [templateLinkKey(experiment)]: 'https://console.example.com/project/42/experiment/{id}', [activityLinkKey(experiment)]: 'https://console.example.com/special/123' };
  assert.equal(dashboardDestination(experiment, links).url, 'https://console.example.com/special/123');
  delete links[activityLinkKey(experiment)];
  assert.equal(dashboardDestination({ ...experiment, id: 'a/b?#' }, links).url, 'https://console.example.com/project/42/experiment/a%2Fb%3F%23');
  assert.match(resolveDashboardTemplate('https://console.example.com/{campaignId}', experiment).error!, /does not expose/);
  assert.match(resolveDashboardTemplate('https://console.example.com/{secret}', experiment).error!, /Unknown/);
  assert.ok(resolveDashboardTemplate('https://{id}.example.com/path', experiment).error);
  assert.equal(dashboardDestination(experiment, { [templateLinkKey(experiment)]: 'javascript:alert(1)' }).url, undefined);
  assert.equal(dashboardDestination({ ...experiment, kind: 'personalization' }, links).direct, false);
  assert.equal(dashboardDestination({ ...experiment, dashboardContext: { projectId: '999' } }, links).saved, undefined);
  assert.notEqual(activityLinkKey(experiment), activityLinkKey({ ...experiment, dashboardContext: { projectId: '999' } }));
});

test('Dashboard URLs reject executable schemes, credentials, control characters and relative links', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', '//example.com/path', 'https://user:password@example.com/path', 'https://example.com/\npath', 'https://example.com/\\evil', 'https://{id}.example.com/']) assert.equal(safeDashboardUrl(url), undefined, url);
  assert.equal(safeDashboardUrl('https://experience.adobe.com/#/@org/target/activities/123'), 'https://experience.adobe.com/#/@org/target/activities/123');
});

test('Workspace preserves valid links and bounds saved data', () => {
  const input = { [activityLinkKey(experiment)]: 'https://console.example.com/123', [templateLinkKey(experiment)]: 'https://console.example.com/{id}', 'type:vwo:ab': 'javascript:bad', '__proto__': 'https://bad.example' };
  assert.equal(Object.keys(normalizeDashboardLinks(input)).length, 2);
  assert.deepEqual(normalizeWorkspace({ dashboardLinks: input }).dashboardLinks, normalizeDashboardLinks(input));
  assert.deepEqual(normalizeWorkspace({}).dashboardLinks, {});
  assert.equal(Object.keys(normalizeDashboardLinks(Object.fromEntries(Array.from({ length: 250 }, (_, id) => [`activity:vwo:${id}`, `https://console.example.com/${id}`])))).length, 200);
});

test('Adapters retain dashboard context through normalized bridge snapshots', () => {
  Object.assign(globalThis, { window: { optimizely: { get(name: string) { return name === 'data' ? { projectId: 456, experiments: { 123: { id: 123, name: 'Example', type: 'ab', layerId: 789, variations: [] } } } : {}; } } }, document: { scripts: [{ src: 'https://cdn-4.convertexperiments.com/v1/js/111-222.js' }] } });
  const activity = optimizelyAdapter.listExperiments()[0];
  assert.equal(activity.dashboardContext?.projectId, '456'); assert.equal(activity.campaignId, '789');
  const parsed = parseSnapshot({ url: 'https://example.com', capturedAt: Date.now(), platforms: [], experiments: [activity], page: { title: '', referrer: '', readyState: 'complete' } });
  assert.equal(parsed?.experiments[0].dashboardContext?.projectId, '456');
  (globalThis as any).window.convert = { data: { experiences: { 123: { id: 123 } } } };
  assert.equal(dashboardDestination(convertAdapter.listExperiments()[0]).url, 'https://app.convert.com/accounts/111/projects/222/experiences/123');
});
