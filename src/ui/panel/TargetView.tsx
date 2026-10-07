import { targetFindings } from '../../core/adobe-target/findings';
import { useState } from 'preact/hooks';
import type { PageState } from '../../core/state';
import { isWire } from '../../core/adobe-target/capture';
import { CopyButton, Empty, JsonTree } from '../shared/components';
export default function TargetView({state}: {state:PageState}) {
  const [tab,setTab]=useState('Activities');
  const records=state.events.map(e=>e.properties).filter(isWire);
  const activities=state.experiments.filter(a=>a.platform==='adobe-target');
  return <section><h1>Adobe Target</h1><p class="ss-muted">Observed delivery and decisions. Captures begin when the extension connects; unavailable response fields cannot be inferred.</p>
    <nav class="ss-segmented" aria-label="Adobe Target sections">{['Activities','Timeline','Raw','Findings'].map(name=><button class={tab===name?'ss-selected':''} onClick={()=>setTab(name)}>{name}</button>)}</nav>
    {tab==='Activities' && activities.map(a=><article class="ss-card" key={a.id}><h2>{a.name}</h2><p>{a.id} · {a.variations.find(v=>v.id===a.assignedVariationId)?.name || 'Experience not exposed'}</p><p>{a.statusReason}</p><JsonTree value={a} label="Activity details"/></article>)}
    {tab==='Activities'&&!activities.length&&<Empty title="No Target activity IDs observed">Enable response tokens in Adobe Target to expose activity and experience names.</Empty>}
    {tab==='Findings' && <>{targetFindings(records).map(f=><article class="ss-card" key={f.id}><h3>{f.id} · {f.title}</h3><p>{f.severity} · {f.detail}</p><p>{f.recommendation}</p><button class="ss-link" onClick={()=>setTab('Raw')}>Inspect raw captures {f.evidence.map(i=>i+1).join(', ')}</button></article>)}{!targetFindings(records).length&&<p>No findings in captured evidence.</p>}</>}
    {tab!=='Activities' && !records.length && <Empty title="Waiting for delivery">Refresh the website to capture its initial Target request.</Empty>}
    {['Timeline','Raw'].includes(tab) && records.map((r,index)=><article class="ss-card" key={index}><h3>#{index+1} · {r.pipe} · {r.status || 'No HTTP status'} · {Math.round(r.duration)} ms</h3><p>{r.client || 'Client not exposed'} · {new Date(r.at).toLocaleTimeString()}</p><p class="ss-caption">{r.url}</p>{r.ajoCount>0&&<p>{r.ajoCount} Journey Optimizer propositions excluded from Target activities.</p>}{tab==='Raw'?<><CopyButton value={JSON.stringify(r,null,2)} label="Copy capture"/><JsonTree value={r.request} label="Request"/><JsonTree value={r.response} label="Response"/></>:<p>{r.locations.map(l=>l.name+' ('+l.phase+')').join(', ') || 'No locations exposed'}</p>}</article>)}
  </section>;
}
