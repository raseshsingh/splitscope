import test from 'node:test';
import assert from 'node:assert/strict';
import { capStrings, planStorageCleanup, storageUsage, EXPIRY_MS } from '../src/core/storage-budget';

const now = 1_800_000_000_000, old = now - EXPIRY_MS - 1;

test('stored strings are clipped', () => {
  const out = capStrings({ dom: 'x'.repeat(30), list: ['y'.repeat(30)], n: 1 }, 10) as any;
  assert.equal(out.dom, 'x'.repeat(10) + '…[truncated]'); assert.equal(out.list[0], 'y'.repeat(10) + '…[truncated]'); assert.equal(out.n, 1);
});

test('Target memory and QA links expire after 30 days; settings and workspaces are untouched', () => {
  const plan = planStorageCleanup({
    'splitscope:settings': { theme: 'dark' },
    'splitscope:target-memory:https://a.test': [{ id: '1', lastSeen: old }, { id: '2', lastSeen: now }],
    'splitscope:target-qa:https://b.test': [{ url: 'u', savedAt: old }],
    'splitscope:target-qa-observed:https://b.test': old,
    'splitscope:workspace:https://a.test': { notes: 'keep' },
    'other-extension-key': 1,
  }, now);
  assert.deepEqual(plan.set, { 'splitscope:target-memory:https://a.test': [{ id: '2', lastSeen: now }] });
  assert.deepEqual(plan.remove.sort(), ['splitscope:target-qa-observed:https://b.test', 'splitscope:target-qa:https://b.test']);
});

test('over budget, automatic captures go before workspaces, oldest first', () => {
  const big = 'z'.repeat(400);
  const plan = planStorageCleanup({
    'splitscope:workspace:https://a.test': { notes: big },
    'splitscope:target-memory:https://old.test': [{ lastSeen: now - 5000, content: big }],
    'splitscope:target-memory:https://new.test': [{ lastSeen: now - 10, content: big }],
  }, now, 600);
  assert.deepEqual(plan.remove, ['splitscope:target-memory:https://old.test', 'splitscope:target-memory:https://new.test']);
});

test('usage counts only Splitscope keys and sites', () => {
  const usage = storageUsage({ 'splitscope:settings': {}, 'splitscope:workspace:https://a.test': {}, 'splitscope:expectations:https://a.test': [], 'x': 'y' });
  assert.equal(usage.keys, 3); assert.equal(usage.sites, 1); assert.ok(usage.bytes > 0);
});
