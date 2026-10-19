import { useEffect, useMemo, useState } from 'preact/hooks';
import type { PageState } from '../../core/state';
import type { Workspace } from '../../core/qa/workspace';
import { evaluateAudiences, pageAudienceEnv, type AttributeValues, type ConditionNode, type Tri } from '../../core/optimizely/audiences';
import { CopyButton, Empty } from '../shared/components';
import ConfirmModal from '../shared/ConfirmModal';

export type PlatformAction = (platform: string, action: string, args?: Record<string, unknown>) => Promise<any>;
type Section = 'visitor' | 'audiences' | 'pages' | 'events' | 'debug';
const sections: Array<[Section, string]> = [['visitor', 'Visitor'], ['audiences', 'Audiences'], ['pages', 'Pages'], ['events', 'Events'], ['debug', 'Debug']];

const mark = (result: Tri) => result === true ? { text: 'Pass', cls: 'ss-tag ss-tag-ok' } : result === false ? { text: 'Fail', cls: 'ss-tag ss-tag-err' } : { text: 'Unknown', cls: 'ss-tag ss-tag-warn' };

function Tree({ node }: { node: ConditionNode }) {
  const m = mark(node.result);
  return <div class="ss-aud-node"><div class="ss-aud-row"><span class={m.cls}>{m.text}</span><span class="ss-wrap">{node.label}</span></div>{node.note && <small class="ss-muted ss-wrap">{node.note}</small>}{node.children && node.children.length > 0 && <div class="ss-aud-children">{node.children.map((child, index) => <Tree key={index} node={child} />)}</div>}</div>;
}

