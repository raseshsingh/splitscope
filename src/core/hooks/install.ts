import { queueKameleoonPreview } from './kameleoon-preview';
import { isTargetEndpoint } from '../target-evidence';
import { diagnostic } from '../diagnostics';
import { parseBridgeMessage } from '../bridge/protocol';
import { sanitize } from '../sanitize';
import type { CapturedEvent, DetectionRecord, NormalizedExperiment, PlatformId } from '../model';
import type { AnyRecord, HookHelpers, PageAdapter } from './runtime';

const platformHosts: Array<[RegExp, PlatformId]> = [
  [/optimizely|logx\.optimizely/i, 'optimizely'], 
  [/visualwebsiteoptimizer|vwo\.com/i, 'vwo'], [/kameleoon/i, 'kameleoon'], [/abtasty|ariane\.abtasty/i, 'ab-tasty'],
  [/convertexperiments/i, 'convert'], [/dynamicyield|dy\.com/i, 'dynamic-yield'], [/unbounce|ubembed/i, 'unbounce'],
  [/monetate/i, 'monetate'], [/pagesense/i, 'pagesense'], [/onesignal/i, 'onesignal']
];

export interface HookSnapshot {
  url: string;
  capturedAt: number;
  platforms: DetectionRecord[];
  experiments: NormalizedExperiment[];
  page: { title: string; referrer: string; readyState: string };
}

