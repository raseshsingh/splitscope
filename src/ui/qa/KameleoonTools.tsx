import { useEffect, useState } from 'preact/hooks';
import type { PlatformAction } from './OptimizelyTools';
import { CopyButton, Empty } from '../shared/components';
import ConfirmModal from '../shared/ConfirmModal';

type Section = 'visitor' | 'data' | 'experiments' | 'goals' | 'segments';
const sections: Array<[Section, string]> = [['visitor', 'Visitor'], ['data', 'Custom data'], ['experiments', 'Experiments'], ['goals', 'Goals'], ['segments', 'Segments']];
type Pending = { title: string; body: string; confirm: string; run: () => void };
const consent = (value: unknown) => value === true ? { text: 'Granted', cls: 'ss-tag ss-tag-ok' } : value === false ? { text: 'Not granted', cls: 'ss-tag ss-tag-warn' } : { text: 'Not set', cls: 'ss-tag' };
const when = (value: unknown) => typeof value === 'number' && value > 0 ? new Date(value).toLocaleString() : undefined;

/** Survives remounts (switching panel tabs unmounts tools). Results are kept only for the page they came from. */
const remembered: { page: string; section: Section; experiments: any[] | null } = { page: '', section: 'visitor', experiments: null };
const recall = () => { const page = globalThis.location ? location.origin + location.pathname : ''; if (remembered.page !== page) Object.assign(remembered, { page, experiments: null }); return remembered; };

