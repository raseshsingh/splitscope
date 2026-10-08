import { readJourney, type Journey } from '../../core/qa/journey';
import { downloadFile } from '../../core/qa/export';
import { pretty } from '../../core/qa/presentation';
import { Disclosure, JsonTree } from '../shared/components';
import { useState } from 'preact/hooks';
import ConfirmModal from '../shared/ConfirmModal';
type Action = 'start' | 'stop' | 'clear';
export default function JourneyView({ journey, currentUrl, onAction }: { journey: Journey | null; currentUrl: string; onAction: (action: Action) => void | Promise<void> }) {
  journey = readJourney(journey);
  const [confirm, setConfirm] = useState<'replace' | 'clear' | null>(null), [limit, setLimit] = useState(30);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  let sameSite = true; try { sameSite = !journey || new URL(currentUrl).origin === journey.origin; } catch {}
  const entries = (journey?.entries || []).filter(item => filter === 'all' || item.type === filter).slice().sort((a, b) => b.t - a.t);
  async function act(action: Action) {
    if (busy) return;
    setBusy(true); setError('');
    try { await onAction(action); setConfirm(null); setLimit(30); } catch { setError('The recording could not be updated. Try again.'); } finally { setBusy(false); }
  }
  return <section class="ss-card"><div class="ss-inline"><h2>Journey recording</h2>{journey && <span class={'ss-badge ' + (journey.recording && sameSite ? 'ss-recording' : '')}>{journey.recording ? sameSite ? 'Recording' : 'Outside recorded site' : 'Stopped'}</span>}</div>
    <p class="ss-caption ss-muted">Follow page visits, decisions and events through reloads. The recording stays in this tab’s browser session.</p>
    <div class="ss-actions">{!journey?.recording && <button class="ss-button ss-primary" disabled={busy} onClick={() => journey ? setConfirm('replace') : void act('start')}>{journey ? 'New recording' : 'Start recording'}</button>}{journey?.recording && <button class="ss-button" disabled={busy} onClick={() => void act('stop')}>Stop recording</button>}{journey && <><button class="ss-button" disabled={busy} onClick={() => downloadFile('splitscope-journey.json', pretty({ ...journey, decisions: undefined, entries: journey.entries.slice().sort((a, b) => a.t - b.t) }))}>Export JSON</button><button class="ss-link" disabled={busy} onClick={() => setConfirm('clear')}>Delete recording</button></>}</div>
    {confirm && <ConfirmModal title={confirm === 'replace' ? 'Replace existing journey?' : 'Delete this recording?'} confirm={confirm === 'replace' ? 'Replace' : 'Delete'} cancel={confirm === 'replace' ? 'Keep' : 'Cancel'} danger={confirm === 'clear'} busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => void act(confirm === 'replace' ? 'start' : 'clear')}><p>{confirm === 'replace' ? `Recording again replaces the ${journey?.entries.length ?? 0} entries already saved for this tab.` : 'This removes the saved observations for this tab.'} Export it first to keep a copy.</p></ConfirmModal>}
    {error && <p class="ss-inline-error" role="alert">{error}</p>}
    {journey && <><p class="ss-caption">Started {new Date(journey.startedAt).toLocaleString()}{journey.endedAt && <> · Stopped {new Date(journey.endedAt).toLocaleTimeString()}</>}</p><p class="ss-caption ss-muted ss-wrap">{journey.origin} · {journey.entries.length} observations{journey.omitted > 0 && <> · {journey.omitted} older observations omitted</>}</p>
      {!sameSite && journey.recording && <p class="ss-notice">Capture resumes when this tab returns to the recorded site.</p>}
      <label class="ss-label">Show observations<select value={filter} onChange={e => { setFilter(e.currentTarget.value); setLimit(30); }}><option value="all">All observations</option><option value="navigation">Pages & routes</option><option value="decision">Decision changes</option><option value="event">Events</option></select></label>
      {!entries.length && <p class="ss-caption ss-muted">No observations in this view yet.</p>}
      {entries.slice(0, limit).map(entry => <Disclosure key={entry.id} title={entry.name} meta={`${new Date(entry.t).toLocaleTimeString()} · ${entry.type}`}><p class="ss-caption ss-wrap">{entry.url}</p><JsonTree label="Observation" value={entry.detail} /></Disclosure>)}
      {entries.length > limit && <button class="ss-link" onClick={() => setLimit(limit + 30)}>Show 30 older observations</button>}
      <p class="ss-caption ss-muted">Up to 500 observations / 750 KB. Stopped event capture leaves gaps. Missing activities do not prove deactivation.</p>
    </>}
  </section>;
}
