import TargetInventory from './TargetInventory';
import TargetQa from './TargetQa';
import { a4tMatrix, type EnrichedWire } from '../../core/adobe-target/integrity';
import { useState, useEffect } from 'preact/hooks';
import type { PageState } from '../../core/state';
import { CopyButton, Disclosure, Empty, JsonTree, Tabs } from '../shared/components';
import type { TargetData } from './target-data';
export type TargetGroup = 'Overview' | 'QA' | 'Delivery' | 'Tracking';
/** Twelve views grouped by the question they answer, so the tool never shows a wall of chips. */
export const targetGroups: Record<TargetGroup, string[]> = {
  Overview: ['Findings', 'Timeline', 'Conflicts'],
  QA: ['QA', 'Memory'],
  Delivery: ['Mboxes', 'On-device', 'Timing', 'Raw'],
  Tracking: ['A4T', 'Tracking', 'Identity'],
};
export const targetTabs = Object.values(targetGroups).flat();
const firstView = (group: TargetGroup) => targetGroups[group][0] || 'Findings';
const groupOf = (view: string) => (Object.keys(targetGroups) as TargetGroup[]).find(group => targetGroups[group].includes(view)) || 'Overview';
// Remember the last view across remounts (switching panel tabs unmounts the tool).
let lastView = 'Findings';
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour12: false });
function Bars({ rows }: { rows: Array<{ label: string; ms: number; tone: string }> }) {
  const max = Math.max(1, ...rows.map(row => row.ms));
  return <div class="ss-bars">{rows.map(row => <div key={row.label}><div class="ss-caption ss-muted">{row.label} · {Math.round(row.ms)} ms</div><div class="ss-tm"><i class={'ss-tm-' + row.tone} style={{ width: Math.max(2, row.ms / max * 100) + '%' }} /></div></div>)}</div>;
}
export default function TargetView({ state, onAction, data, initialGroup, groupRequest = 0 }: { state: PageState; onAction?: (payload: Record<string, unknown>) => Promise<any>; data: TargetData; initialGroup?: TargetGroup; groupRequest?: number }) {
  const [, tick] = useState(0);
  useEffect(() => { const timer = setInterval(() => tick(n => n + 1), 5000); return () => clearInterval(timer); }, []);
  const [tab, setView] = useState(() => initialGroup ? firstView(initialGroup) : lastView);
  const setTab = (view: string) => { lastView = view; setView(view); };
  useEffect(() => { if (groupRequest && initialGroup) setTab(firstView(initialGroup)); }, [groupRequest]);
  const group = groupOf(tab);
  const { records, config, findings } = data;
  const targetRecords = records.filter(r => r.target);
  const timingEvents = state.events.filter(e => (e.properties as any)?.schema === 'target-timing-v1' || e.platform === 'adobe-target' && e.via === 'api-call');
  const prehide = state.events.findLast(e => e.name === 'Target prehide ended')?.properties as any;
  const mutation = state.events.findLast(e => e.name === 'Target selector mutation observed')?.properties as any;
  const bars = [
    ...(prehide?.duration != null ? [{ label: 'Prehiding', ms: prehide.duration, tone: 'info' }] : []),
    ...(mutation?.requestToMutationMs != null ? [{ label: 'Request to selector mutation', ms: mutation.requestToMutationMs, tone: 'ok' }] : []),
    ...(mutation?.responseToMutationMs != null ? [{ label: 'Response to selector mutation', ms: mutation.responseToMutationMs, tone: 'warn' }] : []),
  ];
  const tracked = new Map<string, { kind: string; seen: number }>();
  for (const r of records) for (const item of r.integrity?.served || []) { const prior = tracked.get(item.ref); tracked.set(item.ref, { kind: item.kind, seen: (prior?.seen || 0) + 1 }); }
  return <section class="ss-target">
    <p class="ss-caption ss-muted">Observed delivery and decisions. Captures begin when the extension connects; unavailable response fields cannot be inferred. This view uses the latest 150 retained wire captures.</p>
    <Tabs className="ss-tabs ss-target-groups" label="Adobe Target area" value={group} onChange={name => setTab(firstView(name))} items={(Object.keys(targetGroups) as TargetGroup[]).map(name => [name, <>{name}{name === 'Overview' && findings.length > 0 && <span class="ss-count">{findings.length}</span>}</>])} />
    <div class="ss-chips" role="group" aria-label="Adobe Target tool">{targetGroups[group].map(name => <button key={name} class={tab === name ? 'ss-selected' : ''} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>)}</div>
    <div class="ss-tags">{[...new Set(targetRecords.map(r => r.client).filter(Boolean))].map(client => <span class="ss-tag" key={client as string}>{client}</span>)}{[...new Set(targetRecords.map(r => r.pipe))].map(pipe => <span class="ss-tag" key={pipe}>{pipe}</span>)}{records.some(r => r.integrity?.qaActive) && <span class="ss-tag ss-tag-warn">QA observed</span>}</div>
    {['Mboxes', 'On-device', 'Memory', 'Conflicts'].includes(tab) && <TargetInventory tab={tab} state={state} records={records} onAction={onAction} />}
    {tab === 'Timing' && <>
      {bars.length > 0 && <Bars rows={bars} />}
      {mutation?.possibleFlickerMs != null && <p class="ss-note ss-note-warn">Potential flicker window: {Math.round(mutation.possibleFlickerMs)} ms. Timing correlation is not proof of render attribution.</p>}
      <p class="ss-caption ss-muted">Timing is based on observed prehiding and later selector mutations. It does not prove Target caused a mutation. Observations missed before connection cannot be recovered.</p>
      <JsonTree value={config} label="Page configuration" />
      {timingEvents.map(e => <div class="ss-card ss-flat" key={e.id}><b>{e.name}</b><JsonTree value={e.properties} label="Timing / API arguments" /></div>)}</>}
    {tab === 'QA' && <TargetQa onAction={onAction} verified={records.some(r => r.integrity?.qaActive)} />}
    {tab === 'Identity' && targetRecords.map((r, i) => <div class="ss-card ss-flat" key={i}><b>{r.client || 'Target'} · {clock(r.at)}</b><JsonTree value={{ session: r.session, ...r.integrity?.identity }} label="Observed identity" defaultOpen /><CopyButton value={JSON.stringify({ session: r.session, ...r.integrity?.identity }, null, 2)} /></div>)}
    {tab === 'A4T' && <>{(() => { const rows = a4tMatrix(records); return rows.length ? <table class="ss-table"><thead><tr><th>Target</th><th>Analytics</th><th>Match</th></tr></thead><tbody>{rows.map(row => <tr key={row.capture}><td><code>#{row.capture}</code></td><td>{row.analyticsCaptures.length ? row.analyticsCaptures.map(n => '#' + n).join(', ') : <span class="ss-muted">none in window</span>}</td><td><span class={'ss-tag ' + (row.state === 'Matched' ? 'ss-tag-ok' : 'ss-tag-warn')}>{row.state === 'Matched' ? 'SDID' : row.state}</span></td></tr>)}</tbody></table> : <p class="ss-caption ss-muted">No client-side A4T requests captured yet. Adobe Analytics hits are recorded only when Capture analytics calls is on in Settings.</p>; })()}<p class="ss-note">Same-page SDID matching within 30 seconds. Correlation cannot prove backend reporting success.</p></>}
    {tab === 'Tracking' && <>{tracked.size ? <table class="ss-table"><thead><tr><th>Fingerprint</th><th>Type</th><th>Seen</th></tr></thead><tbody>{[...tracked].map(([ref, item]) => <tr key={ref}><td><code>{ref.slice(0, 6)}..{ref.slice(-2)}</code></td><td>{item.kind} token</td><td>{item.seen}</td></tr>)}</tbody></table> : <p class="ss-caption ss-muted">No tracking credentials captured yet.</p>}<p class="ss-note">Raw tracking credentials are never stored in the ledger. Opaque credentials are shown as SHA-256 fingerprints. Execute requests can count impressions without a separate notification, and missing captures are not proof of missing tracking.</p>{records.filter(r => r.integrity).map((r, i) => <JsonTree key={i} value={{ served: r.integrity?.served, notifications: r.integrity?.notices }} label={r.pipe + ' · ' + clock(r.at)} />)}</>}
    {tab === 'Findings' && <>{findings.map(f => <div class={'ss-note ss-finding ss-note-' + (f.severity === 'info' ? 'info' : 'warn')} key={f.id}><b>{f.id} · {f.title}</b><br />{f.detail}<br /><span class="ss-sub">{f.recommendation}</span><br /><span class="ss-mono ss-sub">Evidence: capture {f.evidence.map(i => '#' + (i + 1)).join(', ')} · </span><button class="ss-link" onClick={() => setTab('Raw')}>Inspect raw captures</button></div>)}{!findings.length && records.length > 0 && <p class="ss-note ss-note-ok">No findings in captured evidence.</p>}</>}
    {!records.length && ['Findings', 'Timeline', 'Raw', 'Identity', 'A4T', 'Tracking'].includes(tab) && <Empty title="Waiting for delivery">Refresh the website to capture its initial Target request.</Empty>}
    {tab === 'Timeline' && <div class="ss-tl">{records.map((r, index) => <div key={index} class={(r.duration > 1500 ? 'ss-w' : r.pipe === 'ode' ? 'ss-i' : '')}><b>{r.pipe}</b> <code class="ss-sub">{clock(r.at)}</code><br /><span class="ss-sub">#{index + 1} · {r.status || 'No HTTP status'} · {Math.round(r.duration)} ms{r.duration > 1500 ? ' · Slow' : ''} · {r.locations.map(l => l.name + ' (' + l.phase + ')').join(', ') || 'No locations exposed'}</span>{r.ajoCount > 0 && <><br /><span class="ss-sub">{r.ajoCount} Journey Optimizer propositions excluded from Target activities.</span></>}</div>)}</div>}
    {tab === 'Raw' && records.map((r, index) => <Disclosure key={index} title={`#${index + 1} · ${r.pipe} · ${r.status || 'No HTTP status'}`} meta={`${r.client || 'Client not exposed'} · ${clock(r.at)} · ${Math.round(r.duration)} ms · ${r.url}`}><CopyButton value={JSON.stringify(r, null, 2)} label="Copy capture" /><JsonTree value={r.request} label="Request" /><JsonTree value={r.response} label="Response" /></Disclosure>)}
    {tab === 'Raw' && <p class="ss-note">Request and response data is subject to redaction and size limits.</p>}
  </section>;
}
