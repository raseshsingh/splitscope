import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
export default defineConfig({ plugins: [preact()], resolve: { alias: { "wxt/browser": new URL("./mock-browser.ts", import.meta.url).pathname } }, server: { host: '127.0.0.1', port: 5178, strictPort: true } });
