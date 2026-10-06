import { appendJourney, beginJourney, readJourney, recordSnapshot, type Journey } from '../src/core/qa/journey';
import { identifyEndpoint } from '../src/core/platform-endpoints';
import { browser } from 'wxt/browser';
import { BRIDGE_PROTOCOL, EXTENSION_BUILD, errorText, messageListener, unwrapReply } from '../src/core/extension/messages';
import { diagnostic, diagnostics } from '../src/core/diagnostics';
import { normalizeSettings } from '../src/core/settings';

type TabSummary = { url?: string; platforms?: Array<{ id: string; displayName: string; state: string }>; experimentCount?: number; eventCount?: number; activeCount?: number };
const eventBatches = new Map<number, { events: unknown[]; done: Promise<unknown> }>();
const eventWrites = new Map<number, Promise<unknown>>();
const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(messageListener(message => ['journey.get', 'journey.start', 'journey.stop', 'journey.clear', 'preview.save', 'preview.get', 'background.ping', 'page.snapshot', 'panel.remember', 'panel.restore', 'preview.open', 'page.event', 'page.clearEvents', 'page.restore', 'popup.toggle', 'popup.openExperiment', 'popup.state', 'popup.rescan', 'settings.get', 'settings.set'].includes(message?.type), (message: any, sender) => {
    if (message.type === 'background.ping') return { ok: true, build: EXTENSION_BUILD, diagnostics: diagnostics() };
    const tabId = sender.tab?.id;
    if (tabId != null && message.type?.startsWith('journey.')) return manageJourney(tabId, message.type, sender.url || sender.tab?.url || '');
    if (message?.type === 'page.snapshot' && tabId != null) {
      const state = message.state as TabSummary;
      updateBadge(tabId, state.activeCount || 0, Boolean(state.platforms?.length));
      queueTabStateWrite(tabId, state);
      void updateJourney(tabId, journey => recordSnapshot(journey, state)).catch(error => diagnostic('background', 'Could not save journey decision', error));
      return;
    }
    if (message.type === 'preview.save' && tabId != null) return browser.storage.session.set({ [`splitscope:preview:${tabId}`]: message.value });
    if (message.type === 'preview.get' && tabId != null) return browser.storage.session.get(`splitscope:preview:${tabId}`).then(value => value[`splitscope:preview:${tabId}`] || null);
    if (message?.type === 'panel.remember' && tabId != null) return browser.storage.session.set({ [`splitscope:panel:${tabId}`]: { open: message.open === true, origin: new URL(sender.url || sender.tab?.url || '').origin } });
    if (message?.type === 'panel.restore' && tabId != null) return browser.storage.session.get(`splitscope:panel:${tabId}`).then(value => value[`splitscope:panel:${tabId}`] || null);
    if (message?.type === 'preview.open' && tabId != null) {
      try {
        const url = new URL(String(message.url));
        const current = new URL(sender.url || sender.tab?.url || '');
        if (!['http:', 'https:'].includes(url.protocol) || url.origin !== current.origin) throw new Error('Preview URL must belong to this site.');
        return (async () => { const preview = await browser.tabs.create({ url: 'about:blank', openerTabId: tabId }); if (preview.id == null) throw new Error('Chrome did not create the preview tab.'); await browser.storage.session.set({ [`splitscope:preview:${preview.id}`]: message.preview || null, [`splitscope:panel:${preview.id}`]: { open: true, origin: url.origin } }); await browser.tabs.update(preview.id, { url: url.href }); return { ok: true }; })();
      } catch (error) { diagnostic('background', 'Could not open preview', error); return Promise.reject(error); }
    }
    if (message?.type === 'page.event' && tabId != null) {
      const event = message.event;
      void updateJourney(tabId, journey => { if (!journey.recording || typeof event?.pageUrl !== 'string' || new URL(event.pageUrl).origin !== journey.origin) return false; appendJourney(journey, { id: event.id, t: event.t, type: 'event', name: event.name, url: event.pageUrl, detail: event }); return true; }).catch(error => diagnostic('background', 'Could not save journey event', error));
      return queueTabEventWrite(tabId, message.event);
    }
    if (message?.type === 'page.clearEvents' && tabId != null) return serialEventWrite(tabId, () => browser.storage.session.remove(`splitscope:events:${tabId}`));
    if (message?.type === 'page.restore' && tabId != null) {
      return browser.storage.local.get('splitscope:settings').then((settings) => {
        if (!(settings['splitscope:settings'] as any)?.keepLog) return { events: [] };
        return browser.storage.session.get(`splitscope:events:${tabId}`).then((stored) => ({ events: stored[`splitscope:events:${tabId}`] || [] }));
      });
    }
    if (message?.type === 'popup.toggle' && Number.isInteger(message.tabId)) {
      return ensureContentScript(message.tabId).then(() => sendToTab(message.tabId, { type: 'panel.open', tab: message.tab }));
    }
    if (message?.type === 'popup.openExperiment' && Number.isInteger(message.tabId)) {
      return ensureContentScript(message.tabId).then(() => sendToTab(message.tabId, { type: 'panel.openExperiment', platform: message.platform, id: message.id }));
    }
    if (message?.type === 'popup.state' && Number.isInteger(message.tabId)) {
      return ensureContentScript(message.tabId).then(() => sendToTab(message.tabId, { type: 'page.getState' })).catch(() => null);
    }
    if (message?.type === 'popup.rescan' && Number.isInteger(message.tabId)) {
      return sendToTab(message.tabId, { type: 'page.rescan' }).catch(() => null);
    }
    if (message?.type === 'settings.get') return browser.storage.local.get('splitscope:settings');
    if (message?.type === 'settings.set') return (async () => {
      const settings = normalizeSettings(message.value);
      await browser.storage.local.set({ 'splitscope:settings': settings });
      if (!settings.keepLog) { await Promise.allSettled([...eventWrites.values()]); const saved = await browser.storage.session.get(null); await browser.storage.session.remove(Object.keys(saved).filter(key => key.startsWith('splitscope:events:'))); }
    })();
  }));

  browser.action.onClicked.addListener(async tab => {
    if (tab.id == null) return;
    try {
      await ensureContentScript(tab.id);
      const reply = await sendToTab(tab.id, { type: 'panel.open' });
      if (reply?.ok !== true || reply?.mounted !== true) throw new Error('The page did not confirm that the inspector opened. Reload the website and try again.');
    } catch (error) {
      badgeStates.delete(tab.id);
      diagnostic('background', 'Could not open inspector. Reload the website; Chrome internal pages cannot be inspected.', error);
      await browser.action.setBadgeText({ tabId: tab.id, text: '!' });
      await browser.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#b73733' });
      await browser.action.setTitle({ tabId: tab.id, title: `Splitscope ${EXTENSION_BUILD}: ${errorText(error)}` });
      try { await browser.scripting.executeScript({ target: { tabId: tab.id }, world: 'ISOLATED', func: showOpenError, args: [EXTENSION_BUILD, errorText(error)] }); } catch { /* Chrome internal pages prohibit injection. */ }
    }
  });
  browser.tabs.onUpdated.addListener((id, change) => { if (change.status === 'loading') updateBadge(id, 0, false); });

  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-panel') return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) {
      try { await ensureContentScript(tab.id); await sendToTab(tab.id, { type: 'panel.toggle' }); } catch (error) { diagnostic('background', 'Keyboard command could not reach the page inspector', error); }
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    badgeStates.delete(tabId);
    for (const suffix of ['state', 'events']) {
      const writeKey = `${tabId}:${suffix}`;
      const timer = pendingWrites.get(writeKey);
      if (timer) clearTimeout(timer);
      pendingWrites.delete(writeKey);
    }
    void serialJourneyWrite(tabId, () => browser.storage.session.remove(`splitscope:journey:${tabId}`));
    void serialEventWrite(tabId, () => browser.storage.session.remove([`splitscope:tab:${tabId}`, `splitscope:events:${tabId}`, `splitscope:panel:${tabId}`, `splitscope:preview:${tabId}`]));
  });

  // Optional network capture must never prevent worker registration.
  try { browser.webRequest.onBeforeRequest.addListener((details) => {
    const platform = identifyEndpoint(details.url);
    if (!platform || details.tabId < 0 || details.type !== 'image') return undefined;
    browser.tabs.sendMessage(details.tabId, {
      type: 'page.networkEvent',
      event: { id: `${Date.now()}-${details.requestId}`, t: Date.now(), platform, category: 'network', name: `${details.method} ${safeUrl(details.url)}`, via: 'network', pageUrl: details.initiator, properties: { type: details.type } }
    }).catch(() => {});
    return undefined;
  }, { urls: ['<all_urls>'] }); } catch (error) { diagnostic('background', 'Network capture unavailable; inspector remains available', error); }
  // Register all core listeners before any cosmetic work.
  void Promise.resolve().then(() => browser.action.setIcon({ path: 'icons/idle.png' })).catch(error => diagnostic('background', 'Toolbar icon unavailable', error));
  console.info(`[Splitscope/background v${EXTENSION_BUILD}] Ready`);
});

