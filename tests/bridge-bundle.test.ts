import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
const bundle = '.output/chrome-mv3/content-scripts/bridge.js';
class CustomEventMock extends Event { detail: unknown; constructor(name: string, options: any) { super(name); this.detail = options?.detail; } }
function environment(chrome: any) {
  const win: any = new EventTarget(); win.postMessage = () => {}; win.setInterval = () => 1; win.clearInterval = () => {};
  return { chrome, window: win, document: new EventTarget(), location: { href: 'https://example.test/', origin: 'https://example.test' }, crypto: webcrypto, Event, CustomEvent: CustomEventMock, AbortController, URL, URLSearchParams, console, setTimeout, clearTimeout };
}
test('Built bridge handles missing runtime after extension replacement', { skip: !existsSync(bundle) }, async () => {
  const env = environment({});
  await assert.doesNotReject(Promise.resolve(runInNewContext(readFileSync(bundle, 'utf8'), env)));
});
test('Built bridge catches context invalidation during listener registration', { skip: !existsSync(bundle) }, async () => {
  const env = environment({ runtime: { id: 'test', sendMessage: async () => ({}) }, storage: { onChanged: { addListener() { throw new Error('Extension context invalidated.'); }, removeListener() {} } } });
  await assert.doesNotReject(Promise.resolve(runInNewContext(readFileSync(bundle, 'utf8'), env)));
  assert.equal(env.window.__splitscopeBridgeInstalled, undefined);
});
test('Built bridge handles invalidated sendMessage rejection', { skip: !existsSync(bundle) }, async () => {
  const event = { addListener() {}, removeListener() {} };
  const env = environment({ runtime: { id: 'test', sendMessage: () => Promise.reject(new Error('Extension context invalidated.')), onMessage: event }, storage: { onChanged: event } });
  await assert.doesNotReject(Promise.resolve(runInNewContext(readFileSync(bundle, 'utf8'), env)));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(env.window.__splitscopeBridgeInstalled, undefined);
});
