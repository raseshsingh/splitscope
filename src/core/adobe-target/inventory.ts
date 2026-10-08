import {walk,type TargetWire} from './wire';
import type {NormalizedExperiment} from '../model';
export function mboxInventory(records:TargetWire[]) {
 const boxes=new Map<string,{name:string;pages:string[];parameters:string[];profile:string[];count:number;lastSeen:number;entity:boolean;order:boolean;schemas:string[]}>();
 for(const r of records){const counted=new Set<string>();for(const location of r.locations){const b=boxes.get(location.name)||{name:location.name,pages:[],parameters:[],profile:[],count:0,lastSeen:0,entity:false,order:false,schemas:[]};
 b.pages=[...new Set([...b.pages,r.page])];b.parameters=[...new Set([...b.parameters,...location.parameters])];b.profile=[...new Set([...b.profile,...location.profile])];if(location.phase!=='notification')b.schemas=[...new Set([...b.schemas,[...location.parameters].sort().join(',')])];if(!counted.has(b.name)){b.count++;counted.add(b.name);}b.lastSeen=Math.max(b.lastSeen,r.at);b.entity ||= location.entity;b.order ||= location.order;boxes.set(b.name,b);}}
 return [...boxes.values()].map(b=>({...b,paramDrift:b.pages.length>1&&b.schemas.length>1}));
}
export function inventoryCsv(rows:ReturnType<typeof mboxInventory>) {
 const cell=(v:unknown)=>'"'+String(v??'').replace(/"/g,'""').replace(/^([=+@-])/,"'$1")+'"';
 return [['mbox','requests','pages','parameters','profile parameters','schema drift','last seen'],...rows.map(r=>[r.name,r.count,r.pages.join(' | '),r.parameters.join(', '),r.profile.join(', '),r.paramDrift,new Date(r.lastSeen).toISOString()])].map(r=>r.map(cell).join(',')).join('\r\n');
}
export function odeInventory(r:TargetWire,activities:NormalizedExperiment[]) {
 const data=r.response||{},found=new Map<string,{id:string;name:string;observed:boolean}>();
 walk(data,node=>{const id=node['activity.id']??node.activityId??node.activity?.id;if(id!=null)found.set(String(id),{id:String(id),name:String(node['activity.name']||node.activity?.name||id),observed:activities.some(a=>a.platform==='adobe-target'&&a.id===String(id))});});
 for(const a of Array.isArray(data.activities)?data.activities:[])if(a.id!=null)found.set(String(a.id),{id:String(a.id),name:String(a.name||a.id),observed:activities.some(v=>v.platform==='adobe-target'&&v.id===String(a.id))});
 return {version:data.version||data.meta?.version||'Not exposed',environment:r.url.match(/\/(production|staging|development)\//)?.[1]||'Not exposed',capturedAt:r.at,activities:[...found.values()],audiences:data.audiences||'Not exposed in this artifact shape',rules:data.rules||data.localMboxes||data.globalMbox||'Inspect raw artifact for version-specific rules',notice:'Configuration inventory does not establish qualification. Unknown shapes remain available in Raw; capture limits may truncate large artifacts.'};
}
export function selectorConflicts(activities:NormalizedExperiment[]) {
 const rows=activities.filter(a=>a.status==='running-in').flatMap(a=>[...(a.changes||[]),...(a.variations.find(v=>v.id===a.assignedVariationId)?.changes||[])].filter(c=>c.selector).map(c=>({platform:a.platform,id:a.id,name:a.name,selector:c.selector!})));
 const result:Array<{target:string;other:string;selector:string;otherSelector:string;basis:string}>=[];
 for(const a of rows.filter(r=>r.platform==='adobe-target').slice(0,100))for(const b of rows.filter(r=>r.platform!=='adobe-target').slice(0,200)){
 let overlap=a.selector===b.selector,basis='Same selector';
 if(!overlap&&typeof document!=='undefined')try{const nodes=[...document.querySelectorAll(a.selector)].slice(0,50);overlap=nodes.some(n=>n.matches(b.selector));basis='Same current DOM element';}catch{}
 if(overlap)result.push({target:a.name,other:b.name,selector:a.selector,otherSelector:b.selector,basis});
 }return result.slice(0,100);
}
export interface ExperienceMemory {dom?:unknown;id:string;activity:string;experience:string;name:string;count:number;firstSeen:number;lastSeen:number;selectors:string[];content:unknown;lastObservation:string}
export function rememberExperiences(previous:ExperienceMemory[],r:TargetWire):ExperienceMemory[] {
 if(!r.target||r.pipe==='ode')return previous;
 const found=new Map(previous.map(a=>[a.id,a]));const seen=new Set<string>();
 walk(r.response,(node,path)=>{
 if(path.startsWith('prefetch'))return;
 const activity=node['activity.id']??node['campaign.id'], experience=node['experience.id'];if(activity==null||experience==null)return;
 const id=String(activity)+':'+String(experience);if(seen.has(id))return;seen.add(id);
 const observation=r.page+'|'+r.at+'|'+r.url;const prior=found.get(id);if(prior?.lastObservation===observation)return;
 const parts=path.split('.');const optionIndex=parts.findLastIndex(p=>['options','items','offers'].includes(p));
 const option=optionIndex>=0?parts.slice(0,optionIndex+2).reduce((v:any,k)=>v?.[k],r.response):node;
 const selectors:string[]=[];walk(option,n=>{if(typeof(n.cssSelector||n.selector)==='string')selectors.push(n.cssSelector||n.selector);});
 found.set(id,{dom:prior?.dom,id,activity:String(activity),experience:String(experience),name:String(node['activity.name']||activity)+' · '+String(node['experience.name']||experience),count:(prior?.count||0)+1,firstSeen:prior?.firstSeen||r.at,lastSeen:r.at,selectors:[...new Set(selectors)].slice(0,50),content:JSON.stringify(option).slice(0,16000),lastObservation:observation});
 });
 return [...found.values()].sort((a,b)=>b.lastSeen-a.lastSeen).slice(0,100);
}
