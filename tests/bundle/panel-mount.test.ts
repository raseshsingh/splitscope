import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { parseHTML } from 'linkedom';
import { requireFreshBuild } from './fresh';
requireFreshBuild();

async function mountHarness() {
  const { document, window } = parseHTML('<html><head></head><body>Host page</body></html>');
  let listener: any; let shadow: any; let fetches = 0;
  let journey: any = null; const saved: Record<string, any> = {}; const messages: any[] = []; const copied: string[] = []; const downloads: Blob[] = [];
  class TestURL extends URL { static createObjectURL(blob: Blob) { downloads.push(blob); return 'blob:fixture'; } static revokeObjectURL() {} }
  const create = document.createElement.bind(document);
  document.createElement = ((name: string) => {
    const element = create(name);
    if (name === 'dialog') { (element as any).showModal = () => element.setAttribute('open', ''); (element as any).close = () => element.removeAttribute('open'); }
    if (name === 'splitscope-panel') {
      const attach = element.attachShadow.bind(element);
      element.attachShadow = options => { shadow = attach(options); return shadow; };
    }
    return element;
  }) as any;
  const runtime = { id: 'test', onMessage: { addListener(fn: any) { listener = fn; }, removeListener() {} }, getURL: (p: string) => 'chrome-extension://test' + p, sendMessage: async (message: any) => {
    messages.push(message);
    if (message.type === 'journey.start') journey = { origin: 'https://www.keurig.com', startedAt: Date.now(), recording: true, lastUrl: '', decisions: {}, entries: [], omitted: 0 };
    if (message.type === 'journey.stop' && journey) journey = { ...journey, recording: false, endedAt: Date.now() };
    if (message.type === 'journey.clear') journey = null;
    if (message.type.startsWith('journey.')) return journey;
    return null;
  } };
  window.postMessage = () => {}; window.setInterval = (() => 1) as any; window.clearInterval = () => {};
  const context = { window, document, chrome: { runtime, storage: { local: { get: async () => saved, set: async (value: any) => { Object.assign(saved, value); } }, onChanged: { addListener() {}, removeListener() {} } } }, location: { href: 'https://www.keurig.com/', origin: 'https://www.keurig.com' }, crypto: webcrypto, URL: TestURL, Blob, Event: window.Event, CustomEvent: window.CustomEvent, AbortController, console, TextEncoder, setInterval: (callback: any, ms: number) => { const timer=setInterval(callback,ms); timer.unref?.(); return timer; }, clearInterval, setTimeout: (callback: any, ms: number) => { const timer = setTimeout(callback, ms); timer.unref?.(); return timer; }, clearTimeout, requestAnimationFrame: (callback: any) => setTimeout(() => callback(Date.now()), 0), cancelAnimationFrame: clearTimeout, fetch: async () => { fetches++; throw new Error('Stylesheet network request blocked'); }, MutationObserver: window.MutationObserver, HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node, navigator: { clipboard: { writeText: async (text: string) => { copied.push(text); } } }, getComputedStyle: () => ({}) };
  await runInNewContext(readFileSync('.output/chrome-mv3/content-scripts/bridge.js', 'utf8'), context);
  return {
    document, runtime, messages, copied, downloads, get shadow() { return shadow; }, get fetches() { return fetches; },
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

const settle = () => new Promise(resolve => setTimeout(resolve, 20));
async function click(h: any, label: string) {
  const button = [...h.shadow.querySelectorAll('button')].find((node: any) => !node.closest('[hidden]') && (node.textContent.trim() === label || node.getAttribute('aria-label') === label)) as any;
  assert.ok(button, `Button ${label} exists`); assert.equal(button.disabled, false);
  button.click(); await settle();
  assert.doesNotMatch(h.shadow.querySelector('.ss-app').textContent, /Panel render failed|could not display this page/);
}
async function section(h: any, tab: string) { await h.send({ type: 'panel.open', tab }); await settle(); }

test('Compiled panel: every main tab, code/raw/targeting/events, search and QA tool lifecycle', async () => {
  const h = await mountHarness(); const nonce = 'ui-fixture';
  const manifest = JSON.parse(readFileSync('.output/chrome-mv3/manifest.json', 'utf8'));
  h.post({ namespace: '__splitscope__', nonce, type: 'hello', payload: { build: manifest.version } });
  const fixture = { url: 'https://www.keurig.com/', capturedAt: Date.now(), platforms: [{ id: 'optimizely', displayName: 'Optimizely', result: { state: 'active', confidence: 1, signals: ['fixture'] }, capabilities: { listAll: 'full', forceVariation: 'url', events: true, changes: 'partial', notes: {} } }], experiments: [{ id: 'e', platform: 'optimizely', name: 'Code fixture', kind: 'ab', status: 'running-in', source: ['runtime-api'], variations: [{ id: 'v', name: 'Variant', changes: [{ type: 'js', code: 'window.fixture = true' }] }], targeting: { urls: ['/shop'] }, assignedVariationId: 'v', raw: { fixture: true } }], page: { title: 'Fixture', referrer: '', readyState: 'complete' } };
  h.post({ namespace: '__splitscope__', nonce, type: 'snapshot', payload: fixture });
  await section(h, 'activities');
  assert.equal(h.shadow.querySelector('.ss-dashboard-actions'), null); // Missing project/ID: no fallback controls.
  assert.doesNotMatch(h.shadow.querySelector('.ss-app').textContent, /Open dashboard|Add direct link|Link settings/);
  const card = h.shadow.querySelector('.ss-activity'); assert.ok(card); card.click(); await settle();
  await click(h, 'Pin activity');
  await click(h, 'Preview');
  const plan = { method: 'url', url: 'https://www.keurig.com/?optimizely_x=v', tracking: 'disabled', explanation: 'Fixture preview' };
  const proposal = { message: 'force-plan', plan, request: { platform: 'optimizely', experimentId: 'e', variationId: 'v', experiment: 'Code fixture', variation: 'Variant' } };
  h.post({ namespace: '__splitscope__', nonce, type: 'status', payload: structuredClone(proposal) }); await settle();
  assert.ok(h.shadow.querySelector('dialog[open]')); await click(h, 'Cancel'); assert.equal(h.shadow.querySelector('dialog'), null);
  await click(h, 'Preview'); h.post({ namespace: '__splitscope__', nonce, type: 'status', payload: structuredClone(proposal) }); await settle();
  await click(h, 'Open in new tab'); assert.equal(h.messages.find((m: any) => m.type === 'preview.open')?.url, plan.url);

  await click(h, 'Code & changes');
  const disclosure = h.shadow.querySelector('.ss-disclosure-toggle'); assert.ok(disclosure); disclosure.click(); await settle();
  assert.equal(h.shadow.querySelector('.ss-source-code').textContent, 'window.fixture = true');
  await click(h, 'Copy code'); assert.equal(h.copied.at(-1), 'window.fixture = true');
  await click(h, 'Save code'); assert.equal(await h.downloads.at(-1)!.text(), 'window.fixture = true');
  await click(h, 'Disable line wrap'); assert.ok(h.shadow.querySelector('.ss-code-nowrap'));
  await click(h, 'Targeting'); assert.match(h.shadow.querySelector('.ss-app').textContent, /\/shop/);
  await click(h, 'Events 0'); assert.match(h.shadow.querySelector('.ss-app').textContent, /Linked events/);
  await click(h, 'Raw'); assert.match(h.shadow.querySelector('.ss-app').textContent, /Complete captured data/);
  await click(h, 'All activities');
  const input = h.shadow.querySelector('input[type=search]'); input.value = 'missing'; input.dispatchEvent(new h.document.defaultView.Event('input', { bubbles: true })); await settle();
  assert.match(h.shadow.querySelector('.ss-app').textContent, /No matching activities/); await click(h, 'Clear all filters'); assert.ok(h.shadow.querySelector('.ss-activity'));
  await section(h, 'events');
  h.post({ namespace: '__splitscope__', nonce, type: 'event', payload: { id: 'evt', t: Date.now(), platform: 'optimizely', name: 'purchase', category: 'custom', via: 'api-call', experimentId: 'e', properties: { amount: 49 } } }); await settle();
  assert.ok(h.shadow.querySelector('.ss-event-summary')); assert.equal(h.shadow.querySelector('.ss-event-body'), null);
  h.shadow.querySelector('.ss-event-summary').click(); await settle(); assert.match(h.shadow.querySelector('.ss-event-body').textContent, /amount49/);
  await click(h, 'Freeze list'); await click(h, 'Resume live list'); await click(h, 'Stop recording'); await click(h, 'Start recording');
  await click(h, 'Export CSV'); assert.match(await h.downloads.at(-1)!.text(), /purchase/);
  await section(h, 'page'); assert.match(h.shadow.querySelector('.ss-app').textContent, /Inspector connection/);
  await section(h, 'settings'); assert.match(h.shadow.querySelector('.ss-app').textContent, /Capture analytics calls/); assert.ok(h.shadow.querySelector('.ss-drawer')); await click(h, 'Close settings'); assert.equal(h.shadow.querySelector('.ss-drawer'), null);
  await section(h, 'tools'); await click(h, 'JSON report'); assert.equal(JSON.parse(await h.downloads.at(-1)!.text()).activities[0].id, 'e');
  await click(h, 'Markdown'); assert.match(await h.downloads.at(-1)!.text(), /Code fixture/);
  await click(h, 'Compare'); await click(h, 'Save baseline'); assert.match(h.shadow.querySelector('.ss-app').textContent, /No assignment changes/);
  await click(h, 'Overlap'); assert.match(h.shadow.querySelector('.ss-app').textContent, /Selector overlap hints/);
  await click(h, 'Journey'); await click(h, 'Start recording'); assert.match(h.shadow.querySelector('.ss-app').textContent, /0 observations/);
  await click(h, 'Stop recording'); await click(h, 'Export JSON'); assert.equal(JSON.parse(await h.downloads.at(-1)!.text()).recording, false);
  await click(h, 'New recording'); await click(h, 'Keep'); await click(h, 'Delete recording'); await click(h, 'Delete'); assert.match(h.shadow.querySelector('.ss-app').textContent, /Start recording/);
  await click(h, 'Workspace'); await click(h, 'Export workspace'); assert.equal(JSON.parse(await h.downloads.at(-1)!.text()).workspace.pinned[0], 'optimizely:e');
  await click(h, 'Clear this workspace'); await click(h, 'Clear workspace'); assert.match(h.shadow.querySelector('.ss-app').textContent, /0 pinned activities/);
  await h.send({ type: 'panel.close' });
});

test('Target-specific sections all render from captured delivery data', async () => {
 const h=await mountHarness();const nonce='target-fixture';
 h.post({namespace:'__splitscope__',nonce,type:'hello'});
 h.post({namespace:'__splitscope__',nonce,type:'event',payload:{id:'target-wire',t:Date.now(),platform:'adobe-target',category:'network',name:'Target delivery',via:'network',properties:{schema:'target-wire-v1',pipe:'atjs2',url:'https://target.example.com/rest/v1/delivery',page:'https://www.keurig.com/',at:Date.now(),duration:10,status:200,target:true,ajoCount:0,locations:[],request:{},response:{}}}});
 await h.send({type:'panel.open'});await settle();
 const button=(name:string)=>[...h.shadow.querySelectorAll('button')].find((b:any)=>b.textContent.trim()===name) as any;
 assert.ok(!button('Target'));
 const tools=[...h.shadow.querySelectorAll('button')].find((b:any)=>b.textContent.includes('Adobe Target tools')) as any;
 tools.click();await settle();
 for(const name of ['Timeline','Raw','Identity','A4T','Tracking','Timing','Findings','QA','Mboxes','On-device','Memory','Conflicts']){
  const picker=h.shadow.querySelector('[aria-label="Adobe Target tool"]');assert.ok(picker,name);
  const tabButton=[...picker.querySelectorAll('button')].find((b:any)=>b.textContent.trim()===name) as any;assert.ok(tabButton,name);tabButton.click();await settle();
  assert.doesNotMatch(h.shadow.querySelector('.ss-panel')?.textContent || '',/could not display this page/);assert.ok(h.shadow.querySelector('.ss-panel'),name);
 }
 await h.send({type:'panel.close'});
});
