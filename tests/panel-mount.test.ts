import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { parseHTML } from 'linkedom';

async function mountHarness() {
  const { document, window } = parseHTML('<html><head></head><body>Host page</body></html>');
  let listener: any; let shadow: any; let fetches = 0;
  const create = document.createElement.bind(document);
  document.createElement = ((name: string) => {
    const element = create(name);
    if (name === 'splitscope-panel') {
      const attach = element.attachShadow.bind(element);
      element.attachShadow = options => { shadow = attach(options); return shadow; };
    }
    return element;
  }) as any;
  const runtime = { id: 'test', onMessage: { addListener(fn: any) { listener = fn; }, removeListener() {} }, getURL: (p: string) => 'chrome-extension://test' + p, sendMessage: async () => null };
  window.postMessage = () => {}; window.setInterval = (() => 1) as any; window.clearInterval = () => {};
  const context = { window, document, chrome: { runtime, storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {}, removeListener() {} } } }, location: { href: 'https://www.keurig.com/', origin: 'https://www.keurig.com' }, crypto: webcrypto, URL, Event: window.Event, CustomEvent: window.CustomEvent, AbortController, console, TextEncoder, setTimeout, clearTimeout, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, fetch: async () => { fetches++; throw new Error('Stylesheet network request blocked'); }, MutationObserver: window.MutationObserver, Element: window.Element, Node: window.Node, navigator: {}, getComputedStyle: () => ({}) };
  await runInNewContext(readFileSync('.output/chrome-mv3/content-scripts/bridge.js', 'utf8'), context);
  return {
    document, runtime, get shadow() { return shadow; }, get fetches() { return fetches; },
    send: (message: any) => new Promise<any>(resolve => listener(message, {}, resolve)),
    post(data: any) { const event = new window.Event('message'); Object.assign(event, { data, source: window }); window.dispatchEvent(event); }
  };
}

test('Built panel repeatedly opens and closes with stylesheet fetching unavailable', async () => {
  const h = await mountHarness();
  for (let i = 0; i < 6; i++) {
    const reply = await h.send({ type: 'panel.open' });
    assert.equal(reply.mounted, true, `open ${i + 1}`);
    assert.ok(h.document.querySelector('splitscope-panel')?.isConnected);
    assert.ok(h.shadow.querySelector('.ss-panel'));
    assert.match(h.shadow.querySelector('style').textContent, /position:fixed|position: fixed/);
    await h.send({ type: 'panel.close' });
    assert.equal(h.document.querySelector('splitscope-panel'), null);
  }
  assert.equal(h.fetches, 0);
});

test('Snapshot and malformed page messages do not prevent opening the built panel', async () => {
  const h = await mountHarness(); const nonce = 'fixture';
  h.post({ namespace: '__splitscope__', nonce, type: 'hello' });
  h.post({ namespace: '__splitscope__', nonce, type: 'snapshot', payload: { url: 'https://www.keurig.com/', capturedAt: Date.now(), experiments: [], platforms: [], page: { title: 'Keurig', referrer: '', readyState: 'complete' } } });
  h.post({ namespace: '__splitscope__', nonce, type: 'event', payload: { platform: 'invalid' } });
  assert.equal((await h.send({ type: 'panel.open' })).mounted, true);
  assert.match(h.shadow.querySelector('.ss-panel').textContent, /Splitscope/);
  await h.send({ type: 'panel.close' });
});
