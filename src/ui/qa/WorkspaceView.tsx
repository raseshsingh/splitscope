import { useState } from 'preact/hooks';
import type { Workspace } from '../../core/qa/workspace';
import { emptyWorkspace } from '../../core/qa/workspace';
import { downloadFile } from '../../core/qa/export';
import { pretty } from '../../core/qa/presentation';
import { sanitize } from '../../core/sanitize';
import type { EventExpectation } from '../../core/qa/expectations';
export default function WorkspaceView({ workspace, onChange, expectations, onExpectations }: { workspace: Workspace; onChange: (value: Workspace) => void; expectations: EventExpectation[]; onExpectations: (rules: EventExpectation[]) => void }) {
  const [confirm, setConfirm] = useState(false);
  return <section class="ss-card"><h2>Site workspace</h2><p class="ss-caption ss-muted">Filters, selection, pinned activities, notes, expectations and baseline are saved locally for this origin. They survive browser restarts.</p><label class="ss-label">Workspace name<input value={workspace.name} maxLength={120} placeholder="Checkout QA" onInput={e => onChange({ ...workspace, name: e.currentTarget.value })} /></label><p class="ss-caption">{workspace.pinned.length} pinned activities · {expectations.length} expectations</p><div class="ss-actions"><button class="ss-button" onClick={() => downloadFile('splitscope-workspace.json', pretty({ exportedAt: new Date().toISOString(), workspace: sanitize(workspace), expectations: sanitize(expectations) }))}>Export workspace</button><button class="ss-link" onClick={() => setConfirm(true)}>Clear this workspace</button></div>{confirm && <div class="ss-notice"><p>Clear saved filters, notes, pins, baseline and expectations for this site?</p><button class="ss-button" onClick={() => { onChange(emptyWorkspace()); onExpectations([]); setConfirm(false); }}>Clear workspace</button><button class="ss-link" onClick={() => setConfirm(false)}>Cancel</button></div>}</section>;
}
