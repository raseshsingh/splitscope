import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const script = readFileSync('.output/chrome-mv3/background.js', 'utf8');
const manifest = JSON.parse(readFileSync('.output/chrome-mv3/manifest.json', 'utf8'));
function worker(optionalFailure = false) {
  const listeners: Record<string, any> = {}; const messages: any[] = [];
  const event = (name: string) => ({ addListener(fn: any) { listeners[name] = fn; } });
  const area = { get: async () => ({ 'splitscope:settings': { keepLog: false } }), set: async () => {}, remove: async () => {} };
  const chrome = {
    runtime: { id: 'test', onMessage: event('message') },
    storage: { local: area, session: area },
    action: { onClicked: event('click'), setIcon: () => { if (optionalFailure) throw new Error('Icon unavailable'); return Promise.resolve(); }, setTitle: async () => {}, setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    tabs: { onUpdated: event('update'), onRemoved: event('remove'), query: async () => [{ id: 7 }], sendMessage: async (_id: number, message: any) => { messages.push(message); return message.type === 'bridge.ping' ? { protocol: 3, build: manifest.version, instanceId: 'fixture' } : { ok: true, mounted: true }; } },
    commands: { onCommand: event('command') },
    webRequest: optionalFailure ? undefined : { onBeforeRequest: event('network') }
  };
  // Deliberately omit OffscreenCanvas, DOM and ImageData: startup must not require them.
  runInNewContext(script, { chrome, URL, console, TextEncoder, setTimeout, clearTimeout });
  return { listeners, messages, send: (message: any) => new Promise<any>(resolve => listeners.message(message, { tab: { id: 7 } }, resolve)) };
}
for (const optionalFailure of [false, true]) {
  test(`Built worker registers and serves messages with optional failures=${optionalFailure}`, async () => {
    const w = worker(optionalFailure);
    assert.ok(w.listeners.click); assert.ok(w.listeners.command);
    assert.equal((await w.send({ type: 'background.ping' })).build, manifest.version);
    assert.equal((await w.send({ type: 'settings.get' }))['splitscope:settings'].keepLog, false);
    await w.listeners.click({ id: 7 });
    assert.deepEqual(w.messages.map(m => m.type), ['bridge.ping', 'panel.open']);
  });
}
test('Built manifest includes packaged toolbar images', () => {
  assert.equal(readFileSync('.output/chrome-mv3/' + manifest.action.default_icon).subarray(1, 4).toString(), 'PNG');
});
