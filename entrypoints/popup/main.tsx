import { useEffect, useRef } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { render } from 'preact';
import { browser } from 'wxt/browser';
import { Brand, Empty, Icon, IconButton, Status } from '../../src/ui/shared/components';
import { unwrapReply } from '../../src/core/extension/messages';
import { kindNames } from '../../src/core/qa/presentation';
import { defaultSettings, normalizeSettings } from '../../src/core/settings';
import type { NormalizedExperiment } from '../../src/core/model';
import './style.css';
type Activity = Pick<NormalizedExperiment, 'platform' | 'id' | 'name' | 'kind' | 'status' | 'assignedVariationId'> & { platformName: string; variations: Array<{ id: string; name: string }> };
type Summary = { url: string; platforms: Array<{ id: string; displayName: string }>; activeCount: number; experimentCount: number; eventCount: number; experiments: Activity[] };
function Popup() {
  const page = useSignal<Summary | null>(null), status = useSignal('Connecting to this page…'), query = useSignal(''), scope = useSignal('all'), settings = useSignal(defaultSettings);
  const tabId = useRef<number>(); const alive = useRef(true);
  const refresh = async () => { if (tabId.current == null) return; try { const result = unwrapReply(await browser.runtime.sendMessage({ type: 'popup.state', tabId: tabId.current })); if (!alive.current) return; page.value = result; status.value = result ? result.platforms.length + (result.platforms.length === 1 ? ' platform detected' : ' platforms detected') : 'Reload this website to connect the inspector.'; } catch { status.value = 'Cannot inspect this page. Open a website and reload it.'; } };
  useEffect(() => {
    alive.current = true;
    void browser.storage.local.get('splitscope:settings').then(result => settings.value = normalizeSettings(result['splitscope:settings']));
    void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => { if (!tab || !/^https?:/.test(tab.url || '')) { status.value = 'Open a website to inspect activities.'; return; } tabId.current = tab.id; void refresh(); });
    const timer = setInterval(() => void refresh(), 1500); return () => { alive.current = false; clearInterval(timer); };
  }, []);
  const open = async (tab = 'activities', activity?: Activity) => { if (tabId.current == null) return; try { unwrapReply(await browser.runtime.sendMessage(activity ? { type: 'popup.openExperiment', tabId: tabId.current, platform: activity.platform, id: activity.id } : { type: 'popup.toggle', tabId: tabId.current, tab })); window.close(); } catch { status.value = 'Could not open the inspector. Reload the website and try again.'; } };
  const activities = (page.value?.experiments || []).filter(item => (scope.value === 'all' || item.status === 'running-in') && `${item.name} ${item.id} ${item.platformName} ${kindNames[item.kind]} ${item.variations.map(v => v.id + ' ' + v.name).join(' ')}`.toLowerCase().includes(query.value.trim().toLowerCase())).sort((a, b) => Number(b.status === 'running-in') - Number(a.status === 'running-in'));
  let host = 'Page inspector'; try { host = new URL(page.value?.url || '').hostname; } catch {}
  return <main class="ss-app ss-popup" data-theme={settings.value.theme} data-text-size={settings.value.textSize}>
    <header class="ss-popup-header"><Brand subtitle={host} /><IconButton icon="settings" label="Settings" onClick={() => void open('settings')} /></header>
    <section class="ss-popup-summary"><div class="ss-inline"><span class="ss-eyebrow">This page</span><button class="ss-link" onClick={async () => { if (tabId.current != null) { try { unwrapReply(await browser.runtime.sendMessage({ type: 'popup.rescan', tabId: tabId.current })); await refresh(); } catch { status.value = 'Could not refresh. Reload the website and try again.'; } } }}><Icon name="refresh" size={13} />Refresh</button></div><div class="ss-popup-count"><strong>{page.value?.activeCount || 0}</strong><span>current decisions<small>{page.value?.experimentCount || 0} activities available to inspect</small></span></div><p class="ss-caption" role="status">{status.value}</p><div class="ss-actions">{page.value?.platforms.map(item => <span class="ss-badge" key={item.id}>{item.displayName}</span>)}</div></section>
    <div class="ss-popup-content"><div class="ss-search"><Icon name="search" size={16} /><input type="search" aria-label="Search activities" placeholder="Name, activity ID, or variation ID" value={query.value} onInput={event => query.value = event.currentTarget.value} /></div><div class="ss-segmented"><button class={scope.value === 'all' ? 'ss-selected' : ''} onClick={() => scope.value = 'all'}>All activities</button><button class={scope.value === 'active' ? 'ss-selected' : ''} onClick={() => scope.value = 'active'}>Current decisions</button></div><div class="ss-popup-list">{activities.length ? activities.map(item => <button class="ss-activity" key={item.platform + item.id} onClick={() => void open('activities', item)}><div class="ss-inline"><span class="ss-eyebrow">{item.platformName} · {kindNames[item.kind]}</span><Icon name="arrow" size={14} /></div><h3>{item.name}</h3><div class="ss-inline"><Status status={item.status} /><code class="ss-id">{item.id}</code></div></button>) : <Empty title={query.value || scope.value === 'active' ? 'No matching activities' : 'No activities exposed'}>Accept site consent or interact with the page, then refresh.</Empty>}</div></div>
    <footer class="ss-popup-footer"><div class="ss-actions"><button class="ss-button ss-primary" disabled={!page.value} onClick={() => void open()}>Open inspector <Icon name="arrow" size={15} /></button><button class="ss-button" disabled={!page.value} onClick={() => void open('events')}><Icon name="events" size={15} />Events <span class="ss-count">{page.value?.eventCount || 0}</span></button></div><p class="ss-caption ss-muted">Alt + Shift + S · No account or telemetry</p></footer>
  </main>;
}
render(<Popup />, document.getElementById('app')!);
