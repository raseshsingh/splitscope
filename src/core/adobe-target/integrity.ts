import { walk, targetPropositions, sameTargetPage, type TargetWire } from './wire';
import type { TargetFinding } from './findings';
export interface Integrity {
 served:Array<{ref:string;kind:'display'|'click';phase:string}>;
 notices:Array<{ref:string;kind:string}>;
 identity:{ecid?:string;tntId?:string;thirdPartyPresent:boolean;customers:Array<{integrationCode?:string;authenticatedState?:string}>};
 propertyRef?:string; qaActive:boolean; logging?:string; sdid?:string;
}
async function digest(value:unknown):Promise<string|undefined> {
 if(typeof value!=='string'||!value||!globalThis.crypto?.subtle)return;
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
/** Correlate opaque tracking credentials without copying them into extension storage. */
export async function enrichIntegrity(r:TargetWire):Promise<Integrity> {
 const served:Integrity['served']=[],notices:Integrity['notices']=[];const tasks:Promise<void>[]=[];
 const add=(value:unknown,kind:'display'|'click',phase:string)=>{tasks.push(digest(value).then(ref=>{if(ref)served.push({ref,kind,phase});}));};
 walk(r.response,(node,path)=>{
   if(typeof node.eventToken==='string')add(node.eventToken,path.includes('metrics')?'click':'display',path.startsWith('prefetch')?'prefetch':'execute');
 });
 for(const n of Array.isArray(r.request?.notifications)?r.request.notifications:[])for(const value of Array.isArray(n.tokens)?n.tokens:[])tasks.push(digest(value).then(ref=>{if(ref)notices.push({ref,kind:String(n.type)});}));
 for(const p of targetPropositions(r.response))if(p.id)add('proposition:'+p.id,'display','proposition');
 for(const event of Array.isArray(r.request?.events)?r.request.events:[]){const data=event.xdm?._experience?.decisioning||event.data?._experience?.decisioning;const kind=data?.propositionEventType?.display===1||event.xdm?.eventType==='decisioning.propositionDisplay'?'display':data?.propositionEventType?.interact===1||event.xdm?.eventType==='decisioning.propositionInteract'?'click':undefined;
 if(!kind)continue;for(const p of Array.isArray(data?.propositions)?data.propositions:[])if(p.scopeDetails?.decisionProvider==='TGT'&&p.id)tasks.push(digest('proposition:'+p.id).then(ref=>{if(ref)notices.push({ref,kind});}));}
 const req=r.request||{},res=r.response||{};
 const edgeEcid=(Array.isArray(req.events)?req.events:[]).flatMap((e:any)=>Array.isArray(e.xdm?.identityMap?.ECID)?e.xdm.identityMap.ECID:[]).find((v:any)=>typeof v?.id==='string')?.id;
 await Promise.all(tasks);
 return {served,notices,identity:{ecid:req.id?.marketingCloudVisitorId||res.id?.marketingCloudVisitorId||req.mboxMCGVID||req.mid||edgeEcid,tntId:req.id?.tntId||res.id?.tntId||req.mboxPC,thirdPartyPresent:!!req.id?.thirdPartyId,customers:(Array.isArray(req.id?.customerIds)?req.id.customerIds:[]).map((c:any)=>({integrationCode:c.integrationCode,authenticatedState:c.authenticatedState}))},propertyRef:await digest(req.property?.token||req.at_property),qaActive:!!req.qaMode,logging:req.experienceCloud?.analytics?.logging||(req.mboxMCSDID?'client_side':undefined),sdid:req.experienceCloud?.analytics?.supplementalDataId||req.mboxMCSDID||req.sdid};
}
export type EnrichedWire=TargetWire&{integrity?:Integrity};
export function a4tMatrix(records:EnrichedWire[],now=Date.now()) {
 return records.filter(r=>r.target&&r.integrity?.logging==='client_side').map(r=>{
 const matches=records.filter(a=>a.pipe==='analytics'&&sameTargetPage(a,r)&&Math.abs(a.at-r.at)<=30000&&r.integrity?.sdid&&a.integrity?.sdid===r.integrity.sdid);
 return {capture:records.indexOf(r)+1,sdid:r.integrity?.sdid,analyticsCaptures:matches.map(a=>records.indexOf(a)+1),ecid:matches.length?matches.some(a=>a.integrity?.identity.ecid&&r.integrity?.identity.ecid&&a.integrity.identity.ecid===r.integrity.identity.ecid)?'Matched':matches.every(a=>a.integrity?.identity.ecid&&r.integrity?.identity.ecid)?'Different':'Not exposed':'Not observed',state:matches.length?'Matched':now-r.at<30000?'Waiting (30 seconds)':'No matching beacon observed'};
 });
}
export function integrityFindings(records:EnrichedWire[],now=Date.now(),renders:Array<{at:number;page:string;served:Array<{ref:string}>}>=[]):TargetFinding[] {
 const findings:TargetFinding[]=[];
 const add=(id:string,title:string,detail:string,index:number,severity:TargetFinding['severity']='warning')=>{if(!findings.some(f=>f.id===id))findings.push({id,severity,title,detail,recommendation:'Inspect the related capture and confirm against your implementation. Earlier or unavailable requests may be missing.',evidence:[index]});};
 records.forEach((r,index)=>{
 const i=r.integrity;if(!r.target||!i)return;
 if(i.logging==='server_side')add('T43','Server-side A4T','Correlation happens outside this browser capture; reporting success is not verified.',index,'info');
 if(i.qaActive)add('T60','QA mode observed','The delivery request contains qaMode. Adobe separates QA reporting from live activity data.',index,'info');
 if(!i.identity.ecid)add('T54','ECID not exposed','No ECID was found in this delivery request or response.',index,'info');
 if(i.identity.thirdPartyPresent||i.identity.customers.length)add('T51','Customer identity present','Inspect integration codes and authentication states in Identity.',index,'info');
 if(i.identity.customers.some(c=>c.authenticatedState==='unknown'))add('T52','Unknown authentication state','A customer identity uses the unknown authentication state.',index);
 if(new Set(records.filter(a=>sameTargetPage(a,r)).map(a=>a.session).filter(Boolean)).size>1)add('T50','Session changed on this page','More than one session ID was observed for this page URL.',index);
 if(new Set(records.map(a=>a.integrity?.propertyRef).filter(Boolean)).size>1)add('T14','Multiple properties','Different property fingerprints were captured.',index);
 for(const n of i.notices){const known=records.some(s=>sameTargetPage(s,r)&&s.at<=r.at&&s.integrity?.served.some(v=>v.ref===n.ref&&(v.kind===n.kind||v.phase==='proposition')));if(!known)add(n.kind==='click'?'T31':'T33','Unmatched '+n.kind+' notification','No corresponding served credential exists in retained captures. This does not prove over-counting.',index);}
 });
 for(const render of renders){if(now-render.at<30000)continue;for(const served of render.served){const index=records.findIndex(r=>r.page===render.page&&r.at<=render.at&&r.integrity?.served.some(s=>s.ref===served.ref&&s.phase==='prefetch'&&s.kind==='display'));if(index<0)continue;const notified=records.some(r=>r.page===render.page&&r.at>=records[index]!.at&&r.integrity?.notices.some(n=>n.ref===served.ref&&n.kind==='display'));if(!notified)add('T30','Rendered prefetch lacks an observed display notification','A render-success event exposed a prefetched credential, but no corresponding display notification was captured within the waiting window.',index);}}
 for(const row of a4tMatrix(records,now)){
 const r=records[row.capture-1]!;const aa=records.some(a=>a.pipe==='analytics'&&sameTargetPage(a,r));
 if(row.state.startsWith('Waiting'))continue;
 if(!aa)add('T42','No Analytics beacon observed','Client-side A4T was requested but no AppMeasurement request was captured on this page.',row.capture-1);
 else if(!row.sdid)add('T41','Client-side SDID missing','Client-side logging is configured but the Target SDID was not exposed.',row.capture-1);
 else if(!row.analyticsCaptures.length)add('T40','No matching A4T SDID observed','No same-page Analytics beacon matched within 30 seconds. Capture gaps may explain this.',row.capture-1);
 }
 return findings;
}
