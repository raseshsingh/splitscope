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

The current build has detection adapters for: Adobe Target, Optimizely, VWO, Kameleoon, AB Tasty, Convert, Dynamic Yield, Unbounce, Monetate, Zoho PageSense, OneSignal, GrowthBook, Statsig, and PostHog. Optimizely, VWO, Kameleoon, AB Tasty, and Convert have initial experiment readers. Other adapters expose runtime details when the page makes them available. OneSignal is presented as an engagement SDK, not an A/B experimentation tool.

The hook observes API commands, documented lifecycle events, selected page-world network calls, and image-pixel requests. The event buffer is memory-only by default. Enabling **Keep event log across page loads** stores a sanitized session log in Chrome session storage and restores it when the page loads again.

Variation switching is still in active development. The confirmation dialog shows the adapter's proposed method and its reported tracking impact. Runtime formats and force behaviour need verification against live platform installs before relying on them for client QA. Safe mode and universal visitor-assignment reset are not implemented. Preview reset restores URL parameters and direct variant paths changed by Splitscope; persistent vendor assignments require vendor controls. The existing plan uses Kameleoon; Chameleon is a separate product and is not implemented.

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

Preview offers current-tab and new-tab choices. Tabs share visitor cookies. Convert uses its vendor preview URL. Kameleoon A/B assignment waits for the engine, saves and verifies the assignment, then reloads and may count in reports; personalization requires a vendor simulation link. Kameleoon/VWO preview URLs require Splitscope in the destination tab because the extension consumes their temporary parameters before the SDK loads.

For errors, open **Settings → Copy diagnostics**, or copy console messages starting with **[Splitscope/bridge]** or **[Splitscope/hook]**. Production builds currently retain readable JavaScript and `.map` files for troubleshooting. Include the affected website URL, action taken, and error stack. Review diagnostics before sharing.

See [preview and detection changes](docs/preview-and-detection.md) for the API references and remaining live-site verification needs.

### Regression checks

`npm test` rebuilds the Chrome extension and runs adapter, detail-view and compiled bridge lifecycle checks. An optional Accor compatibility check uses a separately downloaded public Kameleoon engine: `SPLITSCOPE_KAMELEOON_ENGINE=/path/to/engine.js npm test`. It executes only the extracted assignment function, not the website or tracking engine. See [0.1.2 investigation and limits](docs/preview-and-detection.md).

After upgrading, reload Splitscope on `chrome://extensions` and refresh existing website tabs once. Old scripts already injected into those tabs cannot be updated by rebuilding the extension folder alone.

## QA workflows (0.1.10)

- **Activities:** evidence distinguishes assigned/delivered, applied, stored, and detected-only states. Pin activities from their detail view; filters and selection are saved per site.
- **Events → Event checks:** save exact event names, source, required property paths, and expected JSON values. Start a check, perform an action, finish, and copy results. Checks accumulate independently of the event list and survive panel reopening in the same document. Reloading ends the check. Paused recording is reported as incomplete; observations cannot establish vendor ingestion.
- **Settings → Capture analytics calls:** opt in to future default dataLayer, Google tag, exposed Segment and AppMeasurement calls, plus recognized outgoing transport endpoints. Renamed globals, private SDKs and first-party proxy endpoints can be unavailable.
- **Tools → Workspace:** local per-origin name, notes, filters, pins, baseline and expectations. Export or clear explicitly. Workspace changes are shared by tabs on the same origin. Exports are sanitized; review before sharing.
- **Tools → Journey:** opt-in tab/session history across reloads and SPA navigation on the starting origin. Other origins are excluded. Stop, export, or delete; starting a new recording requires confirmation before replacing the old one. Retains up to 500 entries / 750 KB plus a bounded decision cache. It does not require Keep event log. Paused capture and missing pre-hook events remain gaps.
- **Tools → Compare:** persistent baseline, timestamp/page, before/after status, variation and feature value.
- **GrowthBook / Statsig / PostHog:** initial observation-only integrations, with no switching controls. Coverage depends on exposed instances; project enumeration is partial. Statsig lists observed evaluations only; PostHog flags are not assumed to be experiments.

See [phase progress and limitations](docs/phase-progress.md). These changes passed compilation and production builds; they have not been verified on live vendor installs.

## October polish pass

Version 0.1.10 simplifies activity filters, keeps event checks collapsed by default, and separates report, comparison, journey and workspace tools. Activity details adapt to flags and experiments. Page and Settings show connection health and provide copyable diagnostics, including background errors.

Runtime changes improve endpoint matching, observation timestamps, navigation handling, preview reset and storage updates. See [polish review](docs/polish-review.md) for completed phases and validation limits.
