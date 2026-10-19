import { ConnectionStatus } from './ConnectionStatus';
import { useEffect, useState } from 'preact/hooks';
import type { PageState } from '../../core/state';
import { EXTENSION_BUILD } from '../../core/extension/messages';
import type { Settings } from '../../core/settings';
import { diagnostics } from '../../core/diagnostics';
import { CopyButton } from '../shared/components';
import { pretty } from '../../core/qa/presentation';
function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (value: T) => void }) {
  return <div class="ss-segmented ss-setting-seg" role="group" aria-label={label}>{options.map(([id, text]) => <button class={value === id ? 'ss-selected' : ''} aria-pressed={value === id} onClick={() => onChange(id)}>{text}</button>)}</div>;
}
function Switch({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label class="ss-setting"><span>{label}{hint && <small>{hint}</small>}</span><input class="ss-switch" type="checkbox" role="switch" checked={checked} onChange={e => onChange(e.currentTarget.checked)} /></label>;
}
export default function SettingsView({ state, settings, onChange, onClearWorkspace, onStorage }: { state?: PageState; settings: Settings; onChange: (patch: Partial<Settings>) => void; onClearWorkspace?: () => void; onStorage?: (action: 'usage' | 'clear') => Promise<any> }) {
  const [confirm, setConfirm] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [usage, setUsage] = useState<{ bytes: number; keys: number; sites: number } | null>(null);
  const [storageNote, setStorageNote] = useState('');
  const loadUsage = () => { if (onStorage) void onStorage('usage').then(value => setUsage(value || null)).catch(() => setUsage(null)); };
  useEffect(loadUsage, []);
  const clearAll = () => { if (!onStorage) return; setConfirmAll(false); void onStorage('clear').then(() => { setStorageNote('All Splitscope data was cleared. Settings were kept.'); loadUsage(); }).catch(error => setStorageNote('Could not clear data: ' + String((error as Error)?.message || error))); };
  const chrome = typeof navigator !== 'undefined' ? /Chrome\/(\d+)/.exec(navigator.userAgent || '')?.[1] : undefined;
  return <section>
    <h3 class="ss-h">Appearance</h3>
    <div class="ss-setting"><span>Theme</span><Segmented label="Theme" value={settings.theme} options={[['light', 'Light'], ['dark', 'Dark'], ['system', 'System']]} onChange={theme => onChange({ theme })} /></div>
    <div class="ss-setting"><span>Text size</span><Segmented label="Text size" value={settings.textSize} options={[['normal', 'Normal'], ['large', 'Larger']]} onChange={textSize => onChange({ textSize })} /></div>
    <div class="ss-setting"><span>Dock position</span><Segmented label="Dock position" value={settings.dock} options={[['left', 'Left'], ['right', 'Right'], ['bottom', 'Bottom']]} onChange={dock => onChange({ dock })} /></div>
    <h3 class="ss-h">Capture</h3>
    <Switch label="Keep event log through reloads" hint="Keeps a sanitized log across page loads in this tab." checked={settings.keepLog} onChange={keepLog => onChange({ keepLog })} />
    <Switch label="Capture analytics calls" hint="Observe future dataLayer, Google tag, Segment, and Adobe Analytics calls. Reload after enabling to capture startup calls where possible." checked={settings.analyticsCapture === true} onChange={analyticsCapture => onChange({ analyticsCapture })} />
    <Switch label="Restore panel after reload" hint="Reopen an open panel in this tab on the same site. Closing the panel stops reopening it." checked={settings.restorePanel} onChange={restorePanel => onChange({ restorePanel })} />
    <p class="ss-caption ss-muted">Activities update automatically as the site changes, including SPA navigation.</p>
    <h3 class="ss-h">Connection</h3>
    {state && <ConnectionStatus state={state} />}
    <div class="ss-card"><dl class="ss-kv"><dt>Version</dt><dd><code>{EXTENSION_BUILD}</code></dd><dt>Chrome</dt><dd><code>{chrome ? chrome + ' (needs 116+)' : 'unknown'}</code></dd>{state?.connection && <><dt>Page hook</dt><dd>{state.connection.page === 'connected' ? <span class="ss-tag ss-tag-ok">connected</span> : <span class="ss-tag ss-tag-warn">{state.connection.page === 'outdated' ? 'reload needed' : 'waiting'}</span>}</dd><dt>Bridge</dt><dd><span class="ss-tag ss-tag-ok">connected</span></dd><dt>Service worker</dt><dd>{state.connection.background === 'unavailable' ? <span class="ss-tag ss-tag-err">unreachable</span> : state.connection.background === 'connecting' ? <span class="ss-tag ss-tag-warn">connecting</span> : <span class="ss-tag ss-tag-ok">active</span>}</dd></>}</dl><p class="ss-muted">Copy recent inspector diagnostics to report an error. Console entries start with [Splitscope/bridge] or [Splitscope/hook]. Builds include readable code and source maps.</p><CopyButton value={pretty(diagnostics())} label="Copy diagnostics" /><p class="ss-caption ss-muted">Diagnostics can contain error messages and source URLs. Review before sharing.</p></div>
    <h3 class="ss-h">Privacy</h3>
    <p class="ss-note">No account service and no telemetry backend. Settings and QA artifacts stay in this browser.</p>
    {onStorage && <>
      <h3 class="ss-h">Storage</h3>
      <p class="ss-caption ss-muted">{usage ? `${(usage.bytes / 1_000_000).toFixed(usage.bytes < 100_000 ? 2 : 1)} MB saved for ${usage.sites} ${usage.sites === 1 ? 'site' : 'sites'} (limit about 6 MB).` : 'Storage use is not available.'} Adobe Target experience memory and QA links expire after 30 days; the oldest data is removed first when space runs short.</p>
      <div class="ss-actions">{confirmAll ? <><span class="ss-caption">Delete workspaces, event checks, saved logs, Target memory and QA links for every site? Settings stay.</span><button class="ss-button ss-danger" onClick={clearAll}>Clear all data</button><button class="ss-link" onClick={() => setConfirmAll(false)}>Cancel</button></> : <button class="ss-button ss-danger" onClick={() => setConfirmAll(true)}>Clear all Splitscope data</button>}</div>
      {storageNote && <p class="ss-caption" role="status">{storageNote}</p>}
    </>}
    {onClearWorkspace && <div class="ss-actions">{confirm ? <><span class="ss-caption">Clear saved filters, notes, pins, baseline and expectations for this site?</span><button class="ss-button ss-danger" onClick={() => { onClearWorkspace(); setConfirm(false); }}>Clear site workspace</button><button class="ss-link" onClick={() => setConfirm(false)}>Cancel</button></> : <button class="ss-button ss-danger" onClick={() => setConfirm(true)}>Clear site workspace</button>}</div>}
  </section>;
}
