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
  const [tab,setTab]=useState('Activities');
  const records=state.events.map(e=>e.properties).filter(isWire) as EnrichedWire[];
  const findings=[...targetFindings(records),...integrityFindings(records)];
  const activities=state.experiments.filter(a=>a.platform==='adobe-target');
  return <section><h1>Adobe Target</h1><p class="ss-muted">Observed delivery and decisions. Captures begin when the extension connects; unavailable response fields cannot be inferred.</p>
    <nav class="ss-segmented" aria-label="Adobe Target sections">{['Activities','Timeline','Raw','Identity','A4T','Tracking','Findings','QA'].map(name=><button class={tab===name?'ss-selected':''} onClick={()=>setTab(name)}>{name}</button>)}</nav>
    {tab==='Activities' && activities.map(a=><article class="ss-card" key={a.id}><h2>{a.name}</h2><p>{a.id} · {a.variations.find(v=>v.id===a.assignedVariationId)?.name || 'Experience not exposed'}</p><p>{a.statusReason}</p><JsonTree value={a} label="Activity details"/></article>)}
    {tab==='Activities'&&!activities.length&&<Empty title="No Target activity IDs observed">Enable response tokens in Adobe Target to expose activity and experience names.</Empty>}
    {tab==='QA' && <TargetQa onAction={onAction} verified={records.some(r=>r.integrity?.qaActive)}/>}
    {tab==='Identity' && records.filter(r=>r.target).map((r,i)=><article class="ss-card" key={i}><h3>{r.client || 'Target'} · {new Date(r.at).toLocaleTimeString()}</h3><JsonTree value={{session:r.session,...r.integrity?.identity}} label="Observed identity"/><CopyButton value={JSON.stringify({session:r.session,...r.integrity?.identity},null,2)}/></article>)}
    {tab==='A4T' && <><p>Same-page SDID matching within 30 seconds. Server-side reporting cannot be verified here.</p><JsonTree value={a4tMatrix(records)} label="Correlation matrix" defaultOpen/></>}
    {tab==='Tracking' && <><p>Opaque credentials are represented by SHA-256 fingerprints. Execute impressions may be counted automatically. Missing captures are not proof of missing tracking.</p>{records.filter(r=>r.integrity).map((r,i)=><JsonTree key={i} value={{served:r.integrity?.served,notifications:r.integrity?.notices}} label={r.pipe+' · '+new Date(r.at).toLocaleTimeString()}/>)}</>}
    {tab==='Findings' && <>{findings.map(f=><article class="ss-card" key={f.id}><h3>{f.id} · {f.title}</h3><p>{f.severity} · {f.detail}</p><p>{f.recommendation}</p><button class="ss-link" onClick={()=>setTab('Raw')}>Inspect raw captures {f.evidence.map(i=>i+1).join(', ')}</button></article>)}{!findings.length&&<p>No findings in captured evidence.</p>}</>}
    {tab!=='Activities' && !records.length && <Empty title="Waiting for delivery">Refresh the website to capture its initial Target request.</Empty>}
    {['Timeline','Raw'].includes(tab) && records.map((r,index)=><article class="ss-card" key={index}><h3>#{index+1} · {r.pipe} · {r.status || 'No HTTP status'} · {Math.round(r.duration)} ms</h3><p>{r.client || 'Client not exposed'} · {new Date(r.at).toLocaleTimeString()}</p><p class="ss-caption">{r.url}</p>{r.ajoCount>0&&<p>{r.ajoCount} Journey Optimizer propositions excluded from Target activities.</p>}{tab==='Raw'?<><CopyButton value={JSON.stringify(r,null,2)} label="Copy capture"/><JsonTree value={r.request} label="Request"/><JsonTree value={r.response} label="Response"/></>:<p>{r.locations.map(l=>l.name+' ('+l.phase+')').join(', ') || 'No locations exposed'}</p>}</article>)}
  </section>;
}
