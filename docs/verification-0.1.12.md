# Verification — 0.1.12

Completed October 7, 2026.

## Automated checks

- Production Chrome MV3 build completed through `npm test`.
- 40 tests: **39 passed, 0 failed, 1 skipped**. The optional Accor engine check requires a separately downloaded vendor script that was not supplied.
- TypeScript check (`npx tsc --noEmit`) passed.
- Patch whitespace check (`git diff --check`) passed.

Coverage includes function source serialization without execution, nested vendor payloads, Optimizely referenced variations, Adobe offer/proposition associations, long source, bridge lifecycle and background registration, Journey storage, and compiled panel rendering.

The compiled panel walkthrough covers all main sections and applicable activity tabs, search, pinning, copy/save source contents, wrapping, event expansion and capture controls, CSV/report exports, baseline comparison, Journey start/stop/export/delete, workspace export/reset, and preview confirmation including opening a new tab. Tests use browser API substitutes; they do not substitute for live vendor integration checks.

## Browser review

Used the local sample page with the production UI components. Reviewed Activities, Events, Page, Tools (Report, Compare, Journey, Workspace), and Settings. Changed theme/text size, saved a baseline, started/stopped a Journey, and completed an event check with a generated matching event. Clearing the event log retained the completed check result. No warning/error console entries were observed during that walkthrough.

Confirmed that Optimizely JavaScript and Adobe Target HTML/script source are readable in expandable code views. CSS and HTML changes remain separate disclosures. Captures:

- [Optimizely source](optimizely-code-preview.png)
- [Adobe Target offer](target-code-preview.png)

The browser download-event observer did not return a result. Export file contents were verified through Blob assertions in the compiled panel tests; an actual file save through the browser UI remains unconfirmed.

## Fixes found during verification

- Opening a specific panel section now accepts Page and Tools in addition to Activities, Events and Settings.
- Download links are attached to the document for the click and removed afterward.
- The sample page now includes both Optimizely function/CSS/HTML content and an Adobe Target offer parsed through the adapter reader.

## Remaining scope

Live customer sites and every SDK/version have not been exercised in this pass. Availability depends on what each platform exposes in the browser. Private/server-side code, unloaded variations, and native/bound function bodies cannot be reconstructed. See [code inspection details](code-inspection.md) for capture and redaction limits.

Reload the extension from `.output/chrome-mv3` in Chrome, then reload the inspected website so the updated bridge and source capture are active.
