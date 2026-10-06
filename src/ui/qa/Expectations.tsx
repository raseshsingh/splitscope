import { useState } from 'preact/hooks';
import type { CheckRun } from '../../core/qa/check-run';
import { finishCheck, startCheck } from '../../core/qa/check-run';
import type { EventExpectation } from '../../core/qa/expectations';
import { platformNames, pretty } from '../../core/qa/presentation';
import { sanitize } from '../../core/sanitize';
import { CopyButton, Disclosure, JsonTree } from '../shared/components';

type Props = { rules: EventExpectation[]; onChange: (rules: EventExpectation[]) => void; paused: boolean; run: CheckRun | null; onRun: (run: CheckRun | null) => void };
export default function Expectations({ rules, onChange, paused, run, onRun }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState(''), [platform, setPlatform] = useState('all');
  const [required, setRequired] = useState(''), [equals, setEquals] = useState('{}'), [error, setError] = useState('');
  const running = !!run && !run.endedAt;
  const summary = run ? running ? 'Check running' : `${run.results.filter(result => result.status === 'passed').length}/${run.results.length} matched` : `${rules.length} saved`;
  function edit(rule?: EventExpectation) {
    setEditing(rule?.id || 'new'); setName(rule?.eventName || ''); setPlatform(rule?.platform || 'all');
    setRequired(rule?.required.join(', ') || ''); setEquals(pretty(rule?.equals || {})); setError('');
  }
  function save() {
    try {
      if (!name.trim()) throw new Error('Enter the exact event name.');
      const values = JSON.parse(equals);
      if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Expected values must be a JSON object.');
      if (Object.keys(values).length > 50 || Object.entries(values).some(([path, value]) => !path.trim() || path.length > 200 || JSON.stringify(value).length > 2000)) throw new Error('Use up to 50 property paths, with values under 2,000 characters each.');
      const paths = required.split(',').map(value => value.trim()).filter(Boolean);
      if (paths.length > 50 || paths.some(path => path.length > 200)) throw new Error('Use up to 50 property paths, each under 200 characters.');
      const rule = { id: editing === 'new' ? crypto.randomUUID() : editing!, name: name.trim(), eventName: name.trim(), platform, required: paths, equals: values };
      onChange(editing === 'new' ? [...rules, rule] : rules.map(item => item.id === editing ? rule : item));
      setEditing(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  return <section class="ss-checks">
    <button class="ss-disclosure-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><span><strong>Event checks</strong><small>{summary} · {expanded ? 'Hide' : 'Set up or review'}</small></span><span class={'ss-badge ' + (running ? 'ss-recording' : '')}>{running ? 'Recording' : 'QA'}</span></button>
    {expanded && <div class="ss-disclosure-body"><p class="ss-caption ss-muted">Start a check, perform your action, then finish. Expectations are saved for this site.</p>
      {rules.map(rule => <Disclosure key={rule.id} title={rule.name} meta={platformNames[rule.platform] || 'Any source'}><JsonTree label="Required properties" value={rule.required} defaultOpen /><JsonTree label="Expected values" value={rule.equals} /><div class="ss-actions"><button class="ss-button" disabled={running} onClick={() => edit(rule)}>Edit</button><button class="ss-link" disabled={running} onClick={() => onChange(rules.filter(item => item.id !== rule.id))}>Delete</button></div></Disclosure>)}
      {!editing && <button class="ss-button" disabled={rules.length >= 50 || running} onClick={() => edit()}>Add expectation</button>}
      {editing && <form class="ss-qa-form" onSubmit={event => { event.preventDefault(); save(); }}>
        <label class="ss-label">Exact event name<input required value={name} maxLength={300} placeholder="add_to_cart" onInput={e => setName(e.currentTarget.value)} /></label>
        <label class="ss-label">Source<select value={platform} onChange={e => setPlatform(e.currentTarget.value)}><option value="all">Any source</option>{Object.entries(platformNames).filter(([id]) => id !== 'page').map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label class="ss-label">Required property paths<input value={required} maxLength={2000} placeholder="product_id, value, ecommerce.currency" onInput={e => setRequired(e.currentTarget.value)} /></label>
        <label class="ss-label">Expected values (optional JSON)<textarea value={equals} maxLength={10000} spellcheck={false} onInput={e => setEquals(e.currentTarget.value)} /></label>
        <p class="ss-caption ss-muted">Separate paths with commas. Paths start inside Properties; use 0.eventName for argument arrays. Example values: {'{"currency":"USD"}'}</p>
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