const connecting = new Map<number, Promise<void>>();
async function sendToTab(tabId: number, message: Record<string, unknown>, timeoutMs = 8000): Promise<any> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return unwrapReply(await Promise.race([
      browser.tabs.sendMessage(tabId, message, { frameId: 0 }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Page inspector did not respond to ${message.type}.`)), timeoutMs); }),
    ]));
  } finally { if (timer) clearTimeout(timer); }
}
function ensureContentScript(tabId: number): Promise<void> {
  const pending = connecting.get(tabId);
  if (pending) return pending;
  const connect = (async () => {
    const ready = async () => {
      try { const reply = await sendToTab(tabId, { type: 'bridge.ping' }, 1500); return reply?.protocol === BRIDGE_PROTOCOL && reply?.build === EXTENSION_BUILD && typeof reply?.instanceId === 'string'; }
      catch { return false; }
    };
    if (await ready()) return;
    // Explicit worlds: only the isolated bridge can access extension APIs.
    await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/hook.js'], world: 'MAIN' });
    await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/bridge.js'], world: 'ISOLATED' });
    if (!await ready()) throw new Error('Inspector initialization failed. Reload the website after updating Splitscope, then click the icon again.');
  })();
  connecting.set(tabId, connect);
  void connect.finally(() => { if (connecting.get(tabId) === connect) connecting.delete(tabId); }).catch(() => {});
  return connect;
}

function queueTabStateWrite(tabId: number, summary: TabSummary): void {
  const key = `splitscope:tab:${tabId}`;
  const writeKey = `${tabId}:state`;
  const previous = pendingWrites.get(writeKey);
  if (previous) clearTimeout(previous);
  pendingWrites.set(writeKey, setTimeout(() => {
    void browser.storage.session.get(key).then((current) => browser.storage.session.set({ [key]: { ...(current[key] || {}), ...summary, updatedAt: Date.now() } })).catch(error => diagnostic('background', 'Could not save page summary', error));
    pendingWrites.delete(writeKey);
  }, 500));
}

function serialEventWrite(tabId: number, write: () => Promise<unknown>): Promise<unknown> {
  const pending = (eventWrites.get(tabId) || Promise.resolve()).catch(() => {}).then(write);
  eventWrites.set(tabId, pending);
  void pending.finally(() => { if (eventWrites.get(tabId) === pending) eventWrites.delete(tabId); }).catch(() => {});
  return pending;
}
function queueTabEventWrite(tabId: number, event: unknown): Promise<unknown> {
  const pending = eventBatches.get(tabId);
  if (pending) { pending.events.push(event); if (pending.events.length > 5000) pending.events.shift(); return pending.done; }
  const batch = { events: [event], done: Promise.resolve() as Promise<unknown> };
  batch.done = serialEventWrite(tabId, async () => {
    await new Promise(resolve => setTimeout(resolve, 150));
    eventBatches.delete(tabId);
    const settings = await browser.storage.local.get('splitscope:settings');
    if (!normalizeSettings(settings['splitscope:settings']).keepLog) return;
    const key = `splitscope:events:${tabId}`;
    const current = await browser.storage.session.get(key);
    const events = Array.isArray(current[key]) ? current[key] as unknown[] : [];
    const combined = [...events, ...batch.events].slice(-5000);
    // Session storage is shared by all tabs. Bound each saved timeline as well as its count.
    let bytes = JSON.stringify(combined).length;
    while (bytes > 1_500_000 && combined.length) { const removed = combined.shift(); bytes -= JSON.stringify(removed).length + 1; }
    await browser.storage.session.set({ [key]: combined });
  });
  eventBatches.set(tabId, batch);
  return batch.done;
}

const badgeStates = new Map<number, string>();
function updateBadge(tabId: number, count: number, detected: boolean): void {
  count = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const signature = `${count}:${detected}`;
  if (badgeStates.get(tabId) === signature) return;
  badgeStates.set(tabId, signature);
  void Promise.resolve().then(async () => {
    await Promise.all([
      browser.action.setIcon({ tabId, path: detected ? 'icons/detected.png' : 'icons/idle.png' }),
      browser.action.setTitle({ tabId, title: detected ? `Splitscope: ${count} current decisions — open inspector` : 'Splitscope: no platform detected yet — open inspector' }),
      browser.action.setBadgeText({ tabId, text: count > 99 ? '99+' : detected ? String(count) : '' }),
      browser.action.setBadgeBackgroundColor({ tabId, color: detected ? '#08764f' : '#66758a' }),
    ]);
  }).catch(error => { badgeStates.delete(tabId); diagnostic('background', 'Could not update toolbar', error); });
}

function safeUrl(raw: string): string {
  try { const url = new URL(raw); return `${url.origin}${url.pathname}`; } catch { return raw.slice(0, 250); }
}

// Independent of the app renderer: even a broken bridge must produce a useful visible failure.
function showOpenError(build: string, detail: string): void {
  document.getElementById('splitscope-open-error')?.remove();
  const host = document.createElement('div'); host.id = 'splitscope-open-error';
  host.style.setProperty('all', 'initial', 'important');
  for (const [key, value] of Object.entries({ position: 'fixed', top: '12px', right: '12px', 'z-index': '2147483647', display: 'block' })) host.style.setProperty(key, value, 'important');
  const root = host.attachShadow({ mode: 'closed' });
  const box = document.createElement('section');
  box.style.cssText = 'box-sizing:border-box;width:min(420px,90vw);padding:20px;background:#fff;color:#172339;border:2px solid #b73733;border-radius:10px;box-shadow:0 10px 40px #0004;font:14px/1.5 system-ui';
  const heading = document.createElement('strong'); heading.textContent = `Splitscope ${build} could not open`;
  const explanation = document.createElement('p'); explanation.textContent = 'The exact opening error is below. You can copy it to report the problem.';
  const output = document.createElement('textarea'); output.readOnly = true; output.value = detail; output.setAttribute('aria-label', 'Opening error'); output.style.cssText = 'box-sizing:border-box;width:100%;height:130px;display:block;margin:12px 0;font:12px/1.5 monospace';
  const reload = document.createElement('button'); reload.textContent = 'Reload page'; reload.onclick = () => location.reload();
  const close = document.createElement('button'); close.textContent = 'Close'; close.style.marginLeft = '12px'; close.onclick = () => host.remove();
  box.append(heading, explanation, output, reload, close); root.append(box); document.documentElement.append(host);
}

const journeyWrites = new Map<number, Promise<unknown>>();
function serialJourneyWrite<T>(tabId: number, action: () => Promise<T>): Promise<T> {
  const pending = (journeyWrites.get(tabId) || Promise.resolve()).catch(() => {}).then(action);
  journeyWrites.set(tabId, pending);
  void pending.finally(() => { if (journeyWrites.get(tabId) === pending) journeyWrites.delete(tabId); }).catch(() => {});
  return pending;
}
const journeyBatches = new Map<number, { updates: Array<(journey: Journey) => boolean>; done: Promise<unknown> }>();
function updateJourney(tabId: number, update: (journey: Journey) => boolean): Promise<unknown> {
  const pending = journeyBatches.get(tabId);
  if (pending && pending.updates.length < 1000) { pending.updates.push(update); return pending.done; }
  const batch = { updates: [update], done: Promise.resolve() as Promise<unknown> };
  batch.done = serialJourneyWrite(tabId, async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (journeyBatches.get(tabId) === batch) journeyBatches.delete(tabId);
    const key = `splitscope:journey:${tabId}`, saved = await browser.storage.session.get(key);
    const journey = readJourney(saved[key]);
    if (!journey) return;
    let changed = false;
    for (const apply of batch.updates) { try { changed = apply(journey) || changed; } catch (error) { diagnostic('background', 'Could not record journey observation', error); } }
    if (changed) await browser.storage.session.set({ [key]: journey });
  });
  journeyBatches.set(tabId, batch);
  return batch.done;
}

function manageJourney(tabId: number, type: string, url: string) {
  return serialJourneyWrite(tabId, async () => {
    const key = `splitscope:journey:${tabId}`, saved = await browser.storage.session.get(key);
    if (type === 'journey.clear') { await browser.storage.session.remove(key); return null; }
    let journey = readJourney(saved[key]);
    if (type === 'journey.start') { journey = beginJourney(new URL(url).origin); await browser.storage.session.set({ [key]: journey }); }
    if (type === 'journey.stop' && journey) { journey.recording = false; journey.endedAt = Date.now(); await browser.storage.session.set({ [key]: journey }); }
    return journey || null;
  });
}
