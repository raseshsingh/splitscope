# Splitscope

**See what your experimentation tools are doing on the page.**

Splitscope is a Manifest V3 Chrome extension for experimentation, conversion rate optimization (CRO), and implementation QA. It brings activity inspection, variation previews, custom code, event payloads, and QA evidence into a panel on the website you are inspecting.

It helps marketers, developers, analysts, and QA teams answer practical questions:

- Which platforms are present, and which activities have a current decision for this page?
- Which variation did this visitor receive?
- What code, content, targeting, or traffic allocation does the platform expose?
- Did a click or conversion trigger the expected event and properties?
- Did an assignment change after navigation, a reload, or a preview?
- What evidence can I share with the person investigating an issue?

**Current version:** 0.2.1 · **14 platform integrations** · **Chrome 116+** · **No Splitscope account required**

> Coverage depends on what a website exposes. Splitscope inspects browser-visible data; it does not connect to vendor accounts or retrieve every experiment configured in a project. A reported decision does not, by itself, prove that all visual changes rendered.

## What makes Splitscope useful

Splitscope combines several parts of the QA workflow in one place:

- **A shared workspace across platforms.** Search activities, inspect assignments, and review events through the same interface on sites using different tools.
- **Evidence behind the status.** Current decisions are separated from project configuration and stored assignments. Missing information is identified instead of being filled with guesses.
- **Code and behavior together.** Inspect exposed change source, highlight matching elements, and follow related events without leaving the page.
- **Repeatable QA.** Save event expectations, compare assignments with a baseline, record a navigation journey, and export findings.
- **Deeper Adobe Target inspection.** Investigate delivery, identity, tracking, QA links, mboxes, timing, and experience history inside Activities.
- **Local storage and portable reports.** Settings and QA artifacts stay in the browser; there is no Splitscope telemetry backend.

These are the product’s distinguishing workflows, rather than a claim that every capability is unique to Splitscope.

## Install and open

This repository provides an unpacked development build.

```sh
npm install
npm run build
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select `.output/chrome-mv3`.
3. Open or reload the website you want to inspect.
4. Click the Splitscope toolbar icon. The panel opens directly on the page.

**After an update:** rebuild, reload Splitscope in `chrome://extensions`, and reload existing website tabs. Rebuilding alone does not replace scripts already injected into a page.

### A first QA session

1. Open **Activities** and select **Here** to focus on current page decisions.
2. Open an activity to inspect its assignment, exposed variations, and code.
3. Open **Events**, interact with the website, and expand an event to inspect its payload. Choose **All event types** to include technical calls and navigation.
4. Use **Tools** to save a comparison baseline, record a journey, or export a QA report.
5. Open the settings gear to change appearance, retain the event log, or enable additional analytics capture.

## Supported platforms

There are **14 registered integrations**. They cover experimentation platforms, feature flag SDKs, and OneSignal engagement events. Detection, activity enumeration, code visibility, and preview support are separate capabilities.

| Platform | Activity and decision inspection | Preview or switching in Splitscope |
| --- | --- | --- |
| **Optimizely** | Published Web project data, current decisions, campaigns, variations, and exposed changes. Legacy Classic inspection is also supported. | Web variation URL preview; depends on the site allowing force parameters. Classic is inspection-only. |
| **Adobe Target** | Captured at.js and Target-specific Web SDK delivery, activity/experience metadata, offers, and observed application evidence. | Save and reopen real Adobe QA links; only known activity/experience mappings are available. |
| **VWO** | Runtime experiments, assignments, and exposed variation changes and allocation. | Extension-assisted variation preview. Splitscope must be enabled in the destination tab. |
| **Kameleoon** | Runtime experiments and personalizations, assignments, and exposed changes. | A/B variation assignment with engine verification and reload. Personalization requires vendor simulation tools. |
| **AB Tasty** | Runtime activities and assignments; change and allocation details where exposed. | No built-in override. |
| **Convert** | Runtime experiences, assignments, and exposed variation changes and allocation. | Vendor preview URL. |
| **Dynamic Yield** | Partial runtime campaign and decision information. | Use vendor QA tools; no general in-panel switcher. |
| **Unbounce** | Exposed landing-page and current variant metadata. | Direct variant URL for supported single-letter variant IDs. |
| **Monetate** | Partial runtime experience and decision information. | Use vendor QA tools; no general in-panel switcher. |
| **Zoho PageSense** | Partial runtime experiment and decision information. | Use vendor QA tools; no general in-panel switcher. |
| **GrowthBook** | Exposed SDK instance, feature/experiment data, and evaluations. Cached configuration is not proof of a current decision. | Observation-only. |
| **Statsig** | Observed experiment, gate, configuration, and layer evaluations; not a complete project catalog. | Observation-only. |
| **PostHog** | Feature flags and evaluations from the exposed default instance. Flags are not automatically classified as experiments. | Observation-only. |
| **OneSignal** | Engagement SDK detection and supported API events; no experiment catalog. | Not applicable. |

