import preact from '@preact/preset-vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: [],
  vite: () => ({ plugins: [preact()], build: { minify: false, sourcemap: true } }),
  hooks: { 'build:manifestGenerated': (_wxt, manifest) => { if (manifest.action) delete manifest.action.default_popup; delete manifest.options_ui; delete manifest.options_page; } },
  manifest: {
    action: { default_title: 'Splitscope — open page inspector', default_icon: 'icons/idle.png' },
    name: 'Splitscope',
    description: 'Inspect experiments, variations, and platform events on the page.',
    version: '0.1.10',
    minimum_chrome_version: '116',
    permissions: ['storage', 'scripting', 'webRequest', 'activeTab'],
    host_permissions: ['<all_urls>'],
    commands: {
      'toggle-panel': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'Show or hide the Splitscope panel'
      }
    },
    web_accessible_resources: [
      { resources: ['assets/*', 'chunks/*'], matches: ['<all_urls>'], use_dynamic_url: true }
    ],
  }
});
