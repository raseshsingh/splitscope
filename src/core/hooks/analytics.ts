import type { RuntimeEmitter } from './runtime';
import type { CapturedEvent } from '../model';
// Capture only future calls. Never replay a queue or invoke a tracking method.
export function installAnalytics(emit: RuntimeEmitter, enabled: () => boolean, cleanups: Array<() => void>) {
  const wrapped = new WeakSet<Function>(); let insideGtag = 0;
  const win = window as any;
  function wrap(owner: any, key: string, observe: (args: any[], self: any) => void, gtag = false) {
    if (!owner || typeof owner[key] !== 'function' || wrapped.has(owner[key])) return;
    const original = owner[key];
    const replacement = function(this: any, ...args: any[]) {
      if (enabled()) { try { observe(args, this); } catch {} }
      if (gtag) insideGtag++;
      try { return Reflect.apply(original, this, args); } finally { if (gtag) insideGtag--; }
    };
    wrapped.add(replacement);
    try { owner[key] = replacement; if (owner[key] === replacement) cleanups.push(() => { if (owner[key] === replacement) owner[key] = original; }); } catch {}
  }
  function capture(platform: CapturedEvent['platform'], name: string, properties: unknown, category: CapturedEvent['category'] = 'custom') {
    emit({ platform, name, properties, category, via: 'api-call' });
  }
  function tag(args: any[]) {
    if (args[0] === 'event') capture('ga4', String(args[1]), args[2]);
    else if (args[0] === 'consent') capture('ga4', 'gtag.consent', { command: args[1], values: args[2] }, 'consent');
  }
  const refresh = () => {
    if (!enabled()) return;
    wrap(win, 'gtag', args => tag(args), true);
    wrap(win.dataLayer, 'push', args => {
      for (const item of args) {
        if (item && typeof item === 'object' && typeof item.event === 'string') capture('datalayer', item.event, item);
        else if (!insideGtag && item && typeof item === 'object' && item[0]) tag(Array.from(item));
      }
    });
    for (const method of ['track', 'page', 'identify', 'group', 'alias']) wrap(win.analytics, method, args => {
      capture('segment', method === 'track' ? String(args[0]) : `analytics.${method}`, method === 'track' ? args[1] : args, method === 'page' ? 'pageview' : method === 'track' ? 'custom' : 'identity');
    });
    const instances = new Set([win.s, ...(Array.isArray(win.s_c_il) ? win.s_c_il.filter((item: any) => item?._c === 's_c') : [])]);
    for (const instance of instances) for (const method of ['t', 'tl']) wrap(instance, method, (args, self) => {
      const values: Record<string, unknown> = {};
      for (const key of Object.keys(self)) if (/^(events|products|pageName|channel|campaign|eVar\d+|prop\d+|contextData|linkTrackVars|linkTrackEvents)$/.test(key)) {
        const descriptor = Object.getOwnPropertyDescriptor(self, key); if (descriptor && 'value' in descriptor) values[key] = descriptor.value;
      }
      capture('adobe-analytics', method === 'tl' ? String(args[2] || 's.tl') : 's.t', { ...values, arguments: args }, method === 't' ? 'pageview' : 'custom');
    });
  };
  refresh(); const timer = setInterval(refresh, 500); cleanups.push(() => clearInterval(timer));
  return refresh;
}

export function analyticsEndpoint(raw: string): CapturedEvent['platform'] | undefined {
  try {
    const url = new URL(raw, location.href), host = url.hostname;
    if ((host === 'google-analytics.com' || host.endsWith('.google-analytics.com')) && /\/g\/collect$/.test(url.pathname)) return 'ga4';
    if ((host === 'api.segment.io' || host.endsWith('.segment.io')) && /^\/v1\/(track|page|identify|group|alias|batch|t|p|i|g|a|b)$/.test(url.pathname)) return 'segment';
    if ((host.endsWith('.sc.omtrdc.net') || host.endsWith('.2o7.net')) && url.pathname.startsWith('/b/ss/')) return 'adobe-analytics';
  } catch {}
}
