import { serializeSnapshot } from '../bridge/snapshot';
import { pageKey } from '../page-key';
import { classifyTarget } from '../adobe-target/wire';
import { EXTENSION_BUILD } from '../extension/messages';
import { analyticsEndpoint, installAnalytics } from './analytics';
import { queueKameleoonPreview } from './kameleoon-preview';
import { identifyEndpoint } from '../platform-endpoints';
import { diagnostic } from '../diagnostics';
import { parseBridgeMessage } from '../bridge/protocol';
import { sanitize } from '../sanitize';
import type { CapturedEvent, DetectionRecord, NormalizedExperiment, PlatformId } from '../model';
import type { AnyRecord, HookHelpers, PageAdapter } from './runtime';

export interface HookSnapshot {
  url: string;
  capturedAt: number;
  platforms: DetectionRecord[];
  experiments: NormalizedExperiment[];
  page: { title: string; referrer: string; readyState: string };
}

const HOOK_KEY = Symbol.for('splitscope.hook');

export function installHookEngine(adapters: PageAdapter[]): void {
  // A re-injected hook (after an extension update or reload) replaces the running one instead of being blocked by it.
  // The handle is a non-enumerable symbol, not a named window property.
  const existing = (window as any)[HOOK_KEY] as { stop?: () => void } | undefined;
  if (existing) { try { existing.stop?.(); } catch {} }
  const handle = { stop: () => stop() };
  try { Object.defineProperty(window, HOOK_KEY, { value: handle, configurable: true, enumerable: false }); } catch {}
  const nonce = makeNonce();
  const queued: Array<{ type: 'snapshot' | 'event' | 'status'; payload: unknown }> = [];
  const cleanups: Array<() => void> = [];
  const refreshHooks: Array<() => void> = [];
  const experiments = new Map<string, NormalizedExperiment>();
  const observed = new Map<string, NormalizedExperiment>();
  let observedPage = pageKey();
  // Activities observed on the previous page are kept, demoted, until something on the new page replaces them.
  let previousObserved = new Map<string, NormalizedExperiment>();
  const routeChanged = () => {
    if (pageKey() === observedPage) return;
    const from = observedPage;
    previousObserved = new Map([...observed].map(([key, item]) => [key, { ...item, status: 'unknown' as const, statusReason: `Observed on the previous page (${(() => { try { return new URL(from).pathname; } catch { return from; } })()}). Not seen on this page yet.`, evidence: item.evidence ? { ...item.evidence, state: 'detected' as const } : undefined }]));
    observed.clear(); evidenceTimes.clear(); observedPage = pageKey();
    pollBoost = performance.now();
  };
  // One shared timer for every adapter's attach loop: fast while a page settles, slow afterwards, idle in hidden tabs.
  const pollTasks = new Set<{ run: () => void; next: number }>();
  let pollBoost = performance.now();
  const poll = (run: () => void) => {
    const task = { run, next: 0 };
    pollTasks.add(task);
    try { run(); } catch {}
    return () => { pollTasks.delete(task); };
  };
  const pollTimer = window.setInterval(() => {
    if (document.hidden || !pollTasks.size) return;
    const now = performance.now(), fast = now - pollBoost < 30000;
    for (const task of pollTasks) { if (now < task.next) continue; task.next = now + (fast ? 500 : 5000); try { task.run(); } catch {} }
  }, 500);
  const evidenceTimes = new Map<string, { signature: string; at: number }>();
  let analyticsEnabled = false;
  let refreshAnalytics = () => {};
  let preparedPlan: AnyRecord | undefined;
  const observedPlatforms = new Set<PlatformId>();
  let eventRefreshTimer = 0;
  let hasPlatforms = false;
  let connected = false;
  let stopped = false;
  let helloTimer = 0;
  const started = performance.now();
  const win = window as unknown as AnyRecord;
  const adapterById = new Map(adapters.map((adapter) => [adapter.id, adapter]));

  let lastSnapshotKey = '';
  let lastSignature = '';
  let panelOpen = false;
  let lastSnapshotSent = 0;
  let scanCost = 0;
  let lastPublishAt = 0;
  const post = (type: 'snapshot' | 'event' | 'status', payload: unknown) => {
    const targetWire = type === 'event' && (payload as any)?.properties?.schema === 'target-wire-v1';
    if (stopped) return;
    if (type === 'snapshot' && connected) {
      // A cheap fingerprint first: most scans change nothing, and serializing can cost megabytes.
      const signature = snapshotSignature(payload as HookSnapshot);
      if (signature && signature === lastSignature && performance.now() - lastSnapshotSent < 15000) return;
      lastSignature = signature;
    }
    const clean = type === 'snapshot' ? serializeSnapshot(payload as HookSnapshot) : sanitize(payload, targetWire ? 400_000 : 200_000, targetWire ? 20 : 10);
    if (type === 'snapshot' && connected) {
      // Skip unchanged snapshots (apart from a periodic heartbeat) so large projects do not re-send megabytes every scan.
      let key = ''; try { key = JSON.stringify({ ...(clean as AnyRecord), capturedAt: 0 }); } catch {}
      const now = performance.now();
      if (key && key === lastSnapshotKey && now - lastSnapshotSent < 15000) return;
      lastSnapshotKey = key; lastSnapshotSent = now;
    }
    if (!connected && queued.length < 1000) queued.push({ type, payload: clean });
    else window.postMessage({ namespace: '__splitscope__', nonce, type, payload: clean }, '*');
  };

  const emit: HookHelpers['emit'] = (event) => {
    try {
    const caller = captureCaller();
    const references = (Array.isArray(event.properties) ? event.properties.find(value => value && typeof value === 'object' && ('experimentId' in value || 'activityId' in value)) : event.properties) as AnyRecord | undefined;
    const referenceId = references?.experimentId ?? references?.activityId;
    const variationId = references?.variationId;
    const normalized: CapturedEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      t: performance.timeOrigin + performance.now(),
      ...event,
      experimentId: event.experimentId ?? (typeof referenceId === 'string' || typeof referenceId === 'number' ? String(referenceId) : undefined),
      variationId: event.variationId ?? (typeof variationId === 'string' || typeof variationId === 'number' ? String(variationId) : undefined),
      properties: sanitize(event.properties, (event.properties as any)?.schema === 'target-wire-v1' ? 400_000 : 256_000, (event.properties as any)?.schema === 'target-wire-v1' ? 20 : 14),
      pageUrl: String(sanitize(location.href)),
      caller: event.caller || caller
    };
    post('event', normalized);
    if (adapterById.has(event.platform as PlatformId)) observedPlatforms.add(event.platform as PlatformId);
    if (!eventRefreshTimer) eventRefreshTimer = window.setTimeout(() => { eventRefreshTimer = 0; publish(); }, Math.max(100, Math.min(5000, scanCost * 4)));
    } catch { /* Observation must not interrupt the site's original API or request. */ }
  };

  const helpers: HookHelpers = {
    emit,
    onGlobal(name, apply) {
      trapGlobal(name, (value) => { if (value !== undefined && value !== null) apply(value); });
    },
    wrapQueue(name, platform, eventName, category) {
      trapGlobal(name, (value) => helpers.wrapMethod(value as AnyRecord, 'push', platform, eventName, category));
      refreshHooks.push(() => helpers.wrapMethod(win[name], 'push', platform, eventName, category));
    },
    wrapMethod(target, method, platform, eventName, category, observe, link) {
      if (typeof target === 'function') {
        const resolve = target;
        const attach = () => { try { helpers.wrapMethod(resolve(), method, platform, eventName, category, observe, link); } catch {} };
        refreshHooks.push(attach); attach(); return;
      }
      if (!target || typeof target[method] !== 'function') return;
      const original = target[method] as (...args: unknown[]) => unknown;
      if ((original as AnyRecord).__splitscopeWrapped) return;
      const wrapper = function (this: unknown, ...args: unknown[]) {
        try {
          const command = args[0] as AnyRecord | undefined;
          const linked = link?.(args);
          if (!(platform === 'optimizely' && ['addListener', 'removeListener'].includes(command?.type) && String(command?.token).startsWith('splitscope:')) && !ownCommand(command)) emit({ ...linked, platform, category: (typeof category === 'function' ? category(args) : category) || inferCategory(String(eventName?.(args) || method)), name: String(eventName?.(args) || method), properties: args, via: 'api-call' });
        } catch {}
        const callPage = pageKey();
        const result = Reflect.apply(original, this, args);
        if (observe) {
          const inspect = (value: unknown) => { try { if (pageKey() === callPage) observe(args, value); } catch {} };
          if (result && typeof (result as any).then === 'function') void Promise.resolve(result).then(inspect, () => {});
          else inspect(result);
        }
        return result;
      } as typeof original & AnyRecord;
      Object.defineProperty(wrapper, '__splitscopeWrapped', { value: true });
      try {
        target[method] = wrapper;
        if (target[method] === wrapper) cleanups.push(() => { if (target[method] === wrapper) target[method] = original; });
      } catch {}
    },
    listen(name, handler) {
      const listener = (event: Event) => {
        try { handler(event); } catch {}
      };
      window.addEventListener(name, listener, true);
      cleanups.push(() => window.removeEventListener(name, listener, true));
    },
    clean: sanitize,
    analyticsEnabled: () => analyticsEnabled,
    addExperiment(experiment) {
      if (!experiment.id) return;
      routeChanged();
      previousObserved.delete(`${experiment.platform}:${experiment.id}`);
      observed.set(`${experiment.platform}:${experiment.id}`, { ...experiment, evidence: experiment.evidence || { state: experiment.status === 'running-in' ? 'assigned' : experiment.status === 'bucketed-elsewhere' ? 'stored' : 'detected', observedAt: Date.now(), pageUrl: location.href } });
    },
    invalidate(platform) { for (const [key, item] of observed) if (item.platform === platform) observed.delete(key); for (const [key, item] of previousObserved) if (item.platform === platform) previousObserved.delete(key); },
    addCleanup(fn) { cleanups.push(fn); },
    poll(fn) { const cancel = poll(fn); cleanups.push(cancel); return cancel; }
  };

  // Several watchers can follow one global (a queue wrapper and a listener registration, for example).
  const globalWatchers = new Map<string, Array<(value: unknown) => void>>();
  function trapGlobal(name: string, apply: (value: unknown) => void): void {
    const existing = globalWatchers.get(name);
    if (existing) { existing.push(apply); if (win[name] !== undefined) { try { apply(win[name]); } catch {} } return; }
    const watchers = [apply];
    globalWatchers.set(name, watchers);
    const notify = (value: unknown) => { for (const watcher of watchers.slice()) { try { watcher(value); } catch {} } };
    const descriptor = Object.getOwnPropertyDescriptor(window, name);
    if (descriptor && !descriptor.configurable) {
      try { apply(win[name]); } catch {}
      return;
    }
    if (descriptor?.get || descriptor?.set) {
      try { apply(win[name]); } catch {}
      return;
    }
    let current = descriptor?.value;
    if (current !== undefined) { try { apply(current); } catch {} }
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        get() { return current; },
        set(value) { current = value; notify(value); }
      });
      cleanups.push(() => {
        const active = Object.getOwnPropertyDescriptor(window, name);
        if (!active?.get) return;
        if (descriptor) Object.defineProperty(window, name, 'value' in descriptor ? { ...descriptor, value: current } : descriptor);
        else { delete win[name]; if (current !== undefined) win[name] = current; }
      });
    } catch {}
  }

  function scan(): HookSnapshot {
    const platforms: DetectionRecord[] = [];
    for (const refresh of refreshHooks) { try { refresh(); } catch {} }
    experiments.clear();
    routeChanged();
    for (const [key, value] of observed) experiments.set(key, value);
    for (const adapter of adapters) {
      try {
        let result = adapter.detect();
        if (observedPlatforms.has(adapter.id) && result.confidence <= 0) result = { state: 'detected', confidence: 0.95, signals: ['Observed platform call or event'] };
        if (result.version != null) result = { ...result, version: String(result.version) };
        if (result.confidence <= 0 || result.signals.length === 0) continue;
        platforms.push({ id: adapter.id, displayName: adapter.displayName, result, capabilities: capabilities(adapter.id) });
        for (const experiment of adapter.listExperiments()) { const key = `${experiment.platform}:${experiment.id}`; if (!observed.has(key)) experiments.set(key, experiment); }
      } catch (error) {
        diagnostic('hook', `Could not read ${adapter.displayName}`, error);
        if (!platforms.some(item => item.id === adapter.id) && observedPlatforms.has(adapter.id)) platforms.push({ id: adapter.id, displayName: adapter.displayName, result: { state: 'detected', confidence: 0.95, signals: ['Observed platform call; runtime read failed'] }, capabilities: capabilities(adapter.id) });
        post('status', { platform: adapter.id, message: `Could not read ${adapter.displayName} runtime data.`, error: String(error) });
      }
    }
    for (const [key, value] of previousObserved) if (!experiments.has(key)) experiments.set(key, value);
    hasPlatforms = platforms.length > 0;
    return {
      url: location.href,
      capturedAt: Date.now(),
      platforms,
      experiments: Array.from(experiments.values()).map(item => {
        if (item.evidence) return item;
        const key = item.platform + ':' + item.id;
        const signature = JSON.stringify([pageKey(), item.status, item.assignedVariationId]);
        const previous = evidenceTimes.get(key);
        const at = previous?.signature === signature ? previous.at : Date.now();
        evidenceTimes.set(key, { signature, at });
        if (evidenceTimes.size > 3000) evidenceTimes.delete(evidenceTimes.keys().next().value!);
        return { ...item, evidence: { state: item.status === 'running-in' ? 'assigned' as const : item.status === 'bucketed-elsewhere' ? 'stored' as const : 'detected' as const, observedAt: at, pageUrl: location.href } };
      }),
      page: { title: document.title, referrer: document.referrer, readyState: document.readyState }
    };
  }

  function publish(): void {
    const begin = performance.now();
    post('snapshot', scan());
    lastPublishAt = performance.now();
    // Remember how expensive a scan is so heavy pages are rescanned less often.
    scanCost = scanCost ? scanCost * 0.7 + (lastPublishAt - begin) * 0.3 : lastPublishAt - begin;
  }
  function forcePublish(): void { lastSnapshotKey = ''; lastSignature = ''; publish(); }

  function handleCommand(message: ReturnType<typeof parseBridgeMessage>): void {
    if (!message || message.type !== 'command' || !message.payload || typeof message.payload !== 'object') return;
    const payload = message.payload as AnyRecord;
    if (payload.name === 'targetProbe') {
      const target = (window as any).adobe?.target;
      const name = typeof payload.mbox === 'string' ? payload.mbox.trim() : '';
      if (!name || name.length > 250 || typeof target?.getOffers !== 'function') { post('status', { error: 'A valid mbox name and at.js getOffers are required.' }); return; }
      // Prefetch avoids the automatic execute impression; never apply the returned offer.
      void Promise.resolve().then(() => target.getOffers({request:{prefetch:{mboxes:[{name,index:0}]}}})).then(response => {
        emit({platform:'adobe-target', category:'decision', name:'Target mbox probe: '+name, via:'api-call', properties:sanitize(response,400_000)});
        post('status',{message:'Target probe completed; inspect Events and Target Raw.'});
      }).catch(error=>post('status',{error:String(error)})); return;
    }
    if (payload.name === 'platformAction') {
      const adapter = adapterById.get(payload.platform as PlatformId);
      const action = typeof payload.action === 'string' ? payload.action : '';
      const reply = (body: AnyRecord) => post('status', { message: 'platform-result', requestId: message.requestId, platform: payload.platform, action, ...body });
      try {
        const handler = adapter?.actions && Object.prototype.hasOwnProperty.call(adapter.actions, action) ? adapter.actions[action] : undefined;
        if (!handler) throw new Error('This action is not available for this platform.');
        const args = payload.args && typeof payload.args === 'object' && !Array.isArray(payload.args) ? payload.args as AnyRecord : {};
        void Promise.resolve().then(() => handler.call(adapter, args)).then(result => { reply({ result }); publish(); }, error => reply({ error: String((error as any)?.message || error) }));
      } catch (error) { reply({ error: String((error as any)?.message || error) }); }
      return;
    }
    if (payload.name === 'captureOptions') {
      analyticsEnabled = payload.analytics === true; refreshAnalytics();
      if (typeof payload.panelOpen === 'boolean') { const opened = payload.panelOpen && !panelOpen; panelOpen = payload.panelOpen; if (opened) forcePublish(); }
      return;
    }
    if (payload.name === 'refresh' || payload.name === 'rescan') { forcePublish(); return; }
    if (payload.name === 'stop') { stop(); return; }
    if (payload.name === 'forceVariation') {
      const adapter = adapterById.get(payload.platform as PlatformId);
      try {
        if (payload.platform === 'ab-tasty') throw new Error('Use a vendor QA link for this integration.');
        const experiment = adapter?.listExperiments().find(item => item.id === String(payload.experimentId));
        if (!experiment?.variations.some(item => item.id === String(payload.variationId))) throw new Error('Variation is no longer available. Refresh first.');
        const plan = withPreviewToken(adapter?.force?.(String(payload.experimentId), String(payload.variationId), location.href) as AnyRecord | undefined);
        if (!plan) throw new Error('Variation switching is unavailable.');
        preparedPlan = plan;
        post('status', { message: 'force-plan', requestId: message.requestId, request: { platform: payload.platform, experimentId: payload.experimentId, variationId: payload.variationId, experiment: payload.experimentName, variation: payload.variationName }, plan });
      } catch (error) { post('status', { message: 'force-error', requestId: message.requestId, error: String(error) }); }
      return;
    }
    if (payload.name === 'executeForcePlan' && payload.plan && typeof payload.plan === 'object') {
      try {
        if (!preparedPlan || JSON.stringify(payload.plan) !== JSON.stringify(sanitize(preparedPlan, 200_000, 10))) throw new Error('Preview expired. Select the variation again.');
        const plan = preparedPlan; preparedPlan = undefined; executeForcePlan(plan);
      }
      catch (error) { post('status', { message: 'force-error', requestId: message.requestId, error: String(error) }); }
    }
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(eventRefreshTimer);
    window.clearInterval(helloTimer);
    window.clearInterval(pollTimer); pollTasks.clear();
    cleanups.reverse().forEach((cleanup) => { try { cleanup(); } catch {} });
    window.removeEventListener('message', onWindowMessage);
    try { if ((window as any)[HOOK_KEY] === handle) delete (window as any)[HOOK_KEY]; } catch {}
  }

  function onWindowMessage(event: MessageEvent): void {
    if (event.source !== window) return;
    const message = parseBridgeMessage(event.data);
    // Answer the bridge's bootstrap only until it connects; afterwards the nonce is no longer handed to anyone who asks.
    if (message?.type === 'hello' && message.nonce === 'bootstrap') { if (connected) return; window.postMessage({ namespace: '__splitscope__', nonce, type: 'hello', payload: { build: EXTENSION_BUILD } }, '*'); return; }
    if (!message || message.nonce !== nonce) return;
    if (message.type === 'ready') {
      connected = true;
      window.clearInterval(helloTimer);
      for (const item of queued.splice(0)) window.postMessage({ namespace: '__splitscope__', nonce, ...item }, '*');
      forcePublish();
    } else if (message.type === 'command') handleCommand(message);
  }

  window.addEventListener('message', onWindowMessage);
  applyPendingForce((message, error) => { diagnostic('preview', message, error); post('status', { message, error: error ? String(error) : undefined }); });
  for (const adapter of adapters) {
    try { adapter.install(helpers); } catch (error) { diagnostic('hook', `Could not install ${adapter.displayName} hooks`, error); }
  }
  refreshAnalytics = installAnalytics(emit, () => analyticsEnabled, cleanups, poll);
  installNetworkHooks(emit, cleanups, () => analyticsEnabled);
  installHistoryHooks(emit, cleanups, publish);
  const retryUntilReady = () => {
    if (!connected && performance.now() - started < 1500) window.postMessage({ namespace: '__splitscope__', nonce, type: 'hello', payload: { build: EXTENSION_BUILD } }, '*');
    else window.clearInterval(helloTimer);
  };
  helloTimer = window.setInterval(retryUntilReady, 40);
  publish();
  // Rescan every 1.5s while the page settles, then every 3s: long-lived pages stop paying for rescans nobody needs.
  let scanTick = 0;
  // With the panel closed only the toolbar badge needs data, so scan at most every 10 seconds.
  const scanTimer = window.setInterval(() => { scanTick++; if (document.hidden || (performance.now() - started > 30000 && scanTick % 2)) return; const since = performance.now() - lastPublishAt; if (since < Math.min(20000, scanCost * 12) || (!panelOpen && connected && since < 10000)) return; publish(); }, 1500);
  cleanups.push(() => window.clearInterval(scanTimer));

  function executeForcePlan(plan: AnyRecord): void {
    if (plan.method === 'url' && typeof plan.url === 'string') { const url = new URL(plan.url); if (url.origin !== location.origin) throw new Error('Preview must stay on this site.'); location.assign(url.href); return; }
    if (plan.method === 'pre-snippet-api') {
      sessionStorage.setItem('__splitscope_pending_force__', JSON.stringify(plan.commands));
      location.reload(); return;
    }
    if (plan.method === 'runtime-api-then-reload' && typeof plan.op === 'string') {
      if (plan.op !== 'Kameleoon.API.Experiments.assignVariation') throw new Error('Unsupported preview operation.');
      const fn = plan.op.split('.').reduce((value: any, key: string) => value?.[key], window as any);
      if (typeof fn !== 'function') throw new Error('The platform force API is no longer available.');
      const ownerPath = plan.op.split('.').slice(0, -1);
      const owner = ownerPath.reduce((value: any, key: string) => value?.[key], window as any);
      fn.apply(owner, Array.isArray(plan.args) ? plan.args : []);
      location.reload(); return;
    }
    throw new Error('Unsupported preview method. Use a vendor QA link.');
  }
}

