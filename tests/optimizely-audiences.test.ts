import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAudiences, evaluateConditions, type AudienceEnv } from '../src/core/optimizely/audiences';

const env: AudienceEnv = { search: '?utm_source=news&n=5', href: 'https://x.test/p?utm_source=news&n=5', referrer: 'https://google.com/', language: 'en-GB', cookies: { plan: 'pro' } };

test('Audience conditions combine with and, or and not, and keep unknown values unknown', () => {
  const conditions = JSON.stringify(['and', ['or', ['or', { type: 'query', name: 'utm_source', value: 'news', match: 'exact' }]], ['not', ['or', { type: 'cookie', name: 'plan', value: 'free', match: 'exact' }]]]);
  const tree = evaluateConditions(conditions, {}, env);
  assert.equal(tree.result, true);
  const unknown = evaluateConditions(['and', { type: 'location', value: 'US' }, { type: 'query', name: 'n', value: '9', match: 'gt' }], {}, env);
  assert.equal(unknown.result, false, 'a false branch decides an and even when another is unknown');
  assert.equal(evaluateConditions(['or', { type: 'location', value: 'US' }, { type: 'query', name: 'n', value: '1', match: 'gt' }], {}, env).result, true);
  assert.equal(evaluateConditions(['and', { type: 'location', value: 'US' }], {}, env).result, null);
});

test('Custom attributes use what the visitor has, and are unknown when attributes are not exposed', () => {
  const condition = { type: 'custom_attribute', name: 'tier', value: 'gold', match: 'exact' };
  assert.equal(evaluateConditions(['or', condition], { tier: 'gold' }, env).result, true);
  assert.equal(evaluateConditions(['or', condition], { tier: 'silver' }, env).result, false);
  assert.equal(evaluateConditions(['or', condition], {}, env, true).result, false);
  assert.equal(evaluateConditions(['or', condition], {}, env, false).result, null);
  assert.equal(evaluateConditions(['or', condition], { tier: '[redacted]' }, env).result, null);
  assert.equal(evaluateConditions(['or', { type: 'custom_attribute', name: 'tier', match: 'exists' }], { tier: 'x' }, env).result, true);
});

test('Experiment audiences are or-ed, empty means everyone, and bad regex does not throw', () => {
  const a = { id: '1', name: 'Pro users', conditions: ['or', { type: 'cookie', name: 'plan', value: 'pro' }] };
  const b = { id: '2', name: 'Mobile', conditions: ['or', { type: 'cookie', name: 'device', value: 'm' }] };
  const result = evaluateAudiences([a, b], {}, env);
  assert.equal(result.result, true);
  assert.deepEqual(result.audiences.map(item => item.tree.result), [true, false]);
  assert.equal(evaluateAudiences([], {}, env).result, true);
  assert.equal(evaluateConditions(['or', { type: 'cookie', name: 'plan', value: '(', match: 'regex' }], {}, env).result, null);
  assert.equal(evaluateConditions('not json', {}, env).result, null);
});
