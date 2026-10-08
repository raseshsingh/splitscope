import {JsonTree} from '../shared/components';
import {useEffect,useState} from 'preact/hooks';
export default function TargetQa({onAction,verified}:{onAction?: (payload:Record<string,unknown>)=>Promise<any>;verified:boolean}) {
 const [status,setStatus]=useState<any>({saved:[]}),[url,setUrl]=useState(''),[label,setLabel]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[edge,setEdge]=useState(false);
 const refresh=async()=>{if(!onAction)return;const value=await onAction({action:'status'});if(!value||!Array.isArray(value.saved))throw new Error('Target controls are unavailable. Reload the extension and this page.');setStatus(value);};
 useEffect(()=>{void refresh().catch(e=>setError(String(e)));},[]);
 const run=async(payload:Record<string,unknown>)=>{if(!onAction)return;setBusy(true);setError('');try{await onAction(payload);await refresh();if(payload.action==='save'){setUrl('');setLabel('');}}catch(e){setError(String(e));}finally{setBusy(false);}};
 const hasCookies=Boolean(status.qaCookies?.length);
 const stale=status.qaFirstObserved&&Date.now()-status.qaFirstObserved>7*86400000;
 const state=verified?'ok':hasCookies?'info':'plain';
 return <section class="ss-qa ss-stack">
  <div class={'ss-note ss-qa-state'+(state==='ok'?' ss-note-ok':state==='info'?' ss-note-info':'')} role="status"><strong>{verified?'QA mode confirmed':hasCookies?'QA cookies present':'QA mode not confirmed'}</strong><span>{verified?'Seen in a captured delivery request.':hasCookies?'Waiting for a delivery request to confirm it.':'No QA delivery has been captured yet.'}</span></div>
  {stale&&<p class="ss-note ss-note-warn">QA cookies were first observed more than seven days ago. Cookie creation time is unavailable, so exit QA if this session is no longer needed.</p>}
  {!onAction&&<p class="ss-note ss-note-warn">QA controls require the installed extension.</p>}
  {error&&<p class="ss-note ss-note-err" role="alert">{error}</p>}

  <div class="ss-qa-card">
   <h2>QA sessions</h2>
   <p class="ss-caption ss-muted">Save the Adobe generated link for each experience. Adobe keeps QA reporting separate from live activity data. Links contain private QA credentials and stay in this browser.</p>
   {status.saved.length>0&&<ul class="ss-qa-list" aria-label="Saved QA experiences">{status.saved.map((s:any)=><li key={s.id}><div class="ss-qa-name"><strong>{s.label}</strong><small>Adobe index {s.index}</small></div><div class="ss-actions"><button class="ss-button ss-small" disabled={busy} onClick={()=>void run({action:'open',id:s.id})}>Open here</button><button class="ss-button ss-small" disabled={busy} onClick={()=>void run({action:'open',id:s.id,newTab:true})}>New tab</button><button class="ss-link" disabled={busy} onClick={()=>void run({action:'remove',id:s.id})}>Remove</button></div></li>)}</ul>}
   <div class="ss-qa-form">
    <label class="ss-qa-field"><span>Experience label</span><input value={label} onInput={e=>setLabel(e.currentTarget.value)} placeholder="Homepage, Experience B"/></label>
    <label class="ss-qa-field"><span>Adobe QA link</span><input type="url" value={url} onInput={e=>setUrl(e.currentTarget.value)} placeholder="Paste the full QA URL"/></label>
    <div class="ss-actions"><button class="ss-button ss-primary" disabled={busy||!onAction||!url} onClick={()=>void run({action:'save',url,label})}>Save QA experience</button><button class="ss-button" disabled={busy||!onAction} onClick={()=>void run({action:'exit'})}>Exit QA and reload</button></div>
   </div>
   <JsonTree value={status.cookieIdentity||{}} label="Target and Adobe cookie identity"/>
  </div>

  <div class="ss-qa-card">
   <h2>Baseline view</h2>
   <p class="ss-caption ss-muted">{status.blocked?'Target blocking is on for this tab.':'Block new Target delivery and on-device artifact requests in this tab, then reload to see the page without Target.'} Service-worker caches or inline offers may still apply content.</p>
   <label class="ss-setting ss-qa-switch"><span>Also block Adobe Edge requests<small>This also interrupts Analytics, identity and other Adobe services. Target cannot be isolated inside a shared Edge request.</small></span><input class="ss-switch" type="checkbox" role="switch" checked={edge} onChange={e=>setEdge(e.currentTarget.checked)}/></label>
   <button class={'ss-button'+(status.blocked?' ss-primary':'')} disabled={busy||!onAction} onClick={()=>void run({action:'block',enabled:!status.blocked,edge})}>{status.blocked?'Restore Target and reload':'Block Target and reload'}</button>
  </div>
 </section>;
}
