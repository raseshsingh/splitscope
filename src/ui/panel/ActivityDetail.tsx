import { DashboardLink } from './DashboardLink';
import ChangeView from './ChangeView';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { NormalizedExperiment } from '../../core/model';
import type { PageState } from '../../core/state';
import { activityDetails } from '../../core/qa/activity-details';
import { activityEvents, activityStatus, goalHits, isActive, kindNames, platformNames, pretty } from '../../core/qa/presentation';
import { EventRow } from '../events/EventFeed';
import { CopyButton, Empty, Icon, JsonTree, PlatformDot, Status, Tabs } from '../shared/components';
import EventFeed from '../events/EventFeed';

const valueKinds = ['feature-flag', 'configuration', 'layer'];
const tabLabels: Record<string, string> = { overview: 'Overview', changes: 'Code & changes', targeting: 'Targeting', events: 'Events', raw: 'Raw' };
// Remember the open tab per activity for this page session, so switching main tabs does not reset it.
const lastTab = new Map<string, string>();
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour12: false });

export function SplitBar({ activity, compact = false }: { activity: NormalizedExperiment; compact?: boolean }) {
  const known = activity.variations.length > 0 && activity.variations.every((item) => typeof item.weight === 'number' && item.weight >= 0);
  const total = activity.variations.reduce((sum, item) => sum + (item.weight || 0), 0);
  if (!known || !total) return compact ? null : <p class="ss-caption ss-muted">Traffic split not exposed</p>;
  return <div class="ss-split" aria-label="Reported variation allocation">
    {activity.variations.map((item) => <span key={item.id} class={item.id === activity.assignedVariationId ? 'ss-assigned' : ''} style={{ flex: String(item.weight) }} title={`${item.name}: ${item.weight}%`} />)}
  </div>;
}

type Props = { onPin: () => void; pinned: boolean; activity: NormalizedExperiment; state: PageState; onBack: () => void; onForce: (id: string) => void; onHighlight: (selector: string) => void; pending: boolean; paused: boolean; onPause: () => void };

