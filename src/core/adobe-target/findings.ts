import { walk, type TargetWire } from './wire';
export interface TargetFinding { id:string; severity:'critical'|'warning'|'info'; title:string; detail:string; recommendation:string; evidence:number[] }
export function targetFindings(records:TargetWire[], config:Record<string,any> = {}, now=Date.now()):TargetFinding[] {
 const result:TargetFinding[]=[];
 const add=(id:string,severity:TargetFinding['severity'],title:string,detail:string,recommendation:string,evidence:number[])=>{if(!result.some(f=>f.id===id))result.push({id,severity,title,detail,recommendation,evidence});};
 const delivery=records.filter(r=>r.target&&r.pipe!=='ode');
 const indices=(rs:TargetWire[])=>rs.map(r=>records.indexOf(r));
 const matching=(predicate:(r:TargetWire)=>boolean)=>delivery.filter(predicate);
 const failures=matching(r=>r.status>=400||r.status===0);
 if(failures.length)add('T01','critical','Delivery failed','A Target request did not complete successfully. Default content may remain.','Inspect the response or network failure; status 0 alone does not establish an ad blocker.',indices(failures));
 const blocked=matching(r=>/ERR_BLOCKED_BY_CLIENT/.test(r.error||''));
 if(blocked.length)add('T05','warning','Browser reported blocking','The browser reported ERR_BLOCKED_BY_CLIENT.','Check extensions and browser request blocking.',indices(blocked));
 const timeout=matching(r=>Number(config.timeout)>0&&r.duration>Number(config.timeout));
 if(timeout.length)add('T04','warning','Delivery exceeded configured timeout','Captured delivery duration exceeds the reported at.js timeout.','Compare render events with request timing.',indices(timeout));
 for(const page of new Set(delivery.map(r=>r.page))){const pageRecords=delivery.filter(r=>r.page===page);const pipes=new Set(pageRecords.map(r=>r.pipe));
 if(pipes.has('edge')&&(pipes.has('atjs1')||pipes.has('atjs2')))add('T10','warning','Two Target delivery stacks','at.js and Web SDK delivered Target on the same page.','Confirm that the integrations cannot apply competing experiences.',indices(pageRecords));
 if(new Set(pageRecords.map(r=>r.response?.edgeHost).filter(Boolean)).size>1)add('T06','warning','Delivery edge changed','Multiple edge hosts were observed on this page.','Check identity and session continuity.',indices(pageRecords));
 if(pipes.has('atjs1')&&pipes.has('atjs2'))add('T15','warning','Mixed at.js delivery versions','Both legacy and current delivery endpoints were observed.','Review migration and duplicate snippet loading.',indices(pageRecords));
 }
 if(delivery.some(r=>r.pipe==='atjs1'))add('T11','warning','Legacy at.js delivery','The mbox/json endpoint was observed.','Review migration to a supported implementation.',indices(matching(r=>r.pipe==='atjs1')));
 if(config.globalMboxName&&config.globalMboxName!=='target-global-mbox')add('T12','info','Custom global mbox',String(config.globalMboxName),'Use this name when auditing global delivery.',[]);
 if(delivery.length)add('T13','info','Property configuration',delivery.some(r=>r.request?.property||r.request?.at_property)?'A property was included in captured requests.':'No property was exposed in captured requests.','Confirm the intended property/workspace configuration.',indices(delivery));
 if(new Set(delivery.map(r=>r.client).filter(Boolean)).size>1)add('T14','warning','Multiple Target clients','More than one client code was observed.','Check whether multiple accounts are intentional.',indices(delivery));
 if(delivery.some(r=>r.pipe==='atjs1'||r.pipe==='atjs2'))add('T17','info','Delivery host',delivery.filter(r=>r.pipe!=='edge').map(r=>new URL(r.url).hostname).filter((v,i,a)=>a.indexOf(v)===i).join(', '),'First-party hostnames may be CNAMEs; DNS ownership is not verified.',indices(delivery));
 let withNames=0,withoutNames=0;let defaults=0,offers=0;
 records.forEach((r,index)=>{
 if(!r.target)return;
 walk(r.response,(node,path)=>{
 if(node.schema?.endsWith?.('/default-content-item'))defaults++;
 if(node.type==='json'||node.schema?.endsWith?.('/json-content-item'))add('T24','info','JSON offer observed','A structured data offer was delivered.','Expand the raw response to inspect its payload.',[index]);
 if(node.type&&node.content!==undefined||node.schema&&node.data){offers++;if(node.responseTokens||node.meta?.['activity.id'])withNames++;else withoutNames++;}
 const selector=node.cssSelector||node.selector;
 if(typeof selector==='string'&&(selector.length>200||(selector.match(/nth-child/g)||[]).length>3))add('T23','warning','Fragile selector','An offer uses a long or positional CSS selector.','Prefer stable element identifiers and verify after page releases.',[index]);
 if(node.type==='redirect'&&typeof node.content==='string'){try{if(new URL(node.content,r.page).origin!==new URL(r.page).origin)add('T25','warning','Cross-origin redirect','An offer redirects to a different origin.','Verify destination, consent and identity continuity.',[index]);}catch{}}
 });
 });
 if(withoutNames&&!withNames)add('T21','warning','Offer metadata not exposed','Captured offers did not expose activity response tokens at option level. Tokens may exist at a parent level.','Check response token settings and the full response.',indices(delivery));
 if(withNames&&withoutNames)add('T22','warning','Uneven offer metadata','Some options expose activity tokens and others do not.','Inspect parent-level metadata before changing token configuration.',indices(delivery));
 if(defaults&&defaults===offers)add('T20','info','Default content observed','Only default-content items appeared in captured offers.','Review qualification and decision scopes; this is not evidence of a delivery failure.',indices(delivery));
 return result;
}
