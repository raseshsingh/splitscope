import { useState } from 'preact/hooks';
import type { Workspace } from '../../core/qa/workspace';
import { emptyWorkspace, parseWorkspaceImport } from '../../core/qa/workspace';
import { downloadFile } from '../../core/qa/export';
import { pretty } from '../../core/qa/presentation';
import { sanitize } from '../../core/sanitize';
import type { EventExpectation } from '../../core/qa/expectations';
export default function WorkspaceView({ workspace, onChange, expectations, onExpectations }: { workspace: Workspace; onChange: (value: Workspace) => void; expectations: EventExpectation[]; onExpectations: (rules: EventExpectation[]) => void }) {
  const [confirm, setConfirm] = useState(false), [message, setMessage] = useState('');
  async function importFile(file?: File) {
    if (!file) return;
    const parsed = file.size <= 2_000_000 ? parseWorkspaceImport(await file.text()) : null;
    if (!parsed) { setMessage('That file is not a Splitscope workspace export.'); return; }
    onChange(parsed.workspace); onExpectations(parsed.expectations);
    setMessage(`Imported ${parsed.workspace.pinned.length} pinned activities and ${parsed.expectations.length} expectations.`);
  }
  return <section class="ss-stack"><h2 class="ss-visually-hidden">Site workspace</h2><p class="ss-caption ss-muted">Filters, selection, pinned activities, notes, expectations and baseline are saved locally for this origin and shared by tabs on it. They survive browser restarts.</p><label class="ss-label">Workspace name<input value={workspace.name} maxLength={120} placeholder="Checkout QA" onInput={e => onChange({ ...workspace, name: e.currentTarget.value })} /></label><dl class="ss-kv"><dt>Pins</dt><dd>{workspace.pinned.length} pinned activities</dd><dt>Filters</dt><dd>{workspace.scope}{workspace.platform !== 'all' ? ', ' + workspace.platform : ''}</dd><dt>Selection</dt><dd>{workspace.selected ? <code class="ss-wrap">{workspace.selected}</code> : 'none'}</dd><dt>Baseline</dt><dd>{workspace.baseline ? 'saved' : 'none'}</dd><dt>Event checks</dt><dd>{expectations.length} expectations</dd></dl><div class="ss-actions"><button class="ss-button" onClick={() => downloadFile('splitscope-workspace.json', pretty({ exportedAt: new Date().toISOString(), workspace: sanitize(workspace), expectations: sanitize(expectations) }))}>Export workspace</button><label class="ss-button ss-file">Import workspace<input type="file" accept="application/json,.json" hidden onChange={e => { void importFile(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} /></label><button class="ss-link" onClick={() => setConfirm(true)}>Clear this workspace</button></div>{message && <p class="ss-caption" role="status">{message}</p>}{confirm && <div class="ss-notice"><p>Clear saved filters, notes, pins, baseline and expectations for this site?</p><button class="ss-button" onClick={() => { onChange(emptyWorkspace()); onExpectations([]); setConfirm(false); }}>Clear workspace</button><button class="ss-link" onClick={() => setConfirm(false)}>Cancel</button></div>}</section>;
}
