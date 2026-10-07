const QA_KEYS = ['at_preview_token','at_preview_index','at_preview_listed_activities_only','at_preview_evaluate_as_true_audience_ids','at_preview_evaluate_as_false_audience_ids','at_preview_list_activities'];
export function parseQaLink(raw:string, page:string) {
 const source=new URL(raw),current=new URL(page);
 if(source.origin!==current.origin||!['https:','http:'].includes(source.protocol)||source.username||source.password)throw new Error('Use an Adobe QA link for this website.');
 if(!source.searchParams.get('at_preview_token'))throw new Error('The link has no Adobe QA token.');
 const index=source.searchParams.get('at_preview_index');
 if(!index||!/^\d+(?:_\d+)?(?:,\d+(?:_\d+)?)*$/.test(index)||index.split(/[_,]/).some(n=>Number(n)<1))throw new Error('Use the complete Adobe-generated QA link with indexes starting at 1.');
 // Keep exact mappings and decoded parameter values; URL serialization encodes once.
 for(const key of QA_KEYS) {const value=source.searchParams.get(key);if(value&&value.length>12000)throw new Error('QA parameter is too long.');}
 return {url:source.href,index};
}
export function exitQaUrl(page:string) {const url=new URL(page);for(const key of [...url.searchParams.keys()])if(key.startsWith('at_preview_'))url.searchParams.delete(key);url.searchParams.set('at_preview_token','');return url.href;}
export function baselineRules(tabId:number,startId:number,edge=false):any[] {
 const filters=['^https?://[^/]+/rest/v1/delivery(\\?|$)','^https?://[^/]+/m2/[^/]+/mbox/json(\\?|$)','^https?://assets\\.adobetarget\\.(com|net)/'];
 if(edge)filters.push('^https?://[^/]+/ee/([^/]+/)?v1/(interact|collect)(\\?|$)');
 return filters.map((regexFilter,index)=>({id:startId+index,priority:1,action:{type:'block'},condition:{tabIds:[tabId],regexFilter,resourceTypes:['xmlhttprequest','script','other']}}));
}
