import { recordCheck, type CheckRun } from '../src/core/qa/check-run';
import { emptyWorkspace, normalizeWorkspace, type Workspace } from '../src/core/qa/workspace';
import { readJourney, type Journey } from '../src/core/qa/journey';
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
import { mergeEvents, platformNames, confirmedCallIndex, mergeConfirmation } from '../src/core/qa/presentation';
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
    let nonce = '';
    const cleanup: Array<() => void> = [];
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      // Stop the page hook this bridge connected to, so a re-injected hook can take over cleanly.
      if (nonce) { try { window.postMessage({ namespace: '__splitscope__', nonce, type: 'command', requestId: 'dispose', payload: { name: 'stop' } }, '*'); } catch {} }
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
      let receivedReply = false;
      try {
        const reply = await browser.runtime.sendMessage(message);
        receivedReply = true;
        const value = isAlive() ? unwrapReply(reply) : undefined;
        if (isAlive() && state.value.connection?.background !== 'connected') state.value = { ...state.value, connection: { page: 'waiting', ...state.value.connection, background: 'connected' } };
        return value;
      } catch (error) {
        if (!isAlive() || /extension context invalidated/i.test(errorText(error))) { dispose(); return undefined; }
        if (!receivedReply && state.value.connection?.background !== 'unavailable') state.value = { ...state.value, connection: { page: 'waiting', ...state.value.connection, background: 'unavailable' } };
        throw error;
      }
    };
    const state = signal<PageState>({ ...emptyPageState(location.href), connection: { background: 'connecting', page: 'waiting' } });
    const platformEvidence = new Map<string, DetectionRecord>();
    const requestedExperiment = signal<{ platform: string; id: string; requestId: number } | null>(null);
    const settings = signal(defaultSettings);
    const requestedTab = signal<{ tab: PanelTab; requestId: number }>({ tab: 'activities', requestId: 0 });
    void send({ type: 'preview.get' }).then(record => { if (record?.origin === location.origin && Date.now() - record.startedAt < 86400000) { state.value = { ...state.value, preview: record }; requestedExperiment.value = { platform: record.platform, id: record.experimentId, requestId: Date.now() }; } }).catch(error => diagnostic('bridge', 'Could not restore preview', error));
    const workspace = signal<Workspace>(emptyWorkspace());
    const workspaceKey = `splitscope:workspace:${location.origin}`;
    const checkRun = signal<CheckRun | null>(null);
    let journeyRequest = 0;
    let workspaceWrites = Promise.resolve();
    let workspacePending = 0;
    let expectationWrites = Promise.resolve();
    let expectationPending = 0;
    const journey = signal<Journey | null>(null);
    const workspaceLoaded = browser.storage.local.get(workspaceKey).then(value => { workspace.value = normalizeWorkspace(value[workspaceKey]); }).catch(error => diagnostic('bridge', 'Could not load workspace', error));
    const expectations = signal<EventExpectation[]>([]);
    const expectationsKey = `splitscope:expectations:${location.origin}`;
    const expectationsLoaded = browser.storage.local.get(expectationsKey).then(value => { expectations.value = normalizeExpectations(value[expectationsKey]); }).catch(error => diagnostic('bridge', 'Could not load expectations', error));
    const settingsLoaded = send({ type: 'settings.get' }).then(result => { if (isAlive()) { settings.value = normalizeSettings(result?.['splitscope:settings']); sendOptions(); } }).catch(error => diagnostic('bridge', 'Could not load settings', error));
    const onSettingsChanged = (changes: Record<string, any>, area: string) => {
      if (isAlive() && area === 'local') { if (changes[workspaceKey] && !workspacePending) workspace.value = normalizeWorkspace(changes[workspaceKey].newValue); if (changes[expectationsKey] && !expectationPending) expectations.value = normalizeExpectations(changes[expectationsKey].newValue); }
      if (isAlive() && area === 'local' && changes['splitscope:settings']) { settings.value = normalizeSettings(changes['splitscope:settings'].newValue); sendOptions(); }
    };
    browser.storage.onChanged.addListener(onSettingsChanged);
    cleanup.push(() => browser.storage.onChanged.removeListener(onSettingsChanged));
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
          render(<PanelBoundary><App onStorage={action => send({ type: action === 'clear' ? 'storage.clearAll' : 'storage.usage' })} onPlatformAction={platformAction} onTargetAction={async payload => { if (payload.action === 'probe') { command('targetProbe', {mbox:payload.mbox}); return {ok:true}; } return send({ ...payload, type: 'target.command' }); }} checkRun={checkRun} onCheckRun={value => { checkRun.value = value; }} workspace={workspace} onWorkspace={value => { workspace.value = normalizeWorkspace(value); const snapshot = workspace.value; workspacePending++; workspaceWrites = workspaceWrites.then(() => browser.storage.local.set({ [workspaceKey]: snapshot })).catch(error => report('Could not save workspace', error)).finally(() => { workspacePending--; }); }} journey={journey} onJourney={async action => { const request = ++journeyRequest; try { const value = await send({ type: `journey.${action}` }); if (request === journeyRequest) journey.value = readJourney(value); if (action === 'start') command('rescan'); } catch (error) { report('Could not update journey', error); throw error; } }} expectations={expectations} onExpectations={value => { expectations.value = normalizeExpectations(value); const snapshot = expectations.value; expectationPending++; expectationWrites = expectationWrites.then(() => browser.storage.local.set({ [expectationsKey]: snapshot })).catch(error => report('Could not save expectations', error)).finally(() => { expectationPending--; }); }} state={state} initialPaused={eventsPaused} requestedExperiment={requestedExperiment} requestedTab={requestedTab} settings={settings} onSettings={(value) => { settings.value = value; void send({ type: 'settings.set', value }).catch(error => report('Could not save settings', error)); }} onClearEvents={() => { state.value = { ...state.value, events: [] }; void send({ type: 'page.clearEvents' }).catch(error => report('Could not clear saved events', error)); }} onClose={() => closeUi()} onRescan={() => command('rescan')} onPauseEvents={(value) => { eventsPaused = value; if (value && checkRun.value && !checkRun.value.endedAt) checkRun.value = { ...checkRun.value, interrupted: true }; }} onForceRequest={(payload) => command('forceVariation', payload)} onResetPreview={() => { const record = state.value.preview; if (!record) return; void send({ type: 'preview.save', value: null }).then(() => { state.value = { ...state.value, preview: null }; location.assign(resetPreviewUrl(record, location.href)); }).catch(error => report('Could not reset preview', error)); }} onForceExecute={(plan, target, request) => { void (async () => { if (!request) throw new Error('Select a variation again.'); const preview = createPreview(request, plan, location.href, state.value.preview); if (target === 'new' && (plan.method === 'url' || plan.method === 'preview-link')) await send({ type: 'preview.open', url: plan.url, preview }); else { await send({ type: 'preview.save', value: preview }); state.value = { ...state.value, preview }; command('executeForcePlan', { plan }); } })().catch(error => report('Could not start preview', error)); }} /></PanelBoundary>, container);
          return container;
        },
        onRemove(container) { uiMounted = false; if (container) render(null, container); }
      });
      if (!isAlive()) { ui.remove(); throw new Error('Inspector connection expired during mount.'); }
      ui.mount();
      uiMounted = ui.shadowHost.isConnected;
      if (!uiMounted) throw new Error('The website removed the panel while it was opening.');
      sendOptions();
      document.getElementById('splitscope-open-error')?.remove();
      void send({ type: 'panel.remember', open: true }).catch(error => report('Could not remember panel', error));
      } catch (error) { report('Panel mount failed', error); throw error; }
      })().finally(() => { mounting = undefined; });
      return mounting;
    };
    const closeUi = (remember = true) => { const wasOpen = uiMounted; ui?.remove(); uiMounted = false; if (wasOpen) sendOptions(); if (remember && isAlive()) void send({ type: 'panel.remember', open: false }).catch(error => report('Could not save panel state', error)); };
    cleanup.push(() => closeUi(false));
    const report = (message: string, error?: unknown) => { if (!isAlive()) return; const item = diagnostic('bridge', message, error); if (item) state.value = { ...state.value, statuses: [...state.value.statuses.slice(-49), { message, error: error ? errorText(error) : message, diagnostic: item }] }; };
    // Request IDs this bridge issued. Preview plans and errors are accepted only as answers to one of them.
    const issued = new Map<string, number>();
    const command = (name: string, payload: Record<string, unknown> = {}, requestId = `ss-${Date.now()}-${++commandSequence}`) => {
      if (!isAlive()) return;
      issued.set(requestId, Date.now()); if (issued.size > 200) issued.delete(issued.keys().next().value!);
      window.postMessage({ namespace: '__splitscope__', nonce, type: 'command', requestId, payload: { name, ...payload } }, '*');
    };
    const sendOptions = () => command('captureOptions', { analytics: settings.value.analyticsCapture, panelOpen: uiMounted });
    // Ask the page hook to run a platform action and wait for its answer.
    const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: number }>();
    const platformAction = (platform: string, action: string, args: Record<string, unknown> = {}) => new Promise<unknown>((resolve, reject) => {
      if (!isAlive() || !nonce) { reject(new Error('The page is not connected. Reload this website.')); return; }
      const requestId = `pa-${Date.now()}-${++commandSequence}`;
      const timer = window.setTimeout(() => { pending.delete(requestId); reject(new Error('The page did not answer. Reload this website and try again.')); }, 8000);
      pending.set(requestId, { resolve, reject, timer });
      command('platformAction', { platform, action, args }, requestId);
    });
    cleanup.push(() => { for (const item of pending.values()) window.clearTimeout(item.timer); pending.clear(); });

    const handlePageMessage = (event: MessageEvent) => {
      if (!isAlive() || event.source !== window) return;
      const message = parseBridgeMessage(event.data);
      if (!message) { if (event.data?.namespace === '__splitscope__') report('Rejected bridge envelope', 'Invalid shape or message exceeds size limit'); return; }
      if (message.type === 'hello' && message.nonce !== 'bootstrap') {
        if (nonce && nonce !== message.nonce) return;
        nonce = message.nonce;
        const currentBuild = (message.payload as any)?.build === EXTENSION_BUILD;
        state.value = { ...state.value, connection: { background: 'connecting', ...state.value.connection, page: currentBuild ? 'connected' : 'outdated' } };
        if (!currentBuild) report('Reload this website to finish updating Splitscope.');
        console.info('[Splitscope/bridge] Connected to page hook');
        window.postMessage({ namespace: '__splitscope__', nonce, type: 'ready' }, '*');
        sendOptions();
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
          connection: { background: 'connecting', page: 'connected', ...state.value.connection, lastSnapshot: Date.now() },
          platforms: Array.isArray(payload.platforms) ? payload.platforms as DetectionRecord[] : [],
          experiments: Array.isArray(payload.experiments) ? payload.experiments as NormalizedExperiment[] : [],
          page: payload.page || state.value.page
        };
        send({ type: 'page.snapshot', state: { ...summarize(state.value), documentId: instanceId } }).catch(error => report('Could not update toolbar state', error));
      } else if (message.type === 'event' && message.payload && typeof message.payload === 'object') {
        if (eventsPaused) return;
        const incoming = parseEvent(message.payload);
        if (!incoming) { report('Rejected event record', 'Unsupported event shape'); return; }
        // One action, one row: fold the platform's own confirmation into the API call it confirms.
        const confirmed = confirmedCallIndex(state.value.events, incoming);
        if (confirmed >= 0) { const events = state.value.events.slice(); events[confirmed] = mergeConfirmation(events[confirmed]!, incoming); state.value = { ...state.value, events }; return; }
        if (!['page', 'datalayer', 'ga4', 'segment', 'adobe-analytics'].includes(incoming.platform)) {
          const evidence: DetectionRecord = { id: incoming.platform as DetectionRecord['id'], displayName: platformNames[incoming.platform] || incoming.platform, result: { state: 'detected', confidence: 0.9, signals: [`Observed ${incoming.via}: ${incoming.name}`] }, capabilities: { listAll: 'partial', listActive: false, forceVariation: 'none', trafficSplit: 'none', changes: 'none', events: true, notes: {} } };
          platformEvidence.set(incoming.platform, evidence);
          if (!state.value.platforms.some(item => item.id === incoming.platform)) {
            state.value = { ...state.value, platforms: [...state.value.platforms, evidence] };
            void send({ type: 'page.snapshot', state: { ...summarize(state.value), documentId: instanceId } }).catch(error => report('Could not update detected platforms', error));
          }
        }
        checkRun.value = recordCheck(checkRun.value, incoming);
        const events = [...state.value.events, incoming].slice(-5000);
        state.value = { ...state.value, events };
        send({ type: 'page.event', event: incoming, count: events.length }).catch(error => report('Could not save event', error));
      } else if (message.type === 'status' && message.payload && typeof message.payload === 'object') {
        const body = message.payload as Record<string, any>;
        if (typeof body.message === 'string' && body.message.startsWith('force-')) {
          const at = issued.get(String(body.requestId));
          if (!at || Date.now() - at > 60000) { diagnostic('bridge', 'Ignored a preview message that does not answer a Splitscope request'); return; }
          issued.delete(String(body.requestId));
        }
        if (body.message === 'platform-result') {
          const waiting = pending.get(String(body.requestId));
          if (waiting) { pending.delete(String(body.requestId)); window.clearTimeout(waiting.timer); if (body.error) waiting.reject(new Error(String(body.error))); else waiting.resolve(body.result); }
          return;
        }
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
      if (message?.type === 'panel.open') { requestedExperiment.value = null; requestedTab.value = { tab: (['activities', 'events', 'page', 'tools', 'settings'] as string[]).includes(message.tab) ? message.tab as PanelTab : 'activities', requestId: Date.now() }; await ensureUi(); return { ok: true, mounted: uiMounted, instanceId }; }
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
        const incoming = parseEvent({ ...message.event, pageUrl: message.event.pageUrl || location.href });
        if (!incoming) { report('Rejected event record', 'Unsupported event shape'); return; }
        checkRun.value = recordCheck(checkRun.value, incoming);
        state.value = { ...state.value, events: [...state.value.events, incoming].slice(-5000) };
        void send({ type: 'page.event', event: incoming }).catch(() => {});
      }
    });
    browser.runtime.onMessage.addListener(onRuntimeMessage);
    cleanup.push(() => browser.runtime.onMessage.removeListener(onRuntimeMessage));
    const journeyTimer = window.setInterval(() => { if (isAlive() && uiMounted) { const request = journeyRequest; void send({ type: 'journey.get' }).then(value => { if (isAlive() && request === journeyRequest && JSON.stringify(journey.value) !== JSON.stringify(readJourney(value))) journey.value = readJourney(value); }).catch(error => report('Could not load journey', error)); } }, 2500);
    cleanup.push(() => window.clearInterval(journeyTimer));
    let checkingHealth = false;
    const checkHealth = async () => {
      if (!isAlive() || checkingHealth) return;
      checkingHealth = true;
      try { const reply = await send({ type: 'background.ping' }); if (isAlive()) state.value = { ...state.value, connection: { page: 'waiting', ...state.value.connection, background: reply?.ok ? 'connected' : 'unavailable', backgroundDiagnostics: reply?.diagnostics || [] } }; }
      catch { /* send has already updated the visible connection state. */ }
      finally { checkingHealth = false; }
    };
    void checkHealth();
    const healthTimer = window.setInterval(() => { if (isAlive() && uiMounted) void checkHealth(); }, 15000);
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
