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
  const record = (input: Parameters<typeof normalizeWire>[0]) => {
    if (!alive) return;
    try {
      const wire = normalizeWire(input); if (!wire) return;
      if (wire.target && wire.pipe !== 'ode') decision(wire.pipe === 'edge' ? targetPropositions(wire.response).map(p=>({...p, activityId:p.scopeDetails.activity?.id, experienceId:p.scopeDetails.experience?.id})) : wire.response);
      helpers.emit({platform:wire.target?'adobe-target':wire.pipe==='analytics'?'adobe-analytics':'page', category:'network',name:`Target inspector · ${wire.pipe} · ${wire.status || 'network failure'}`, via:'network', properties:sanitize(wire,400_000,18)});
    } catch { /* Observation must not affect delivery. */ }
  };
  const original = window.fetch;
  const wrapped: typeof fetch = function(this: Window, input, init) {
    const url = new URL(typeof input==='string'||input instanceof URL?String(input):input.url,location.href).href;
    if (!classifyTarget(url)) return Reflect.apply(original,this,[input,init]);
    const at=Date.now(), page=location.href;
    const body = init?.body ?? (input instanceof Request ? undefined : null);
    const request = input instanceof Request && body===undefined ? readResponse(new Response(input.clone().body)).catch(()=>({captureUnavailable:true})) : Promise.resolve(body);
    const promise = Reflect.apply(original,this,[input,init]);
    void promise.then(async response=> { const duration=Date.now()-at; const result=await readResponse(response); record({url,page,at,duration,status:response.status,request:await request,response:result}); },error=>{record({url,page,at,duration:Date.now()-at,status:0,error:String(error),request:body});}).catch(()=>{});
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
export function isWire(value: any): value is TargetWire { return value?.schema==='target-wire-v1' && Array.isArray(value.locations); }
