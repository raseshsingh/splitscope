import type { PageState } from '../../core/state';
import type { Assignment, Workspace } from '../../core/qa/workspace';
import { sanitize } from '../../core/sanitize';
import { activityKey, activityStatus, pretty, selectorConflicts } from '../../core/qa/presentation';
import { createReport, downloadFile, markdownReport } from '../../core/qa/export';
import { Icon, JsonTree } from '../shared/components';
import { isActive } from '../../core/qa/presentation';
type Change = { name: string; kind: 'Added' | 'Changed' | 'No longer reported'; before: any; after: any };
export default function ToolsView({ section, baselineMeta, state, onHighlight, notes, setNotes, baseline, setBaseline }: { section: 'report' | 'compare' | 'overlap'; baselineMeta: Workspace['baseline']; notes: string; setNotes: (value: string) => void; baseline: Assignment[] | null; setBaseline: (value: Assignment[] | null) => void; state: PageState; onHighlight: (selector: string) => void }) {
  const conflicts = selectorConflicts(state.experiments);
  const snapshot = (item: PageState['experiments'][number]) => ({ status: activityStatus(item), variation: item.assignedVariationId, value: sanitize(item.evaluatedValue, 2000, 8) });
  const changes: Change[] = [];
  if (baseline) {
    for (const before of baseline) {
      const now = state.experiments.find(item => activityKey(item) === before.key);
      const after = now ? snapshot(now) : null;
      if (!after) changes.push({ name: before.name, kind: 'No longer reported', before, after });
      else if (after.status !== before.status || after.variation !== before.variation || pretty(after.value) !== pretty(before.value)) changes.push({ name: before.name, kind: 'Changed', before, after });
    }
    for (const now of state.experiments) if (!baseline.some(before => before.key === activityKey(now))) changes.push({ name: now.name, kind: 'Added', before: { key: activityKey(now), name: now.name, status: 'Not previously reported' }, after: snapshot(now) });
  }
  const variationText = (value: any) => value ? (value.variation || value.status || 'none') : 'none';
  const saveBaseline = () => setBaseline(state.experiments.map(item => ({ key: activityKey(item), name: item.name, status: activityStatus(item), variation: item.assignedVariationId, value: item.evaluatedValue })));
  let path = state.url; try { path = new URL(state.url).pathname; } catch {}
  return <>
    {section === 'report' && <section class="ss-stack"><p class="ss-caption ss-muted">Export current assignments, platform evidence and the event timeline. JSON includes sanitized event payloads.</p><label class="ss-label">QA notes<textarea placeholder="Notes for the person investigating this issue" value={notes} onInput={(event) => setNotes(event.currentTarget.value)} /></label><dl class="ss-kv"><dt>Active on this page</dt><dd>{state.experiments.filter(isActive).length}</dd><dt>Events</dt><dd>{state.events.length}</dd><dt>Page</dt><dd><code>{path}</code></dd></dl><div class="ss-actions"><button class="ss-button ss-primary" onClick={() => downloadFile('splitscope-qa-report.json', pretty(createReport(state, notes)))}><Icon name="download" size={14} />JSON report</button><button class="ss-button" onClick={() => downloadFile('splitscope-qa-report.md', markdownReport(state, notes), 'text/markdown')}><Icon name="download" size={14} />Markdown</button></div><p class="ss-note ss-note-warn">Review reports before sharing. Redaction is not a guarantee that personal data is removed.</p></section>}
    {section === 'compare' && <section class="ss-stack">
      {!baseline ? <div class="ss-empty"><span class="ss-empty-icon"><Icon name="activity" size={24} /></span><h3>No baseline saved</h3><div class="ss-empty-body"><p>Save a baseline of the current assignments, then compare after navigation, a reload or a preview. It is saved with this site's workspace across reloads.</p><button class="ss-button ss-primary" onClick={saveBaseline}>Save baseline</button></div></div> : <>
        <p class="ss-note ss-note-info">Baseline saved{baselineMeta ? <> {new Date(baselineMeta.at).toLocaleString()} · <code class="ss-wrap">{baselineMeta.url}</code></> : null}</p>
        {changes.length ? changes.map((change, index) => <div class="ss-card ss-flat" key={index}><div class="ss-inline"><b>{change.name}</b><span class={'ss-tag ' + (change.kind === 'Added' ? 'ss-tag-ok' : change.kind === 'Changed' ? 'ss-tag-warn' : 'ss-tag-err')}>{change.kind}</span></div><p class="ss-caption ss-muted">{variationText(change.before)} → {variationText(change.after) === 'none' ? 'No longer reported' : variationText(change.after)}</p><JsonTree label="Before" value={change.before} /><JsonTree label="After" value={change.after} /></div>) : <p class="ss-note ss-note-ok"><Icon name="check" size={13} /> No assignment changes since the baseline.</p>}
        <div class="ss-actions"><button class="ss-button" onClick={saveBaseline}>Replace baseline</button><button class="ss-link" onClick={() => setBaseline(null)}>Clear baseline</button></div></>}
    </section>}
    {section === 'overlap' && <section class="ss-stack"><h2 class="ss-h">Selector overlap hints <span class="ss-count">{conflicts.length}</span></h2>
      <p class="ss-caption ss-muted">Exact selector overlaps between assigned variations of active activities.</p>
      {conflicts.length ? conflicts.map((item) => <div class="ss-card ss-flat" key={item.selector}><div class="ss-inline"><b class="ss-mono">{item.selector}</b><button class="ss-button ss-small" onClick={() => onHighlight(item.selector)}><Icon name="target" size={13} />Highlight</button></div>{item.activities.map((name) => <p class="ss-caption ss-muted" key={name}>{name}</p>)}</div>) : <p class="ss-caption">No exact overlaps found in the selectors currently exposed.</p>}
      <p class="ss-note">These are investigation leads, not proof that activities conflict.</p></section>}
  </>;
}
