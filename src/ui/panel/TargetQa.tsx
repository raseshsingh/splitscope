import {JsonTree} from '../shared/components';
import {useEffect,useState} from 'preact/hooks';
export default function TargetQa({onAction,verified}:{onAction?: (payload:Record<string,unknown>)=>Promise<any>;verified:boolean}) {
 const [status,setStatus]=useState<any>({saved:[]}),[url,setUrl]=useState(''),[label,setLabel]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[edge,setEdge]=useState(false);
 const refresh=async()=>{if(!onAction)return;const value=await onAction({action:'status'});if(!value||!Array.isArray(value.saved))throw new Error('Target controls are unavailable. Reload the extension and this page.');setStatus(value);};
 useEffect(()=>{void refresh().catch(e=>setError(String(e)));},[]);
 const run=async(payload:Record<string,unknown>)=>{if(!onAction)return;setBusy(true);setError('');try{await onAction(payload);await refresh();if(payload.action==='save'){setUrl('');setLabel('');}}catch(e){setError(String(e));}finally{setBusy(false);}};
 return <section><h2>QA sessions</h2><p>{verified?'QA mode confirmed in a captured delivery request.':status.qaCookies?.length?'QA cookies present; waiting for delivery confirmation.':'QA mode has not been confirmed in captured delivery.'}</p><p>Save an Adobe-generated link for each experience. Adobe separates QA reporting from live activity data. These links contain private QA credentials and are stored only in this browser.</p>
 <JsonTree value={status.cookieIdentity||{}} label="Target and Adobe cookie identity"/>{status.qaFirstObserved&&Date.now()-status.qaFirstObserved>7*86400000&&<p>T61 · QA cookies were first observed more than seven days ago. Cookie creation time is unavailable; exit QA if this session is no longer needed.</p>}
 {!onAction&&<p>QA controls require the installed extension.</p>}{error&&<p role="alert">{error}</p>}
 <label>Experience label<input value={label} onInput={e=>setLabel(e.currentTarget.value)} placeholder="Homepage · Experience B"/></label><label>Adobe QA link<input type="url" value={url} onInput={e=>setUrl(e.currentTarget.value)} placeholder="Paste the full QA URL"/></label>
 <button class="ss-button" disabled={busy||!onAction||!url} onClick={()=>void run({action:'save',url,label})}>Save QA experience</button>
 {status.saved.map((s:any)=><article class="ss-card" key={s.id}><h3>{s.label}</h3><p>Adobe index {s.index}</p><button class="ss-button" disabled={busy} onClick={()=>void run({action:'open',id:s.id})}>Open here</button><button class="ss-button" disabled={busy} onClick={()=>void run({action:'open',id:s.id,newTab:true})}>Open in new tab</button><button class="ss-link" disabled={busy} onClick={()=>void run({action:'remove',id:s.id})}>Remove</button></article>)}
 <button class="ss-button" disabled={busy||!onAction} onClick={()=>void run({action:'exit'})}>Exit QA and reload</button>
 <h2>Baseline view</h2><p>{status.blocked?'Target blocking is enabled for this tab.':'Block new Target delivery and on-device artifact requests in this tab, then reload.'} Existing service-worker caches or inline offers may still apply content.</p>
 <label><input type="checkbox" checked={edge} onChange={e=>setEdge(e.currentTarget.checked)}/>Also block Adobe Edge requests</label><p class="ss-caption">Edge blocking also interrupts Analytics, identity and other Adobe services. Target cannot be isolated inside a shared Edge request.</p>
 <button class="ss-button" disabled={busy||!onAction} onClick={()=>void run({action:'block',enabled:!status.blocked,edge})}>{status.blocked?'Restore Target and reload':'Block Target and reload'}</button>
 </section>;
}
