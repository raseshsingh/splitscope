import TargetInventory from './TargetInventory';
import TargetQa from './TargetQa';
import { a4tMatrix, integrityFindings, type EnrichedWire } from '../../core/adobe-target/integrity';
import { targetFindings } from '../../core/adobe-target/findings';
import { useState, useEffect } from 'preact/hooks';
import type { PageState } from '../../core/state';
import { isWire } from '../../core/adobe-target/capture';
import { CopyButton, Empty, JsonTree } from '../shared/components';
export default function TargetView({state,onAction}: {state:PageState;onAction?: (payload:Record<string,unknown>)=>Promise<any>}) {
  const [,tick]=useState(0);
  useEffect(()=>{const timer=setInterval(()=>tick(n=>n+1),5000);return ()=>clearInterval(timer);},[]);
  const [tab,setTab]=useState('Findings');
  const [history,setHistory]=useState<Array<{id:string;properties:unknown}>>([]);
  useEffect(()=>{let active=true;void onAction?.({action:'captures'}).then(value=>{if(active)setHistory(Array.isArray(value)?value:[]);}).catch(()=>{});return ()=>{active=false;};},[]);
  const merged=new Map([...history,...state.events].map(e=>[e.id,e.properties]));
  const records=[...merged.values()].filter(isWire).sort((a,b)=>a.at-b.at).slice(-150) as EnrichedWire[];
  const config=(state.events.findLast(e=>(e.properties as any)?.schema==='target-config-v1')?.properties as any)?.config || {};
  const findings=[...targetFindings(records, {...config,renderedRequestIds:state.events.filter(e=>e.name==='at-content-rendering-succeeded').map(e=>(e.properties as any)?.requestId).filter(Boolean)}),...integrityFindings(records, Date.now(), state.events.map(e=>e.properties as any).filter(p=>p?.schema==='target-render-v1'&&Array.isArray(p.served)&&p.served.every((s:any)=>typeof s?.ref==='string')))];
  return <section><p class="ss-muted">Observed delivery and decisions. Captures begin when the extension connects; unavailable response fields cannot be inferred. This view uses the latest 150 retained wire captures.</p>
    <label class="ss-target-tool-picker">Inspect<select aria-label="Adobe Target tool" value={tab} onChange={event=>setTab(event.currentTarget.value)}>{['Findings','Timeline','Raw','Identity','A4T','Tracking','Timing','QA','Mboxes','On-device','Memory','Conflicts'].map(name=><option value={name}>{name}</option>)}</select></label>
    <div class="ss-platform-strip">{[...new Set(records.filter(r=>r.target).map(r=>r.client).filter(Boolean))].map(client=><span class="ss-badge">{client}</span>)}{[...new Set(records.filter(r=>r.target).map(r=>r.pipe))].map(pipe=><span class="ss-badge">{pipe}</span>)}{records.some(r=>r.integrity?.qaActive)&&<span class="ss-badge">QA observed</span>}</div>
    {['Mboxes','On-device','Memory','Conflicts'].includes(tab)&&<TargetInventory tab={tab} state={state} records={records} onAction={onAction}/>}
    {tab==='Timing' && <><p>Timing is based on observed prehiding and later selector mutations. It does not prove Target caused a mutation. Observations missed before connection cannot be recovered.</p><JsonTree value={config} label="Page configuration"/>{state.events.filter(e=>(e.properties as any)?.schema==='target-timing-v1'||e.platform==='adobe-target'&&e.via==='api-call').map(e=><article class="ss-card" key={e.id}><h3>{e.name}</h3><JsonTree value={e.properties} label="Timing / API arguments"/></article>)}</>}
    {tab==='QA' && <TargetQa onAction={onAction} verified={records.some(r=>r.integrity?.qaActive)}/>}
    {tab==='Identity' && records.filter(r=>r.target).map((r,i)=><article class="ss-card" key={i}><h3>{r.client || 'Target'} · {new Date(r.at).toLocaleTimeString()}</h3><JsonTree value={{session:r.session,...r.integrity?.identity}} label="Observed identity"/><CopyButton value={JSON.stringify({session:r.session,...r.integrity?.identity},null,2)}/></article>)}
    {tab==='A4T' && <><p>Same-page SDID matching within 30 seconds. Server-side reporting cannot be verified here.</p><JsonTree value={a4tMatrix(records)} label="Correlation matrix" defaultOpen/></>}
    {tab==='Tracking' && <><p>Opaque credentials are represented by SHA-256 fingerprints. Execute impressions may be counted automatically. Missing captures are not proof of missing tracking.</p>{records.filter(r=>r.integrity).map((r,i)=><JsonTree key={i} value={{served:r.integrity?.served,notifications:r.integrity?.notices}} label={r.pipe+' · '+new Date(r.at).toLocaleTimeString()}/>)}</>}
    {tab==='Findings' && <>{findings.map(f=><article class="ss-card" key={f.id}><h3>{f.id} · {f.title}</h3><p>{f.severity} · {f.detail}</p><p>{f.recommendation}</p><button class="ss-link" onClick={()=>setTab('Raw')}>Inspect raw captures {f.evidence.map(i=>i+1).join(', ')}</button></article>)}{!findings.length&&<p>No findings in captured evidence.</p>}</>}
    {tab!=='Activities' && !records.length && <Empty title="Waiting for delivery">Refresh the website to capture its initial Target request.</Empty>}
    {['Timeline','Raw'].includes(tab) && records.map((r,index)=><article class="ss-card" key={index}><h3>#{index+1} · {r.pipe} · {r.status || 'No HTTP status'} · {Math.round(r.duration)} ms</h3><p>{r.client || 'Client not exposed'} · {new Date(r.at).toLocaleTimeString()}</p><p class="ss-caption">{r.url}</p>{r.ajoCount>0&&<p>{r.ajoCount} Journey Optimizer propositions excluded from Target activities.</p>}{tab==='Raw'?<><CopyButton value={JSON.stringify(r,null,2)} label="Copy capture"/><JsonTree value={r.request} label="Request"/><JsonTree value={r.response} label="Response"/></>:<p>{r.locations.map(l=>l.name+' ('+l.phase+')').join(', ') || 'No locations exposed'}</p>}</article>)}
  </section>;
}