export function installHookEngine(adapters: PageAdapter[]): void {
  const globalWindow = window as unknown as AnyRecord;
  if (globalWindow.__splitscopeHookInstalled) return;
  globalWindow.__splitscopeHookInstalled = true;
  const nonce = makeNonce();
  const queued: Array<{ type: 'snapshot' | 'event' | 'status'; payload: unknown }> = [];
  const cleanups: Array<() => void> = [];
  const refreshHooks: Array<() => void> = [];
  const experiments = new Map<string, NormalizedExperiment>();
  const observed = new Map<string, NormalizedExperiment>();
  let observedUrl = location.href;
  const evidenceTimes = new Map<string, { signature: string; at: number }>();
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

  const post = (type: 'snapshot' | 'event' | 'status', payload: unknown) => {
    if (stopped) return;
    if (!connected && queued.length < 1000) queued.push({ type, payload: sanitize(payload, type === 'snapshot' ? 2_000_000 : 200_000, type === 'snapshot' ? 16 : 10) });
    else window.postMessage({ namespace: '__splitscope__', nonce, type, payload: sanitize(payload, type === 'snapshot' ? 2_000_000 : 200_000, type === 'snapshot' ? 16 : 10) }, '*');
  };

  const emit: HookHelpers['emit'] = (event) => {
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
      properties: sanitize(event.properties),
      pageUrl: String(sanitize(location.href)),
      caller: event.caller || caller
    };
    post('event', normalized);
    if (adapterById.has(event.platform as PlatformId)) observedPlatforms.add(event.platform as PlatformId);
    if (!eventRefreshTimer) eventRefreshTimer = window.setTimeout(() => { eventRefreshTimer = 0; publish(); }, 100);
  };

  const helpers: HookHelpers = {
    emit,
    wrapQueue(name, platform, eventName, category) {
      trapGlobal(name, (value) => helpers.wrapMethod(value as AnyRecord, 'push', platform, eventName, category));
      refreshHooks.push(() => helpers.wrapMethod(win[name], 'push', platform, eventName, category));
    },
    wrapMethod(target, method, platform, eventName, category, observe) {
      if (typeof target === 'function') {
        const resolve = target;
        const attach = () => { try { helpers.wrapMethod(resolve(), method, platform, eventName, category, observe); } catch {} };
        refreshHooks.push(attach); attach(); return;
      }
      if (!target || typeof target[method] !== 'function') return;
      const original = target[method] as (...args: unknown[]) => unknown;
      if ((original as AnyRecord).__splitscopeWrapped) return;
      const wrapper = function (this: unknown, ...args: unknown[]) {
        try {
          const command = args[0] as AnyRecord | undefined;
          if (!(platform === 'optimizely' && ['addListener', 'removeListener'].includes(command?.type) && String(command?.token).startsWith('splitscope:'))) emit({ platform, category: category || inferCategory(String(eventName?.(args) || method)), name: String(eventName?.(args) || method), properties: args, via: 'api-call' });
        } catch {}
        const result = Reflect.apply(original, this, args);
        if (observe) {
          const inspect = (value: unknown) => { try { observe(args, value); } catch {} };
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
    addExperiment(experiment) {
      if (!experiment.id) return;
      if (observedUrl !== location.href) { observed.clear(); observedUrl = location.href; }
      observed.set(`${experiment.platform}:${experiment.id}`, experiment);
    },
    addCleanup(fn) { cleanups.push(fn); }
  };

  function trapGlobal(name: string, apply: (value: unknown) => void): void {
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
        set(value) { current = value; try { apply(value); } catch {} }
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
    for (const refresh of refreshHooks) refresh();
    experiments.clear();
    if (observedUrl !== location.href) { observed.clear(); observedUrl = location.href; }
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
    hasPlatforms = platforms.length > 0;
    return {
      url: location.href,
      capturedAt: Date.now(),
      platforms,
      experiments: Array.from(experiments.values()).map(item => {
        if (item.evidence) return item;
        const key = item.platform + ':' + item.id;
        const signature = JSON.stringify([location.href, item.status, item.assignedVariationId]);
        const previous = evidenceTimes.get(key);
        const at = previous?.signature === signature ? previous.at : Date.now();
        evidenceTimes.set(key, { signature, at });
        return { ...item, evidence: { state: item.status === 'running-in' ? 'assigned' as const : item.status === 'bucketed-elsewhere' ? 'stored' as const : 'detected' as const, observedAt: at, pageUrl: location.href } };
      }),
      page: { title: document.title, referrer: document.referrer, readyState: document.readyState }
    };
  }

  function publish(): void { post('snapshot', scan()); }

  function handleCommand(message: ReturnType<typeof parseBridgeMessage>): void {
    if (!message || message.type !== 'command' || !message.payload || typeof message.payload !== 'object') return;
    const payload = message.payload as AnyRecord;
    if (payload.name === 'refresh' || payload.name === 'rescan') { publish(); return; }
    if (payload.name === 'stop') { stop(); return; }
    if (payload.name === 'forceVariation') {
      const adapter = adapterById.get(payload.platform as PlatformId);
      try {
        if (payload.platform === 'ab-tasty') throw new Error('Use a vendor QA link for this integration.');
        const experiment = adapter?.listExperiments().find(item => item.id === String(payload.experimentId));
        if (!experiment?.variations.some(item => item.id === String(payload.variationId))) throw new Error('Variation is no longer available. Refresh first.');
        const plan = adapter?.force?.(String(payload.experimentId), String(payload.variationId), location.href);
        if (!plan) throw new Error('Variation switching is unavailable.');
        preparedPlan = plan as AnyRecord;
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
    window.clearInterval(helloTimer);
    cleanups.reverse().forEach((cleanup) => { try { cleanup(); } catch {} });
    window.removeEventListener('message', onWindowMessage);
  }

  function onWindowMessage(event: MessageEvent): void {
    if (event.source !== window) return;
    const message = parseBridgeMessage(event.data);
    if (message?.type === 'hello' && message.nonce === 'bootstrap') { window.postMessage({ namespace: '__splitscope__', nonce, type: 'hello' }, '*'); return; }
    if (!message || message.nonce !== nonce) return;
    if (message.type === 'ready') {
      connected = true;
      window.clearInterval(helloTimer);
      for (const item of queued.splice(0)) window.postMessage({ namespace: '__splitscope__', nonce, ...item }, '*');
      publish();
    } else if (message.type === 'command') handleCommand(message);
  }

  window.addEventListener('message', onWindowMessage);
  applyPendingForce((message, error) => { diagnostic('preview', message, error); post('status', { message, error: error ? String(error) : undefined }); });
  for (const adapter of adapters) {
    try { adapter.install(helpers); } catch (error) { diagnostic('hook', `Could not install ${adapter.displayName} hooks`, error); }
  }
  installNetworkHooks(emit, cleanups);
  installHistoryHooks(emit, cleanups, publish);
  const retryUntilReady = () => {
    if (!connected && performance.now() - started < 1500) window.postMessage({ namespace: '__splitscope__', nonce, type: 'hello' }, '*');
    else window.clearInterval(helloTimer);
  };
  helloTimer = window.setInterval(retryUntilReady, 40);
  publish();
  const scanTimer = window.setInterval(() => {  if (!document.hidden) publish(); }, 1500);
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

function applyPendingForce(report: (message: string, error?: unknown) => void): void {
  try {
    const url = new URL(location.href);
    const vwoMarker = url.searchParams.get('__splitscope_vwo');
    if (vwoMarker !== null) {
      url.searchParams.delete('__splitscope_vwo');
      history.replaceState(history.state, '', url.href);
      if (!/^\d+:\d+$/.test(vwoMarker)) throw new Error('Invalid VWO preview IDs.');
      const [experimentId, variationId] = vwoMarker.split(':');
      const win = window as any;
      (win.VWO || (win.VWO = [])).push(['setVariation', [{ e: experimentId, v: variationId }]]);
    }
    const marker = url.searchParams.get('__splitscope_kameleoon');
    if (marker !== null) {
      url.searchParams.delete('__splitscope_kameleoon');
      history.replaceState(history.state, '', url.href);
      queueKameleoonPreview(window, marker, url.href, next => location.replace(next), report);
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

function makeNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function captureCaller(): string | undefined {
  try {
    const frame = new Error().stack?.split('\n').slice(2).find((line) => !line.includes('chrome-extension://') && !line.includes('splitscope'));
    return frame?.trim().slice(0, 500);
  } catch { return undefined; }
}

function inferCategory(name: string): CapturedEvent['category'] {
  if (/revenue|purchase/i.test(name)) return 'revenue';
  if (/conversion|goal/i.test(name)) return 'goal';
  if (/identify|login|logout|user/i.test(name)) return 'identity';
  if (/consent/i.test(name)) return 'consent';
  if (/activate|decision|variation|bucket/i.test(name)) return 'activation';
  return 'custom';
}

function installNetworkHooks(emit: HookHelpers['emit'], cleanups: Array<() => void>): void {
  const classify = (raw: string) => { try { const url = new URL(raw, location.href); return isTargetEndpoint(url.href) ? 'adobe-target' as const : platformHosts.find(([pattern]) => pattern.test(url.hostname))?.[1]; } catch { return undefined; } };
  const originalFetch = window.fetch;
  const fetchWrapper: typeof window.fetch = function (this: Window, input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const platform = classify(url);
    if (platform) emit({ platform, category: 'network', name: `${init?.method || 'GET'} ${safeUrl(url)}`, properties: { body: safeBody(init?.body), mode: init?.mode }, via: 'network', caller: captureCaller() });
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
    const platform = request ? classify(request.url) : undefined;
    if (platform) emit({ platform, category: 'network', name: `${request.method} ${safeUrl(request.url)}`, properties: { body: safeBody(body) }, via: 'network', caller: captureCaller() });
    return Reflect.apply(xhrSend, this, [body]);
  } as typeof xhrSend;
  XMLHttpRequest.prototype.open = openWrapper;
  XMLHttpRequest.prototype.send = sendWrapper;
  cleanups.push(() => { if (XMLHttpRequest.prototype.open === openWrapper) XMLHttpRequest.prototype.open = xhrOpen; if (XMLHttpRequest.prototype.send === sendWrapper) XMLHttpRequest.prototype.send = xhrSend; });

  if (typeof navigator.sendBeacon === 'function') {
    const sendBeacon = navigator.sendBeacon;
    const sendBeaconWrapper: typeof navigator.sendBeacon = function (this: Navigator, url: string | URL, data?: BodyInit | null) {
      const platform = classify(String(url));
      if (platform) emit({ platform, category: 'network', name: `beacon ${safeUrl(String(url))}`, properties: { body: safeBody(data) }, via: 'network', caller: captureCaller() });
      return Reflect.apply(sendBeacon, this, [url, data]);
    };
    navigator.sendBeacon = sendBeaconWrapper;
    cleanups.push(() => { if (navigator.sendBeacon === sendBeaconWrapper) navigator.sendBeacon = sendBeacon; });
  }
}

function safeUrl(raw: string): string {
  try { const url = new URL(raw, location.href); return `${url.origin}${url.pathname}`; } catch { return raw.slice(0, 250); }
}

function safeBody(body: unknown): unknown {
  if (typeof body !== 'string') return body == null ? body : `[${Object.prototype.toString.call(body)}]`;
  if (body.length > 20_000) return `${body.slice(0, 20_000)}…[truncated]`;
  try { return sanitize(JSON.parse(body)); } catch { return sanitize(body); }
}

function installHistoryHooks(emit: HookHelpers['emit'], cleanups: Array<() => void>, publish: () => void): void {
  const onRoute = () => {
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