/** Visitor, audience, page and event tools for Optimizely Web, run through the page hook. */
export default function OptimizelyTools({ state, onAction, workspace, onRevision, onNotice }: { state: PageState; onAction?: PlatformAction; workspace: Workspace; onRevision: (key: string, revision: string) => void; onNotice: (message: string) => void }) {
  const [section, setSection] = useState<Section>('visitor');
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attrId, setAttrId] = useState(''); const [attrValue, setAttrValue] = useState(''); const [attrType, setAttrType] = useState('string');
  const experiments = state.experiments.filter(item => item.platform === 'optimizely');
  const [experimentId, setExperimentId] = useState('');
  const [audit, setAudit] = useState<any>(null);
  const [fire, setFire] = useState<null | { eventName: string; label: string }>(null);
  const [previousRevision, setPreviousRevision] = useState<{ revision: string; at: number } | null>(null);

  const load = async () => {
    if (!onAction) return;
    setBusy(true); setError('');
    try { setInfo(await onAction('optimizely', 'visitor')); } catch (e) { setError(String((e as Error).message || e)); } finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);

  // Remember the snippet revision per project so a republish is noticed on the next visit.
  const revisionKey = info?.projectId ? `optimizely:${info.projectId}` : '';
  useEffect(() => {
    if (!revisionKey || !info?.revision) return;
    const saved = workspace.revisions?.[revisionKey];
    if (saved && saved.revision !== info.revision) setPreviousRevision(saved);
    if (!saved || saved.revision !== info.revision) onRevision(revisionKey, info.revision);
  }, [revisionKey, info?.revision]);

  const run = async (action: string, args: Record<string, unknown>, success: string) => {
    if (!onAction) return;
    setBusy(true); setError('');
    try { const result = await onAction('optimizely', action, args); if (result && Array.isArray(result.attributes)) setInfo(result); onNotice(success); return result; }
    catch (e) { setError(String((e as Error).message || e)); } finally { setBusy(false); }
  };

  const attrs: AttributeValues = useMemo(() => {
    const map: AttributeValues = {};
    for (const item of info?.attributes || []) { if (item.value === undefined) continue; map[item.id] = item.value; map[item.name] = item.value; if (item.apiName) map[item.apiName] = item.value; }
    return map;
  }, [info]);

  const check = async () => {
    if (!onAction || !experimentId) return;
    setBusy(true); setError('');
    try {
      const result = await onAction('optimizely', 'audiences', { experimentId });
      const visitorAttrs: AttributeValues = {};
      for (const item of result.visitor?.attributes || []) { if (item.value === undefined) continue; visitorAttrs[item.id] = item.value; visitorAttrs[item.name] = item.value; if (item.apiName) visitorAttrs[item.apiName] = item.value; }
      setAudit({ ...evaluateAudiences(result.audiences, visitorAttrs, pageAudienceEnv(), result.visitor?.exposesAttributes !== false), raw: result.audiences, at: Date.now() });
    } catch (e) { setError(String((e as Error).message || e)); setAudit(null); } finally { setBusy(false); }
  };

  const reloadWith = (params: Record<string, string>) => { const url = new URL(location.href); for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value); location.assign(url.href); };

  if (!onAction) return <Empty title="Needs the installed extension">Optimizely tools talk to the page through the extension, so they are not available in this preview.</Empty>;
  const defined = (info?.attributes || []).filter((item: any) => item.defined);
  return <section class="ss-stack ss-opt">
    <nav class="ss-tabs" aria-label="Optimizely tools">{sections.map(([id, label]) => <button key={id} class={section === id ? 'ss-selected' : ''} aria-pressed={section === id} onClick={() => setSection(id)}>{label}</button>)}</nav>
    {error && <p class="ss-note ss-note-err" role="alert">{error}</p>}

    {section === 'visitor' && <>
      <div class="ss-qa-card">
        <div class="ss-inline"><h2>This visitor</h2><button class="ss-link" disabled={busy} onClick={() => void load()}>Refresh</button></div>
        <dl class="ss-kv"><dt>Visitor ID</dt><dd>{info?.visitorId ? <><code class="ss-wrap">{info.visitorId}</code> <CopyButton value={info.visitorId} label="Copy" /></> : <span class="ss-muted">Not exposed</span>}</dd><dt>Project ID</dt><dd>{info?.projectId ? <code>{info.projectId}</code> : <span class="ss-muted">Not exposed</span>}</dd><dt>Snippet revision</dt><dd>{info?.revision ? <code>{info.revision}</code> : <span class="ss-muted">Not exposed</span>}</dd></dl>
        {previousRevision && info?.revision && <p class="ss-note ss-note-warn" role="status">The snippet was republished since you last inspected this project: revision {previousRevision.revision} on {new Date(previousRevision.at).toLocaleString()}, now {info.revision}. Re-check your assignments and code.</p>}
      </div>
      <div class="ss-qa-card">
        <h2>Visitor attributes</h2>
        {info && !info.exposesAttributes && <p class="ss-note ss-note-warn">This page does not expose the visitor's attribute values, so audience checks that depend on attributes will show Unknown.</p>}
        {info?.attributes?.some((item: any) => item.value !== undefined) ? <ul class="ss-qa-list" aria-label="Attribute values">{info.attributes.filter((item: any) => item.value !== undefined).map((item: any) => <li key={item.id}><div class="ss-qa-name"><strong class="ss-wrap">{item.name}</strong><small>ID {item.id}</small></div><code class="ss-wrap">{String(item.value)}</code></li>)}</ul> : <p class="ss-caption ss-muted">No attribute values are set for this visitor.</p>}
        {defined.length > 0 ? <div class="ss-qa-form">
          <label class="ss-qa-field"><span>Attribute</span><select value={attrId} onChange={e => setAttrId(e.currentTarget.value)}><option value="">Choose an attribute</option>{defined.map((item: any) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <div class="ss-qa-pair"><label class="ss-qa-field"><span>Value</span><input value={attrValue} onInput={e => setAttrValue(e.currentTarget.value)} /></label><label class="ss-qa-field"><span>Type</span><select value={attrType} onChange={e => setAttrType(e.currentTarget.value)}><option value="string">Text</option><option value="number">Number</option><option value="boolean">True or false</option></select></label></div>
          <div class="ss-actions"><button class="ss-button ss-primary" disabled={busy || !attrId} onClick={() => void run('setAttribute', { id: attrId, value: attrValue, valueType: attrType }, 'Attribute set for this page view.')}>Set attribute</button></div>
          <p class="ss-caption ss-muted">Applies to this page view through Optimizely's own API. Optimizely only re-evaluates audiences when it normally would, so you may need to reload with the attribute set by the site.</p>
        </div> : info && <p class="ss-caption ss-muted">No attribute definitions were found in the project data.</p>}
      </div>
    </>}

    {section === 'audiences' && <div class="ss-qa-card">
      <h2>Audience check</h2>
      <p class="ss-caption ss-muted">Choose an experiment and Splitscope evaluates its audience conditions against this visitor and page. It cannot read location, device or custom JavaScript conditions, so those show Unknown. Optimizely makes the real decision.</p>
      {experiments.length ? <>
        <label class="ss-qa-field"><span>Experiment</span><select value={experimentId} onChange={e => { setExperimentId(e.currentTarget.value); setAudit(null); }}><option value="">Choose an experiment</option>{experiments.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <div class="ss-actions"><button class="ss-button ss-primary" disabled={busy || !experimentId} onClick={() => void check()}>Check audiences</button></div>
      </> : <p class="ss-caption ss-muted">No Optimizely experiments have been found on this page yet.</p>}
      {audit && <div class="ss-aud">
        <p class={'ss-note ' + (audit.result === true ? 'ss-note-ok' : audit.result === false ? 'ss-note-err' : 'ss-note-warn')} role="status"><strong>{audit.result === true ? 'The visitor qualifies' : audit.result === false ? 'The visitor does not qualify' : 'Could not be fully determined'}</strong><span>{audit.audiences.length ? 'An experiment includes a visitor who matches any of its audiences.' : 'This experiment has no audiences, so everyone qualifies.'}</span></p>
        {audit.audiences.map((item: any) => <div class="ss-card ss-flat" key={item.id}><div class="ss-inline"><b>{item.name}</b><span class={mark(item.tree.result).cls}>{mark(item.tree.result).text}</span></div><Tree node={item.tree} /></div>)}
      </div>}
    </div>}

    {section === 'pages' && <div class="ss-qa-card">
      <div class="ss-inline"><h2>Pages</h2><button class="ss-link" disabled={busy} onClick={() => void load()}>Refresh</button></div>
      <p class="ss-caption ss-muted">Pages with an API name can be activated or deactivated by hand, which is how many sites control them. URL targeted pages activate on their own.</p>
      {info?.pages?.length ? <ul class="ss-qa-list">{info.pages.map((page: any) => <li key={page.id}><div class="ss-qa-name"><strong class="ss-wrap">{page.name}</strong><small>{page.apiName ? 'API name ' + page.apiName : 'No API name'}</small></div><div class="ss-actions">{page.isActive !== undefined && <span class={'ss-tag' + (page.isActive ? ' ss-tag-ok' : '')}>{page.isActive ? 'Active' : 'Inactive'}</span>}<button class="ss-button ss-small" disabled={busy || !page.apiName} onClick={() => void run('setPage', { apiName: page.apiName, isActive: !page.isActive }, page.isActive ? 'Page deactivated.' : 'Page activated.')}>{page.isActive ? 'Deactivate' : 'Activate'}</button></div></li>)}</ul> : <p class="ss-caption ss-muted">No pages were found in the project data.</p>}
    </div>}

    {section === 'events' && <div class="ss-qa-card">
      <h2>Project events</h2>
      <p class="ss-caption ss-muted">Fire a custom event by API name to test that your metric is wired up. This sends a real event to Optimizely and can count in results.</p>
      {info?.projectEvents?.length ? <ul class="ss-qa-list">{info.projectEvents.map((event: any) => <li key={event.id}><div class="ss-qa-name"><strong class="ss-wrap">{event.name}</strong><small class="ss-wrap">{event.apiName}</small></div><button class="ss-button ss-small" disabled={busy} onClick={() => setFire({ eventName: event.apiName, label: event.name })}>Fire</button></li>)}</ul> : <p class="ss-caption ss-muted">No custom events with an API name were found.</p>}
    </div>}

    {section === 'debug' && <div class="ss-qa-card">
      <h2>Reload with a debug option</h2>
      <p class="ss-caption ss-muted">These reload this page with a parameter Optimizely understands. Open the browser console to read the output.</p>
      <div class="ss-actions"><button class="ss-button" onClick={() => reloadWith({ optimizely_log: 'info' })}>Log level info</button><button class="ss-button" onClick={() => reloadWith({ optimizely_log: 'debug' })}>Log level debug</button><button class="ss-button" onClick={() => reloadWith({ optimizely_disable: 'true' })}>Disable Optimizely</button></div>
      <p class="ss-note">Disable Optimizely shows the page without any experiments, which is a quick check for whether a problem comes from a variation.</p>
    </div>}

    {fire && <ConfirmModal title="Fire this event?" confirm="Fire event" onCancel={() => setFire(null)} onConfirm={() => { const target = fire; setFire(null); void run('trackEvent', { eventName: target.eventName }, `Fired ${target.label}.`); }}>
      <p>This sends <code class="ss-wrap">{fire.eventName}</code> to Optimizely for this visitor. It can appear in experiment results.</p>
    </ConfirmModal>}
  </section>;
}