/** Visitor, custom data, experiment exposure, goal and segment tools for Kameleoon, run through the page hook. */
export default function KameleoonTools({ onAction, onNotice }: { onAction?: PlatformAction; onNotice: (message: string) => void }) {
  const memory = recall();
  const [section, setSectionState] = useState<Section>(memory.section);
  const setSection = (value: Section) => { memory.section = value; setSectionState(value); };
  const [info, setInfo] = useState<any>(null);
  const [experiments, setExperimentsState] = useState<any[] | null>(memory.experiments);
  const setExperiments = (value: any[] | null) => { memory.experiments = value; setExperimentsState(value); };
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dataName, setDataName] = useState(''); const [dataValue, setDataValue] = useState(''); const [dataType, setDataType] = useState('string'); const [overwrite, setOverwrite] = useState(true);
  const [goal, setGoal] = useState(''); const [revenue, setRevenue] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);

  const run = async (action: string, args: Record<string, unknown>, success: string) => {
    if (!onAction) return;
    setBusy(true); setError('');
    try {
      const result = await onAction('kameleoon', action, args);
      if (action === 'experiments') setExperiments(Array.isArray(result) ? result : []);
      else if (result && typeof result === 'object' && 'customData' in result) setInfo(result);
      if (success) onNotice(success);
    } catch (e) { setError(String((e as Error).message || e)); } finally { setBusy(false); }
  };
  const load = () => run('visitor', {}, '');
  useEffect(() => { void load(); void run('experiments', {}, ''); }, []);
  const refreshExperiments = () => run('experiments', {}, '');

  if (!onAction) return <Empty title="Needs the installed extension">Kameleoon tools talk to the page through the extension, so they are not available in this preview.</Empty>;
  const ask = (value: Pending) => setPending(value);
  const experimentConsent = consent(info?.experimentConsent), personalizationConsent = consent(info?.personalizationConsent);
  return <section class="ss-stack ss-opt">
    <nav class="ss-tabs" aria-label="Kameleoon tools">{sections.map(([id, label]) => <button key={id} class={section === id ? 'ss-selected' : ''} aria-pressed={section === id} onClick={() => setSection(id)}>{label}</button>)}</nav>
    {error && <p class="ss-note ss-note-err" role="alert">{error}</p>}

    {section === 'visitor' && <>
      <div class="ss-qa-card">
        <div class="ss-inline"><h2>This visitor</h2><button class="ss-link" disabled={busy} onClick={() => void load()}>Refresh</button></div>
        <dl class="ss-kv"><dt>Visitor code</dt><dd>{info?.code ? <><code class="ss-wrap">{info.code}</code> <CopyButton value={info.code} label="Copy" /></> : <span class="ss-muted">Not exposed</span>}</dd><dt>Site code</dt><dd>{info?.siteCode ? <code>{info.siteCode}</code> : <span class="ss-muted">Not exposed</span>}</dd><dt>Visits</dt><dd>{info?.numberOfVisits ?? <span class="ss-muted">Not exposed</span>}</dd>{when(info?.firstVisitStartDate) && <><dt>First visit</dt><dd>{when(info.firstVisitStartDate)}</dd></>}<dt>Single page support</dt><dd>{info ? (info.singlePageSupport ? 'On' : 'Off') : ''}</dd></dl>
      </div>
      <div class="ss-qa-card">
        <h2>Consent</h2>
        <p class="ss-caption ss-muted">Kameleoon only runs the modules the visitor has consented to. Switching consent here changes this visitor's real consent state for the site.</p>
        <div class="ss-setting"><span>A/B testing<small><span class={experimentConsent.cls}>{experimentConsent.text}</span></small></span><div class="ss-actions"><button class="ss-button ss-small" disabled={busy} onClick={() => ask({ title: 'Grant A/B testing consent?', body: 'Kameleoon will start running experiments for this visitor.', confirm: 'Grant consent', run: () => void run('setConsent', { module: 'AB_TESTING', enabled: true }, 'A/B testing consent granted.') })}>Grant</button><button class="ss-button ss-small" disabled={busy} onClick={() => ask({ title: 'Withdraw A/B testing consent?', body: 'Kameleoon will stop running experiments for this visitor.', confirm: 'Withdraw consent', run: () => void run('setConsent', { module: 'AB_TESTING', enabled: false }, 'A/B testing consent withdrawn.') })}>Withdraw</button></div></div>
        <div class="ss-setting"><span>Personalization<small><span class={personalizationConsent.cls}>{personalizationConsent.text}</span></small></span><div class="ss-actions"><button class="ss-button ss-small" disabled={busy} onClick={() => ask({ title: 'Grant personalization consent?', body: 'Kameleoon will start running personalizations for this visitor.', confirm: 'Grant consent', run: () => void run('setConsent', { module: 'PERSONALIZATION', enabled: true }, 'Personalization consent granted.') })}>Grant</button><button class="ss-button ss-small" disabled={busy} onClick={() => ask({ title: 'Withdraw personalization consent?', body: 'Kameleoon will stop running personalizations for this visitor.', confirm: 'Withdraw consent', run: () => void run('setConsent', { module: 'PERSONALIZATION', enabled: false }, 'Personalization consent withdrawn.') })}>Withdraw</button></div></div>
      </div>
      <div class="ss-qa-card">
        <h2>Current visit</h2>
        <dl class="ss-kv"><dt>Page views</dt><dd>{info?.visit?.pageViews ?? <span class="ss-muted">Not exposed</span>}</dd><dt>Channel</dt><dd>{info?.visit?.acquisitionChannel ?? <span class="ss-muted">Not exposed</span>}</dd><dt>Device</dt><dd>{info?.visit?.device ?? <span class="ss-muted">Not exposed</span>}</dd><dt>Landing page</dt><dd class="ss-wrap">{info?.visit?.landingPageURL ?? <span class="ss-muted">Not exposed</span>}</dd></dl>
        {info?.visit?.conversions?.length > 0 && <><h3>Conversions this visit</h3><ul class="ss-qa-list">{info.visit.conversions.map((item: any) => <li key={item.goalId}><div class="ss-qa-name"><strong>Goal {item.goalId}</strong><small>{item.count} {item.count === 1 ? 'conversion' : 'conversions'}</small></div><code>{item.revenue ? 'Revenue ' + item.revenue : 'No revenue'}</code></li>)}</ul></>}
      </div>
    </>}

    {section === 'data' && <div class="ss-qa-card">
      <div class="ss-inline"><h2>Custom data</h2><button class="ss-link" disabled={busy} onClick={() => void load()}>Refresh</button></div>
      <p class="ss-caption ss-muted">Targeting often depends on custom data. Set a value to test a condition, then check Segments or Experiments. Values you set are real and may be sent to Kameleoon.</p>
      {info?.customData?.length ? <ul class="ss-qa-list">{info.customData.map((item: any) => <li key={item.scope + item.name}><div class="ss-qa-name"><strong class="ss-wrap">{item.name}</strong><small>{item.scope}</small></div><div class="ss-actions"><code class="ss-wrap">{String(item.value)}</code><button class="ss-link" disabled={busy} onClick={() => ask({ title: 'Reset this custom data?', body: `This clears ${item.name} for the visitor.`, confirm: 'Reset', run: () => void run('resetCustomData', { name: item.name }, 'Custom data reset.') })}>Reset</button></div></li>)}</ul> : <p class="ss-caption ss-muted">No custom data is set for this visitor or page.</p>}
      <div class="ss-qa-form">
        <label class="ss-qa-field"><span>Name or index</span><input value={dataName} onInput={e => setDataName(e.currentTarget.value)} placeholder="loyalty_tier" /></label>
        <div class="ss-qa-pair"><label class="ss-qa-field"><span>Value</span><input value={dataValue} onInput={e => setDataValue(e.currentTarget.value)} /></label><label class="ss-qa-field"><span>Type</span><select value={dataType} onChange={e => setDataType(e.currentTarget.value)}><option value="string">Text</option><option value="number">Number</option><option value="boolean">True or false</option></select></label></div>
        <label class="ss-setting ss-reset-switch"><span>Replace existing value<small>List types append by default. Turn this on to replace instead.</small></span><input class="ss-switch" type="checkbox" role="switch" checked={overwrite} onChange={e => setOverwrite(e.currentTarget.checked)} /></label>
        <div class="ss-actions"><button class="ss-button ss-primary" disabled={busy || !dataName.trim()} onClick={() => ask({ title: 'Set this custom data?', body: `This sets ${dataName.trim()} for the visitor on this page. It may be sent to Kameleoon.`, confirm: 'Set value', run: () => void run('setCustomData', { name: dataName, value: dataValue, valueType: dataType, overwrite }, 'Custom data set.') })}>Set custom data</button></div>
      </div>
    </div>}

    {section === 'experiments' && <div class="ss-qa-card">
      <div class="ss-inline"><h2>Exposure</h2><button class="ss-link" disabled={busy} onClick={() => void refreshExperiments()}>Refresh</button></div>
      <p class="ss-caption ss-muted">What Kameleoon reports for this visitor, including the reason a visitor is not exposed. Block removes an experiment for this page or visit, which is useful to isolate conflicts. Personalizations can only be disabled.</p>
      {experiments === null ? <p class="ss-caption ss-muted">Loading.</p> : experiments.length ? <ul class="ss-qa-list">{experiments.map(item => <li key={item.kind + item.id}>
        <div class="ss-qa-name"><strong class="ss-wrap">{item.name}</strong><small>{item.kind === 'experiment' ? 'Experiment' : 'Personalization'} {item.id}{item.variation ? ' · ' + item.variation.name : ''}</small></div>
        <div class="ss-actions"><span class={'ss-tag' + (item.active ? ' ss-tag-ok' : item.triggered ? ' ss-tag-info' : '')}>{item.active ? 'Ran on this page' : item.activatedInVisit ? 'Ran earlier this visit' : item.triggered ? 'Triggered' : 'Not exposed'}</span></div>
        {item.reason && <small class="ss-wrap ss-muted">Reason reported: {item.reason}</small>}
        <div class="ss-actions ss-full"><button class="ss-button ss-small" disabled={busy} onClick={() => ask({ title: item.kind === 'experiment' ? 'Block for this page?' : 'Disable this personalization?', body: item.kind === 'experiment' ? 'The experiment is blocked for this visitor on the current page only.' : 'The personalization is disabled for this visitor.', confirm: item.kind === 'experiment' ? 'Block' : 'Disable', run: () => void run('block', { id: item.id, kind: item.kind, visit: false }, 'Done.') })}>{item.kind === 'experiment' ? 'Block on this page' : 'Disable'}</button>{item.kind === 'experiment' && <button class="ss-button ss-small" disabled={busy} onClick={() => ask({ title: 'Block for this visit?', body: 'The experiment is blocked for this visitor for the rest of the visit.', confirm: 'Block', run: () => void run('block', { id: item.id, kind: item.kind, visit: true }, 'Blocked for this visit.') })}>Block this visit</button>}</div>
      </li>)}</ul> : <p class="ss-caption ss-muted">Kameleoon reports no live experiments or personalizations.</p>}
    </div>}

    {section === 'goals' && <div class="ss-qa-card">
      <h2>Goals</h2>
      <p class="ss-caption ss-muted">Test that a goal is wired up by sending a conversion for this visit. This is a real conversion and can appear in reports.</p>
      <div class="ss-qa-form">
        <label class="ss-qa-field"><span>Goal</span>{info?.goals?.length ? <select value={goal} onChange={e => setGoal(e.currentTarget.value)}><option value="">Choose a goal</option>{info.goals.map((item: any) => <option value={item.id} key={item.id}>{item.name}</option>)}</select> : <input value={goal} onInput={e => setGoal(e.currentTarget.value)} placeholder="Goal name or ID" />}</label>
        <label class="ss-qa-field"><span>Revenue (optional)</span><input inputMode="decimal" value={revenue} onInput={e => setRevenue(e.currentTarget.value)} /></label>
        <div class="ss-actions"><button class="ss-button ss-primary" disabled={busy || !goal} onClick={() => ask({ title: 'Send this conversion?', body: `This records a conversion for goal ${goal}${revenue ? ' with revenue ' + revenue : ''}. It can count in reports.`, confirm: 'Send conversion', run: () => void run('processConversion', { goal, revenue }, 'Conversion sent.') })}>Send conversion</button></div>
      </div>
    </div>}

    {section === 'segments' && <div class="ss-qa-card">
      <div class="ss-inline"><h2>Segments and triggers</h2><button class="ss-link" disabled={busy} onClick={() => void load()}>Refresh</button></div>
      <p class="ss-caption ss-muted">Re-run a segment's targeting after changing custom data. Splitscope does not show whether you are in a segment, because Kameleoon does not expose that directly.</p>
      {info?.segments?.length ? <ul class="ss-qa-list" aria-label="Segments">{info.segments.map((item: any) => <li key={item.id}><div class="ss-qa-name"><strong class="ss-wrap">{item.name}</strong><small>Segment {item.id}</small></div><button class="ss-button ss-small" disabled={busy} onClick={() => void run('reevaluateSegment', { id: item.id }, 'Segment re-evaluated.')}>Re-evaluate</button></li>)}</ul> : <p class="ss-caption ss-muted">No segments are exposed.</p>}
      {info?.triggers?.length > 0 && <><h3>Triggers</h3><ul class="ss-qa-list" aria-label="Triggers">{info.triggers.map((item: any) => <li key={item.id}><div class="ss-qa-name"><strong class="ss-wrap">{item.name}</strong><small>Trigger {item.id}</small></div></li>)}</ul></>}
    </div>}

    {pending && <ConfirmModal title={pending.title} confirm={pending.confirm} onCancel={() => setPending(null)} onConfirm={() => { const action = pending; setPending(null); action.run(); }}><p>{pending.body}</p></ConfirmModal>}
  </section>;
}