/** Changes whenever anything the panel lists changes; raw detail alone is refreshed by the 15 second heartbeat. */
export function snapshotSignature(snapshot: HookSnapshot): string {
  try {
    return JSON.stringify([snapshot.url, snapshot.page.title, snapshot.platforms.map(p => [p.id, p.result.state, p.result.confidence, p.result.signals.length]),
      snapshot.experiments.map(e => { let value = ''; try { value = JSON.stringify(e.evaluatedValue)?.slice(0, 200) ?? ''; } catch {} return [e.platform, e.id, e.name, e.status, e.statusReason, e.assignedVariationId, e.kind, e.evidence?.state, e.evidence?.observedAt, value, e.changes?.length, e.variations.map(v => [v.id, v.name, v.weight, v.changes?.length])]; })]);
  } catch { return ''; }
}

function applyPendingForce(report: (message: string, error?: unknown) => void): void {
  try {
    const url = new URL(location.href);
    const vwoMarker = url.searchParams.get('__splitscope_vwo');
    const kameleoonMarker = url.searchParams.get('__splitscope_kameleoon');
    if (vwoMarker !== null || kameleoonMarker !== null) {
      // A marker applies only with a one time token this browser issued when the user chose the preview,
      // so a shared or emailed link cannot rebucket a visitor.
      const token = url.searchParams.get('__splitscope_token');
      for (const name of ['__splitscope_vwo', '__splitscope_kameleoon', '__splitscope_token']) url.searchParams.delete(name);
      history.replaceState(history.state, '', url.href);
      if (!consumePreviewToken(token)) { report('Ignored a preview link that was not started from Splitscope in this browser.'); }
      else applyMarkers(vwoMarker, kameleoonMarker, url.href, report);
    }

    const serialized = sessionStorage.getItem('__splitscope_pending_force__');
    if (!serialized) return;
    const commands = JSON.parse(serialized);
    sessionStorage.removeItem('__splitscope_pending_force__');
    if (!Array.isArray(commands)) return;
    const globals = window as any;
    for (const command of commands) {
      if (!Array.isArray(command) || command[0] !== 'setVariation') continue;
      const vwo = globals.VWO || (globals.VWO = []);
      if (typeof vwo.push === 'function') vwo.push(command);
    }
  } catch (error) { report('Could not apply pending preview', error); }
}

