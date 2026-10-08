import {sanitize} from '../sanitize';
import { rememberExperiences } from './inventory';
import { isWire } from './capture';
import { browser } from 'wxt/browser';
import { baselineRules, exitQaUrl, parseQaLink, targetCookieIdentity } from './qa';
interface SavedQa {label:string;url:string;index:string;savedAt:number}
export async function clearTargetBlock(tabId:number) {
 const rules=await browser.declarativeNetRequest.getSessionRules();
 const ids=rules.filter(r=>r.condition.tabIds?.includes(tabId)).map(r=>r.id);
 if(ids.length)await browser.declarativeNetRequest.updateSessionRules({removeRuleIds:ids});
}
export async function targetCommand(message:any, tabId:number, page:string) {
 const origin=new URL(page).origin;const key=`splitscope:target-qa:${origin}`;
 const stored=await browser.storage.local.get(key);const saved:SavedQa[]=Array.isArray(stored[key])?stored[key]:[];
 if(message.action==='captures'){const captureKey=`splitscope:target-captures:${tabId}:${origin}`;await memoryWrites.get(captureKey)?.catch(()=>{});const data=await browser.storage.session.get(captureKey);return data[captureKey]||[];}
 if(message.action==='save-dom'){const memoryKey='splitscope:target-memory:'+origin;const data=await browser.storage.local.get(memoryKey);const rows=Array.isArray(data[memoryKey])?data[memoryKey]:[];await browser.storage.local.set({[memoryKey]:rows.map((r:any)=>r.id===message.id?{...r,dom:sanitize(message.dom,100000)}:r)});return {ok:true};}
 if(message.action==='memory'){const data=await browser.storage.local.get('splitscope:target-memory:'+origin);return data['splitscope:target-memory:'+origin]||[];}
 if(message.action==='clear-memory'){await memoryWrites.get('splitscope:target-memory:'+origin)?.catch(()=>{});await browser.storage.local.remove('splitscope:target-memory:'+origin);return {ok:true};}
 if(message.action==='status'){
 const rules=await browser.declarativeNetRequest.getSessionRules();
 const cookies=await browser.cookies.getAll({url:page});
 const cookieIdentity=targetCookieIdentity(cookies);
 const ageKey='splitscope:target-qa-observed:'+origin;const ages=await browser.storage.local.get(ageKey);const qaFirstObserved=cookieIdentity.qaCookies.length?(ages[ageKey]||Date.now()):undefined;
 if(qaFirstObserved)await browser.storage.local.set({[ageKey]:qaFirstObserved});else await browser.storage.local.remove(ageKey);
 return {cookieIdentity,qaFirstObserved,saved:saved.map(({label,index,savedAt},id)=>({label,index,savedAt,id})),blocked:rules.some(r=>r.condition.tabIds?.includes(tabId)),qaCookies:cookies.filter(c=>c.name.startsWith('at_preview_')).map(c=>c.name)};
 }
 if(message.action==='save'){
 const link=parseQaLink(String(message.url),page),label=String(message.label||`Experience ${link.index}`).slice(0,160);
 const next=[...saved.filter(s=>s.url!==link.url),{...link,label,savedAt:Date.now()}].slice(-50);await browser.storage.local.set({[key]:next});return {ok:true};
 }
 if(message.action==='remove'){await browser.storage.local.set({[key]:saved.filter((_,i)=>i!==message.id)});return {ok:true};}
 if(message.action==='open'){
 const link=saved[Number(message.id)];if(!link)throw new Error('Saved QA link no longer exists.');parseQaLink(link.url,page);
 if(message.newTab)await browser.tabs.create({url:link.url,openerTabId:tabId});else await browser.tabs.update(tabId,{url:link.url});return {ok:true};
 }
 if(message.action==='exit'){
 const cookies=await browser.cookies.getAll({url:page});for(const cookie of cookies.filter(c=>c.name.startsWith('at_preview_')||c.name==='at_qa_mode'))await browser.cookies.remove({url:`${cookie.secure?'https':'http'}://${cookie.domain.replace(/^\./,'')}${cookie.path}`,name:cookie.name,storeId:cookie.storeId});
 await browser.tabs.update(tabId,{url:exitQaUrl(page)});return {ok:true};
 }
 if(message.action==='block'){
 await clearTargetBlock(tabId);
 if(message.enabled===true){const rules=await browser.declarativeNetRequest.getSessionRules();let start=10000;while(rules.some(r=>r.id>=start&&r.id<start+4))start+=4;await browser.declarativeNetRequest.updateSessionRules({addRules:baselineRules(tabId,start,message.edge===true)});}
 await browser.tabs.reload(tabId);return {ok:true};
 }
 throw new Error('Unsupported Target action.');
}

const memoryWrites=new Map<string,Promise<unknown>>();
export function retainTargetExperience(event:any,tabId:number,page:string) {
 const r=event?.properties;if(!isWire(r))return;
 let origin:string;try{origin=new URL(r.page).origin;if(origin!==new URL(page).origin)return;}catch{return;}
 const captureKey=`splitscope:target-captures:${tabId}:${origin}`;
 const captureWrite=(memoryWrites.get(captureKey)||Promise.resolve()).catch(()=>{}).then(async()=>{const data=await browser.storage.session.get(captureKey);const prior=Array.isArray(data[captureKey])?data[captureKey]:[];const rows=[...prior.filter((e:any)=>e.id!==event.id),{id:event.id,properties:r}].slice(-100);while(rows.length>1&&JSON.stringify(rows).length>1000000)rows.shift();await browser.storage.session.set({[captureKey]:rows});});
 memoryWrites.set(captureKey,captureWrite);void captureWrite.catch(()=>{}).finally(()=>{if(memoryWrites.get(captureKey)===captureWrite)memoryWrites.delete(captureKey);});
 if(!r.target)return;
 const key='splitscope:target-memory:'+origin;
 const write=(memoryWrites.get(key)||Promise.resolve()).catch(()=>{}).then(async()=>{const saved=await browser.storage.local.get(key);const previous=Array.isArray(saved[key])?saved[key]:[];await browser.storage.local.set({[key]:rememberExperiences(previous,r)});});
 memoryWrites.set(key,write);void write.catch(()=>{}).finally(()=>{if(memoryWrites.get(key)===write)memoryWrites.delete(key);});
}

export async function clearTargetCaptures(tabId:number) {
 const prefix=`splitscope:target-captures:${tabId}:`;
 await Promise.allSettled([...memoryWrites.entries()].filter(([key])=>key.startsWith(prefix)).map(([,promise])=>promise));
 const data=await browser.storage.session.get(null);await browser.storage.session.remove(Object.keys(data).filter(key=>key.startsWith(prefix)));
}

export async function captureQaNavigation(page:string) {
 let link:ReturnType<typeof parseQaLink>;try{link=parseQaLink(page,page);}catch{return;}
 const key='splitscope:target-qa:'+new URL(page).origin;const data=await browser.storage.local.get(key);const saved:SavedQa[]=Array.isArray(data[key])?data[key]:[];
 if(saved.some(s=>s.url===link.url))return;
 await browser.storage.local.set({[key]:[...saved,{...link,label:'Visited QA · '+link.index,savedAt:Date.now()}].slice(-50)});
}
