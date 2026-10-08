import test from 'node:test';
import assert from 'node:assert/strict';
import { browserEnv, cookieDomains, planReset, runReset, type VisitorEnv } from '../src/core/visitor-reset';

function fake(cookies: string[], local: string[] = [], session: string[] = [], stubborn: string[] = []) {
  const jar = new Set(cookies), ls = new Set(local), ss = new Set(session);
  const env: VisitorEnv = {
    hostname: 'www.shop.example.co.uk', pathname: '/a/b/c',
    cookieNames: () => [...jar],
    setCookie: text => { const name = text.split('=')[0]!; if (!stubborn.includes(name) && /Max-Age=0/.test(text) && /path=\/(;|$)/.test(text) && /domain=\.?shop\.example\.co\.uk/.test(text) || (!stubborn.includes(name) && /Max-Age=0/.test(text) && !/domain=/.test(text) && /path=\/(;|$)/.test(text))) jar.delete(name); },
    keys: kind => [...(kind === 'local' ? ls : ss)],
    remove: (kind, key) => { (kind === 'local' ? ls : ss).delete(key); }
  };
  return { env, jar, ls, ss };
}

test('Plan separates assignment from visitor ID and only lists what exists', () => {
  const { env } = fake(['optimizelyEndUserId', 'optimizelyBuckets', 'unrelated', '_vis_opt_exp_7_combi', '_vwo_uuid_v2'], ['optimizelyData$$x', 'other'], ['kameleoonData']);
  const withId = planReset(['optimizely', 'vwo', 'kameleoon', 'monetate'], env, true).map(i => `${i.platform}:${i.kind}:${i.name}:${i.group}`).sort();
  assert.deepEqual(withId, ['kameleoon:session:kameleoonData:assignment', 'optimizely:cookie:optimizelyBuckets:assignment', 'optimizely:cookie:optimizelyEndUserId:identity', 'optimizely:local:optimizelyData$$x:assignment', 'vwo:cookie:_vis_opt_exp_7_combi:assignment', 'vwo:cookie:_vwo_uuid_v2:identity']);
  const without = planReset(['optimizely', 'vwo'], env, false);
  assert.ok(without.every(i => i.group === 'assignment'));
  assert.ok(!without.some(i => i.name === 'unrelated'));
});

test('Reset removes cookies on parent domains and storage keys, and reports what could not be cleared', () => {
  const { env, jar, ls } = fake(['mt.v', 'mt.sc', 'keep', 'HttpOnlyLike'], ['mt.x', 'keep'], [], ['mt.sc']);
  const plan = planReset(['monetate'], env, true);
  assert.equal(plan.length, 3);
  const result = runReset(plan, env);
  assert.deepEqual(result.remaining.map(i => i.name), ['mt.sc']);
  assert.ok(result.cleared.some(i => i.name === 'mt.v'));
  assert.ok(!jar.has('mt.v') && jar.has('keep') && !ls.has('mt.x') && ls.has('keep'));
});

test('Cookie domains cover the host and every parent, and skip IP addresses', () => {
  assert.deepEqual(cookieDomains('a.b.example.com'), [undefined, 'a.b.example.com', '.a.b.example.com', 'b.example.com', '.b.example.com', 'example.com', '.example.com']);
  assert.deepEqual(cookieDomains('127.0.0.1'), [undefined]);
});

test('Browser environment tolerates blocked storage', () => {
  Object.assign(globalThis, { location: { hostname: 'x.test', pathname: '/' }, document: { cookie: 'a=1; b=2' }, window: { get localStorage() { throw new Error('blocked'); }, get sessionStorage() { throw new Error('blocked'); } } });
  const env = browserEnv();
  assert.deepEqual(env.cookieNames(), ['a', 'b']);
  assert.deepEqual(env.keys('local'), []);
  assert.doesNotThrow(() => env.remove('local', 'x'));
});