function capabilities(id: PlatformId) {
  const data: Record<PlatformId, any> = {
    growthbook: { listAll: 'partial', listActive: true, forceVariation: 'none', trafficSplit: 'partial', changes: 'partial', events: true, notes: { listAll: 'Requires an exposed SDK instance. Cached results are not current-page proof.', forcing: 'Use GrowthBook developer tools for overrides.' } },
    statsig: { listAll: 'partial', listActive: true, forceVariation: 'none', trafficSplit: 'none', changes: 'none', events: true, notes: { listAll: 'Only observed client evaluations are listed; private and server evaluations are unavailable.', forcing: 'Use the vendor QA tools for overrides.' } },
    posthog: { listAll: 'partial', listActive: true, forceVariation: 'none', trafficSplit: 'none', changes: 'none', events: true, notes: { listAll: 'Flag values do not establish experiment membership. Only the default exposed instance is inspected.', forcing: 'Use the PostHog toolbar for overrides.' } },
    optimizely: { listAll: 'full', listActive: true, forceVariation: 'url', trafficSplit: 'partial', changes: 'partial', events: true, notes: {} },
    vwo: { listAll: 'full', listActive: true, forceVariation: 'url', trafficSplit: 'full', changes: 'partial', events: true, notes: {} },
    kameleoon: { listAll: 'full', listActive: true, forceVariation: 'url', trafficSplit: 'full', changes: 'partial', events: true, notes: {} },
    'ab-tasty': { listAll: 'full', listActive: true, forceVariation: 'none', trafficSplit: 'partial', changes: 'partial', events: true, notes: {} },
    convert: { listAll: 'full', listActive: true, forceVariation: 'url', trafficSplit: 'full', changes: 'full', events: true, notes: {} },
    'adobe-target': { listAll: 'partial', listActive: true, forceVariation: 'preview-link', trafficSplit: 'none', changes: 'partial', events: true, notes: {} },
    'dynamic-yield': { listAll: 'partial', listActive: true, forceVariation: 'preview-link', trafficSplit: 'partial', changes: 'partial', events: true, notes: {} },
    unbounce: { listAll: 'partial', listActive: true, forceVariation: 'url', trafficSplit: 'none', changes: 'none', events: true, notes: {} },
    monetate: { listAll: 'partial', listActive: true, forceVariation: 'preview-link', trafficSplit: 'partial', changes: 'partial', events: true, notes: {} },
    pagesense: { listAll: 'partial', listActive: true, forceVariation: 'preview-link', trafficSplit: 'partial', changes: 'partial', events: true, notes: {} },
    onesignal: { listAll: 'none', listActive: false, forceVariation: 'none', trafficSplit: 'none', changes: 'none', events: true, notes: { listAll: 'OneSignal is a messaging platform, not a page experiment platform.' } }
  };
  return data[id];
}