Each integration includes observation of supported calls or events. This does not mean every SDK method or network request is captured. Private SDK instances, renamed globals, runtime versions, consent, and site configuration can limit coverage.

**Kameleoon and Chameleon are different products. Chameleon is not currently implemented.**

## Activities: understand the visitor’s experience

### Find the relevant activity

- Search by activity name, activity ID, or variation ID.
- Filter by platform and reported activity type.
- Switch between **All**, **Here**, **Other**, and **Pinned**.
- See current page decisions separately from configuration and stored decisions.
- Distinguish A/B tests, personalization, split-URL tests, feature flags, configurations, and other types when the runtime exposes enough information. Unknown types remain unknown.
- Pin activities and retain your selection and filters in a per-site workspace.
- Click a detected platform in the top bar to filter its activities.

### Inspect the details

An activity’s detail view adapts to available platform capabilities and data:

- **Overview:** names, IDs, campaign references, reported status, status explanation, observation context, assignment, variations, evaluated values, goals, and exposed traffic allocation or variation weights.
- **Code & changes:** captured activity-level and variation-level change source.
- **Targeting:** exposed URLs, audiences, and conditions. Splitscope displays these rules but does not evaluate eligibility itself.
- **Events:** captured events with an explicit matching platform and activity ID.
- **Raw:** an expandable view of captured fields, normalized details, platform evidence, and linked events, with copy controls.

Missing names, traffic splits, targeting rules, or variation catalogs are identified as unavailable. A single observed experience is not treated as the full list of possible experiences.

### Read custom code and visual changes

Where exposed by the runtime or captured offers, inspect:

- JavaScript and browser-visible function source.
- CSS, HTML, JSON, attributes, redirects, and nested visual-editor actions.
- Shared activity code and variation-specific changes, labeled with their source field.
- Selectors that can be highlighted on the current page.

Expand individual changes to read, copy, or save the source, with line-wrapping controls. Code is displayed as text and is not executed by the inspector. Native or bound functions, private SDK code, server-side code, and unloaded variation code may be unavailable. Captured source can be minified, redacted, or truncated.

### Open the activity in its vendor console

Activity cards and details offer a new-tab link when Splitscope can construct a supported activity-specific route:

- **Optimizely Web:** experiment or personalization campaign, using the captured project and activity/campaign IDs.
- **Optimizely Classic:** legacy experiment editor.
- **Convert:** experience link when account and project IDs can be identified from an unambiguous official snippet.
- **Kameleoon:** experiment or personalization results.

Other platforms hide this action when a reliable route or required identifiers are unavailable. There is no generic dashboard fallback. Vendor login and account permissions still apply; authenticated navigation is not verified for every route. See [activity link coverage](docs/dashboard-links.md).

## Variation previews

Supported activities expose a **Preview** action with a confirmation explaining the method and reported tracking impact. URL-based previews can open in the current tab or a new tab, and their link can be copied.

