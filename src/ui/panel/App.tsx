import TargetView, { type TargetGroup } from './TargetView';
import { useTargetData } from './target-data';
import { DashboardLink } from './DashboardLink';
import ActivityDetail from './ActivityDetail';
import PageView from './PageView';
import ToolsView from './ToolsView';
import ResetVisitor from '../qa/ResetVisitor';
import OptimizelyTools, { type PlatformAction } from '../qa/OptimizelyTools';
import KameleoonTools from '../qa/KameleoonTools';
import ConfirmDialog from './PreviewDialog';
import { connectionLabel } from './ConnectionStatus';
import { EXTENSION_BUILD } from '../../core/extension/messages';
import { recordCheck, type CheckRun } from '../../core/qa/check-run';
import JourneyView from '../qa/JourneyView';
import WorkspaceView from '../qa/WorkspaceView';
import { emptyWorkspace, type Assignment, type Workspace } from '../../core/qa/workspace';
import type { Journey } from '../../core/qa/journey';
import Expectations, { type CheckDraft } from '../qa/Expectations';
import { draftFromEvent } from '../../core/qa/expectations';
import type { EventExpectation } from '../../core/qa/expectations';
import { previewOutcome, type PreviewRecord } from '../../core/qa/preview';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Signal } from '@preact/signals';
import type { ForcePlan } from '../../core/model';
import type { PageState } from '../../core/state';
import { defaultSettings, type Settings } from '../../core/settings';
import { searchExperiments } from '../../core/search';
import { activityKey, activityStatus, isActive, isBusinessEvent, kindNames, platformNames, pretty } from '../../core/qa/presentation';
import { clearHighlight, highlightSelector } from '../../core/qa/highlight';
import { Brand, CopyButton, Logo, Empty, Icon, IconButton, PlatformDot, Status } from '../shared/components';
import SettingsView from './SettingsView';
import EventFeed from '../events/EventFeed';
type ToolName = 'report' | 'compare' | 'journey' | 'workspace' | 'overlap' | 'reset' | 'adobe-target' | 'optimizely' | 'kameleoon';
const toolOrder: ToolName[] = ['report', 'compare', 'journey', 'workspace', 'overlap', 'reset', 'adobe-target', 'optimizely', 'kameleoon'];
const toolLabels: Record<ToolName, string> = { report: 'QA report', compare: 'Compare', journey: 'Journey', workspace: 'Workspace', overlap: 'Overlap', reset: 'Reset visitor', 'adobe-target': 'Adobe Target', optimizely: 'Optimizely', kameleoon: 'Kameleoon' };
export type PanelTab = 'activities' | 'events' | 'page' | 'tools' | 'settings';
type Props = { onStorage?: (action: 'usage' | 'clear') => Promise<any>; onPlatformAction?: PlatformAction; onTargetAction?: (payload: Record<string,unknown>) => Promise<any>; checkRun?: Signal<CheckRun | null>; onCheckRun?: (value: CheckRun | null) => void; workspace?: Signal<Workspace>; onWorkspace?: (value: Workspace) => void; journey?: Signal<Journey | null>; onJourney?: (action: 'start' | 'stop' | 'clear') => void | Promise<void>; expectations?: Signal<EventExpectation[]>; onExpectations?: (rules: EventExpectation[]) => void; state: Signal<PageState>; requestedExperiment: Signal<{ platform: string; id: string; requestId: number } | null>; requestedTab?: Signal<{ tab: PanelTab; requestId: number }>; settings?: Signal<Settings>; onSettings?: (value: Settings) => void; onClose: () => void; onRescan: () => void; onClearEvents?: () => void; initialPaused?: boolean; onPauseEvents: (paused: boolean) => void; onForceRequest: (payload: Record<string, unknown>) => void; onResetPreview?: () => void; onForceExecute: (plan: ForcePlan, target: 'current' | 'new', request?: Omit<PreviewRecord, 'origin' | 'startedAt' | 'changes' | 'persistent'>) => void };
export default function App(props: Props) {
  const { state, requestedExperiment, onRescan } = props;
  const current = state.value; const settings = props.settings?.value || defaultSettings;
  const [targetBlocked, setTargetBlocked] = useState(false);
  useEffect(() => { void props.onTargetAction?.({action:'status'}).then(value=>setTargetBlocked(value.blocked===true)).catch(()=>{}); }, []);
  const hasTarget = current.platforms.some(p => p.id === 'adobe-target') || current.events.some(e => e.platform === 'adobe-target');
  const targetData = useTargetData(current, props.onTargetAction, hasTarget);
  const [localCheck, setLocalCheck] = useState<CheckRun | null>(null);
  const check = props.checkRun?.value ?? localCheck;
  const setCheck = props.onCheckRun || setLocalCheck;
  useEffect(() => { if (!props.checkRun) setLocalCheck(prior => current.events.reduce((run, event) => recordCheck(run, event), prior)); }, [current.events]);
  const [tab, setTab] = useState<PanelTab>('activities');
  const [tool, setTool] = useState<ToolName>('report');
  const [targetGroup, setTargetGroup] = useState<{ group?: TargetGroup; request: number }>({ request: 0 });
  const [checkDraft, setCheckDraft] = useState<CheckDraft | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  // Scope counts follow the search, platform and type filters, so each count matches the list it opens.
  const base = useMemo(() => searchExperiments(current.experiments, query).filter(({ experiment: item }) => (platform === 'all' || item.platform === platform) && (kind === 'all' || item.kind === kind)), [current.experiments, query, platform, kind]);
  const inScope = (item: PageState['experiments'][number], value: string) => value === 'all' || (value === 'pinned' ? workspace.pinned.includes(activityKey(item)) : value === 'active' ? isActive(item) : !isActive(item));
  const filtered = useMemo(() => base.filter(({ experiment: item }) => inScope(item, scope)), [base, scope, workspace.pinned]);
  const scopeCounts = { all: base.length, active: base.filter(({ experiment }) => isActive(experiment)).length, other: base.filter(({ experiment }) => !isActive(experiment)).length, pinned: base.filter(({ experiment }) => workspace.pinned.includes(activityKey(experiment))).length };
  const narrowed = Boolean(query.trim()) || platform !== 'all' || kind !== 'all';
  const ordered = [...filtered.filter(({ experiment }) => isActive(experiment)), ...filtered.filter(({ experiment }) => !isActive(experiment))];
  useEffect(() => { const request = requestedExperiment.value; if (!request || requestSeen.current === request.requestId) return; const found = current.experiments.find((item) => item.id === request.id && item.platform === request.platform); if (found) { requestSeen.current = request.requestId; setSelected(activityKey(found)); setTab('activities'); setMinimized(false); } }, [requestedExperiment.value, current.experiments]);
  useEffect(() => { if (props.requestedTab?.value.requestId) { changeTab(props.requestedTab.value.tab); setMinimized(false); } }, [props.requestedTab?.value]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    const response = current.statuses.at(-1); if (!response || response === handled.current) return; handled.current = response;
    if (response.message === 'force-plan' && response.plan) { setPending(false); const request = response.request as any; setProposal({ plan: response.plan as ForcePlan, experiment: request?.experiment || 'Selected activity', variation: request?.variation || 'selected variation', request }); }
    else if (response.error) { setPending(false); setNotice(String(response.error)); }
  }, [current.statuses]);
  useEffect(() => { if (!pending) return; const timer = setTimeout(() => { setPending(false); setNotice('The page did not respond. Refresh the page and try again.'); }, 6000); return () => clearTimeout(timer); }, [pending]);
  useEffect(() => () => clearHighlight(), []);
  function changeTab(next: PanelTab) { if (next === 'settings') { setSettingsOpen(true); return; } setSettingsOpen(false); setTab(next); }
  const togglePin = (key: string) => updateWorkspace({ pinned: workspace.pinned.includes(key) ? workspace.pinned.filter(item => item !== key) : [...workspace.pinned, key].slice(-100) });
  const setSettings = (patch: Partial<Settings>) => props.onSettings?.({ ...settings, ...patch });
  const highlight = (selector: string) => { const result = highlightSelector(selector); setNotice(result.error || (result.count ? result.count + (result.count === 1 ? ' matching element' : ' matching elements') + ' outlined for 5 seconds (up to 100).' : 'No elements match this selector on the current page.')); };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') { if (proposal) setProposal(null); else if (settingsOpen) setSettingsOpen(false); else if (tab === 'activities' && selected) setSelected(null); else setMinimized(true); event.stopPropagation(); }
    if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]')) return;
    if (event.key === '/') { event.preventDefault(); root.current?.querySelector<HTMLInputElement>('input[type="search"],.ss-search input')?.focus(); }
    const index = Number(event.key) - 1; if (index >= 0 && index <= 3) changeTab((['activities', 'events', 'page', 'tools'] as PanelTab[])[index]!);
  };
  const pause = () => { if (!paused && check && !check.endedAt) setCheck({ ...check, interrupted: true }); props.onPauseEvents(!paused); setPaused(!paused); };
  const clear = () => { if (props.onClearEvents) props.onClearEvents(); else state.value = { ...state.value, events: [] }; };
  let hostname = current.url; try { hostname = new URL(current.url).hostname; } catch {}
  const showTargetTools = targetBlocked || hasTarget;
  // Platform tools appear in Tools only while their platform is detected; a hidden choice falls back to the QA report.
  const visibleTools = toolOrder.filter(name => (name !== 'journey' || props.journey) && (name !== 'adobe-target' || showTargetTools) && (name !== 'optimizely' || current.platforms.some(item => item.id === 'optimizely')) && (name !== 'kameleoon' || current.platforms.some(item => item.id === 'kameleoon')));
  const currentTool: ToolName = visibleTools.includes(tool) ? tool : 'report';
  const openTarget = (group?: TargetGroup) => { setTargetGroup({ group, request: Date.now() }); setTool('adobe-target'); changeTab('tools'); };
  const targetTools = showTargetTools && (selected ? activity?.platform === 'adobe-target' : platform === 'all' || platform === 'adobe-target') && <button class="ss-target-link" onClick={() => openTarget()}><span><strong>Adobe Target tools</strong><small>Delivery, QA, tracking and diagnostics, in Tools</small></span>{targetData.findings.length > 0 && <span class="ss-tag ss-tag-warn">{targetData.findings.length} {targetData.findings.length === 1 ? 'finding' : 'findings'}</span>}<Icon name="arrow" size={15} /></button>;
  if (minimized) return <div class={'ss-app ss-minimized ss-dock-' + settings.dock} data-theme={settings.theme}><button onClick={() => setMinimized(false)} aria-label={'Restore Splitscope, ' + active + ' active on this page'}><span class="ss-mini-logo"><Logo size={20} /></span>Splitscope <b class="ss-tag ss-tag-ok">{active} active</b><Icon name="arrow" size={14} /></button></div>;
  const health = current.connection;
  const lost = !!health && (health.background === 'unavailable' || health.page === 'outdated');
  const tabs = ['activities', 'events', 'page', 'tools'] as PanelTab[];
  const businessCount = current.events.filter(isBusinessEvent).length;
  const tabLabel = (name: PanelTab) => name === 'activities' ? 'Activities' : name.charAt(0).toUpperCase() + name.slice(1);
  const preview = current.preview; const previewObserved = !!preview && previewOutcome(preview, current.experiments) === 'Requested assignment observed';
  return <div ref={root} class={'ss-app ss-panel ss-dock-' + settings.dock} data-theme={settings.theme} data-text-size={settings.textSize} onKeyDown={onKeyDown}>
    <header class="ss-header"><Brand version={EXTENSION_BUILD} /><div class="ss-actions"><IconButton icon="dock-right" label="Dock right" on={settings.dock === 'right'} onClick={() => setSettings({ dock: 'right' })} /><IconButton icon="dock-bottom" label="Dock bottom" on={settings.dock === 'bottom'} onClick={() => setSettings({ dock: 'bottom' })} /><IconButton icon="gear" label="Settings" on={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)} /><IconButton icon="minus" label="Minimize panel" onClick={() => setMinimized(true)} /><IconButton icon="close" label="Close panel" onClick={props.onClose} /></div></header>
    <div class="ss-platform-strip" aria-label="Detected platforms"><span class="ss-lbl">{current.platforms.length ? 'Detected' : 'No platform detected'}</span>{current.platforms.map(item => <button class={'ss-chip' + (platform === item.id ? ' ss-on' : '')} key={item.id} aria-pressed={platform === item.id} title="Filter activities by this platform" onClick={() => { updateWorkspace({ platform: platform === item.id ? 'all' : item.id, selected: null, scope: 'all', query: '', kind: 'all' }); setSettingsOpen(false); setTab('activities'); }}><PlatformDot platform={item.id} />{item.displayName}</button>)}</div>
    {preview && <div class={'ss-banner' + (previewObserved ? ' ss-ok' : '')} role="status"><Icon name={previewObserved ? 'check' : 'eye'} size={15} /><span><b>Preview: {preview.variation}.</b> {previewOutcome(preview, current.experiments)}{preview.persistent ? ' This platform may keep the assignment in visitor storage; use the vendor QA controls to restore it.' : ''}</span><button class="ss-button ss-small" onClick={props.onResetPreview}>{preview.persistent ? 'Remove preview parameters & dismiss' : 'Reset my preview'}</button></div>}
    <main class="ss-main">
      {lost && <section class="ss-card ss-lost"><h2>{health!.background === 'unavailable' ? 'Lost connection to the extension' : 'This page needs a reload'}</h2><p class="ss-muted">{health!.background === 'unavailable' ? 'The extension background stopped responding. This can happen after an update.' : 'This page is running an older capture script, usually after the extension updated.'}</p><ol class="ss-steps">{health!.background === 'unavailable' && <li>Reload Splitscope in chrome://extensions</li>}<li>Reload this website tab</li><li>Open Splitscope again</li></ol><div class="ss-actions"><CopyButton label="Copy diagnostics" value={'Splitscope ' + EXTENSION_BUILD + ' | ' + connectionLabel(current) + ' | ' + hostname} /><button class="ss-button" onClick={onRescan}><Icon name="refresh" size={13} />Retry</button></div></section>}
      {targetBlocked && <div class="ss-notice">Adobe Target baseline mode is enabled in this tab. <button class="ss-link" onClick={() => openTarget('QA')}>Manage blocking</button></div>}
      {tab === 'activities' && selected && targetTools}
      {tab === 'activities' && (selected ? activity ? <ActivityDetail key={selected} activity={activity} state={current} onPin={() => togglePin(selected)} pinned={workspace.pinned.includes(selected)} onBack={() => setSelected(null)} onHighlight={highlight} onForce={(variationId) => { setPending(true); setNotice(''); props.onForceRequest({ platform: activity.platform, experimentId: activity.id, variationId, experimentName: activity.name, variationName: activity.variations.find((item) => item.id === variationId)?.name }); }} pending={pending} paused={paused} onPause={pause} /> : <Empty title="Activity no longer reported"><button class="ss-button" onClick={() => setSelected(null)}>Back to activities</button></Empty> : <>
        <label class="ss-search"><Icon name="search" /><input type="search" aria-label="Search activities" placeholder="Search name, activity ID or variation ID" value={query} onInput={(event) => setQuery(event.currentTarget.value)} /><kbd>/</kbd></label>
        <div class="ss-segmented" aria-label="Activity scope">{[['all', 'All', scopeCounts.all], ['active', 'Active', scopeCounts.active], ['other', 'Other', scopeCounts.other], ['pinned', 'Pinned', scopeCounts.pinned]].map(([value, label, count]) => <button aria-pressed={scope === value} class={scope === value ? 'ss-selected' : ''} onClick={() => setScope(String(value))}>{label}<span>{count}</span></button>)}</div>
        <div class="ss-list-row"><span class="ss-caption ss-muted">{narrowed || scope !== 'all' ? `${filtered.length} of ${current.experiments.length} ${current.experiments.length === 1 ? 'activity' : 'activities'}` : `${filtered.length} ${filtered.length === 1 ? 'activity' : 'activities'}`}{platform !== 'all' ? ' on ' + (platformNames[platform] || platform) : ''}{kind !== 'all' ? ' · ' + (kindNames[kind as keyof typeof kindNames] || kind) : ''}{query.trim() ? ' · matching search' : ''}</span><button class="ss-button ss-small" onClick={onRescan}><Icon name="refresh" size={13} />Refresh</button></div>
        <div class="ss-filter-row">{(current.platforms.length > 1 || platform !== 'all') && <select aria-label="Filter activity platform" value={platform} onChange={(event) => setPlatform(event.currentTarget.value)}><option value="all">All platforms</option>{platform !== 'all' && !current.platforms.some(item => item.id === platform) && <option value={platform}>{platformNames[platform] || platform} · not detected</option>}{current.platforms.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select>}{(new Set(current.experiments.map(item => item.kind)).size > 1 || kind !== 'all') && <select aria-label="Filter activity type" value={kind} onChange={(event) => setKind(event.currentTarget.value)}><option value="all">All activity types</option>{kind !== 'all' && !current.experiments.some(item => item.kind === kind) && <option value={kind}>{kindNames[kind] || kind} · not reported</option>}{[...new Set(current.experiments.map((item) => item.kind))].map((type) => <option key={type} value={type}>{kindNames[type]}</option>)}</select>}</div>
        {(query || platform !== 'all' || kind !== 'all' || scope !== 'all') && <button class="ss-link ss-clear-filters" onClick={() => updateWorkspace({ query: '', platform: 'all', kind: 'all', scope: 'all' })}>Clear all filters</button>}
        {!filtered.length && (!current.experiments.length && !current.platforms.length && health?.page === 'waiting' ? <div class="ss-skeletons" role="status" aria-label="Scanning page"><i /><i /><i /><p class="ss-caption ss-muted">Scanning page for experimentation platforms…</p></div> : <Empty title={scope === 'pinned' && !workspace.pinned.length ? 'Nothing pinned yet' : current.experiments.length ? 'No matching activities' : 'No activity decisions available'}>{scope === 'pinned' ? (workspace.pinned.length ? 'Pinned activities are saved for this site. None match the current page and filters.' : 'Pin an activity from its card to keep it handy on this site.') : current.experiments.length ? 'Clear a filter or try another ID.' : current.platforms.length ? 'A platform was detected, but it has not exposed activity data. Accept site consent or interact with the page, then refresh.' : 'No supported platform was detected. Refresh after the site finishes loading.'}</Empty>)}
        <div class="ss-activity-list">{ordered.map(({ experiment: item, matchedVariationName }) => { const key = activityKey(item); const pinned = workspace.pinned.includes(key); const assigned = item.variations.find((variation) => variation.id === item.assignedVariationId)?.name || item.assignedVariationId; return <article class="ss-activity-shell" key={key}><button class="ss-activity" onClick={() => setSelected(key)}><span class="ss-eyebrow"><PlatformDot platform={item.platform} />{platformNames[item.platform]} {item.kind !== 'other' && <span class="ss-tag">{kindNames[item.kind]}</span>}</span><h3>{pinned && <span class="ss-pin-label">Pinned · </span>}{item.name}</h3><code class="ss-id">ID {item.id}</code><span class="ss-status-row"><Status status={item.status} label={activityStatus(item)} /><span class="ss-assignment">{['feature-flag', 'configuration', 'layer'].includes(item.kind) && item.evaluatedValue !== undefined ? 'Value: ' + pretty(item.evaluatedValue).slice(0, 120) : item.assignedVariationId ? (isActive(item) ? 'Variation: ' : item.status === 'bucketed-elsewhere' ? 'Stored: ' : 'Reported: ') + assigned : 'Variation not reported'}</span></span>{matchedVariationName && <span class="ss-assignment">Matched variation: {matchedVariationName}</span>}</button><DashboardLink activity={item} variant="icon" /><button class={'ss-icon-button ss-card-pin' + (pinned ? ' ss-on' : '')} aria-label={(pinned ? 'Unpin ' : 'Pin ') + item.name} aria-pressed={pinned} title={pinned ? 'Unpin' : 'Pin'} onClick={() => togglePin(key)}><Icon name="pin" size={15} /></button></article>; })}</div>
        {targetTools}
      </>)}
      <section hidden={tab !== 'events'}><EventFeed events={current.events} paused={paused} onPause={pause} onClear={clear} lead={props.expectations && <Expectations rules={props.expectations.value} onChange={props.onExpectations || (() => {})} run={check} onRun={setCheck} paused={paused} draft={checkDraft} />} onCreateCheck={props.expectations ? (event) => setCheckDraft({ rule: draftFromEvent(event), request: Date.now() }) : undefined} /></section>
      {tab === 'page' && <PageView state={current} onRescan={onRescan} />}
      {tab === 'tools' && <>
        <nav class="ss-chips" aria-label="QA tools">{visibleTools.map(name => <button key={name} class={currentTool === name ? 'ss-selected' : ''} aria-pressed={currentTool === name} onClick={() => setTool(name)}>{toolLabels[name]}</button>)}</nav>
        {currentTool === 'workspace' && <WorkspaceView workspace={workspace} onChange={value => updateWorkspace(value)} expectations={props.expectations?.value || []} onExpectations={props.onExpectations || (() => {})} />}
        {currentTool === 'adobe-target' && <TargetView state={current} onAction={props.onTargetAction} data={targetData} initialGroup={targetGroup.group} groupRequest={targetGroup.request} />}
        {currentTool === 'kameleoon' && <KameleoonTools onAction={props.onPlatformAction} onNotice={setNotice} />}
        {currentTool === 'optimizely' && <OptimizelyTools state={current} onAction={props.onPlatformAction} workspace={workspace} onNotice={setNotice} onRevision={(key, revision) => updateWorkspace({ revisions: { ...workspace.revisions, [key]: { revision, at: Date.now() } } })} />}
        {currentTool === 'reset' && <ResetVisitor state={current} onNotice={setNotice} />}
        {currentTool === 'journey' && props.journey && <JourneyView currentUrl={current.url} journey={props.journey.value} onAction={props.onJourney || (() => {})} />}
        {(currentTool === 'report' || currentTool === 'compare' || currentTool === 'overlap') && <ToolsView section={currentTool} state={current} notes={notes} setNotes={setNotes} baseline={baseline} setBaseline={setBaseline} onHighlight={highlight} baselineMeta={workspace.baseline} />}
      </>}
    </main>
    <nav class="ss-nav" aria-label="Inspector sections" onKeyDown={(e: KeyboardEvent) => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; const next = tabs[(tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!; e.preventDefault(); changeTab(next); queueMicrotask(() => ((e.currentTarget as HTMLElement).querySelector('button.ss-selected') as HTMLElement | null)?.focus()); }}>{tabs.map((name, index) => <button key={name} aria-current={tab === name && !settingsOpen ? 'page' : undefined} class={tab === name ? 'ss-selected' : ''} onClick={() => changeTab(name)}><Icon name={name === 'activities' ? 'activity' : name} size={18} /><span class="ss-nav-label">{tabLabel(name)}{name === 'activities' && current.platforms.length > 0 && <b class="ss-count">{active}</b>}{name === 'events' && <b class="ss-count" title={`${businessCount} goals and custom events, ${current.events.length} in total`}>{businessCount}</b>}</span><small aria-hidden="true">{index + 1}</small></button>)}</nav>
    {settingsOpen && <div class="ss-drawer" role="dialog" aria-label="Settings"><div class="ss-drawer-top"><IconButton icon="back" label="Close settings" onClick={() => setSettingsOpen(false)} /><strong>Settings</strong></div><div class="ss-drawer-body"><SettingsView state={current} settings={settings} onChange={setSettings} onClearWorkspace={() => { updateWorkspace(emptyWorkspace()); props.onExpectations?.([]); setNotice('Site workspace cleared'); }} onStorage={props.onStorage} /></div></div>}
    {notice && <button class="ss-toast" role="status" onClick={() => setNotice('')}>{notice}</button>}
    {proposal && <ConfirmDialog proposal={proposal} onClose={() => setProposal(null)} onConfirm={(target) => { props.onForceExecute(proposal.plan, target, proposal.request); setProposal(null); }} />}
  </div>;
}
