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

test('panel shortcuts stay out of fields and dialogs', async () => {
  const { shortcutIntent } = await import('../src/ui/panel/shortcuts');
  const base = { modifier: false, inDialog: false, inField: false, settingsOpen: false };
  assert.deepEqual(shortcutIntent('2', base), { kind: 'section', index: 1 });
  assert.deepEqual(shortcutIntent('2', { ...base, inField: true }), { kind: 'none' });
  assert.deepEqual(shortcutIntent('2', { ...base, settingsOpen: true }), { kind: 'none' });
  assert.deepEqual(shortcutIntent('Escape', { ...base, inField: true }), { kind: 'blur' });
  assert.deepEqual(shortcutIntent('Escape', { ...base, inDialog: true }), { kind: 'none' });
  assert.deepEqual(shortcutIntent('Escape', base), { kind: 'escape' });
  assert.deepEqual(shortcutIntent('/', base), { kind: 'search' });
  assert.deepEqual(shortcutIntent('5', base), { kind: 'none' });
  assert.deepEqual(shortcutIntent('1', { ...base, modifier: true }), { kind: 'none' });
});

/** Run the real hook engine against a linkedom window with a fake panel bridge. */
async function hookHarness(adapters: any[]) {
  const { parseHTML } = await import('linkedom');
  const { window, document } = parseHTML('<html><head></head><body></body></html>') as any;
  const posted: any[] = [];
  Object.assign(window, { setInterval, clearInterval, setTimeout, clearTimeout, postMessage: (data: any) => { posted.push(data); } });
  const g = globalThis as any;
  const saved = { window: g.window, document: g.document, location: g.location, history: g.history, sessionStorage: g.sessionStorage };
  const history = { state: null, pushState() {}, replaceState() {} };
  const store = new Map<string, string>();
  Object.assign(g, { window, document, location: new URL('https://shop.test/p'), history, sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
  window.history = history;
  const { installHookEngine } = await import('../src/core/hooks/install');
  const deliver = (data: any) => { const event = new window.Event('message'); Object.assign(event, { data, source: window }); window.dispatchEvent(event); };
  installHookEngine(adapters);
  const restore = () => Object.assign(g, saved);
  return { window, posted, deliver, restore, stop: (nonce: string) => deliver({ namespace: '__splitscope__', nonce, type: 'command', requestId: 't', payload: { name: 'stop' } }) };
}

test('the hook wraps site methods transparently, connects once, and stops cleanly', async () => {
  const site = { calls: 0, track(this: any, name: string) { this.calls++; if (name === 'boom') throw new Error('site error'); return 'ok:' + name; } };
  const original = site.track;
  const adapter = { id: 'convert', displayName: 'Test', detect: () => ({ state: 'none', confidence: 0, signals: [] }), listExperiments: () => [], install(helpers: any) { helpers.wrapMethod(site, 'track', 'convert', (args: unknown[]) => String(args[0]), 'goal', () => { throw new Error('observer failure'); }); } };
  const h = await hookHarness([adapter]);
  try {
    assert.notEqual(site.track, original, 'method wrapped');
    assert.equal(site.track('cta'), 'ok:cta', 'return value passes through even when the observer throws');
    assert.equal(site.calls, 1, 'this is the original object');
    assert.throws(() => site.track('boom'), /site error/, 'site errors are rethrown unchanged');
    // Handshake: the bridge asks, the hook answers with its nonce, then flushes queued messages after ready.
    h.deliver({ namespace: '__splitscope__', nonce: 'bootstrap', type: 'hello' });
    const hello = h.posted.find(item => item.type === 'hello' && item.nonce !== 'bootstrap');
    assert.ok(hello?.nonce, 'hook answered the bootstrap');
    h.deliver({ namespace: '__splitscope__', nonce: hello.nonce, type: 'ready' });
    assert.ok(h.posted.some(item => item.type === 'event' && item.payload?.name === 'cta' && item.payload?.category === 'goal'), 'queued event flushed after ready');
    const before = h.posted.length;
    h.deliver({ namespace: '__splitscope__', nonce: 'bootstrap', type: 'hello' });
    assert.equal(h.posted.slice(before).filter(item => item.type === 'hello').length, 0, 'no nonce handed out after connecting');
    h.stop(hello.nonce);
    assert.equal(site.track, original, 'stop restores the original method');
    assert.equal((h.window as any)[Symbol.for('splitscope.hook')], undefined, 'stop removes the hook handle');
  } finally { h.restore(); }
});

test('a re-injected hook stops the running one instead of being blocked', async () => {
  const site = { track() { return 1; } };
  const original = site.track;
  const adapter = { id: 'convert', displayName: 'Test', detect: () => ({ state: 'none', confidence: 0, signals: [] }), listExperiments: () => [], install(helpers: any) { helpers.wrapMethod(site, 'track', 'convert'); } };
  const first = await hookHarness([adapter]);
  try {
    const firstWrapper = site.track;
    const { installHookEngine } = await import('../src/core/hooks/install');
    installHookEngine([adapter]);
    assert.notEqual(site.track, original, 'the new hook wrapped the method');
    assert.notEqual(site.track, firstWrapper, 'the old wrapper was removed first');
    (first.window as any)[Symbol.for('splitscope.hook')].stop();
    assert.equal(site.track, original);
  } finally { first.restore(); }
});

test('observing fetch never turns a rejection into a synchronous throw', async () => {
  const h = await hookHarness([]);
  try {
    // The harness window had no fetch, so install one and re-run the hook to wrap it.
    h.window.fetch = (input: any) => input == null ? Promise.reject(new TypeError('bad input')) : Promise.resolve('ok');
    const { installHookEngine } = await import('../src/core/hooks/install');
    installHookEngine([]);
    let result: Promise<unknown> | undefined;
    assert.doesNotThrow(() => { result = h.window.fetch(null); });
    await assert.rejects(result!, /bad input/);
    assert.equal(await h.window.fetch('https://cdn.optimizely.com/x'), 'ok');
    (h.window as any)[Symbol.for('splitscope.hook')].stop();
  } finally { h.restore(); }
});