- Requested previews are compared with subsequent observed assignments. A preview parameter alone does not mark a variation as applied.
- New tabs share the browser’s visitor cookies; they are not isolated test visitors.
- Optimizely Web forcing can be disabled by the project’s implementation settings. If the vendor ignores a force parameter, the original assignment and normal tracking may continue.
- VWO and Kameleoon preview links require Splitscope in the destination tab because the extension processes their temporary parameters before the SDK loads.
- Kameleoon A/B previews may persist an assignment and count in vendor reporting.
- Adobe Target uses real saved QA links rather than guessed activity indexes or generated QA tokens.
- Reset removes preview parameters or restores a direct variant path changed by Splitscope. Persistent vendor assignments may still require the vendor’s own reset controls.

There is no universal tracking-safe mode or universal visitor-assignment reset. See [preview implementation and limits](docs/preview-and-detection.md).

## Events: inspect what was sent

The event timeline records supported API calls, lifecycle events, selected network requests, and page navigation.

- View event name, time, platform, category, and observation source.
- Keep payloads collapsed until opened; expand nested objects separately.
- Inspect properties, exposed caller information, activity/variation IDs, and the page URL at capture.
- Search event names, activity IDs, and payload values.
- Filter by platform or event category. The default view focuses on goals and custom events.
- Stop/start recording, or **freeze the visible list** while recording continues.
- Copy individual events and export the filtered timeline as CSV.
- Clear the tab’s event log with confirmation.
- Optionally retain the sanitized event log across page loads.

An observed API call establishes that the call occurred. It does not establish successful vendor ingestion or reporting.

### Check event requirements

Under **Events → Event checks**, define reusable expectations with:

- An exact event name and source.
- Required property paths, including nested paths.
- Expected JSON values.

Start a check, perform the website action, finish the check, and copy the results. Checks distinguish matching events, missing events, and payload mismatches. Paused recording marks the check incomplete; a reload ends the active check. Checks can survive closing and reopening the panel within the same document.

### Optional analytics capture

Enable **Capture analytics calls** in Settings to observe future calls through standard exposed `dataLayer`, Google tag, Segment, and Adobe Analytics/AppMeasurement APIs, plus recognized outgoing transports. Renamed globals, private instances, proxies, and calls made before capture starts may be unavailable.

## Tools: turn observations into QA evidence

| Tool | What it helps you do |
| --- | --- |
| **QA report** | Add notes and export JSON or Markdown containing assignments, platform evidence, and the event timeline. |
| **Compare** | Save a baseline and compare activity status, variation, and feature values later. See additions, changes, and activities no longer reported, alongside the baseline page and timestamp. |
| **Journey** | Record an opt-in, per-tab history across reloads and SPA navigation on the starting origin. Stop, export, or delete it; replacement requires confirmation. |
| **Workspace** | Save a per-origin name, notes, pins, filters, selection, baseline, and event expectations. Export or clear it. Tabs on the same origin share workspace updates. |
| **Selector overlap hints** | Find matching selectors in active assigned variations and highlight their elements. These are investigation leads, not proof that activities conflict. |

Journey recording is separate from event-log retention. It retains up to 500 entries / 750 KB plus a bounded decision cache. Navigation to other origins is excluded, and capture gaps remain visible limitations.

## Adobe Target tools

Adobe Target has additional tools in a **collapsible section inside Activities**. There is no separate top-level Target tab.

