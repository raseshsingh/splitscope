import { useMemo, useState } from 'preact/hooks';
import type { CapturedEvent } from '../../core/model';
import { platformNames, pretty } from '../../core/qa/presentation';
import { downloadFile, eventsCsv } from '../../core/qa/export';
import { CopyButton, Empty, Icon, JsonTree } from '../shared/components';
const searchCache = new WeakMap<CapturedEvent, string>();
function searchable(event: CapturedEvent) { let text = searchCache.get(event); if (!text) { text = (event.name + ' ' + event.experimentId + ' ' + pretty(event.properties)).toLowerCase(); searchCache.set(event, text); } return text; }
export function EventRow({ event }: { event: CapturedEvent }) {
  const [open, setOpen] = useState(false);
  const route = event.platform === 'page';
  return <article class={'ss-event ' + (route ? 'ss-route' : '')}>
    <button class="ss-event-summary" aria-expanded={open} onClick={() => setOpen(!open)}>
      <time title={new Date(event.t).toISOString()}>{new Date(event.t).toLocaleTimeString([], { hour12: false })}</time>
      <span class="ss-event-title"><strong>{event.name}</strong><small>{platformNames[event.platform] || event.platform} <span>·</span> {event.via === 'api-call' ? 'API call observed' : event.via === 'network' ? 'Network request observed' : event.via.replaceAll('-', ' ')}</small></span>
      <span class={'ss-category ss-category-' + event.category}>{route ? 'navigation' : event.category}</span><span class={open ? 'ss-chevron ss-open' : 'ss-chevron'}><Icon name="arrow" size={14} /></span>
    </button>
    {open && <div class="ss-event-body"><div class="ss-inline"><span class="ss-eyebrow">Event details</span><CopyButton value={pretty(event)} label="Copy event" /></div><p class="ss-muted ss-caption">{event.via === 'api-call' ? 'This confirms the API was called. Delivery to the vendor is not verified.' : 'Captured from the page. Payload fields may be redacted or truncated.'}</p>{event.properties === undefined ? <p class="ss-muted">No properties were exposed.</p> : <JsonTree value={event.properties} label="Properties" defaultOpen />}{event.caller && <div class="ss-field"><span>Caller</span><code>{event.caller}</code></div>}{event.experimentId && <div class="ss-field"><span>Activity ID</span><code>{event.experimentId}</code></div>}{event.variationId && <div class="ss-field"><span>Variation ID</span><code>{event.variationId}</code></div>}{event.pageUrl && <div class="ss-field"><span>Page at capture</span><code>{event.pageUrl}</code></div>}<JsonTree value={event} label="Full event" /></div>}
  </article>;
}
export default function EventFeed({ events, paused, onPause, onClear, compact = false }: { events: CapturedEvent[]; paused: boolean; onPause: () => void; onClear: () => void; compact?: boolean }) {
  const [query, setQuery] = useState(''); const [platform, setPlatform] = useState('all'); const [category, setCategory] = useState(compact ? 'all' : 'business'); const [limit, setLimit] = useState(100); const [confirmClear, setConfirmClear] = useState(false);
  const [frozen, setFrozen] = useState<CapturedEvent[] | null>(null);
  const visible = frozen || events;
  const filtered = useMemo(() => visible.filter((event) => (platform === 'all' || event.platform === platform) && (category === 'all' || (category === 'business' ? ['custom', 'goal', 'revenue'].includes(event.category) : event.category === category)) && (!query.trim() || searchable(event).includes(query.trim().toLowerCase()))).slice().sort((a, b) => b.t - a.t), [visible, platform, category, query]);
  return <section class="ss-feed"><div class="ss-section-title"><div><h2>{compact ? 'Linked events' : 'Event timeline'}</h2><p>{filtered.length} matching · newest first {paused ? '· capture paused' : '· capturing'}</p></div>{!compact && <button class="ss-button" onClick={onPause}><Icon name={paused ? 'play' : 'pause'} size={14} />{paused ? 'Start recording' : 'Stop recording'}</button>}</div>
    <label class="ss-search"><Icon name="search" size={17} /><input aria-label="Search events" placeholder="Find an event or property…" value={query} onInput={(event) => { setQuery(event.currentTarget.value); setLimit(100); }} /></label>
    <div class="ss-filter-row"><select aria-label="Filter event platform" value={platform} onChange={(event) => { setPlatform(event.currentTarget.value); setLimit(100); }}><option value="all">All platforms</option>{[...new Set(events.map((event) => event.platform))].map((id) => <option key={id} value={id}>{platformNames[id] || id}</option>)}</select><select aria-label="Filter event category" value={category} onChange={(event) => { setCategory(event.currentTarget.value); setLimit(100); }}><option value="all">All event types</option><option value="business">Goals & custom events</option>{[...new Set(events.map((event) => event.category))].map((name) => <option key={name} value={name}>{name}</option>)}</select></div>
    <div class="ss-feed-actions"><button class="ss-link" onClick={() => setFrozen(frozen ? null : events.slice())}>{frozen ? 'Resume live list' : 'Freeze list'}</button><span class="ss-caption ss-muted">{frozen ? 'List frozen; recording state unchanged' : 'Payloads expand on click'}</span><button class="ss-link" disabled={!filtered.length} onClick={() => downloadFile('splitscope-events.csv', eventsCsv(filtered.slice().reverse()), 'text/csv')}>Export CSV</button>{!compact && <button class="ss-link" disabled={!events.length} onClick={() => setConfirmClear(true)}>Clear</button>}</div>
    {confirmClear && <div class="ss-notice"><span>Clear the log for this tab, including its saved session history?</span><button class="ss-button" onClick={() => { onClear(); setFrozen(null); setConfirmClear(false); }}>Clear log</button><button class="ss-link" onClick={() => setConfirmClear(false)}>Cancel</button></div>}
    {!filtered.length ? <Empty title={events.length ? 'No matching events' : 'Waiting for events'}>{events.length ? 'Adjust your filters or search to see more.' : 'Interact with the page to capture platform calls. Events before the hook loaded are unavailable.'}</Empty> : filtered.slice(0, limit).map((event) => <EventRow key={event.id} event={event} />)}
    {filtered.length > limit && <button class="ss-button ss-load-more" onClick={() => setLimit(limit + 100)}>Show 100 older events · {filtered.length - limit} remaining</button>}
  </section>;
}
