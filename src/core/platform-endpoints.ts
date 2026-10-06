import type { PlatformId } from './model';
import { isTargetEndpoint } from './target-evidence';
const domains: Array<[PlatformId, string[]]> = [
  ['optimizely', ['optimizely.com']], ['vwo', ['visualwebsiteoptimizer.com', 'vwo.com']],
  ['kameleoon', ['kameleoon.com', 'kameleoon.eu', 'kameleoon.io']], ['ab-tasty', ['abtasty.com']],
  ['convert', ['convertexperiments.com']], ['dynamic-yield', ['dynamicyield.com', 'dy.com']],
  ['unbounce', ['unbounce.com', 'ubembed.com', 'unbouncepages.com', 'ubpages.com']],
  ['monetate', ['monetate.net', 'monetate.com']], ['pagesense', ['pagesense.io', 'pagesense.com']],
  ['onesignal', ['onesignal.com']], ['growthbook', ['growthbook.io']],
  ['statsig', ['statsigapi.net', 'statsig.com']], ['posthog', ['posthog.com']],
];
/** Domain boundaries avoid matching unrelated hosts containing a vendor's name. */
export function identifyEndpoint(raw: string, base?: string): PlatformId | undefined {
  try {
    const url = new URL(raw, base);
    if (isTargetEndpoint(url.href)) return 'adobe-target';
    return domains.find(([, hosts]) => hosts.some(host => url.hostname === host || url.hostname.endsWith('.' + host)))?.[0];
  } catch { return undefined; }
}
