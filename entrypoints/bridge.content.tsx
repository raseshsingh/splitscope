import { emptyWorkspace, normalizeWorkspace, type Workspace } from '../src/core/qa/workspace';
import type { Journey } from '../src/core/qa/journey';
import { normalizeExpectations, type EventExpectation } from '../src/core/qa/expectations';
import { createPreview, resetPreviewUrl } from '../src/core/qa/preview';
import { render, Component, type ComponentChildren } from 'preact';
import { diagnostic, diagnostics } from '../src/core/diagnostics';
import { signal } from '@preact/signals';
import { browser } from 'wxt/browser';
import { BRIDGE_PROTOCOL, EXTENSION_BUILD, errorText, messageListener, unwrapReply } from '../src/core/extension/messages';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import type { CapturedEvent, DetectionRecord, NormalizedExperiment } from '../src/core/model';
import { parseBridgeMessage, parseEvent, parseSnapshot, snapshotIssues } from '../src/core/bridge/protocol';
import { emptyPageState, type PageState } from '../src/core/state';
import { defaultSettings, normalizeSettings } from '../src/core/settings';
import { mergeEvents, platformNames } from '../src/core/qa/presentation';
import App, { type PanelTab } from '../src/ui/panel/App';
import panelCss from '../src/ui/panel/panel.css?inline';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'ISOLATED',
  cssInjectionMode: 'manual',
  async main(ctx) {
    const contentWindow = window as unknown as Record<string, unknown>;
    // WXT invalidates an earlier instance before invoking main. A persistent
    // boolean guard would prevent the replacement from starting after that.
    const instanceId = crypto.randomUUID();
    contentWindow.__splitscopeBridgeInstalled = instanceId;
    let disposed = false;
    const cleanup: Array<() => void> = [];
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      if (!ctx.signal.aborted) { try { ctx.abort('Splitscope connection expired'); } catch {} }
      for (const remove of cleanup.splice(0).reverse()) { try { remove(); } catch {} }
      if (contentWindow.__splitscopeBridgeInstalled === instanceId) delete contentWindow.__splitscopeBridgeInstalled;
    };
    ctx.onInvalidated(dispose);
    const isAlive = () => {
      if (disposed) return false;
      try { if (!ctx.signal.aborted && browser?.runtime?.id && typeof browser.runtime.sendMessage === 'function') return true; } catch {}
      dispose();
      return false;
    };
    if (!isAlive()) return;
    try {
    const send = async (message: Record<string, unknown>): Promise<any> => {
      if (!isAlive()) return undefined;
      try {
        const reply = await browser.runtime.sendMessage(message);
        return isAlive() ? unwrapReply(reply) : undefined;
      } catch (error) {
        if (!isAlive() || /extension context invalidated/i.test(errorText(error))) { dispose(); return undefined; }
        throw error;
      }
    };
    const state = signal<PageState>(emptyPageState(location.href));
    const platformEvidence = new Map<string, DetectionRecord>();
    const requestedExperiment = signal<{ platform: string; id: string; requestId: number } | null>(null);
    const settings = signal(defaultSettings);
    const requestedTab = signal<{ tab: PanelTab; requestId: number }>({ tab: 'activities', requestId: 0 });
    void send({ type: 'preview.get' }).then(record => { if (record?.origin === location.origin && Date.now() - record.startedAt < 86400000) { state.value = { ...state.value, preview: record }; requestedExperiment.value = { platform: record.platform, id: record.experimentId, requestId: Date.now() }; } }).catch(error => diagnostic('bridge', 'Could not restore preview', error));
    const workspace = signal<Workspace>(emptyWorkspace());
    const workspaceKey = `splitscope:workspace:${location.origin}`;
    const journey = signal<Journey | null>(null);
    const workspaceLoaded = browser.storage.local.get(workspaceKey).then(value => { workspace.value = normalizeWorkspace(value[workspaceKey]); }).catch(error => diagnostic('bridge', 'Could not load workspace', error));
    const expectations = signal<EventExpectation[]>([]);
    const expectationsKey = `splitscope:expectations:${location.origin}`;
    const expectationsLoaded = browser.storage.local.get(expectationsKey).then(value => { expectations.value = normalizeExpectations(value[expectationsKey]); }).catch(error => diagnostic('bridge', 'Could not load expectations', error));
    const settingsLoaded = send({ type: 'settings.get' }).then(result => { if (isAlive()) { settings.value = normalizeSettings(result?.['splitscope:settings']); command('captureOptions', { analytics: settings.value.analyticsCapture }); } }).catch(error => diagnostic('bridge', 'Could not load settings', error));
    const onSettingsChanged = (changes: Record<string, any>, area: string) => {
      if (isAlive() && area === 'local') { if (changes[workspaceKey]) workspace.value = normalizeWorkspace(changes[workspaceKey].newValue); if (changes[expectationsKey]) expectations.value = normalizeExpectations(changes[expectationsKey].newValue); }
      if (isAlive() && area === 'local' && changes['splitscope:settings']) { settings.value = normalizeSettings(changes['splitscope:settings'].newValue); command('captureOptions', { analytics: settings.value.analyticsCapture }); }
    };
    browser.storage.onChanged.addListener(onSettingsChanged);
    cleanup.push(() => browser.storage.onChanged.removeListener(onSettingsChanged));
    let nonce = '';
    let mounting: Promise<void> | undefined;
    let ui: Awaited<ReturnType<typeof createShadowRootUi>> | undefined;
    let uiMounted = false;
    let eventsPaused = false;
    let commandSequence = 0;

    const ensureUi = (): Promise<void> => {
      if (!isAlive()) return Promise.reject(new Error('Inspector connection expired. Reload this page.'));
      if (uiMounted && ui?.shadowHost.isConnected) return Promise.resolve();
      uiMounted = false;
      if (mounting) return mounting;
      mounting = (async () => {
      if (!document.head && !document.body) await new Promise<void>(resolve => { const ready = () => { document.removeEventListener('DOMContentLoaded', ready); resolve(); }; document.addEventListener('DOMContentLoaded', ready, { once: true }); cleanup.push(ready); });
      await Promise.all([workspaceLoaded, expectationsLoaded]);
      if (!isAlive()) throw new Error('Inspector connection expired during mount.');
      state.value = { ...state.value, statuses: state.value.statuses.filter(item => !String(item.message).startsWith('force-')) };
      try {
      ui ??= await createShadowRootUi(ctx, {
        name: 'splitscope-panel',
        css: panelCss,
        position: 'overlay',
        zIndex: 2147483647,
        anchor: 'html',
        mode: 'closed',
        isolateEvents: ['keydown', 'keyup', 'keypress'],
        onMount(container) {
          render(<PanelBoundary><App workspace={workspace} onWorkspace={value => { workspace.value = normalizeWorkspace(value); void browser.storage.local.set({ [workspaceKey]: workspace.value }).catch(error => report('Could not save workspace', error)); }} journey={journey} onJourney={action => { void send({ type: `journey.${action}` }).then(value => { journey.value = value || null; if (action === 'start') command('rescan'); }).catch(error => report('Could not update journey', error)); }} expectations={expectations} onExpectations={value => { expectations.value = normalizeExpectations(value); void browser.storage.local.set({ [expectationsKey]: expectations.value }).catch(error => report('Could not save expectations', error)); }} state={state} initialPaused={eventsPaused} requestedExperiment={requestedExperiment} requestedTab={requestedTab} settings={settings} onSettings={(value) => { settings.value = value; void send({ type: 'settings.set', value }).catch(error => report('Could not save settings', error)); }} onClearEvents={() => { state.value = { ...state.value, events: [] }; void send({ type: 'page.clearEvents' }).catch(error => report('Could not clear saved events', error)); }} onClose={() => closeUi()} onRescan={() => command('rescan')} onPauseEvents={(value) => { eventsPaused = value; }} onForceRequest={(payload) => command('forceVariation', payload)} onResetPreview={() => { const record = state.value.preview; if (!record) return; void send({ type: 'preview.save', value: null }).then(() => { state.value = { ...state.value, preview: null }; location.assign(resetPreviewUrl(record, location.href)); }).catch(error => report('Could not reset preview', error)); }} onForceExecute={(plan, target, request) => { void (async () => { if (!request) throw new Error('Select a variation again.'); const preview = createPreview(request, plan, location.href); if (target === 'new' && (plan.method === 'url' || plan.method === 'preview-link')) await send({ type: 'preview.open', url: plan.url, preview }); else { await send({ type: 'preview.save', value: preview }); state.value = { ...state.value, preview }; command('executeForcePlan', { plan }); } })().catch(error => report('Could not start preview', error)); }} /></PanelBoundary>, container);
          return container;
        },
        onRemove(container) { uiMounted = false; if (container) render(null, container); }
      });
      if (!isAlive()) { ui.remove(); throw new Error('Inspector connection expired during mount.'); }
      ui.mount();
      uiMounted = ui.shadowHost.isConnected;
      if (!uiMounted) throw new Error('The website removed the panel while it was opening.');
      document.getElementById('splitscope-open-error')?.remove();
      void send({ type: 'panel.remember', open: true }).catch(error => report('Could not remember panel', error));
      } catch (error) { report('Panel mount failed', error); throw error; }
      })().finally(() => { mounting = undefined; });
      return mounting;
    };
    const closeUi = (remember = true) => { ui?.remove(); uiMounted = false; if (remember && isAlive()) void send({ type: 'panel.remember', open: false }).catch(error => report('Could not save panel state', error)); };
    cleanup.push(() => closeUi(false));
    const report = (message: string, error?: unknown) => { if (!isAlive()) return; const item = diagnostic('bridge', message, error); if (item) state.value = { ...state.value, statuses: [...state.value.statuses.slice(-49), { message, error: error ? errorText(error) : message, diagnostic: item }] }; };
    const command = (name: string, payload: Record<string, unknown> = {}) => {
      if (!isAlive()) return;
      window.postMessage({ namespace: '__splitscope__', nonce, type: 'command', requestId: `ss-${Date.now()}-${++commandSequence}`, payload: { name, ...payload } }, '*');
    };

    const handlePageMessage = (event: MessageEvent) => {
      if (!isAlive() || event.source !== window) return;
      const message = parseBridgeMessage(event.data);
      if (!message) { if (event.data?.namespace === '__splitscope__') report('Rejected bridge envelope', 'Invalid shape or message exceeds size limit'); return; }
      if (message.type === 'hello' && message.nonce !== 'bootstrap') {
        if (nonce && nonce !== message.nonce) return;
        nonce = message.nonce;
        console.info('[Splitscope/bridge] Connected to page hook');
        window.postMessage({ namespace: '__splitscope__', nonce, type: 'ready' }, '*');
        command('captureOptions', { analytics: settings.value.analyticsCapture });
        return;
      }
      if (message.nonce !== nonce) return;
      if (message.type === 'snapshot' && message.payload && typeof message.payload === 'object') {
        const parsed = parseSnapshot(message.payload);
        if (!parsed) { report('Rejected platform snapshot', snapshotIssues(message.payload)); return; }
        const payload = parsed as unknown as PageState;
        if (parsed.omittedPlatforms) report('Some platform records were rejected', { count: parsed.omittedPlatforms });
        for (const record of platformEvidence.values()) if (!payload.platforms.some(item => item.id === record.id)) payload.platforms.push(record);
        if (parsed.omitted && !state.value.statuses.some(item => item.message === 'Incomplete activity data')) state.value = { ...state.value, statuses: [...state.value.statuses, { message: 'Incomplete activity data', error: `${parsed.omitted} activity records had unsupported data shapes and were omitted.` }] };
        state.value = {
          ...state.value,
          url: typeof payload.url === 'string' ? payload.url : location.href,
          capturedAt: Number(payload.capturedAt) || Date.now(),
          platforms: Array.isArray(payload.platforms) ? payload.platforms as DetectionRecord[] : [],
          experiments: Array.isArray(payload.experiments) ? payload.experiments as NormalizedExperiment[] : [],
          page: payload.page || state.value.page
        };
        send({ type: 'page.snapshot', state: { ...summarize(state.value), documentId: instanceId } }).catch(error => report('Could not update toolbar state', error));
      } else if (message.type === 'event' && message.payload && typeof message.payload === 'object') {
        if (eventsPaused) return;
        const incoming = parseEvent(message.payload);
        if (!incoming) { report('Rejected event record', 'Unsupported event shape'); return; }
        if (!['page', 'datalayer', 'ga4', 'segment', 'adobe-analytics'].includes(incoming.platform)) {
          const evidence: DetectionRecord = { id: incoming.platform as DetectionRecord['id'], displayName: platformNames[incoming.platform] || incoming.platform, result: { state: 'detected', confidence: 0.9, signals: [`Observed ${incoming.via}: ${incoming.name}`] }, capabilities: { listAll: 'partial', listActive: false, forceVariation: 'none', trafficSplit: 'none', changes: 'none', events: true, notes: {} } };
          platformEvidence.set(incoming.platform, evidence);
          if (!state.value.platforms.some(item => item.id === incoming.platform)) {
            state.value = { ...state.value, platforms: [...state.value.platforms, evidence] };
            void send({ type: 'page.snapshot', state: { ...summarize(state.value), documentId: instanceId } }).catch(error => report('Could not update detected platforms', error));
          }
        }
        const events = [...state.value.events, incoming].slice(-5000);
        state.value = { ...state.value, events };
        send({ type: 'page.event', event: incoming, count: events.length }).catch(error => report('Could not save event', error));
      } else if (message.type === 'status' && message.payload && typeof message.payload === 'object') {
        state.value = { ...state.value, statuses: [...state.value.statuses.slice(-49), message.payload as Record<string, unknown>] };
      }
    };

    const onPageMessage = (event: MessageEvent) => { try { handlePageMessage(event); } catch (error) { report('Page message handler failed', { message: errorText(error), stack: (error as any)?.stack, messageType: event.data?.type, pageUrl: location.href }); } };
    window.addEventListener('message', onPageMessage);
    void send({ type: 'page.restore' }).then((stored: any) => {
      if (!Array.isArray(stored?.events) || !stored.events.length) return;
      state.value = { ...state.value, events: mergeEvents(stored.events.map(parseEvent).filter(Boolean), state.value.events) };
    }).catch(() => {});
    cleanup.push(() => window.removeEventListener('message', onPageMessage));
    const onRuntimeMessage = messageListener(message => isAlive() && ['bridge.ping', 'panel.toggle', 'panel.open', 'panel.openExperiment', 'panel.close', 'page.rescan', 'page.getState', 'panel.forcePlan', 'panel.executeForce', 'panel.pauseEvents', 'page.networkEvent'].includes(message?.type), async (message: any) => {
      if (!isAlive()) throw new Error('Inspector connection expired.');
      if (message.type === 'bridge.ping') return { protocol: BRIDGE_PROTOCOL, build: EXTENSION_BUILD, instanceId };
      if (message?.type === 'panel.toggle') { if (uiMounted) closeUi(); else await ensureUi(); return { ok: true, mounted: uiMounted, instanceId }; }
      if (message?.type === 'panel.open') { requestedExperiment.value = null; requestedTab.value = { tab: message.tab === 'settings' ? 'settings' : message.tab === 'events' ? 'events' : 'activities', requestId: Date.now() }; await ensureUi(); return { ok: true, mounted: uiMounted, instanceId }; }
      if (message?.type === 'panel.openExperiment') {
        requestedTab.value = { tab: 'activities', requestId: Date.now() };
        requestedExperiment.value = { platform: String(message.platform), id: String(message.id), requestId: Date.now() };
        await ensureUi(); return { ok: true, mounted: uiMounted, instanceId };
      }
      if (message?.type === 'panel.close') closeUi();
      if (message?.type === 'page.rescan') command('rescan');
      if (message?.type === 'page.getState') return Promise.resolve(summarize(state.value));
      if (message?.type === 'panel.forcePlan') command('forceVariation', message.payload);
      if (message?.type === 'panel.executeForce') command('executeForcePlan', message.payload);
      if (message?.type === 'panel.pauseEvents') eventsPaused = Boolean(message.value);
      if (message?.type === 'page.networkEvent' && message.event && !eventsPaused) {
        const incoming = parseEvent(message.event);
        if (!incoming) { report('Rejected event record', 'Unsupported event shape'); return; }
        state.value = { ...state.value, events: [...state.value.events, incoming].slice(-5000) };
        void send({ type: 'page.event', event: incoming }).catch(() => {});
      }
    });
    browser.runtime.onMessage.addListener(onRuntimeMessage);
    cleanup.push(() => browser.runtime.onMessage.removeListener(onRuntimeMessage));
    const journeyTimer = window.setInterval(() => { if (isAlive() && uiMounted) void send({ type: 'journey.get' }).then(value => { if (isAlive()) journey.value = value || null; }).catch(error => report('Could not load journey', error)); }, 2500);
    cleanup.push(() => window.clearInterval(journeyTimer));
    const healthTimer = window.setInterval(() => { isAlive(); }, 1000);
    cleanup.push(() => window.clearInterval(healthTimer));
    window.postMessage({ namespace: '__splitscope__', nonce: 'bootstrap', type: 'hello' }, '*');
    console.info('[Splitscope/bridge] Inspector initialized', { protocol: BRIDGE_PROTOCOL, build: EXTENSION_BUILD, instanceId });
    void settingsLoaded.then(async () => {
      const prior = await send({ type: 'panel.restore' });
      if (isAlive() && settings.value.restorePanel && prior?.open && prior.origin === location.origin) {
        if (document.readyState === 'loading') await new Promise<void>(resolve => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
        await ensureUi();
      }
    }).catch(error => report('Could not restore panel', error));

    } catch (error) {
      const expired = !isAlive() || /extension context invalidated/i.test(errorText(error));
      dispose();
      if (!expired) diagnostic('bridge', 'Inspector startup failed', error);
    }
  }
});

