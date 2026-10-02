import type { PageAdapter } from '../core/hooks/runtime';
import { detection, normalizedExperiment } from '../core/hooks/runtime';
import { sanitize } from '../core/sanitize';

export const unbounceAdapter: PageAdapter = {
  id: 'unbounce', displayName: 'Unbounce', category: 'experimentation',
  detect() {
    const win = window as any;
    if (win.ub?.page || win.lp || document.querySelector('.lp-pom-body')) return detection('active', [win.ub?.page ? 'window.ub.page' : 'Unbounce landing-page markup'], win.ub?.page ? 0.98 : 0.78);
    if (/unbouncepages\.com|ubpages\.com/.test(location.hostname)) return detection('active', ['Unbounce hosted domain'], 0.72);
    if (document.querySelector('script[src*="ubembed.com"]')) return detection('loading', ['Unbounce embed script'], 0.7);
    return detection('blocked', [], 0);
  },
  listExperiments() {
    const page = (window as any).ub?.page;
    if (!page?.id && !page?.variantId) return [];
    const id = String(page.id || location.pathname);
    const variationId = String(page.variantId || page.variant || 'a');
    return [normalizedExperiment({ platform: 'unbounce', id, campaignId: id, name: page.name || `Landing page ${id}`, kind: 'split-url', status: 'running-in', variations: [{ id: variationId, name: `Variant ${variationId.toUpperCase()}` }], assignedVariationId: variationId, source: ['runtime-api'], raw: sanitize(page) })];
  },
  install(helpers) {
    helpers.wrapMethod(() => (window as any).ub, 'track', 'unbounce', (args) => String((args[0] as any)?.name || args[0] || 'Unbounce track'), 'goal');
    helpers.wrapMethod(() => (window as any).ub, 'submitForm', 'unbounce', () => 'Unbounce form submission', 'goal');
  },
  force(experimentId, variationId, pageUrl) {
    const url = new URL(pageUrl);
    const letter = variationId.replace(/^variant\s*/i, '').toLowerCase();
    const path = url.pathname.replace(/\/[a-z]\.html$/i, '');
    url.pathname = `${path}/${letter}.html`;
    return { method: 'url', url: url.href, tracking: 'disabled', explanation: 'Unbounce opens the page variant directly. These QA visits are not counted in Unbounce test statistics.' };
  }
};
