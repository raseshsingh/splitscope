import { useEffect, useRef, useState } from 'preact/hooks';
import type { CheckRun } from '../../core/qa/check-run';
import { finishCheck, startCheck } from '../../core/qa/check-run';
import type { EventExpectation } from '../../core/qa/expectations';
import { platformNames, pretty } from '../../core/qa/presentation';
import { sanitize } from '../../core/sanitize';
import { CopyButton, Icon, JsonTree } from '../shared/components';

export type CheckDraft = { rule: Pick<EventExpectation, 'eventName' | 'platform' | 'required' | 'equals'>; request: number };
type Props = { rules: EventExpectation[]; onChange: (rules: EventExpectation[]) => void; paused: boolean; run: CheckRun | null; onRun: (run: CheckRun | null) => void; draft?: CheckDraft | null };
export default function Expectations({ rules, onChange, paused, run, onRun, draft }: Props) {
  const [expanded, setExpanded] = useState(!!draft);
  const root = useRef<HTMLElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState(''), [platform, setPlatform] = useState('all');
  const [required, setRequired] = useState(''), [equals, setEquals] = useState('{}'), [error, setError] = useState('');
  const [minCount, setMinCount] = useState(''), [maxCount, setMaxCount] = useState('');
  const running = !!run && !run.endedAt;
  const summary = run ? running ? 'Check running' : `${run.results.filter(result => result.status === 'passed').length}/${run.results.length} matched` : `${rules.length} saved`;
  // "Create check from this event" opens the form prefilled; the user reviews and saves it.
  useEffect(() => {
    if (!draft || running) return;
    setExpanded(true); edit({ ...draft.rule, id: '', name: draft.rule.eventName });
    queueMicrotask(() => root.current?.scrollIntoView?.({ block: 'start' }));
  }, [draft?.request]);
  function edit(rule?: EventExpectation) {
    setEditing(rule?.id || 'new'); setName(rule?.eventName || ''); setPlatform(rule?.platform || 'all');
    setRequired(rule?.required.join(', ') || ''); setEquals(pretty(rule?.equals || {})); setError('');
    setMinCount(rule?.minCount != null ? String(rule.minCount) : ''); setMaxCount(rule?.maxCount != null ? String(rule.maxCount) : '');
  }
  function save() {
    try {
      if (!name.trim()) throw new Error('Enter the exact event name.');
      const values = JSON.parse(equals);
      if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Expected values must be a JSON object.');
      if (Object.keys(values).length > 50 || Object.entries(values).some(([path, value]) => !path.trim() || path.length > 200 || JSON.stringify(value).length > 2000)) throw new Error('Use up to 50 property paths, with values under 2,000 characters each.');
      const paths = required.split(',').map(value => value.trim()).filter(Boolean);
      if (paths.length > 50 || paths.some(path => path.length > 200)) throw new Error('Use up to 50 property paths, each under 200 characters.');
      const limit = (text: string, label: string) => { if (!text.trim()) return undefined; const value = Number(text); if (!Number.isInteger(value) || value < 0 || value > 1000) throw new Error(`${label} must be a whole number from 0 to 1000.`); return value; };
      const min = limit(minCount, 'Minimum count'), max = limit(maxCount, 'Maximum count');
      if (min != null && max != null && min > max) throw new Error('Minimum count cannot be higher than maximum count.');
      const rule: EventExpectation = { ...(min != null ? { minCount: min } : {}), ...(max != null ? { maxCount: max } : {}), id: editing === 'new' ? crypto.randomUUID() : editing!, name: name.trim(), eventName: name.trim(), platform, required: paths, equals: values };
      onChange(editing === 'new' ? [...rules, rule] : rules.map(item => item.id === editing ? rule : item));
      setEditing(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  return <section class="ss-checks" ref={root}>
    <button class="ss-disclosure-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><span><strong>Event checks</strong><small>{summary} · {expanded ? 'Hide' : 'Set up or review'}</small></span><span class={'ss-badge ' + (running ? 'ss-recording' : '')}>{running ? 'Recording' : 'QA'}</span></button>
    {expanded && <div class="ss-disclosure-body"><p class="ss-caption ss-muted">Start a check, perform your action, then finish. Expectations are saved for this site.</p>
      {running && <p class="ss-note ss-note-info" role="status"><Icon name="play" size={12} /> Check running. Perform the action on the website, then finish.{paused && <b> Recording is paused, so the result will be incomplete.</b>}</p>}
      {rules.map(rule => <div class="ss-card ss-flat" key={rule.id}><div class="ss-inline"><b>{rule.name}</b><span class="ss-actions"><button class="ss-button ss-small" disabled={running} onClick={() => edit(rule)}>Edit</button><button class="ss-link" disabled={running} onClick={() => onChange(rules.filter(item => item.id !== rule.id))}>Delete</button></span></div><div class="ss-mono ss-muted">{rule.eventName} · {platformNames[rule.platform] || 'Any source'}</div><div class="ss-tags">{rule.required.map(path => <span class="ss-tag" key={'r' + path}>{path} required</span>)}{Object.entries(rule.equals).map(([path, value]) => <span class="ss-tag" key={'e' + path}>{path} = {JSON.stringify(value)}</span>)}{(rule.minCount != null || rule.maxCount != null) && <span class="ss-tag">{rule.minCount != null ? `at least ${rule.minCount}` : ''}{rule.minCount != null && rule.maxCount != null ? ', ' : ''}{rule.maxCount != null ? `at most ${rule.maxCount}` : ''} times</span>}</div></div>)}
      {!editing && <button class="ss-button" disabled={rules.length >= 50 || running} onClick={() => edit()}>Add expectation</button>}
      {editing && <form class="ss-qa-form" onSubmit={event => { event.preventDefault(); save(); }}>
        <label class="ss-label">Exact event name<input required value={name} maxLength={300} placeholder="add_to_cart" onInput={e => setName(e.currentTarget.value)} /></label>
        <label class="ss-label">Source<select value={platform} onChange={e => setPlatform(e.currentTarget.value)}><option value="all">Any source</option>{Object.entries(platformNames).filter(([id]) => id !== 'page').map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label class="ss-label">Required property paths<input value={required} maxLength={2000} placeholder="product_id, value, ecommerce.currency" onInput={e => setRequired(e.currentTarget.value)} /></label>
        <label class="ss-label">Expected values (optional JSON)<textarea value={equals} maxLength={10000} spellcheck={false} onInput={e => setEquals(e.currentTarget.value)} /></label>
        <div class="ss-inline"><label class="ss-label">Minimum times<input inputMode="numeric" value={minCount} maxLength={4} placeholder="1" onInput={e => setMinCount(e.currentTarget.value)} /></label><label class="ss-label">Maximum times<input inputMode="numeric" value={maxCount} maxLength={4} placeholder="no limit" onInput={e => setMaxCount(e.currentTarget.value)} /></label></div>
        <p class="ss-caption ss-muted">Use a maximum of 1 to catch duplicate events, or a maximum of 0 to confirm an event does not fire. Separate paths with commas. Paths start inside Properties; use 0.eventName for argument arrays. Example values: {'{"currency":"USD"}'}</p>
        {error && <p role="alert" class="ss-inline-error">{error}</p>}
        <div class="ss-actions"><button type="submit" class="ss-button ss-primary" disabled={running}>Save expectation</button><button type="button" class="ss-link" onClick={() => setEditing(null)}>Cancel</button></div>
      </form>}
      <div class="ss-actions">{running ? <button class="ss-button ss-primary" onClick={() => onRun(finishCheck(run!))}>Finish check</button> : <button class="ss-button ss-primary" disabled={!rules.length || paused || !!editing} onClick={() => onRun(startCheck(rules))}>{run ? 'Start another check' : 'Start check'}</button>}</div>
      {paused && <p class="ss-caption ss-muted">Event recording is stopped. Resume it to capture more observations.</p>}
      {run?.interrupted && <p role="status" class="ss-notice">Recording was stopped during this check. Results are incomplete.</p>}
      {run?.results.map(result => <div class={'ss-qa-result ss-result-' + result.status} key={result.id}><strong>{result.name}</strong><span>{({ waiting: 'Waiting for event', 'not-observed': run.interrupted ? 'Not observed · recording incomplete' : 'Not observed during check', passed: run.interrupted ? 'Matched in captured observations · incomplete recording' : running ? 'Matching so far' : 'Observed with expected properties', failed: 'Property mismatch', unverifiable: 'Value unavailable for comparison' })[result.status]}</span><small>{result.matches} matching observations</small>{result.failures.length > 0 && <JsonTree label="Details (first 20)" value={result.failures} />}</div>)}
      {run && <CopyButton value={pretty(sanitize({ ...run, seen: undefined }))} label="Copy check results" />}
      <p class="ss-caption ss-muted">Results stay available when switching sections or reopening the panel on this page. Reloading starts a new page session. Clearing the event list keeps check results. API observations do not confirm delivery.</p>
    </div>}
  </section>;
}
