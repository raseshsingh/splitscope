/** Target wire formats. Edge is a candidate until an explicit TGT provider is observed. */
export type Pipe = 'atjs1' | 'atjs2' | 'edge' | 'ode' | 'analytics';
export function classifyTarget(raw: string): Pipe | undefined {
  try {
    const u = new URL(raw);
    if (/\/rest\/v1\/delivery$/.test(u.pathname) && u.searchParams.has('client')) return 'atjs2';
    if (/\/m2\/[^/]+\/mbox\/json$/.test(u.pathname)) return 'atjs1';
    if (/^assets\.adobetarget\.(com|net)$/.test(u.hostname) && /\/rules\.json$/.test(u.pathname)) return 'ode';
    if (/\/v1\/(interact|collect)$/.test(u.pathname) && u.searchParams.has('configId')) return 'edge';
    if (/\/b\/ss\//.test(u.pathname)) return 'analytics';
  } catch {}
}
export function parseBody(body: unknown): any {
  if (typeof body !== 'string') return body && typeof body === 'object' ? body : {};
  try { const value=JSON.parse(body); return value && typeof value==='object' ? value : {value}; } catch { return {unparsedBody:body.slice(0,100000)}; }
}
export function walk(value: unknown, visit: (value: any, path: string) => void) {
  let count = 0; const seen = new WeakSet<object>();
  const step = (node: any, path: string, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 16 || count++ > 10000 || seen.has(node)) return;
    seen.add(node); visit(node, path);
    for (const [key, child] of Object.entries(node).slice(0, 500)) step(child, path ? `${path}.${key}` : key, depth + 1);
  }; step(value, '', 0);
}
export function targetPropositions(response: any): any[] {
  const result: any[] = [];
  for (const handle of Array.isArray(response?.handle) ? response.handle : []) {
    if (handle.type !== 'personalization:decisions') continue;
    for (const p of Array.isArray(handle.payload) ? handle.payload : []) if (p.scopeDetails?.decisionProvider === 'TGT') result.push(p);
  }
  return result;
}
export interface TargetWire {
  schema: 'target-wire-v1'; pipe: Pipe; url: string; page: string; pageId?: string; at: number; duration: number; status: number; error?: string;
  request: any; response: any; privacy?: Array<{path:string;kind:string}>; client?: string; session?: string; target: boolean; ajoCount: number;
  locations: Array<{name: string; phase: string; parameters: string[]; profile: string[]; entity: boolean; order: boolean}>;
}
export function normalizeWire(input: {url: string; page: string; pageId?: string; at: number; duration: number; status: number; request?: unknown; response?: unknown; error?: string}): TargetWire | undefined {
  const pipe = classifyTarget(input.url); if (!pipe) return;
  const u = new URL(input.url); const request = pipe === 'atjs1' || pipe === 'analytics' ? Object.fromEntries(u.searchParams) : parseBody(input.request);
  const response = parseBody(input.response); const locations: TargetWire['locations'] = [];
  for (const phase of ['execute','prefetch']) {
    const group = request?.[phase]; if (!group) continue;
    const entries = [...(Array.isArray(group.mboxes) ? group.mboxes : []), ...(Array.isArray(group.views) ? group.views : []), ...(group.pageLoad ? [{...group.pageLoad, name:'pageLoad'}] : [])];
    for (const box of entries.filter(b=>b&&typeof b==='object')) locations.push({name:String(box.name || '__view__'), phase, parameters:Object.keys(box.parameters || {}), profile:Object.keys(box.profileParameters || {}), entity:Object.keys(box.parameters || {}).some(k=>k.startsWith('entity.')), order:!!box.order});
  }
  for (const notice of Array.isArray(request?.notifications)?request.notifications:[]) {const name=notice?.mbox?.name||notice?.view?.name;if(name)locations.push({name:String(name),phase:'notification',parameters:[],profile:[],entity:false,order:false});}
  if (pipe === 'atjs1') locations.push({name:request.mbox || 'target-global-mbox',phase:'execute',parameters:Object.keys(request),profile:Object.keys(request).filter(k=>k.startsWith('profile.')),entity:Object.keys(request).some(k=>k.startsWith('entity.')),order:!!request.orderId});
  for (const p of targetPropositions(response)) locations.push({name:String(p.scope || '__view__'),phase:'decision',parameters:[],profile:[],entity:false,order:false});
  const ajoCount = (Array.isArray(response.handle) ? response.handle : []).filter((h:any)=>h.type==='personalization:decisions').flatMap((h:any)=>Array.isArray(h.payload)?h.payload:[]).filter((p:any)=>p.scopeDetails?.decisionProvider==='AJO').length;
  return {schema:'target-wire-v1', pipe, url:u.origin+u.pathname, page:input.page,pageId:input.pageId,at:input.at,duration:input.duration,status:input.status,error:input.error,locations,client:u.searchParams.get('client') || (pipe==='atjs1'?u.pathname.split('/')[2]:undefined),session:u.searchParams.get('sessionId') || request.mboxSession, target:pipe==='atjs1'||pipe==='atjs2'||pipe==='ode'||targetPropositions(response).length>0||(pipe==='edge'&&(Array.isArray(request.events)?request.events:[]).some((e:any)=>{const ps=e.xdm?._experience?.decisioning?.propositions||e.data?._experience?.decisioning?.propositions;return Array.isArray(ps)&&ps.some((p:any)=>p.scopeDetails?.decisionProvider==='TGT');})),ajoCount,request,response};
}

export function sameTargetPage(a:TargetWire,b:TargetWire){return a.page===b.page&&(!a.pageId||!b.pageId||a.pageId===b.pageId);}
