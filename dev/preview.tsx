import { emptyWorkspace } from '../src/core/qa/workspace';
import { beginJourney, recordSnapshot, type Journey } from '../src/core/qa/journey';
import type { EventExpectation } from '../src/core/qa/expectations';
// Design fixture only. This entry point is never included in the extension build.
import { render } from 'preact';
import { signal } from '@preact/signals';
import App from '../src/ui/panel/App';
import { emptyPageState } from '../src/core/state';
import { defaultSettings } from '../src/core/settings';
import '../src/ui/panel/panel.css';
const state = signal({ ...emptyPageState('https://example.com/shop'), page: { title: 'Example shop — design fixture', referrer: '', readyState: 'complete' }, platforms: [{ id: 'optimizely', displayName: 'Optimizely', result: { state: 'active', confidence: 1, signals: ['window.optimizely.get'] }, capabilities: { listAll: 'full', listActive: true, forceVariation: 'none', trafficSplit: 'partial', changes: 'partial', events: true, notes: {} } }], experiments: [
{ platform: 'optimizely', id: '10248', name: 'Product page • clearer delivery promise', kind: 'ab', status: 'running-in', variations: [{ id: '201', name: 'Original', weight: 50 }, { id: '202', name: 'Delivery beside price', weight: 50, changes: [{ type: 'html', selector: '.delivery', code: '<span>Free delivery on orders over $50</span>' }] }], assignedVariationId: '202', source: ['runtime-api'], raw: { id: '10248' } },
{ platform: 'optimizely', id: '10261', name: 'Welcome offer for returning visitors', kind: 'personalization', status: 'bucketed-elsewhere', variations: [{ id: '301', name: 'Welcome back' }], assignedVariationId: '301', source: ['snippet-data'], raw: {} }
], events: [{ id: 'one', t: Date.now(), platform: 'optimizely', name: 'add_to_cart', category: 'custom', via: 'api-call', properties: { product: { id: 'SKU-108', name: 'Everyday tote' }, quantity: 1, revenue: 4900 }, pageUrl: 'https://example.com/shop' }, { id: 'two', t: Date.now() - 1000, platform: 'page', name: 'Route /shop', category: 'pageview', via: 'listener', properties: { path: '/shop' } }] } as any);
const settings = signal(defaultSettings);
const workspace = signal(emptyWorkspace());
const expectations = signal<EventExpectation[]>([]);
const journey = signal<Journey | null>(null);
render(<><div style={{ padding: '50px', maxWidth: '500px', font: '18px system-ui', color: '#3c4c65' }}><small>DESIGN PREVIEW · SAMPLE DATA</small><h1>Inspect the experience.</h1><p>The panel uses the production components. Vendor capture is not running on this preview page.</p><button onClick={() => { const event = { id: crypto.randomUUID(), t: Date.now(), platform: 'datalayer', name: 'add_to_cart', category: 'custom', via: 'api-call', properties: { product_id: 'SKU-108', value: 49, currency: 'USD' } }; state.value = { ...state.value, events: [...state.value.events, event] }; }}>Generate sample add_to_cart event</button><p class="delivery">Free delivery on orders over $50</p></div><App workspace={workspace} onWorkspace={value => workspace.value = value} expectations={expectations} onExpectations={value => expectations.value = value} journey={journey} onJourney={action => { if (action === 'start') { const value = beginJourney('https://example.com'); recordSnapshot(value, state.value); journey.value = value; } else if (action === 'stop' && journey.value) journey.value = { ...journey.value, recording: false, endedAt: Date.now() }; else journey.value = null; }} state={state} requestedExperiment={signal(null)} settings={settings} onSettings={value => settings.value = value} onClose={() => {}} onRescan={() => {}} onPauseEvents={() => {}} onForceRequest={() => {}} onForceExecute={() => {}} /></>, document.getElementById('app')!);
