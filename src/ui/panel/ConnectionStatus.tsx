import type { PageState } from '../../core/state';
import { EXTENSION_BUILD } from '../../core/extension/messages';
import { diagnostics } from '../../core/diagnostics';
import { CopyButton } from '../shared/components';
import { pretty } from '../../core/qa/presentation';
import { sanitize } from '../../core/sanitize';
export function connectionLabel(state: PageState) {
  const health = state.connection;
  if (!health) return 'Sample data';
  if (health.background === 'unavailable') return 'Extension disconnected';
  if (health.page === 'outdated') return 'Reload to update';
  if (health.page === 'waiting') return 'Connecting to page';
  if (health.background === 'connecting') return 'Connecting to extension';
  return 'Connected';
}
export function ConnectionStatus({ state }: { state: PageState }) {
  const health = state.connection;
  return <section class="ss-card"><h2>Inspector connection</h2><p>{connectionLabel(state)}</p><div class="ss-field"><span>Page capture</span><strong>{health?.page === 'connected' ? 'Connected' : health?.page === 'outdated' ? 'Older capture script — reload this website' : health ? 'Waiting for the page hook' : 'Preview only'}</strong></div><div class="ss-field"><span>Extension background</span><strong>{health?.background || 'Not used in preview'}</strong></div>{health?.lastSnapshot && <p class="ss-caption ss-muted">Last page update {new Date(health.lastSnapshot).toLocaleTimeString()}. Scanning pauses in hidden tabs.</p>}{health && (health.page !== 'connected' || health.background === 'unavailable') && <p class="ss-caption">Reload the extension in Chrome if needed, then reload this website. Existing pages need a refresh after an extension update.</p>}<CopyButton label="Copy connection diagnostics" value={pretty(sanitize({ build: EXTENSION_BUILD, page: state.url, connection: health, bridgeDiagnostics: diagnostics(), captureDiagnostics: state.statuses.filter(item => item.error) }))} /></section>;
}
