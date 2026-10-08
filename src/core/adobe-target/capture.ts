import { privacySignals } from './privacy';
import { installTargetTiming } from './timing';
import { enrichIntegrity } from './integrity';
import type { HookHelpers } from '../hooks/runtime';
import { sanitize } from '../sanitize';
import { classifyTarget, normalizeWire, targetPropositions, type TargetWire } from './wire';
const MAX = 1_000_000;
/** Clone response streams with a hard bound. Never consume the site's response. */
async function readResponse(response: Response) {
  const clone = response.clone(); const reader = clone.body?.getReader(); if (!reader) return '';
  let size = 0; let text = ''; const decoder = new TextDecoder();
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > MAX) { void reader.cancel(); return {captureLimited:true}; } text += decoder.decode(part.value,{stream:true}); } return text+decoder.decode(); }
  finally { reader.releaseLock(); }
}
export function installTargetCapture(helpers: HookHelpers, decision: (data: unknown)=>void) {
  if (typeof window.fetch !== 'function' || typeof XMLHttpRequest === 'undefined') return;
  let alive = true;
  const pageId=globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const observeTiming=installTargetTiming(helpers);
  const record = async (input: Parameters<typeof normalizeWire>[0]) => {
    if (!alive) return;
    try {
      const wire = normalizeWire({...input,pageId}); if (!wire) return;
      wire.privacy=privacySignals(wire.request,wire.response);
      const globalMbox=(window as any).adobe?.target?.settings?.globalMboxName||(window as any).targetGlobalSettings?.globalMboxName;
      for(const box of wire.locations)if(box.name==='pageLoad')box.name=typeof globalMbox==='string'?globalMbox:'target-global-mbox';
      if(wire.page===location.href)observeTiming(wire);
      if (wire.target && wire.pipe !== 'ode' && wire.page === location.href) decision(wire.pipe === 'edge' ? targetPropositions(wire.response).map(p=>({...p, activityId:p.scopeDetails.activity?.id, experienceId:p.scopeDetails.experience?.id})) : wire.response);
      const integrity=await enrichIntegrity(wire);
      if (!alive) return;
      helpers.emit({platform:wire.target?'adobe-target':wire.pipe==='analytics'?'adobe-analytics':'page', category:'network',name:`Target inspector · ${wire.pipe} · ${wire.status || 'network failure'}`, via:'network', properties:sanitize({...Object.fromEntries(Object.entries(wire).filter(([key])=>key!=='request'&&key!=='response')),integrity,request:wire.request,response:wire.response},400_000,18)});
    } catch { /* Observation must not affect delivery. */ }
  };
  const original = window.fetch;
  const wrapped: typeof fetch = function(this: Window, input, init) {
    let url:string,request:Promise<unknown>;
    try {
      url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url,location.href).href;
      if(!classifyTarget(url))return Reflect.apply(original,this,[input,init]);
      const body=init?.body;
      request=body!==undefined?Promise.resolve(body):input instanceof Request?readResponse(new Response(input.clone().body)).catch(()=>({captureUnavailable:true})):Promise.resolve(null);
    } catch { return Reflect.apply(original,this,[input,init]); }
    const at=Date.now(),page=location.href;
    const promise=Reflect.apply(original,this,[input,init]);
    void promise.then(async response=>{const duration=Date.now()-at;let result:unknown;try{result=await readResponse(response);}catch{result={captureUnavailable:true};}await record({url,page,at,duration,status:response.status,request:await request,response:result});},async error=>{await record({url,page,at,duration:Date.now()-at,status:0,error:String(error),request:await request});}).catch(()=>{});
    return promise;
  };
  window.fetch=wrapped;
  const open=XMLHttpRequest.prototype.open, send=XMLHttpRequest.prototype.send;
  const pending=new WeakMap<XMLHttpRequest,string>();
  const openWrap: typeof open=function(this: XMLHttpRequest, method: string,url: string | URL,...args:any[]) { pending.set(this,new URL(String(url),location.href).href); return Reflect.apply(open,this,[method,url,...args]); } as typeof open;
  const sendWrap: typeof send=function(this: XMLHttpRequest, body) {
    const url=pending.get(this); if(url&&classifyTarget(url)) {const at=Date.now(),page=location.href;this.addEventListener('loadend',()=>{try {const response=this.responseType==='json'?this.response:!this.responseType||this.responseType==='text'?this.responseText:undefined;record({url,page,at,duration:Date.now()-at,status:this.status,request:body,response:typeof response==='string'&&response.length>MAX?{captureLimited:true}:response});}catch{}},{once:true});}
    return Reflect.apply(send,this,[body]);
  };
  XMLHttpRequest.prototype.open=openWrap; XMLHttpRequest.prototype.send=sendWrap;
  helpers.addCleanup(()=>{alive=false;if(window.fetch===wrapped)window.fetch=original;if(XMLHttpRequest.prototype.open===openWrap)XMLHttpRequest.prototype.open=open;if(XMLHttpRequest.prototype.send===sendWrap)XMLHttpRequest.prototype.send=send;});
}
export function isWire(value: any): value is TargetWire {
 if(value?.schema!=='target-wire-v1'||!['atjs1','atjs2','edge','ode','analytics'].includes(value.pipe)||typeof value.url!=='string'||typeof value.page!=='string'||!Number.isFinite(value.at)||!Number.isFinite(value.duration)||!Number.isFinite(value.status)||!Array.isArray(value.locations))return false;
 try{new URL(value.url);}catch{return false;}
 if(!value.locations.every((l:any)=>l&&typeof l.name==='string'&&typeof l.phase==='string'&&Array.isArray(l.parameters)&&l.parameters.every((k:any)=>typeof k==='string')&&Array.isArray(l.profile)&&l.profile.every((k:any)=>typeof k==='string')))return false;
 const i=value.integrity;
 if(i&&(!Array.isArray(i.served)||!Array.isArray(i.notices)||!i.identity||!Array.isArray(i.identity.customers)||!i.served.every((s:any)=>s&&typeof s.ref==='string')||!i.notices.every((n:any)=>n&&typeof n.ref==='string')))return false;
 return true;
}
