import { useEffect, useRef } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { render } from 'preact';
import { browser } from 'wxt/browser';
import { Brand } from '../../src/ui/shared/components';
import SettingsView from '../../src/ui/panel/SettingsView';
import { unwrapReply } from '../../src/core/extension/messages';
import { defaultSettings, normalizeSettings, type Settings } from '../../src/core/settings';
import './style.css';
function Options() {
  const settings = useSignal(defaultSettings), status = useSignal('Loading preferences…');
  const loaded = useSignal(false), writes = useRef(Promise.resolve());
  useEffect(() => { void browser.storage.local.get('splitscope:settings').then(result => { settings.value = normalizeSettings(result['splitscope:settings']); loaded.value = true; status.value = 'Settings stay in this browser.'; }).catch(() => status.value = 'Could not load preferences. Reload this page to try again.'); }, []);
  const update = (patch: Partial<Settings>) => {
    const value = { ...settings.value, ...patch }; settings.value = value; status.value = 'Saving…';
    writes.current = writes.current.then(async () => {
      try { unwrapReply(await browser.runtime.sendMessage({ type: 'settings.set', value })); if (settings.value === value) status.value = 'Saved. Open panels update automatically.'; }
      catch { status.value = 'Could not save. Please try again.'; }
    });
  };
  return <main class="ss-app ss-options" data-theme={settings.value.theme} data-text-size={settings.value.textSize}><div class="ss-options-inner"><Brand subtitle="Your inspection workspace" />{loaded.value && <SettingsView settings={settings.value} onChange={update} />}<p role="status">{status.value}</p></div></main>;
}
render(<Options />, document.getElementById('app')!);