| Section | Features |
| --- | --- |
| **Findings** | Evidence-linked observations covering delivery failures or delays, mixed SDK stacks, configuration, metadata, selectors, offers, privacy signals, and other implementation concerns. |
| **Timeline** | Captured delivery and application-related observations, distinguishing execute, prefetch, and notification flows. Prefetched content alone is not marked active. |
| **Raw** | Expandable and copyable request/response data from supported at.js fetch/XHR and Target-specific Web SDK exchanges, subject to redaction and size limits. |
| **Identity** | Inspect exposed identity and cookie information, including mbox session/PC, AMCV ECID, and relevant Web SDK cookie names. |
| **A4T** | Correlate observed Target and Adobe Analytics requests using available identifiers and a same-page time window. This cannot prove backend reporting success. |
| **Tracking** | Inspect a fingerprinted credential ledger and observed display/click notifications. Raw tracking credentials are not stored in the ledger. |
| **Timing** | Inspect observed prehiding, configuration, selector mutations, and potential flicker evidence. Timing correlation is not proof of render attribution. |
| **QA** | Save real QA links, reopen known experience mappings in the current/new tab, inspect observed QA mode, remove saved links, and exit QA. Includes tab-scoped baseline blocking controls. |
| **Mboxes** | Inspect mbox parameter schemas, profile/entity/order fields, page observations, and schema drift; export CSV/JSON. An explicit probe is available when an at.js `getOffers` API has been observed. |
| **On-device** | Inspect captured on-device decisioning metadata, activities, audiences, and rule trees. Unrecognized artifact shapes remain inspectable as raw data. |
| **Memory** | Keep bounded local experience history, inspect first/last observations, compare captured offers, and capture the current assigned experience’s DOM. Includes limited local text replay with undo. |
| **Conflicts** | Identify cross-platform selector matches or overlaps on current DOM nodes and highlight them for investigation. |

### Target-specific behavior and limits

- at.js request classification supports recognized paths on first-party CNAMEs. Generic Adobe Launch or `alloy` presence alone does not establish Target detection; Edge decisions require explicit Target evidence.
- Saved QA links are per-origin and capped at 50. Experience indexes come from actual Adobe links. Splitscope cannot mint QA tokens or discover unseen experience mappings.
- Baseline mode blocks selected Target requests in the current tab and is removed when the tab closes. Optional shared Adobe Edge blocking also affects Analytics and identity. Cached or inline offers may still apply.
- Mbox probes make a real prefetch request. Splitscope does not apply the response or explicitly send a display notification, but site hooks may react.
- Experience memory retains up to 100 experiences per origin. Counts represent captured observations, not visitors or statistical traffic allocation.
- Local replay is restricted to text on one eligible element, with undo. It does not evaluate saved JavaScript, HTML, or CSS; site observers may still react. Screenshot comparison is not implemented.
- Execute requests can count impressions without a separate notification. Missing notifications alone do not prove a tracking failure.

See the [Adobe Target module documentation](docs/adobe-target.md) for implementation details and validation limits.

## Panel, appearance, and page health

- Opens directly on the inspected website, with settings inside the panel.
- Shows detected platforms in the top bar.
- Uses a green toolbar icon when a platform is detected and gray otherwise; the badge counts reported current activities.
- Supports left, right, and bottom docking, minimizing, light/dark/system themes, and larger text.
- Restores an open panel on the same site in the same tab after reload by default. Closing the panel stops that restoration.
- Refreshes activities automatically while the page is visible, on SPA route changes, and on captured events; manual **Refresh** is also available.
- **Page** shows the inspected URL, scan information, connection health, detection evidence, exposed platform versions, coverage notes, and runtime errors.
- **Settings** provides connection information and copyable diagnostics. Builds retain readable JavaScript and source maps for investigation.

| Shortcut | Action |
| --- | --- |
| `Alt+Shift+S` | Toggle the page panel. |
| `/` inside the panel | Focus the available search field. |
| `1`–`4` inside the panel | Open Activities, Events, Page, or Tools. |
| `Escape` inside the panel | Dismiss a preview, return from activity details, or minimize the panel, depending on context. |

Panel shortcuts respect text-entry fields. Chrome may require you to assign the extension shortcut if another application already uses it.

## Privacy, storage, and permissions

Splitscope has no account service or telemetry backend. Inspection and saved QA data are handled locally in the browser. Preview navigation, variation changes, and explicit probes can still contact vendors or change website visitor state.

| Data | Retention |
| --- | --- |
| General event log | Memory by default; optional sanitized session retention across page loads. |
| Target wire history | Separate per-tab, per-origin session ring: up to 100 captures / approximately 1 MB. Clearing Events clears this history; tab closure removes it. |
| Journey | Opt-in tab/session history, independent of the event-log setting. |
| Settings and site workspace | Persist locally, including saved notes, pins, baselines, and event expectations. |
| Target QA links and experience memory | Persist locally by origin until removed or cleared through their controls. |

