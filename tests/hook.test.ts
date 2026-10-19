import test from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, String(v)); }, removeItem: (k: string) => { map.delete(k); }, map };
}

test('preview markers need a one time token issued by this browser', async () => {
  const storage = fakeStorage(); (globalThis as any).localStorage = storage;
  const { withPreviewToken, consumePreviewToken } = await import('../src/core/hooks/install');
  const plan = withPreviewToken({ method: 'url', url: 'https://shop.test/p?__splitscope_vwo=12:3' })!;
  const token = new URL(plan.url).searchParams.get('__splitscope_token');
  assert.ok(token && token.length === 32);
  assert.equal(consumePreviewToken('forged'), false);
  assert.equal(consumePreviewToken(null), false);
  assert.equal(consumePreviewToken(token), true);
  assert.equal(consumePreviewToken(token), false, 'a token works once');
  assert.deepEqual(withPreviewToken({ method: 'url', url: 'https://shop.test/?utm=1' }), { method: 'url', url: 'https://shop.test/?utm=1' }, 'plans without a marker are unchanged');
  storage.setItem('__splitscope_preview_tokens__', JSON.stringify({ old: Date.now() - 1 }));
  assert.equal(consumePreviewToken('old'), false, 'expired tokens are refused');
  delete (globalThis as any).localStorage;
});

test('the snapshot signature ignores capture time and notices status changes', async () => {
  const { snapshotSignature } = await import('../src/core/hooks/install');
  const base = { url: 'https://a.test/', capturedAt: 1, page: { title: 't', referrer: '', readyState: 'complete' }, platforms: [{ id: 'vwo', displayName: 'VWO', result: { state: 'active', confidence: 1, signals: ['x'] }, capabilities: {} }], experiments: [{ platform: 'vwo', id: '1', name: 'A', kind: 'ab', status: 'running-in', assignedVariationId: '2', variations: [{ id: '2', name: 'B' }] }] } as any;
  assert.equal(snapshotSignature(base), snapshotSignature({ ...base, capturedAt: 99 }));
  assert.notEqual(snapshotSignature(base), snapshotSignature({ ...base, experiments: [{ ...base.experiments[0], status: 'not-targeted' }] }));
  assert.notEqual(snapshotSignature(base), snapshotSignature({ ...base, experiments: [{ ...base.experiments[0], assignedVariationId: '1' }] }));
});
