# Splitscope

Manifest V3 Chrome extension for CRO and experimentation QA. The current development build includes the WXT foundation, a document-start page hook, an isolated Preact panel, platform detection, first-tier experiment readers, a live event feed, experiment search, detail views, and a confirmation flow for adapter-provided variation switching.

## Load the extension

1. Install dependencies with `npm install`.
2. Build the Chrome extension with `npm run build`.
3. Open `chrome://extensions` and enable **Developer mode**.
4. Select **Load unpacked** and choose `.output/chrome-mv3`.
5. Open a website and click the Splitscope toolbar button. The inspector opens on the page directly.

The keyboard command **Alt+Shift+S** toggles the panel.

## Current adapter coverage

The current build has detection adapters for: Adobe Target, Optimizely, VWO, Kameleoon, AB Tasty, Convert, Dynamic Yield, Unbounce, Monetate, Zoho PageSense, and OneSignal. Optimizely, VWO, Kameleoon, AB Tasty, and Convert have initial experiment readers. Other adapters expose runtime details when the page makes them available. OneSignal is presented as an engagement SDK, not an A/B experimentation tool.

The hook observes API commands, documented lifecycle events, selected page-world network calls, and image-pixel requests. The event buffer is memory-only by default. Enabling **Keep event log across page loads** stores a sanitized session log in Chrome session storage and restores it when the page loads again.

Variation switching is still in active development. The confirmation dialog shows the adapter's proposed method and its reported tracking impact. Runtime formats and force behaviour need verification against live platform installs before relying on them for client QA. Safe mode, dataLayer capture, a complete forcing reset workflow, and the remaining adapter detail readers are not implemented yet. The existing plan uses Kameleoon; Chameleon is a separate product and is not implemented.

## Development commands

- `npm run dev` — run WXT in development mode
- `npm run build` — create the unpacked Chrome MV3 extension
- `npm run zip` — package the Chrome extension
- `npx tsc --noEmit` — check TypeScript types

Live-site Phase 0 validation remains necessary before claiming verified support for undocumented runtime fields, variation weights, or variation forcing behavior.

## Redesigned workspace

- Active-first activities, platform/type filters, assignment explanations and copyable IDs.
- Event rows keep payloads hidden until expanded; nested objects expand separately.
- Event search, category/platform filters, pause, clear and filtered CSV export.
- QA reports with notes, assignment comparison, selector outlines and overlap hints.
- Shared popup/panel/settings design, light/dark themes, larger text and docking.

After rebuilding, reload Splitscope in `chrome://extensions`, then reload the website. Existing pages still contain the previous content scripts until reloaded.

See [implementation review](docs/implementation-review.md) for architecture decisions, delivered changes, limitations and remaining roadmap work.

For the sample-data design preview, run `npx vite --config dev/vite.config.ts` and open `http://127.0.0.1:5178/dev/`. Popup and settings previews are `/dev/popup.html` and `/dev/options.html`. This preview does not exercise vendor capture or extension APIs.

## On-page controls and diagnostics

The settings gear opens inside the page panel. **Restore panel after reload** is enabled by default: an open panel reopens on the same site in that tab; closing it prevents reopening. Activities refresh automatically every 1.5 seconds while the page is visible, with additional refreshes on route changes and captured events. The fixed top strip identifies detected platforms.

The toolbar icon is green when a platform is detected and gray otherwise; its badge reports activities explicitly active for this visitor. A zero means a platform was detected without confirmed active activities.

Preview offers current-tab and new-tab choices. Tabs share visitor cookies. Convert uses its vendor preview URL. Kameleoon A/B assignment is queued before engine activation and may count in reports; personalization requires a vendor simulation link. Kameleoon/VWO preview URLs require Splitscope in the destination tab because the extension consumes their temporary parameters before the SDK loads.

For errors, open **Settings → Copy diagnostics**, or copy console messages starting with **[Splitscope/bridge]** or **[Splitscope/hook]**. Production builds currently retain readable JavaScript and `.map` files for troubleshooting. Include the affected website URL, action taken, and error stack. Review diagnostics before sharing.

See [preview and detection changes](docs/preview-and-detection.md) for the API references and remaining live-site verification needs.

### Regression checks

`npm test` rebuilds the Chrome extension and runs adapter, detail-view and compiled bridge lifecycle checks. An optional Accor compatibility check uses a separately downloaded public Kameleoon engine: `SPLITSCOPE_KAMELEOON_ENGINE=/path/to/engine.js npm test`. It executes only the extracted assignment function, not the website or tracking engine. See [0.1.2 investigation and limits](docs/preview-and-detection.md).

After upgrading to 0.1.2, reload Splitscope on `chrome://extensions` and refresh existing website tabs once. Old scripts already injected into those tabs cannot be updated by rebuilding the extension folder alone.