function applyMarkers(vwoMarker: string | null, kameleoonMarker: string | null, cleanUrl: string, report: (message: string, error?: unknown) => void): void {
  if (vwoMarker !== null) {
    if (!/^\d+:\d+$/.test(vwoMarker)) throw new Error('Invalid VWO preview IDs.');
    const [experimentId, variationId] = vwoMarker.split(':');
    const win = window as any;
    (win.VWO || (win.VWO = [])).push(['setVariation', [{ e: experimentId, v: variationId }]]);
  }
  if (kameleoonMarker !== null) queueKameleoonPreview(window, kameleoonMarker, cleanUrl, next => location.replace(next), report);
}

const TOKEN_STORE = '__splitscope_preview_tokens__';
function readPreviewTokens(now: number): Record<string, number> {
  const tokens: Record<string, number> = {};
  try {
    const stored = JSON.parse(localStorage.getItem(TOKEN_STORE) || '{}');
    for (const [token, expires] of Object.entries(stored || {})) if (typeof expires === 'number' && expires > now && Object.keys(tokens).length < 20) tokens[token] = expires;
  } catch {}
  return tokens;
}
function writePreviewTokens(tokens: Record<string, number>): void {
  try { if (Object.keys(tokens).length) localStorage.setItem(TOKEN_STORE, JSON.stringify(tokens)); else localStorage.removeItem(TOKEN_STORE); } catch {}
}
/** Add a one time token (valid 10 minutes) to plans that carry a preview marker. */
export function withPreviewToken(plan: AnyRecord | undefined): AnyRecord | undefined {
  if (!plan || typeof plan.url !== 'string' || !/[?&]__splitscope_(vwo|kameleoon)=/.test(plan.url)) return plan;
  const token = makeNonce(), now = Date.now();
  writePreviewTokens({ ...readPreviewTokens(now), [token]: now + 600_000 });
  const url = new URL(plan.url); url.searchParams.set('__splitscope_token', token);
  return { ...plan, url: url.href };
}
export function consumePreviewToken(token: string | null): boolean {
  if (!token) return false;
  const tokens = readPreviewTokens(Date.now());
  const valid = Object.prototype.hasOwnProperty.call(tokens, token);
  delete tokens[token]; writePreviewTokens(tokens);
  return valid;
}

function makeNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function captureCaller(): string | undefined {
  try {
    const frame = new Error().stack?.split('\n').slice(2).find((line) => !line.includes('chrome-extension://') && !line.includes('splitscope'));
    return frame?.trim().slice(0, 500);
  } catch { return undefined; }
}

/** Commands Splitscope itself queues (listener registrations) are marked so they are not logged as site activity. */
function ownCommand(command: unknown): boolean {
  const marked = (value: unknown) => typeof value === 'function' && (value as AnyRecord).__splitscope === true;
  if (!command || typeof command !== 'object') return false;
  const item = command as AnyRecord;
  if (Array.isArray(item)) return item.some(marked);
  return marked(item.handler) || marked(item.params?.handler) || marked(item.command);
}

function inferCategory(name: string): CapturedEvent['category'] {
  if (/revenue|purchase/i.test(name)) return 'revenue';
  if (/conversion|goal/i.test(name)) return 'goal';
  if (/identify|login|logout|set.?user|user.?id/i.test(name)) return 'identity';
  if (/consent/i.test(name)) return 'consent';
  if (/activate|decision|variation|bucket/i.test(name)) return 'activation';
  return 'custom';
}

function installNetworkHooks(emit: HookHelpers['emit'], cleanups: Array<() => void>, analytics: () => boolean): void {
  const classify = (raw: string) => { try { const url = new URL(raw, location.href); return identifyEndpoint(url.href) || (analytics() ? analyticsEndpoint(url.href) : undefined); } catch { return undefined; } };
  // Adobe Target and Analytics fetch/XHR requests are recorded by the Target inspector with full detail; one row per request.
  const ownedByTarget = (raw: string) => { try { return Boolean(classifyTarget(new URL(raw, location.href).href)); } catch { return false; } };
  const originalFetch = window.fetch;
  const fetchWrapper: typeof window.fetch = function (this: Window, input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const platform = ownedByTarget(url) ? undefined : classify(url);
    if (platform) emit({ platform, category: 'network', name: `${init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')} ${safeUrl(url)}`, properties: { query: analytics() && analyticsEndpoint(url) ? queryValues(url) : undefined, body: safeBody(init?.body), mode: init?.mode }, via: 'network', caller: captureCaller() });
    return Reflect.apply(originalFetch, this, [input, init]);
  };
  window.fetch = fetchWrapper;
  cleanups.push(() => { if (window.fetch === fetchWrapper) window.fetch = originalFetch; });

  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  const urlKey = '__splitscope_url__';
  const openWrapper: typeof xhrOpen = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
    (this as any)[urlKey] = { method, url: String(url) };
    return Reflect.apply(xhrOpen, this, [method, url, ...rest]);
  } as typeof xhrOpen;
  const sendWrapper: typeof xhrSend = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const request = (this as any)[urlKey];
    const platform = request && !ownedByTarget(request.url) ? classify(request.url) : undefined;
    if (platform) emit({ platform, category: 'network', name: `${request.method} ${safeUrl(request.url)}`, properties: { query: analytics() && analyticsEndpoint(request.url) ? queryValues(request.url) : undefined, body: safeBody(body) }, via: 'network', caller: captureCaller() });
    return Reflect.apply(xhrSend, this, [body]);
  } as typeof xhrSend;
  XMLHttpRequest.prototype.open = openWrapper;
  XMLHttpRequest.prototype.send = sendWrapper;
  cleanups.push(() => { if (XMLHttpRequest.prototype.open === openWrapper) XMLHttpRequest.prototype.open = xhrOpen; if (XMLHttpRequest.prototype.send === sendWrapper) XMLHttpRequest.prototype.send = xhrSend; });

  if (typeof navigator.sendBeacon === 'function') {
    const sendBeacon = navigator.sendBeacon;
    const sendBeaconWrapper: typeof navigator.sendBeacon = function (this: Navigator, url: string | URL, data?: BodyInit | null) {
      const platform = classify(String(url));
      if (platform) emit({ platform, category: 'network', name: `beacon ${safeUrl(String(url))}`, properties: { query: analytics() && analyticsEndpoint(String(url)) ? queryValues(String(url)) : undefined, body: safeBody(data) }, via: 'network', caller: captureCaller() });
      return Reflect.apply(sendBeacon, this, [url, data]);
    };
    navigator.sendBeacon = sendBeaconWrapper;
    cleanups.push(() => { if (navigator.sendBeacon === sendBeaconWrapper) navigator.sendBeacon = sendBeacon; });
  }
}

