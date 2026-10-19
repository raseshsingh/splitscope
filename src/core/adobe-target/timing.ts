import type {HookHelpers} from '../hooks/runtime';
import {sanitize} from '../sanitize';
import {samePage} from '../page-key';
import {walk,type TargetWire} from './wire';
export function timingMetrics(start:number,response:number,mutation:number,prehideEnd?:number) {
 return {requestToMutationMs:Math.max(0,mutation-start),responseToMutationMs:Math.max(0,mutation-response),possibleFlickerMs:prehideEnd===undefined?undefined:Math.max(0,mutation-prehideEnd)};
}
export function installTargetTiming(helpers:HookHelpers) {
 if(typeof MutationObserver==='undefined')return (_:TargetWire)=>{};
 let prehideStart:number|undefined,prehideEnd:number|undefined,hadPrehide=false;
 const pending=new Map<string,{start:number;response:number;before:string;page:string}>();
 const emit=(name:string,properties:any)=>helpers.emit({platform:'adobe-target',category:'lifecycle',name,via:'listener',properties:sanitize(properties,200_000)});
 const checkPrehide=()=>{
 const present=!!document.getElementById('at-body-style');
 if(present&&!hadPrehide){prehideStart=Date.now();prehideEnd=undefined;emit('Target prehide started',{schema:'target-timing-v1',prehideStart});}
 if(!present&&hadPrehide){prehideEnd=Date.now();emit('Target prehide ended',{schema:'target-timing-v1',prehideStart,prehideEnd,duration:prehideStart?prehideEnd-prehideStart:undefined});}
 hadPrehide=present;
 };
 const observer=new MutationObserver(mutations=>{
 checkPrehide();let checked=0;
 for(const [selector,watch] of pending){
 if(!samePage(watch.page)||Date.now()-watch.response>30000){pending.delete(selector);continue;}
 try{
 const nodes=[...document.querySelectorAll(selector)].slice(0,50);
 const touched=mutations.slice(0,100).some(m=>nodes.some(node=>{if(++checked>5000)return false;return node===m.target||node.contains(m.target)||Array.from(m.addedNodes).some(added=>added===node||added.contains(node));}));
 if(touched){pending.delete(selector);const mutation=Date.now();emit('Target selector mutation observed',{schema:'target-timing-v1',selector,...timingMetrics(watch.start,watch.response,mutation,prehideEnd),prehideObserved:prehideStart!==undefined,before:watch.before,after:nodes[0]?.outerHTML.slice(0,12000),attribution:'Temporal correlation only; another script may have changed this element.'});}
 }catch{pending.delete(selector);}
 }
 if(!pending.size)watch(false);
 });
 // Attribute and text mutations are only watched while a Target response is waiting to be correlated; otherwise only node additions matter (prehide style).
 let wide=false;
 const watch=(full:boolean)=>{if(full===wide)return;wide=full;observer.observe(document,full?{subtree:true,childList:true,attributes:true,characterData:true}:{subtree:true,childList:true});};
 observer.observe(document,{subtree:true,childList:true});checkPrehide();
 let last='';
 const captureConfig=()=>{
 const target=(window as any).adobe?.target;const settings=target?.settings||(window as any).targetGlobalSettings;
 if(!target&&!settings)return;
 const config={hasGetOffers:typeof target?.getOffers==='function',version:target?.VERSION,clientCode:settings?.clientCode,globalMboxName:settings?.globalMboxName,timeout:settings?.timeout,decisioningMethod:settings?.decisioningMethod,bodyHiddenStyle:settings?.bodyHiddenStyle};
 const next=JSON.stringify(config);if(next!==last){last=next;emit('Target configuration observed',{schema:'target-config-v1',config});}
 };
 captureConfig();const timer=setInterval(captureConfig,2000);
 helpers.addCleanup(()=>{observer.disconnect();clearInterval(timer);pending.clear();});
 return (r:TargetWire)=>{
 if(!r.target||r.pipe==='ode')return;
 walk(r.response,node=>{const selector=node.cssSelector||node.selector;if(typeof selector!=='string'||selector.length>2000||pending.size>=100)return;try{pending.set(selector,{page:r.page,start:r.at,response:Date.now(),before:document.querySelector(selector)?.outerHTML.slice(0,12000)||''});watch(true);}catch{}});
 };
}
