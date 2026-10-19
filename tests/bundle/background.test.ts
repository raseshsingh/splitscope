import test from 'node:test';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { requireFreshBuild } from './fresh';
requireFreshBuild();
const script = readFileSync('.output/chrome-mv3/background.js', 'utf8');
const manifest = JSON.parse(readFileSync('.output/chrome-mv3/manifest.json', 'utf8'));
function worker(optionalFailure = false) {
  const listeners: Record<string, any> = {}; const messages: any[] = []; let rules:any[]=[]; const navigations:any[]=[];
  const event = (name: string) => ({ addListener(fn: any) { listeners[name] = fn; } });
  const saved: Record<string, any> = { 'splitscope:settings': { keepLog: false } };
  const area = { get: async () => structuredClone(saved), set: async (value: any) => { Object.assign(saved, structuredClone(value)); }, remove: async (key: string | string[]) => { for (const k of Array.isArray(key) ? key : [key]) delete saved[k]; } };
  const chrome = {
    runtime: { id: 'test', onMessage: event('message') },
    storage: { local: area, session: area },
    action: { onClicked: event('click'), setIcon: () => { if (optionalFailure) throw new Error('Icon unavailable'); return Promise.resolve(); }, setTitle: async () => {}, setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    cookies: {getAll:async()=>[],remove:async()=>({})},
    declarativeNetRequest: {getSessionRules:async()=>rules,updateSessionRules:async(change:any)=>{rules=rules.filter(r=>!change.removeRuleIds?.includes(r.id));rules.push(...(change.addRules||[]));}},
    tabs: { reload:async(id:number)=>navigations.push({reload:id}),update:async(id:number,value:any)=>navigations.push({id,...value}),create:async(value:any)=>{navigations.push(value);return {id:8};}, onUpdated: event('update'), onRemoved: event('remove'), query: async () => [{ id: 7 }], sendMessage: async (_id: number, message: any) => { messages.push(message); return message.type === 'bridge.ping' ? { protocol: 3, build: manifest.version, instanceId: 'fixture' } : { ok: true, mounted: true }; } },
    commands: { onCommand: event('command') },
    webRequest: optionalFailure ? undefined : { onBeforeRequest: event('network'), onCompleted:event('completed') }
  };
  // Deliberately omit OffscreenCanvas, DOM and ImageData: startup must not require them.
  runInNewContext(script, { chrome, URL, crypto: webcrypto, console, TextEncoder, setTimeout, clearTimeout });
  return { listeners, messages, navigations, get rules(){return rules;}, send: (message: any) => new Promise<any>(resolve => listeners.message(message, { frameId:0, tab: { id: 7, url: 'https://example.test/' }, url: 'https://example.test/' }, resolve)) };
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

test('Compiled worker preserves absent Journey replies and stores start/stop/clear lifecycle', async () => {
  const w = worker();
  assert.equal(await w.send({ type: 'journey.get' }), null);
  const recording = await w.send({ type: 'journey.start' });
  assert.equal(recording.recording, true); assert.equal(recording.entries.length, 0);
  await w.send({ type: 'page.snapshot', state: { url: 'https://example.test/shop', documentId: '1', platforms: [], experiments: [] } });
  const loaded = await w.send({ type: 'journey.get' });
  assert.equal(loaded.entries[0].type, 'navigation');
  assert.equal((await w.send({ type: 'journey.stop' })).recording, false);
  assert.equal(await w.send({ type: 'journey.clear' }), null);
  assert.equal(await w.send({ type: 'journey.get' }), null);
});


test('Compiled Target QA manager saves exact links and blocks only the requesting tab',async()=>{
 const w=worker();
 assert.equal((await w.send({type:'target.command',action:'status'})).saved.length,0);
 const url='https://example.test/?at_preview_token=sample&at_preview_index=1_2';
 assert.equal((await w.send({type:'target.command',action:'save',url,label:'B'})).ok,true);
 const status=await w.send({type:'target.command',action:'status'});
 assert.equal(status.saved[0].index,'1_2');assert.ok(!JSON.stringify(status).includes('sample'));
 await w.send({type:'target.command',action:'open',id:0,newTab:true});assert.equal(w.navigations[0].url,url);
 await w.send({type:'target.command',action:'block',enabled:true});assert.equal(w.rules.length,3);assert.ok(w.rules.every(r=>r.condition.tabIds[0]===7));
 await w.send({type:'target.command',action:'block',enabled:false});assert.equal(w.rules.length,0);
 const rejected=await w.send({type:'target.command',action:'save',url:'https://other.test/?at_preview_token=sample&at_preview_index=1_2'});assert.ok(rejected.__splitscopeError);
 await w.send({type:'target.command',action:'remove',id:0});assert.equal((await w.send({type:'target.command',action:'status'})).saved.length,0);
});

test('Target session captures survive log retention off and clear with Events',async()=>{
 const w=worker();const properties={schema:'target-wire-v1',pipe:'atjs2',target:true,url:'https://target.example.test/rest/v1/delivery',page:'https://example.test/',at:1,duration:1,status:200,locations:[],request:{},response:{}};
 await w.send({type:'page.event',event:{id:'target-session',platform:'adobe-target',pageUrl:'https://example.test/',properties}});
 const captures=await w.send({type:'target.command',action:'captures'});assert.equal(captures.length,1);
 await w.send({type:'page.clearEvents'});assert.equal((await w.send({type:'target.command',action:'captures'})).length,0);
});
