import { useEffect, useState } from 'preact/hooks';
import type { CapturedEvent } from '../../core/model';
import { evaluateExpectations, type EventExpectation, type CheckResult } from '../../core/qa/expectations';
import { platformNames, pretty } from '../../core/qa/presentation';
import { CopyButton, Disclosure, JsonTree } from '../shared/components';
export default function Expectations({ rules, onChange, events, paused }: { rules: EventExpectation[]; onChange: (rules: EventExpectation[]) => void; events: CapturedEvent[]; paused: boolean }) {
  const [editing, setEditing] = useState(false), [name, setName] = useState(''), [platform, setPlatform] = useState('all');
  const [required, setRequired] = useState(''), [equals, setEquals] = useState('{}'), [error, setError] = useState('');
  const [start, setStart] = useState<number | null>(null), [results, setResults] = useState<CheckResult[] | null>(null), [runRules, setRunRules] = useState<EventExpectation[]>([]);
  const [interrupted, setInterrupted] = useState(false);
  const shown = results || (start != null ? evaluateExpectations(runRules, events, start) : []);
  const running = start != null && results == null;
  // Capture can be stopped outside this view. Preserve that limitation in the result.
  useEffect(() => { if (running && paused) setInterrupted(true); }, [running, paused]);
  function save() {
    try {
      if (!name.trim()) throw new Error('Enter the exact event name.');
      const values = JSON.parse(equals);
      if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Expected values must be a JSON object.');
      if (equals.length > 10000) throw new Error('Keep expected values under 10,000 characters.');
      onChange([...rules, { id: crypto.randomUUID(), name: name.trim(), eventName: name.trim(), platform, required: required.split(',').map(v => v.trim()).filter(Boolean), equals: values }]);
      setEditing(false); setName(''); setRequired(''); setEquals('{}'); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  return <section class="ss-card"><h2>Event expectations</h2><p class="ss-caption ss-muted">Saved for this site. Start a check, perform your action, then finish. Matches use the exact event name and properties; API calls do not prove delivery.</p>
    {rules.map(rule => <Disclosure key={rule.id} title={rule.name} meta={platformNames[rule.platform] || 'Any source'}><JsonTree label="Expectation" value={rule} /><button class="ss-link" disabled={running} onClick={() => onChange(rules.filter(item => item.id !== rule.id))}>Delete expectation</button></Disclosure>)}
    {!editing && <button class="ss-button" disabled={rules.length >= 50 || running} onClick={() => setEditing(true)}>Add expectation</button>}
    {editing && <div class="ss-qa-form"><label class="ss-label">Exact event name<input value={name} maxLength={300} placeholder="add_to_cart" onInput={e => setName(e.currentTarget.value)} /></label><label class="ss-label">Source<select value={platform} onChange={e => setPlatform(e.currentTarget.value)}><option value="all">Any source</option>{Object.entries(platformNames).filter(([id]) => id !== 'page').map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label class="ss-label">Required property paths, comma separated<input value={required} maxLength={2000} placeholder="product_id, value, ecommerce.currency" onInput={e => setRequired(e.currentTarget.value)} /></label><label class="ss-label">Expected values (JSON object)<textarea value={equals} maxLength={10000} placeholder={'{"currency":"USD"}'} onInput={e => setEquals(e.currentTarget.value)} /></label><p class="ss-caption">Paths are relative to Properties. For raw argument arrays use paths such as 0.eventName. Redacted values cannot be verified.</p>{error && <p role="alert">{error}</p>}<div class="ss-actions"><button class="ss-button" onClick={save}>Save expectation</button><button class="ss-link" onClick={() => setEditing(false)}>Cancel</button></div></div>}
    <div class="ss-actions"><button class="ss-button ss-primary" disabled={!rules.length || paused || editing} onClick={() => { setStart(Date.now()); setRunRules(rules); setResults(null); setInterrupted(false); }}>{running ? 'Restart check' : 'Start check'}</button>{running && <button class="ss-button" onClick={() => setResults(evaluateExpectations(runRules, events, start!, Date.now()))}>Finish check</button>}</div>
    {paused && <p class="ss-caption">Start event recording before running a check.</p>}{interrupted && <p role="status">Recording was stopped during this check; results may be incomplete.</p>}
    {shown.map(result => <div class="ss-qa-result" key={result.id}><strong>{result.name}</strong><span>{({ waiting: 'Waiting', 'not-observed': 'Not observed during recording', passed: 'Observed with expected properties', failed: 'Property mismatch' })[result.status]}</span><small>{result.matches} matching observations</small>{result.failures.length > 0 && <JsonTree label="Mismatches" value={result.failures} />}</div>)}
    {!!shown.length && <><CopyButton value={pretty({ startedAt: start, complete: !!results, interrupted, expectations: runRules, results: shown })} label="Copy check results" /><p class="ss-caption ss-muted">Checks use the retained event buffer (up to 5,000 observations). Finish before navigating or closing the panel. Every matching observation must satisfy the expectation.</p></>}
  </section>;
}
