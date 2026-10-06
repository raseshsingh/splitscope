import ActivityDetail, { SplitBar } from './ActivityDetail';
import PageView from './PageView';
import ToolsView from './ToolsView';
import ConfirmDialog from './PreviewDialog';
import { connectionLabel } from './ConnectionStatus';
import { recordCheck, type CheckRun } from '../../core/qa/check-run';
import JourneyView from '../qa/JourneyView';
import WorkspaceView from '../qa/WorkspaceView';
import { emptyWorkspace, type Assignment, type Workspace } from '../../core/qa/workspace';
import type { Journey } from '../../core/qa/journey';
import Expectations from '../qa/Expectations';
import type { EventExpectation } from '../../core/qa/expectations';
import { previewOutcome, type PreviewRecord } from '../../core/qa/preview';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Signal } from '@preact/signals';
import type { ForcePlan } from '../../core/model';
import type { PageState } from '../../core/state';
import { defaultSettings, type Settings } from '../../core/settings';
import { searchExperiments } from '../../core/search';
import { activityKey, activityStatus, isActive, kindNames, platformNames, pretty } from '../../core/qa/presentation';
import { clearHighlight, highlightSelector } from '../../core/qa/highlight';
import { Brand, Empty, Icon, IconButton, Status } from '../shared/components';
import SettingsView from './SettingsView';
import EventFeed from '../events/EventFeed';
export type PanelTab = 'activities' | 'events' | 'page' | 'tools' | 'settings';
type Props = { checkRun?: Signal<CheckRun | null>; onCheckRun?: (value: CheckRun | null) => void; workspace?: Signal<Workspace>; onWorkspace?: (value: Workspace) => void; journey?: Signal<Journey | null>; onJourney?: (action: 'start' | 'stop' | 'clear') => void | Promise<void>; expectations?: Signal<EventExpectation[]>; onExpectations?: (rules: EventExpectation[]) => void; state: Signal<PageState>; requestedExperiment: Signal<{ platform: string; id: string; requestId: number } | null>; requestedTab?: Signal<{ tab: PanelTab; requestId: number }>; settings?: Signal<Settings>; onSettings?: (value: Settings) => void; onClose: () => void; onRescan: () => void; onClearEvents?: () => void; initialPaused?: boolean; onPauseEvents: (paused: boolean) => void; onForceRequest: (payload: Record<string, unknown>) => void; onResetPreview?: () => void; onForceExecute: (plan: ForcePlan, target: 'current' | 'new', request?: Omit<PreviewRecord, 'origin' | 'startedAt' | 'changes' | 'persistent'>) => void };
export default function App(props: Props) {
  const { state, requestedExperiment, onRescan } = props;
  const current = state.value; const settings = props.settings?.value || defaultSettings;
  const [localCheck, setLocalCheck] = useState<CheckRun | null>(null);
  const check = props.checkRun?.value ?? localCheck;
  const setCheck = props.onCheckRun || setLocalCheck;
  useEffect(() => { if (!props.checkRun) setLocalCheck(prior => current.events.reduce((run, event) => recordCheck(run, event), prior)); }, [current.events]);
  const [tab, setTab] = useState<PanelTab>('activities');
  const [tool, setTool] = useState<'report' | 'compare' | 'journey' | 'workspace'>('report');
  const [localWorkspace, setLocalWorkspace] = useState(emptyWorkspace);
  const workspace = props.workspace?.value || localWorkspace;
  const updateWorkspace = (patch: Partial<Workspace>) => { const value = { ...(props.workspace?.value || localWorkspace), ...patch }; if (props.onWorkspace) props.onWorkspace(value); else setLocalWorkspace(value); };
  const { selected, query, scope, platform, kind, notes } = workspace;
  const setSelected = (selected: string | null) => updateWorkspace({ selected });
  const setQuery = (query: string) => updateWorkspace({ query });
  const setScope = (scope: string) => updateWorkspace({ scope });
  const setPlatform = (platform: string) => updateWorkspace({ platform });
  const setKind = (kind: string) => updateWorkspace({ kind });
  const setNotes = (notes: string) => updateWorkspace({ notes });
  const baseline = workspace.baseline?.assignments || null;
  const setBaseline = (assignments: Assignment[] | null) => updateWorkspace({ baseline: assignments ? { at: Date.now(), url: current.url, assignments } : null });
  const [paused, setPaused] = useState(props.initialPaused || false); const [minimized, setMinimized] = useState(false); const [notice, setNotice] = useState(''); const [proposal, setProposal] = useState<{ plan: ForcePlan; experiment: string; variation: string; request?: Omit<PreviewRecord, 'origin' | 'startedAt' | 'changes' | 'persistent'> } | null>(null);
  const [pending, setPending] = useState(false); const handled = useRef<unknown>(null); const root = useRef<HTMLDivElement>(null); const requestSeen = useRef(0);
  const activity = current.experiments.find((item) => activityKey(item) === selected);
  const active = current.experiments.filter(isActive).length;
  const filtered = useMemo(() => searchExperiments(current.experiments, query).filter(({ experiment: item }) => (scope === 'all' || (scope === 'pinned' ? workspace.pinned.includes(activityKey(item)) : scope === 'active' ? isActive(item) : !isActive(item))) && (platform === 'all' || item.platform === platform) && (kind === 'all' || item.kind === kind)), [current.experiments, query, scope, platform, kind, workspace.pinned]);
  const groups = [{ title: 'Current page decisions', items: filtered.filter(({ experiment }) => isActive(experiment)) }, { title: 'Configuration & stored decisions', items: filtered.filter(({ experiment }) => !isActive(experiment)) }];
  useEffect(() => { const request = requestedExperiment.value; if (!request || requestSeen.current === request.requestId) return; const found = current.experiments.find((item) => item.id === request.id && item.platform === request.platform); if (found) { requestSeen.current = request.requestId; setSelected(activityKey(found)); setTab('activities'); setMinimized(false); } }, [requestedExperiment.value, current.experiments]);
  useEffect(() => { if (props.requestedTab?.value.requestId) { setTab(props.requestedTab.value.tab); setMinimized(false); } }, [props.requestedTab?.value]);
  useEffect(() => {
    const response = current.statuses.at(-1); if (!response || response === handled.current) return; handled.current = response;
    if (response.message === 'force-plan' && response.plan) { setPending(false); const request = response.request as any; setProposal({ plan: response.plan as ForcePlan, experiment: request?.experiment || 'Selected activity', variation: request?.variation || 'selected variation', request }); }
    else if (response.error) { setPending(false); setNotice(String(response.error)); }
  }, [current.statuses]);
  useEffect(() => { if (!pending) return; const timer = setTimeout(() => { setPending(false); setNotice('The page did not respond. Refresh the page and try again.'); }, 6000); return () => clearTimeout(timer); }, [pending]);
  useEffect(() => () => clearHighlight(), []);
  const changeTab = (next: PanelTab) => { setTab(next); };
  const setSettings = (patch: Partial<Settings>) => props.onSettings?.({ ...settings, ...patch });
  const highlight = (selector: string) => { const result = highlightSelector(selector); setNotice(result.error || (result.count ? result.count + ' matching elements outlined for 5 seconds (up to 100).' : 'No elements match this selector on the current page.')); };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') { if (proposal) setProposal(null); else if (tab === 'activities' && selected) setSelected(null); else setMinimized(true); event.stopPropagation(); }
    if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]')) return;
    if (event.key === '/') { event.preventDefault(); root.current?.querySelector<HTMLInputElement>('input[type="search"],.ss-search input')?.focus(); }
    const index = Number(event.key) - 1; if (index >= 0 && index <= 3) changeTab((['activities', 'events', 'page', 'tools'] as PanelTab[])[index]!);
  };
  const pause = () => { if (!paused && check && !check.endedAt) setCheck({ ...check, interrupted: true }); props.onPauseEvents(!paused); setPaused(!paused); };
  const clear = () => { if (props.onClearEvents) props.onClearEvents(); else state.value = { ...state.value, events: [] }; };
  let hostname = current.url; try { hostname = new URL(current.url).hostname; } catch {}
  if (minimized) return <div class={'ss-app ss-minimized ss-dock-' + settings.dock} data-theme={settings.theme}><button onClick={() => setMinimized(false)}><Icon name="activity" />Splitscope <b>{active} decisions</b><Icon name="arrow" size={14} /></button></div>;
  return <div ref={root} class={'ss-app ss-panel ss-dock-' + settings.dock} data-theme={settings.theme} data-text-size={settings.textSize} onKeyDown={onKeyDown}>
    <header class="ss-header"><Brand subtitle={hostname} /><div class="ss-actions"><IconButton icon="settings" label="Settings" onClick={() => changeTab('settings')} /><IconButton icon="dock" label="Change dock position" onClick={() => setSettings({ dock: settings.dock === 'right' ? 'left' : settings.dock === 'left' ? 'bottom' : 'right' })} /><IconButton icon="minus" label="Minimize panel" onClick={() => setMinimized(true)} /><IconButton icon="close" label="Close panel" onClick={props.onClose} /></div></header>
    <div class="ss-platform-strip" aria-label="Detected platforms">{current.platforms.length ? current.platforms.map(item => <button class="ss-badge ss-platform-button" key={item.id} title="Filter activities by this platform" onClick={() => { updateWorkspace({ platform: item.id, selected: null, scope: 'all', query: '', kind: 'all' }); setTab('activities'); }}>{item.displayName}</button>) : <span class="ss-muted">No platform detected yet</span>}</div>
    <div class="ss-overview"><div><span class="ss-live-dot" /><b>{active}</b> current decisions <span class="ss-muted">/ {current.experiments.length} detected</span></div><button class="ss-link" onClick={onRescan}><Icon name="refresh" size={13} />Refresh</button></div>
    <nav class="ss-nav" aria-label="Inspector sections">{(['activities', 'events', 'page', 'tools'] as PanelTab[]).map((name) => <button key={name} aria-current={tab === name ? 'page' : undefined} class={tab === name ? 'ss-selected' : ''} onClick={() => changeTab(name)}><Icon name={name === 'activities' ? 'activity' : name} size={16} />{name === 'activities' ? 'Activities' : name.charAt(0).toUpperCase() + name.slice(1)}{name === 'events' && <span class="ss-count">{current.events.length}</span>}</button>)}</nav>
    {notice && <div class="ss-notice" role="status">{notice}<button class="ss-link" onClick={() => setNotice('')}>Dismiss</button></div>}
    <main class="ss-main">
      {current.preview && <section class="ss-card"><h2>Preview: {current.preview.variation}</h2><p>{previewOutcome(current.preview, current.experiments)}</p><p class="ss-caption ss-muted">Assignment confirmation does not prove every visual change rendered. Requested {new Date(current.preview.startedAt).toLocaleTimeString()}.</p>{current.preview.persistent && <p class="ss-caption">This platform may save the assignment in visitor storage. Removing preview parameters does not restore that assignment; use the vendor’s QA controls.</p>}<button class="ss-button" onClick={props.onResetPreview}>{current.preview.persistent ? 'Remove preview parameters & dismiss' : 'Reset my preview'}</button></section>}

      {tab === 'activities' && (selected ? activity ? <ActivityDetail key={selected} activity={activity} state={current} onPin={() => updateWorkspace({ pinned: workspace.pinned.includes(selected) ? workspace.pinned.filter(key => key !== selected) : [...workspace.pinned, selected].slice(-100) })} pinned={workspace.pinned.includes(selected)} onBack={() => setSelected(null)} onHighlight={highlight} onForce={(variationId) => { setPending(true); setNotice(''); props.onForceRequest({ platform: activity.platform, experimentId: activity.id, variationId, experimentName: activity.name, variationName: activity.variations.find((item) => item.id === variationId)?.name }); }} pending={pending} paused={paused} onPause={pause} /> : <Empty title="Activity no longer reported"><button class="ss-button" onClick={() => setSelected(null)}>Back to activities</button></Empty> : <>
        <div class="ss-inline ss-list-heading"><h2>Activities</h2><span class="ss-caption ss-muted">{filtered.length} of {current.experiments.length}</span></div>
        <label class="ss-search"><Icon name="search" /><input type="search" aria-label="Search activities" placeholder="Name, activity ID or variation ID…" value={query} onInput={(event) => setQuery(event.currentTarget.value)} /><kbd>/</kbd></label>
        <div class="ss-segmented" aria-label="Activity scope">{[['all', 'All', current.experiments.length], ['active', 'Here', active], ['other', 'Other', current.experiments.length - active], ['pinned', 'Pinned', current.experiments.filter(item => workspace.pinned.includes(activityKey(item))).length]].map(([value, label, count]) => <button aria-pressed={scope === value} class={scope === value ? 'ss-selected' : ''} onClick={() => setScope(String(value))}>{label}<span>{count}</span></button>)}</div>
        <div class="ss-filter-row">{(current.platforms.length > 1 || platform !== 'all') && <select aria-label="Filter activity platform" value={platform} onChange={(event) => setPlatform(event.currentTarget.value)}><option value="all">All platforms</option>{platform !== 'all' && !current.platforms.some(item => item.id === platform) && <option value={platform}>{platformNames[platform] || platform} · not detected</option>}{current.platforms.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select>}{(new Set(current.experiments.map(item => item.kind)).size > 1 || kind !== 'all') && <select aria-label="Filter activity type" value={kind} onChange={(event) => setKind(event.currentTarget.value)}><option value="all">All activity types</option>{kind !== 'all' && !current.experiments.some(item => item.kind === kind) && <option value={kind}>{kindNames[kind] || kind} · not reported</option>}{[...new Set(current.experiments.map((item) => item.kind))].map((type) => <option key={type} value={type}>{kindNames[type]}</option>)}</select>}</div>
        {(query || platform !== 'all' || kind !== 'all' || scope !== 'all') && <button class="ss-link ss-clear-filters" onClick={() => updateWorkspace({ query: '', platform: 'all', kind: 'all', scope: 'all' })}>Clear all filters</button>}
        {!filtered.length && <Empty title={current.experiments.length ? 'No matching activities' : 'No activity decisions available'}>{scope === 'pinned' ? 'Pinned activities are saved for this site. None match the current page and filters.' : current.experiments.length ? 'Clear a filter or try another ID.' : current.platforms.length ? 'A platform was detected, but it has not exposed activity data. Accept site consent or interact with the page, then refresh.' : 'No supported platform was detected. Refresh after the site finishes loading.'}</Empty>}
        {groups.filter((group) => group.items.length).map((group) => <section class="ss-group" key={group.title}><div class="ss-group-title">{group.title}<span>{group.items.length}</span></div>{group.items.map(({ experiment: item, matchedVariationName }) => <button class="ss-activity" key={activityKey(item)} onClick={() => setSelected(activityKey(item))}><div class="ss-inline"><span class="ss-eyebrow">{platformNames[item.platform]} · {kindNames[item.kind]}</span><Icon name="arrow" size={15} /></div><h3>{workspace.pinned.includes(activityKey(item)) && <span class="ss-pin-label">Pinned · </span>}{item.name}</h3><div class="ss-inline"><Status status={item.status} label={activityStatus(item)} /><code class="ss-id">{item.id}</code></div><SplitBar activity={item} compact /><p class="ss-assignment">{['feature-flag', 'configuration', 'layer'].includes(item.kind) && item.evaluatedValue !== undefined ? 'Value: ' + pretty(item.evaluatedValue).slice(0, 120) : item.assignedVariationId ? (isActive(item) ? 'Assigned: ' : item.status === 'bucketed-elsewhere' ? 'Stored assignment: ' : 'Reported decision: ') + (item.variations.find((variation) => variation.id === item.assignedVariationId)?.name || item.assignedVariationId) : 'Assignment not exposed'}{matchedVariationName && <span>Matched variation: {matchedVariationName}</span>}</p></button>)}</section>)}
      </>)}
      <section hidden={tab !== 'events'}>{props.expectations && <Expectations rules={props.expectations.value} onChange={props.onExpectations || (() => {})} run={check} onRun={setCheck} paused={paused} />}<EventFeed events={current.events} paused={paused} onPause={pause} onClear={clear} /></section>
      {tab === 'page' && <PageView state={current} />}
      {tab === 'settings' && <SettingsView state={current} settings={settings} onChange={setSettings} />}
      {tab === 'tools' && <><div class="ss-section-title"><div><h1>Tools</h1><p>Save what you observed and compare changes.</p></div></div><nav class="ss-segmented" aria-label="QA tools">{(['report', 'compare', 'journey', 'workspace'] as const).filter(name => name !== 'journey' || props.journey).map(name => <button key={name} class={tool === name ? 'ss-selected' : ''} aria-pressed={tool === name} onClick={() => setTool(name)}>{name.charAt(0).toUpperCase() + name.slice(1)}</button>)}</nav>{tool === 'workspace' && <WorkspaceView workspace={workspace} onChange={value => updateWorkspace(value)} expectations={props.expectations?.value || []} onExpectations={props.onExpectations || (() => {})} />}{tool === 'journey' && props.journey && <JourneyView currentUrl={current.url} journey={props.journey.value} onAction={props.onJourney || (() => {})} />}{(tool === 'report' || tool === 'compare') && <ToolsView section={tool} state={current} notes={notes} setNotes={setNotes} baseline={baseline} setBaseline={setBaseline} onHighlight={highlight} baselineMeta={workspace.baseline} />}</>}

    </main>
    <footer class="ss-footer"><span><span class={paused ? 'ss-paused-dot' : 'ss-live-dot'} />{paused ? 'Capture paused' : 'Capture on'} · {current.platforms.length} {current.platforms.length === 1 ? 'platform' : 'platforms'}</span><button class="ss-link" onClick={() => changeTab('page')} title="View connection health">{connectionLabel(current)}</button></footer>
    {proposal && <ConfirmDialog proposal={proposal} onClose={() => setProposal(null)} onConfirm={(target) => { props.onForceExecute(proposal.plan, target, proposal.request); setProposal(null); }} />}
  </div>;
}
