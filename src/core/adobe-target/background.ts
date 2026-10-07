import { browser } from 'wxt/browser';
import { baselineRules, exitQaUrl, parseQaLink } from './qa';
interface SavedQa {label:string;url:string;index:string;savedAt:number}
export async function clearTargetBlock(tabId:number) {
 const rules=await browser.declarativeNetRequest.getSessionRules();
 const ids=rules.filter(r=>r.condition.tabIds?.includes(tabId)).map(r=>r.id);
 if(ids.length)await browser.declarativeNetRequest.updateSessionRules({removeRuleIds:ids});
}
export async function targetCommand(message:any, tabId:number, page:string) {
 const origin=new URL(page).origin;const key=`splitscope:target-qa:${origin}`;
 const stored=await browser.storage.local.get(key);const saved:SavedQa[]=Array.isArray(stored[key])?stored[key]:[];
 if(message.action==='status'){
 const rules=await browser.declarativeNetRequest.getSessionRules();
 const cookies=await browser.cookies.getAll({url:page});
 return {saved:saved.map(({label,index,savedAt},id)=>({label,index,savedAt,id})),blocked:rules.some(r=>r.condition.tabIds?.includes(tabId)),qaCookies:cookies.filter(c=>c.name.startsWith('at_preview_')).map(c=>c.name)};
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
