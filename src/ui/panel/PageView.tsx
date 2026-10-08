import type { PageState } from '../../core/state';
import { ConnectionStatus } from './ConnectionStatus';
import { Disclosure, Icon, JsonTree, PlatformDot } from '../shared/components';
export default function PageView({ state, onRescan }: { state: PageState; onRescan?: () => void }) {
  const errors = state.statuses.filter((item) => item.error);
  return <div class="ss-stack">
    <section class="ss-card"><span class="ss-eyebrow">Inspected page</span><h2>{state.page.title || 'Untitled page'}</h2><p class="ss-wrap ss-mono">{state.url}</p><p class="ss-caption ss-muted">Last scan {new Date(state.capturedAt).toLocaleTimeString()} · {state.platforms.length} {state.platforms.length === 1 ? 'platform' : 'platforms'} · {state.experiments.length} {state.experiments.length === 1 ? 'activity' : 'activities'}</p>{onRescan && <div class="ss-actions"><button class="ss-button" onClick={onRescan}><Icon name="refresh" size={13} />Rescan page</button></div>}</section>
    <ConnectionStatus state={state} />
    <h3 class="ss-h">Detection evidence</h3>
    {!state.platforms.length && <p class="ss-caption ss-muted">No supported platform has been detected on this page yet.</p>}
    {state.platforms.map((platform) => <section class="ss-card" key={platform.id}><div class="ss-inline"><h2><PlatformDot platform={platform.id} /> {platform.displayName}</h2><span class="ss-tag">{platform.result.state}</span></div>{platform.result.version && <p class="ss-caption">Version / revision {platform.result.version}</p>}<p class="ss-muted">{platform.id === 'onesignal' ? 'Engagement SDK. Its messaging experiments are not available as page activities.' : platform.capabilities.listAll === 'full' ? 'Includes project configuration. Only activities explicitly marked active are reported active here.' : (platform.capabilities.notes.listAll || 'Partial visibility. This runtime may expose only delivered decisions, or no activity details.')}</p><Disclosure title="Detection evidence" meta={platform.result.signals.length + ' signals'}><ul>{platform.result.signals.map((signal) => <li>{signal}</li>)}</ul></Disclosure></section>)}
    <h3 class="ss-h">Coverage notes</h3>
    <p class="ss-note">Private SDK instances, renamed globals, consent state and site configuration can limit coverage. Late installation cannot recover earlier calls. Reload the site after installing or updating the extension to capture from page start.</p>
    {errors.length > 0 && <><h3 class="ss-h">Runtime errors</h3><Disclosure title="Capture diagnostics" meta={errors.length + ' reads or actions returned errors'}><JsonTree value={errors} label="Diagnostics" /></Disclosure></>}
  </div>;
}