Captured data is bounded and common sensitive fields are redacted. Redaction is not a guarantee that all personal or confidential information is removed. Saved Adobe QA links can contain reusable preview credentials. Review reports, copied code, raw data, and diagnostics before sharing them.

The extension requests:

- **Host access to all URLs:** inspect supported platforms on the websites you visit.
- **Scripting and activeTab:** install the page inspector and respond to the toolbar action.
- **Storage:** retain settings and QA artifacts.
- **webRequest:** observe supported network metadata and requests.
- **Cookies:** support Target identity and QA inspection/cleanup.
- **declarativeNetRequest:** apply Target baseline blocking rules scoped to a tab.

Chrome-protected pages, such as `chrome://` pages, cannot host the inspector.

## Practical limits

- Browser-visible configuration is not the same as an active page decision, and delivery is not the same as rendered content.
- Capture starts when the hook loads. Calls made earlier cannot be recovered retroactively.
- Detection and data visibility vary with SDK version, consent state, private runtime objects, network transport, and site implementation.
- Code and payloads can be unavailable, redacted, or truncated. Splitscope does not reconstruct server-side code or fetch source maps to recover original activity source.
- Neither events nor A4T correlations establish successful server-side ingestion, attribution, or reporting.
- Fixture and regression coverage do not establish compatibility with every live vendor installation. Confirm preview and tracking behavior on the site you are testing.

## Development

The extension uses **WXT, TypeScript, Preact, Preact Signals, and Valibot**.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start WXT development mode. |
| `npm run dev:chrome` | Start development explicitly for Chrome. |
| `npm run build` | Generate `.output/chrome-mv3`. |
| `npm run zip` | Package the Chrome extension. |
| `npx tsc --noEmit` | Check TypeScript types. |
| `npm test` | Build and run the automated regression suite. |

For the sample-data UI preview:

```sh
npx vite --config dev/vite.config.ts
```

Open `http://127.0.0.1:5178/dev/`. This is a design fixture; it does not exercise live vendor capture or Chrome extension permissions.

An optional Kameleoon compatibility check accepts a separately obtained public engine file:

```sh
SPLITSCOPE_KAMELEOON_ENGINE=/path/to/engine.js npm test
```

It executes only the extracted assignment function, not the complete website or tracking engine.

### Architecture

- `entrypoints/`: extension entry points, background worker, and content scripts.
- `src/adapters/`: platform detection, activity readers, event hooks, and supported preview plans.
- `src/core/`: shared models, validation, capture, sanitization, state, and QA logic.
- `src/ui/`: the on-page panel, activity details, event timeline, and QA tools.
- `dev/`: sample-data UI preview.
- `tests/`: adapter, capture, UI, and compiled extension regression coverage.
- `docs/`: implementation notes, research references, and verification limits.

Page-world hooks observe supported SDK behavior. An isolated content-script bridge validates captured data and hosts the panel. The background worker handles browser-level operations and storage. Platform-specific capabilities determine the controls shown in the shared UI.

### Troubleshooting

If the panel fails to open after an update, reload the extension and then the website. If the issue persists, copy diagnostics from **Settings**, or collect console messages beginning with `[Splitscope/bridge]` or `[Splitscope/hook]`.

Include the extension version, affected URL, action taken, and full error details. For background connection failures, also inspect the extension’s service worker in `chrome://extensions`. Review the information before sharing it.

## Further documentation

- [Adobe Target tools and limitations](docs/adobe-target.md)
- [Code inspection](docs/code-inspection.md)
- [Automatic activity links](docs/dashboard-links.md)
- [Preview and detection behavior](docs/preview-and-detection.md)
- [Optimizely snapshot and preview fixes in 0.2.1](docs/optimizely-fixes-0.2.1.md)
- [Implementation review](docs/implementation-review.md)
- [Original plan and architecture](plan.md)

Older planning and phase documents describe the development history; the implemented capabilities and limits summarized above describe the current build.
