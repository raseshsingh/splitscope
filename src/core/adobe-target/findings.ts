import { walk, sameTargetPage, type TargetWire } from './wire';
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
 for(const sample of delivery.filter((r,i,all)=>all.findIndex(a=>sameTargetPage(a,r))===i)){const pageRecords=delivery.filter(r=>sameTargetPage(r,sample));const pipes=new Set(pageRecords.map(r=>r.pipe));
 if(pipes.has('edge')&&(pipes.has('atjs1')||pipes.has('atjs2')))add('T10','warning','Two Target delivery stacks','at.js and Web SDK delivered Target on the same page.','Confirm that the integrations cannot apply competing experiences.',indices(pageRecords));
 if(new Set(pageRecords.map(r=>r.response?.edgeHost).filter(Boolean)).size>1)add('T06','warning','Delivery edge changed','Multiple edge hosts were observed on this page.','Check identity and session continuity.',indices(pageRecords));
 if(pipes.has('atjs1')&&pipes.has('atjs2'))add('T15','warning','Mixed at.js delivery versions','Both legacy and current delivery endpoints were observed.','Review migration and duplicate snippet loading.',indices(pageRecords));
 }
 if(delivery.some(r=>r.pipe==='atjs1'))add('T11','warning','Legacy at.js delivery','The mbox/json endpoint was observed.','Review migration to a supported implementation.',indices(matching(r=>r.pipe==='atjs1')));
 if(config.globalMboxName&&config.globalMboxName!=='target-global-mbox')add('T12','info','Custom global mbox',String(config.globalMboxName),'Use this name when auditing global delivery.',[]);
 if(delivery.length)add('T13','info','Property configuration',delivery.some(r=>r.request?.property||r.request?.at_property)?'A property was included in captured requests.':'No property was exposed in captured requests.','Confirm the intended property/workspace configuration.',indices(delivery));
 if(new Set(delivery.map(r=>r.client).filter(Boolean)).size>1)add('T14','warning','Multiple Target clients','More than one client code was observed.','Check whether multiple accounts are intentional.',indices(delivery));
 if(delivery.some(r=>r.pipe==='atjs1'||r.pipe==='atjs2'))add('T17','info','Delivery host',delivery.filter(r=>r.pipe!=='edge').map(r=>new URL(r.url).hostname).filter((v,i,a)=>a.indexOf(v)===i).join(', '),'First-party hostnames may be CNAMEs; DNS ownership is not verified.',indices(delivery));
 const privateRecords=delivery.filter(r=>r.privacy?.length);
 if(privateRecords.length)add('T26','warning','Potential personal data','Email, phone or card-like patterns were found in parameters or offer content. Values are withheld.','Inspect the source implementation and remove unintended personal data.',indices(privateRecords));
 if(privateRecords.some(r=>r.privacy?.some(p=>/profile/i.test(p.path)&&p.kind.startsWith('email'))))add('T53','warning','Email-like profile value','An email-like value was present in profile parameters.','Review whether personal data should enter Target profiles.',indices(privateRecords));
 const applied=delivery.filter(r=>Array.isArray(config.renderedRequestIds)&&config.renderedRequestIds.includes(r.request?.requestId||r.response?.requestId)).map(r=>r.duration).sort((a,b)=>a-b);
 if(applied.length&&applied[Math.ceil(applied.length*.75)-1]!>1000)add('T03','warning','Slow delivery before confirmed rendering','The p75 delivery duration exceeds 1 second for requests with matching render-success IDs.','Inspect the Timing tab. Network latency alone does not measure flicker.',indices(delivery));
 let withNames=0,withoutNames=0;let defaults=0,offers=0;
 records.forEach((r,index)=>{
 if(!r.target)return;
 let recordMetadata=false;walk(r.response,n=>{if(n['activity.id']!=null||n['campaign.id']!=null)recordMetadata=true;});
 walk(r.response,(node,path)=>{
 if(node.schema?.endsWith?.('/default-content-item'))defaults++;
 if(node.type==='json'||node.schema?.endsWith?.('/json-content-item'))add('T24','info','JSON offer observed','A structured data offer was delivered.','Expand the raw response to inspect its payload.',[index]);
 if(node.type&&node.content!==undefined||node.schema&&node.data){offers++;let hasMetadata=!!(node.responseTokens||node.meta?.['activity.id']);
 hasMetadata ||= recordMetadata;
 if(hasMetadata)withNames++;else withoutNames++;}
 const selector=node.cssSelector||node.selector;
 if(typeof selector==='string'&&(selector.length>200||(selector.match(/nth-child/g)||[]).length>3))add('T23','warning','Fragile selector','An offer uses a long or positional CSS selector.','Prefer stable element identifiers and verify after page releases.',[index]);
 if(node.type==='redirect'&&typeof node.content==='string'){try{if(new URL(node.content,r.page).origin!==new URL(r.page).origin)add('T25','warning','Cross-origin redirect','An offer redirects to a different origin.','Verify destination, consent and identity continuity.',[index]);}catch{}}
 });
 });
 if(withoutNames&&!withNames)add('T21','warning','Offer metadata not exposed','Captured offers did not expose activity response tokens at option level. Tokens may exist at a parent level.','Check response token settings and the full response.',indices(delivery));
 if(withNames&&withoutNames)add('T22','warning','Uneven offer metadata','Some options expose activity tokens and others do not.','Inspect parent-level metadata before changing token configuration.',indices(delivery));
 if(defaults&&defaults===offers)add('T20','info','Default content observed','Only default-content items appeared in captured offers.','Review qualification and decision scopes; this is not evidence of a delivery failure.',indices(delivery));

 const redirects:Array<{activity:string;page:string;at:number;index:number}>=[];
 records.forEach((r,index)=>walk(r.response,node=>{if(node.type!=='redirect')return;const id=node.responseTokens?.['activity.id'];if(id!=null)redirects.push({activity:String(id),page:r.page,at:r.at,index});}));
 for(const a of redirects)for(const b of redirects)if(a.index<b.index&&a.activity===b.activity&&a.page!==b.page&&Math.abs(a.at-b.at)<=10000)add('T02','critical','Repeated activity redirects','The same activity returned redirect offers on multiple pages within 10 seconds.','Check the captured navigation chain for a redirect loop.',[a.index,b.index]);
 const edge=records.filter(r=>r.pipe==='edge');
 for(const r of edge){const events=Array.isArray(r.request?.events)?r.request.events:[];const asked=events.some((e:any)=>e.query?.personalization?.decisionScopes?.length||e.query?.personalization?.surfaces?.length);const handles=Array.isArray(r.response?.handle)?r.response.handle:[];
 if(asked&&r.status>=200&&r.status<300&&!handles.some((h:any)=>h.type==='personalization:decisions'&&Array.isArray(h.payload)&&h.payload.length))add('T16','warning','No personalization propositions','A successful Edge request asked for decisions but returned no propositions.','Check scopes and datastream settings; this does not by itself establish Target installation.',[records.indexOf(r)]);
 if(records.some(a=>a.pipe==='analytics'&&sameTargetPage(a,r))&&events.some((e:any)=>e.xdm?.eventType&&!String(e.xdm.eventType).startsWith('decisioning.')))add('T18','warning','Mixed Analytics collection','AppMeasurement and non-decision Edge events were observed on this page.','Check whether both paths send the same Analytics events.',[records.indexOf(r)]);
 if(r.target&&records.some(a=>a.pipe==='analytics'&&sameTargetPage(a,r)))add('T44','warning','Web SDK Target with AppMeasurement','Target decisions and AppMeasurement beacons share this page.','Review A4T integration; this capture cannot prove server-side stitching.',[records.indexOf(r)]);
 }
 const methods:string[]=[];for(const r of delivery)walk(r.response,n=>{if(typeof n['decisioning.method']==='string')methods.push(n['decisioning.method']);});
 if(/on-device|hybrid/.test(config.decisioningMethod||'')&&methods.length&&methods.every(m=>m==='server-side'))add('T73','warning','Only server-side decisions observed','On-device or hybrid is configured, but every exposed decisioning.method reports server-side.','Review local eligibility and artifact contents; server fallback can be intentional.',indices(delivery));
 const artifacts=records.filter(r=>r.pipe==='ode');
 if(artifacts.length)add('T70','info','On-device artifact captured','An artifact request was observed. Its configuration is not a list of active decisions.','Inspect the On-device tab for exposed version and environment.',indices(artifacts));
 if(/on-device|hybrid/.test(config.decisioningMethod||'')&&artifacts.some(r=>r.status===0||r.status>=400))add('T71','warning','On-device artifact failed','An artifact request failed while on-device/hybrid was configured.','Inspect network and server fallback behavior.',indices(artifacts));
 for(const r of delivery){let local=false;walk(r.response,n=>{if(n['decisioning.method']==='on-device')local=true;});if(local)add('T72','info','On-device decision observed','Response metadata reports on-device decisioning.','Compare timing with server-side delivery captures.',[records.indexOf(r)]);}
 for(const r of artifacts){const value=r.response?.generatedAt||r.response?.generatedOn;const time=typeof value==='number'?value:typeof value==='string'?Date.parse(value):NaN;if(Number.isFinite(time)&&time>1e12&&now-time>86400000)add('T74','warning','Older artifact timestamp','The explicit generation timestamp is more than 24 hours old.','Confirm publishing and artifact freshness; age alone does not establish a fault.',[records.indexOf(r)]);}
 return result;
}