export default function ActivityDetail({ onPin, pinned, activity, state, onBack, onForce, onHighlight, pending, paused, onPause }: Props) {
  const key = `${activity.platform}:${activity.id}`;
  const [tab, setTabState] = useState(lastTab.get(key) || 'overview');
  const setTab = (next: string) => { lastTab.set(key, next); setTabState(next); };
  const [requested, setRequested] = useState('');
  const [expandAll, setExpandAll] = useState(0);
  const grouped = activityEvents(state.events, activity);
  const related = grouped.linked;
  const associated = [...grouped.metric, ...grouped.platform].sort((a, b) => b.t - a.t);
  const goals = goalHits(state.events, activity);
  const capability = state.platforms.find((item) => item.id === activity.platform)?.capabilities;
  const details = activityDetails(activity, capability);
  const canForce = details.switchable && !(activity.platform === 'kameleoon' && activity.kind === 'personalization');
  const assigned = activity.variations.find((item) => item.id === activity.assignedVariationId);
  useEffect(() => { if (!details.tabs.includes(tab)) setTab('overview'); }, [details.tabs.join(','), tab]);
  // Clear the requested variation only when a pending request finishes (true to false), not before it starts.
  const wasPending = useRef(pending);
  useEffect(() => { if (wasPending.current && !pending) setRequested(''); wasPending.current = pending; }, [pending]);
  const preview = (id: string) => { setRequested(id); onForce(id); };
  const rawData = { activity, platform: state.platforms.find(item => item.id === activity.platform), relatedEvents: related, metricEvents: grouped.metric, platformEvents: grouped.platform };
  const missing = [!details.changes.length && 'change code', !details.targeting && 'targeting rules', activity.trafficAllocation == null && 'traffic allocation'].filter(Boolean) as string[];
  const changes = [...details.changes].sort((a, b) => Number(b.owner.endsWith('· assigned')) - Number(a.owner.endsWith('· assigned')));

  return <section class="ss-detail">
    <div class="ss-detail-top">
      <button class="ss-back ss-link" onClick={onBack}><Icon name="back" size={14} />All activities</button>
      <span class="ss-eyebrow"><PlatformDot platform={activity.platform} />{platformNames[activity.platform]}{activity.kind !== 'other' ? ' · ' + kindNames[activity.kind] : ''}</span>
    </div>
    <h1>{activity.name}</h1>
    <div class="ss-inline"><Status status={activity.status} label={activityStatus(activity)} /><CopyButton value={activity.id} label="Copy ID" /></div>
    <p class="ss-caption ss-muted"><button class="ss-link" onClick={onPin}>{pinned ? 'Unpin activity' : 'Pin activity'}</button> · Activity {activity.id}{activity.campaignId ? ' · Campaign ' + activity.campaignId : ''}</p>

    <Tabs className="ss-detail-nav" label="Activity details" value={tab} onChange={setTab} items={details.tabs.map(name => [name, <>{tabLabels[name] || name}{name === 'events' && ' ' + (related.length + grouped.metric.length)}</>])} />

    {tab === 'overview' && <>
      <div class="ss-explanation"><Icon name="target" /><div>
        <strong>{activityStatus(activity)}</strong>
        <p>{activity.statusReason || (isActive(activity) ? 'The platform reports an active decision. It does not prove every visual change appeared.' : 'The platform gave no specific reason.')}</p>
      </div></div>

      <div class="ss-actions ss-detail-actions">
        {canForce && <span class="ss-caption ss-muted">Preview any variation from the list below.</span>}
        <DashboardLink activity={activity} variant="button" />
      </div>
      {!canForce && <p class="ss-caption ss-muted">{capability?.notes?.forcing || 'In-page switching is unavailable for this integration. Use a vendor QA or preview link.'}</p>}
      {pending && requested && <p class="ss-note ss-note-info" role="status">Preparing a preview of {activity.variations.find(item => item.id === requested)?.name || requested}. A confirmation shows the method and tracking impact.</p>}

      <h2 class="ss-h">Assignment</h2>
      <dl class="ss-kv">
        <dt>Variation</dt>
        <dd>{activity.assignedVariationId ? <><b>{assigned?.name || activity.assignedVariationId}</b> <code>{activity.assignedVariationId}</code></> : <span class="ss-muted">Not reported</span>}</dd>
        {activity.evidence && <><dt>Observed</dt><dd><code>{clock(activity.evidence.observedAt)}</code> <span class="ss-muted">· {activity.source.join(', ')}</span></dd></>}
        {activity.trafficAllocation != null && <><dt>Traffic in activity</dt><dd>{activity.trafficAllocation}%</dd></>}
      </dl>

      {activity.evaluatedValue !== undefined && <JsonTree label="Reported value" value={activity.evaluatedValue} defaultOpen />}
      {!valueKinds.includes(activity.kind) && activity.variations.length > 0 && <><h2 class="ss-h">Variations <span class="ss-count">{activity.variations.length}</span></h2><SplitBar activity={activity} /></>}
      <div class="ss-variations">
        {activity.variations.map((variation) => {
          const mine = variation.id === activity.assignedVariationId;
          return <div class={'ss-variation' + (mine ? ' ss-me' : '')} key={variation.id}>
            <div><strong>{variation.name}</strong><code>{variation.id}</code>{mine && <span class="ss-assigned-label">{isActive(activity) ? 'Your variation' : activity.status === 'bucketed-elsewhere' ? 'Stored assignment' : 'Reported decision'}</span>}</div>
            <span class="ss-weight">{variation.weight == null ? '' : variation.weight + '%'}</span>
            <CopyButton value={variation.id} label="ID" />
            {canForce && <button class="ss-button ss-small" disabled={pending} onClick={() => preview(variation.id)} aria-label={`Preview ${variation.name}`}><Icon name="eye" size={13} />{pending && requested === variation.id ? 'Preparing' : 'Preview'}</button>}
            {variation.weight != null && <div class="ss-bar" aria-hidden="true"><i style={{ width: Math.max(0, Math.min(100, variation.weight)) + '%' }} /></div>}
          </div>;
        })}
      </div>
      {!activity.variations.length && activity.evaluatedValue === undefined && <p class="ss-muted">Variation details are not exposed by this runtime.</p>}

      {goals.length > 0 && <>
        <h2 class="ss-h">Goals</h2>
        <ul class="ss-qa-list ss-goals" aria-label="Goals and whether they fired">
          {goals.map(({ goal, hits }) => <li key={goal.id || goal.name}>
            <div class="ss-qa-name"><strong class="ss-wrap">{goal.name}</strong>{goal.id && goal.id !== goal.name && <small class="ss-wrap">{goal.id}</small>}</div>
            {hits.length ? <span class="ss-tag ss-tag-ok">Fired {hits.length}x, last {clock(hits[0]!.t)}</span> : <span class="ss-tag">Not seen yet</span>}
          </li>)}
        </ul>
        <p class="ss-caption ss-muted">Matched by event name or goal ID among events captured on this page. A fired event confirms the call, not that the platform counted it.</p>
      </>}
      {missing.length > 0 && <p class="ss-caption ss-muted">Not exposed by the platform: {missing.join(', ')}.</p>}
    </>}

    {tab === 'changes' && <>
      <div class="ss-inline"><p class="ss-muted ss-caption">Source exposed by the platform. It may be minified or truncated, and its presence does not confirm execution.</p>{changes.length > 1 && <button class="ss-link" onClick={() => setExpandAll(expandAll + 1)}>Expand all</button>}</div>
      {(activity as any).detailLimit && <p class="ss-note ss-note-warn" role="status">{String((activity as any).detailLimit)} The Raw tab and the page itself hold the full definition.</p>}
      {changes.map(({ change, owner }, index) => <ChangeView key={`${expandAll}:${owner}:${index}`} change={change} owner={owner} onHighlight={onHighlight} defaultOpen={expandAll > 0 || index === 0} fileBase={`${activity.platform}-${activity.id}-${index + 1}`.replace(/[^\w.-]+/g, '_')} />)}
      {!changes.length && <Empty title="Code not exposed">No change source was available in this page's runtime or captured offers. Reload the page with Splitscope enabled to capture future offers.</Empty>}
    </>}

    {tab === 'targeting' && <>
      {([['Target URLs', activity.targeting?.urls], ['Audiences', activity.targeting?.audiences?.map((item) => item.name)], ['Conditions', activity.targeting?.conditions]] as Array<[string, string[] | undefined]>).map(([label, values]) => <section class="ss-card" key={label}>
        <h2>{label}</h2>
        {values?.length ? values.map((value, index) => <p class="ss-wrap" key={index}>{value}</p>) : <p class="ss-muted">Not exposed by the platform.</p>}
      </section>)}
      <p class="ss-muted ss-caption">Rules are shown as the platform exposes them; the platform makes the eligibility decision.</p>
    </>}

    <section hidden={tab !== 'events'}>
      <p class="ss-muted ss-caption">Events that name this activity, then {platformNames[activity.platform]} goal and custom events that match its goals or were sent while it was active.</p>
      {related.length ? <EventFeed events={related} paused={paused} onPause={onPause} onClear={() => {}} compact /> : <><h2 class="ss-feed-title">Linked events</h2><p class="ss-caption ss-muted">No captured event names this activity yet.</p></>}
      {associated.length > 0 && <div class="ss-assoc">
        <h2 class="ss-h">Platform events for this activity <span class="ss-count">{associated.length}</span></h2>
        {associated.slice(0, 200).map(event => <div class="ss-assoc-row" key={event.id}><span class={'ss-tag ' + (grouped.metric.includes(event) ? 'ss-tag-ok' : 'ss-tag-info')}>{grouped.metric.includes(event) ? 'Matches a goal' : 'Sent while active'}</span><EventRow event={event} /></div>)}
        <p class="ss-caption ss-muted">The platform credits these to every active activity that tracks them.</p>
      </div>}
      {!related.length && !associated.length && !isActive(activity) && <p class="ss-note">This activity is not active on this page, so only events that name it are shown. All captured events are in the Events tab.</p>}
    </section>

    {tab === 'raw' && <>
      <div class="ss-inline"><span class="ss-caption">Sources: {activity.source.join(', ')}</span><CopyButton value={pretty(rawData)} /></div>
      <p class="ss-caption ss-muted">Everything captured for this activity. Secrets are redacted and large values carry truncation markers.</p>
      <JsonTree value={rawData} label="Complete captured data" />
    </>}
  </section>;
}