function summarize(state: PageState) {
  return {
    url: state.url,
    platforms: state.platforms.map((item) => ({ id: item.id, displayName: item.displayName, state: item.result.state })),
    activeCount: state.experiments.filter(item => item.status === 'running-in').length,
    experimentCount: state.experiments.length,
    eventCount: state.events.length,
    experiments: state.experiments.map((item) => ({
      platform: item.platform,
      platformName: state.platforms.find((platform) => platform.id === item.platform)?.displayName || item.platform,
      kind: item.kind,
      id: item.id,
      name: item.name,
      status: item.status,
      assignedVariationId: item.assignedVariationId,
      evidence: item.evidence,
      evaluatedValue: item.evaluatedValue,
      variations: item.variations.map((variation) => ({ id: variation.id, name: variation.name }))
    }))
  };
}

class PanelBoundary extends Component<{ children: ComponentChildren }, { failed: boolean }> {
  override state = { failed: false };
  override componentDidCatch(error: unknown, info: unknown) { diagnostic('bridge', 'Panel render failed', { error, info }); this.setState({ failed: true }); }
  render() {
    if (this.state.failed) return <div class="ss-app ss-panel" style={{ padding: '24px' }}><h2>Splitscope could not display this page’s data</h2><p>Copy these diagnostics and reload the page.</p><textarea readOnly value={JSON.stringify(diagnostics(), null, 2)} style={{ minHeight: '250px' }} /></div>;
    return this.props.children;
  }
}