function safeUrl(raw: string): string {
  try { const url = new URL(raw, location.href); return `${url.origin}${url.pathname}`; } catch { return raw.slice(0, 250); }
}

function queryValues(raw: string) { try { return sanitize(Object.fromEntries(new URL(raw, location.href).searchParams)); } catch { return undefined; } }

function safeBody(body: unknown): unknown {
  if (typeof body !== 'string') return body == null ? body : `[${Object.prototype.toString.call(body)}]`;
  if (body.length > 20_000) return `${body.slice(0, 20_000)}…[truncated]`;
  try { return sanitize(JSON.parse(body)); } catch { return sanitize(body); }
}

function installHistoryHooks(emit: HookHelpers['emit'], cleanups: Array<() => void>, publish: () => void): void {
  let lastHref = pageKey();
  const onRoute = () => {
    // Frameworks often call replaceState with the same URL; that is not a navigation.
    if (pageKey() === lastHref) { publish(); return; }
    lastHref = pageKey();
    emit({ platform: 'page', category: 'pageview', name: `Route ${location.pathname}`, properties: { url: location.href }, via: 'listener' });
    publish();
  };
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method];
    const wrapped: typeof original = function (this: History, ...args) {
      const result = Reflect.apply(original, this, args);
      queueMicrotask(onRoute);
      return result;
    };
    history[method] = wrapped;
    cleanups.push(() => { if (history[method] === wrapped) history[method] = original; });
  }
  window.addEventListener('popstate', onRoute);
  window.addEventListener('hashchange', onRoute);
  cleanups.push(() => { window.removeEventListener('popstate', onRoute); window.removeEventListener('hashchange', onRoute); });
}
