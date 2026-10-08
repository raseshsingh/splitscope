/**
 * Reset visitor: forget a platform's stored assignment (and optionally its visitor ID) so the
 * next page load is bucketed again. Most tools bucket from a hash of the visitor ID, so a
 * different variation normally needs the ID reset as well.
 *
 * Pure functions over a small environment object so the logic can be tested without a browser.
 * Names are matched by pattern; the plan lists what was actually found before anything is removed.
 */
export type StorageKind = 'cookie' | 'local' | 'session';
export interface VisitorItem { kind: StorageKind; name: string; platform: string; group: 'assignment' | 'identity' }
export interface VisitorEnv {
  hostname: string;
  pathname: string;
  cookieNames(): string[];
  setCookie(text: string): void;
  keys(kind: 'local' | 'session'): string[];
  remove(kind: 'local' | 'session', key: string): void;
}
interface Group { cookie?: RegExp; storage?: RegExp }
interface Rule { assignment?: Group; identity?: Group }

export const resetRules: Record<string, Rule> = {
  optimizely: { assignment: { cookie: /^optimizely(?!EndUserId)/i, storage: /^optimizely(?!EndUserId)/i }, identity: { cookie: /^optimizelyEndUserId$/i, storage: /^optimizelyEndUserId$/i } },
  'adobe-target': { assignment: { cookie: /^(mbox|at_check|mboxEdgeCluster|at_qa_mode)$/ }, identity: { cookie: /^(AMCV_|AMCVS_|s_ecid$|kndctr_)/ } },
  vwo: { assignment: { cookie: /^(_vis_opt_|debug_vis_opt_|_vwo_(?!uuid))/, storage: /^(_vwo_(?!uuid)|vwo)/i }, identity: { cookie: /^_vwo_uuid/, storage: /^_vwo_uuid/ } },
  kameleoon: { assignment: { cookie: /^kameleoon(?!VisitorCode)/i, storage: /^kameleoon(?!VisitorCode)/i }, identity: { cookie: /^kameleoonVisitorCode$/i, storage: /^kameleoonVisitorCode$/i } },
  'ab-tasty': { assignment: { cookie: /^(ABTasty.+|_abtasty.*)$/i, storage: /^ABTasty/i }, identity: { cookie: /^ABTasty$/ } },
  convert: { assignment: { cookie: /^_conv_(?!v$)/, storage: /^_conv(?!_v$)/ }, identity: { cookie: /^_conv_v$/, storage: /^_conv_v$/ } },
  'dynamic-yield': { assignment: { cookie: /^(_dy(?!id)|dy_)/i, storage: /^(_dy(?!id)|dy_)/i }, identity: { cookie: /^(_dyid|_dyid_server)$/ } },
  monetate: { assignment: { cookie: /^(mt\.(?!v$)|monetate)/i, storage: /^(mt\.(?!v$)|monetate)/i }, identity: { cookie: /^mt\.v$/ } },
  pagesense: { assignment: { cookie: /^pagesense/i, storage: /^pagesense/i } },
  unbounce: { assignment: { cookie: /^ub(vt|pv|vs)$/ } },
  growthbook: { identity: { cookie: /^gbuuid$/, storage: /^gbuuid$/ } },
  statsig: { assignment: { storage: /^statsig\.(?!stable_id)/ }, identity: { storage: /^statsig\.stable_id/ } },
  posthog: { identity: { cookie: /^ph_.+_posthog$/, storage: /^ph_.+_posthog$/ } }
};

export const resettablePlatforms = Object.keys(resetRules);

export function planReset(platforms: string[], env: VisitorEnv, includeIdentity: boolean): VisitorItem[] {
  const items: VisitorItem[] = [];
  const cookies = env.cookieNames();
  const local = env.keys('local');
  const session = env.keys('session');
  for (const platform of platforms) {
    const rule = resetRules[platform];
    if (!rule) continue;
    for (const group of ['assignment', 'identity'] as const) {
      if (group === 'identity' && !includeIdentity) continue;
      const patterns = rule[group];
      if (!patterns) continue;
      if (patterns.cookie) for (const name of cookies) if (patterns.cookie.test(name)) items.push({ kind: 'cookie', name, platform, group });
      if (patterns.storage) {
        for (const key of local) if (patterns.storage.test(key)) items.push({ kind: 'local', name: key, platform, group });
        for (const key of session) if (patterns.storage.test(key)) items.push({ kind: 'session', name: key, platform, group });
      }
    }
  }
  // A name matched by two platforms (for example a shared prefix) is removed once.
  const seen = new Set<string>();
  return items.filter(item => { const key = `${item.kind}:${item.name}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

/** Host-only plus every parent domain, because cookies are often set on the registrable domain. */
export function cookieDomains(hostname: string): Array<string | undefined> {
  const domains: Array<string | undefined> = [undefined];
  if (!hostname || /^[\d.]+$/.test(hostname) || hostname.includes(':')) return domains;
  const labels = hostname.split('.');
  for (let index = 0; index < labels.length - 1; index++) {
    const domain = labels.slice(index).join('.');
    domains.push(domain, `.${domain}`);
  }
  return domains;
}

function cookiePaths(pathname: string): string[] {
  const paths = ['/'];
  const parts = pathname.split('/').filter(Boolean);
  let current = '';
  for (const part of parts.slice(0, -1)) { current += `/${part}`; paths.push(current); }
  return paths;
}

export function runReset(items: VisitorItem[], env: VisitorEnv): { cleared: VisitorItem[]; remaining: VisitorItem[] } {
  const domains = cookieDomains(env.hostname);
  const paths = cookiePaths(env.pathname);
  for (const item of items) {
    try {
      if (item.kind === 'cookie') {
        for (const domain of domains) for (const path of paths) env.setCookie(`${item.name}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}${domain ? `; domain=${domain}` : ''}`);
      } else env.remove(item.kind, item.name);
    } catch { /* reported as remaining below */ }
  }
  const cookies = new Set(env.cookieNames());
  const local = new Set(env.keys('local'));
  const session = new Set(env.keys('session'));
  const present = (item: VisitorItem) => item.kind === 'cookie' ? cookies.has(item.name) : item.kind === 'local' ? local.has(item.name) : session.has(item.name);
  return { cleared: items.filter(item => !present(item)), remaining: items.filter(present) };
}

export function browserEnv(): VisitorEnv {
  const store = (kind: 'local' | 'session') => { try { return kind === 'local' ? window.localStorage : window.sessionStorage; } catch { return null; } };
  return {
    hostname: (globalThis as any).location?.hostname ?? '',
    pathname: (globalThis as any).location?.pathname ?? '/',
    cookieNames: () => { try { return (document.cookie || '').split(';').map(part => part.split('=')[0]!.trim()).filter(Boolean); } catch { return []; } },
    setCookie: text => { document.cookie = text; },
    keys: kind => { const area = store(kind); if (!area) return []; const keys: string[] = []; try { for (let index = 0; index < area.length; index++) { const key = area.key(index); if (key != null) keys.push(key); } } catch {} return keys; },
    remove: (kind, key) => { store(kind)?.removeItem(key); }
  };
}
