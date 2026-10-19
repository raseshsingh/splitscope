# VanillaXtn Codebase Guide

A working reference for how this project's code is put together, written so that a new task can be scoped quickly without re-reading everything. It describes the code as it exists in the folder (package version 0.2.1), not the product marketing in the README.

Scope note: I read the entrypoints, the whole hook engine, the bridge protocol, the model, the sanitizer, change extraction, the Optimizely, VWO, Kameleoon and Adobe Target adapters, the QA core modules, the Adobe Target core modules, `App.tsx`, the popup, and the README and docs. I did not read line by line: the other adapters (AB Tasty, Convert, Dynamic Yield, GrowthBook, Monetate, OneSignal, PageSense, PostHog, Statsig, Unbounce), most of the smaller panel components, the CSS, the tests, `plan.md`, and the Adobe Target modules `findings.ts`, `integrity.ts` and `timing.ts` beyond their exports. Sections that depend on those say so.

---

## 1. What this is

A Manifest V3 Chrome extension (Chrome 116+) that inspects A/B testing, personalization and feature flag tools running on any web page. The product name inside the code and manifest is **Splitscope**; the folder is called VanillaXtn. It:

1. Detects which of 14 platforms are on the page.
2. Reads each platform's browser-visible runtime data and normalizes it into one activity model.
3. Records events (SDK calls, lifecycle events, selected network requests, route changes).
4. Shows all of it in an on-page panel (a closed shadow DOM overlay), plus a small set of QA tools.

It never talks to vendor accounts or a Splitscope backend. Everything is observation of what the page already exposes.

Stack: WXT (extension framework on Vite), TypeScript, Preact, Preact Signals, Valibot. Tests use `tsx --test` and `linkedom`.

### Commands

| Command | Effect |
| --- | --- |
| `npm run dev` / `dev:chrome` | WXT dev mode |
| `npm run build` | Builds to `.output/chrome-mv3` (unminified, with source maps, see `wxt.config.ts`) |
| `npm run zip` | Package |
| `npx tsc --noEmit` | Type check |
| `npm test` | Runs a build first, then `tsx --test tests/*.test.ts` (some tests inspect the built bundle) |
| `npx vite --config dev/vite.config.ts` | Sample data UI preview at `http://127.0.0.1:5178/dev/` (fixture only, no real capture) |

After a rebuild you must reload the extension in `chrome://extensions` and reload the target tab, because already injected scripts are not replaced.

---

## 2. Folder map

```
entrypoints/
  background.ts          MV3 service worker (browser-level work, storage, badge, Target commands)
  hook.content.ts        Content script, MAIN world: just calls installHookEngine(adapters)
  bridge.content.tsx     Content script, ISOLATED world: bridge to the page hook + hosts the panel UI
  popup/, options/       Preact entrypoints that exist but are stripped from the manifest (see section 4)
src/
  adapters/              One file per platform (14) + index.ts that lists them in order
  core/
    model.ts             Shared types (PlatformId, NormalizedExperiment, CapturedEvent, ForcePlan, ...)
    hooks/               The page-world engine: install.ts, runtime.ts (adapter helpers), analytics.ts, kameleoon-preview.ts
    bridge/              protocol.ts (Valibot schemas for page-to-bridge messages), snapshot.ts (size budgeted serializer)
    extension/messages.ts  Build/protocol constants, messageListener, unwrapReply, errorText
    adobe-target/        Wire capture, findings, integrity (A4T), inventory, QA links, timing, privacy, replay, background commands
    qa/                  preview, check-run, expectations, journey, workspace, export, highlight, presentation, activity-details
    changes.ts           Extracts code/CSS/HTML/redirect changes from arbitrary vendor objects
    sanitize.ts          Redaction and size bounding of anything crossing a boundary
    search/index.ts      Ranked activity search
    activity-kind.ts     Maps vendor type strings to normalized kinds
    dashboard-links.ts   Builds "open in vendor console" URLs (Kameleoon, Optimizely, Convert only)
    platform-endpoints.ts  Hostname to platform lookup for network events
    settings.ts, state.ts, diagnostics.ts, function-source.ts, target-evidence.ts
  ui/
    panel/               App.tsx (the whole panel), ActivityDetail, TargetView, ToolsView, PageView, SettingsView, ...
    events/EventFeed.tsx
    qa/                  Expectations, JourneyView, WorkspaceView
    shared/              components.tsx, theme.css
dev/                     Sample data preview harness (preview.tsx, mock-browser.ts)
tests/                   10 test files (adapter, capture, panel mount, compiled bundle checks)
docs/                    Implementation notes written during development
plan.md                  Original plan (68 KB, historical)
```

---

## 3. The three execution contexts

This is the single most important thing to understand. The extension runs code in three separate JavaScript worlds, and they can only talk through specific channels.

| Context | File | World | Can access | Cannot access |
| --- | --- | --- | --- | --- |
| **Page hook** | `entrypoints/hook.content.ts` calling `src/core/hooks/install.ts` | `MAIN` (the website's own JS world) | `window.optimizely`, `window.VWO`, `fetch`, `XMLHttpRequest`, `history`, DOM events | Any `chrome.*` / `browser.*` extension API |
| **Bridge + panel** | `entrypoints/bridge.content.tsx` | `ISOLATED` content script | Extension messaging, `browser.storage`, the DOM (shared), the shadow root panel | The page's JS variables |
| **Background** | `entrypoints/background.ts` | Service worker | Storage, tabs, scripting, cookies, webRequest, declarativeNetRequest, action badge | The page |

Both content scripts match `<all_urls>` at `document_start`. The hook has to run in MAIN to wrap page globals; the bridge has to run in ISOLATED to use extension APIs. They talk using `window.postMessage`.

### How they get injected

- Normally both are declared content scripts, so they run on every page load.
- When the user clicks the toolbar icon (or uses `Alt+Shift+S`), the background calls `ensureContentScript(tabId)`. It sends `bridge.ping` and checks the reply for matching `BRIDGE_PROTOCOL` (3), `EXTENSION_BUILD` (`'0.2.1'`) and an `instanceId`. If that fails it injects `/content-scripts/hook.js` into `MAIN` and `/content-scripts/bridge.js` into `ISOLATED` with `browser.scripting.executeScript`, then pings again. This handles tabs that were open before install or update.
- The hook guards against double install with `window.__splitscopeHookInstalled`. The bridge uses `window.__splitscopeBridgeInstalled = instanceId` (a UUID, not a boolean) so a newer instance can replace an invalidated one.
- `EXTENSION_BUILD` is hard coded in `src/core/extension/messages.ts` and `version` is also hard coded in `wxt.config.ts` and `package.json`. **All three must be changed together on a version bump**, otherwise `ensureContentScript` and the "outdated build" check misbehave.

---

## 4. Manifest details worth knowing

From `wxt.config.ts`:

- Permissions: `storage`, `scripting`, `webRequest`, `activeTab`, `cookies`, `declarativeNetRequest`. Host permission `<all_urls>`.
- A `build:manifestGenerated` hook **deletes `default_popup`, `options_ui` and `options_page`** from the manifest. So `entrypoints/popup/` and `entrypoints/options/` are built but not wired in: clicking the toolbar triggers `browser.action.onClicked`, which opens the on-page panel directly. Settings live inside the panel (gear icon). The popup code (`entrypoints/popup/main.tsx`) is still maintained and the background still handles `popup.*` messages, but treat it as dormant unless you intend to restore it.
- Command `toggle-panel` bound to `Alt+Shift+S`.
- `web_accessible_resources` for `assets/*` and `chunks/*` with `use_dynamic_url: true`.
- Vite config turns minification off and source maps on, deliberately, so users can read the shipped code when investigating.

---

## 5. Page to bridge protocol (window.postMessage)

All messages have the envelope `{ namespace: '__splitscope__', nonce, type, requestId?, payload? }`, validated by `parseBridgeMessage` in `src/core/bridge/protocol.ts` (Valibot). Allowed `type` values: `hello`, `ready`, `snapshot`, `event`, `command`, `response`, `status`. Size limits: 4,000,000 JSON characters for `snapshot`, 300,000 for everything else. Anything else is dropped or reported as "Rejected bridge envelope".

### Handshake (nonce)

1. The bridge posts `hello` with nonce `'bootstrap'`.
2. The hook replies with `hello` carrying its own random 128 bit nonce and `payload.build`. It also retries every 40 ms for up to 1.5 s until it is connected (this covers load order races).
3. The bridge stores that nonce, compares `payload.build` to `EXTENSION_BUILD` (mismatch sets `connection.page = 'outdated'` and shows "Reload this website to finish updating"), and posts `ready`.
4. On `ready` the hook sets `connected = true`, flushes up to 1000 queued messages (it buffers while unconnected), and publishes a snapshot.
5. After that, every message must carry the right nonce or it is ignored. Both sides also require `event.source === window`.

### Message directions

- Hook to bridge: `snapshot` (full detection + activities), `event` (one captured event), `status` (errors, and the `force-plan` / `force-error` replies).
- Bridge to hook: `command` with `payload.name` in: `rescan`/`refresh`, `captureOptions` (toggle analytics capture), `forceVariation`, `executeForcePlan`, `targetProbe`, `stop`.

The bridge parses snapshots with `parseSnapshot` which validates each platform and activity record independently. Malformed ones are dropped and counted (`omitted`, `omittedPlatforms`), and the user sees an "Incomplete activity data" status instead of the whole snapshot failing.

---

## 6. The hook engine (`src/core/hooks/install.ts`)

`installHookEngine(adapters)` is the heart of runtime capture. Key pieces:

### State it keeps
`experiments` (rebuilt each scan), `observed` (activities pushed by adapters when they see events, keyed `platform:id`, cleared on URL change), `observedPlatforms` (platforms seen making calls even if detection fails), `queued` (pre-handshake messages), `cleanups` (undo list for every patch), `refreshHooks`.

### Posting
`post(type, payload)` sanitizes the payload (`serializeSnapshot` for snapshots, otherwise `sanitize` with a 200 KB or, for Target wire data, 400 KB budget) and either queues it or `postMessage`s it.

### emit(event)
Builds a `CapturedEvent`: id, timestamp (`performance.timeOrigin + performance.now()`), sanitized properties, current URL, and a **caller** line scraped from `new Error().stack` that skips extension frames. It also tries to infer `experimentId` / `variationId` from the properties (looks for `experimentId`, `activityId`, `variationId`). It triggers a debounced (100 ms) re-publish of the snapshot. Everything is wrapped in try/catch: "Observation must not interrupt the site's original API."

### Helpers given to adapters (`HookHelpers`, defined in `runtime.ts`)
- `wrapMethod(target, method, platform, eventName?, category?, observe?)`: replaces `target[method]` with a wrapper that emits an event, then calls the original with `Reflect.apply`, and optionally runs `observe(args, result)` afterwards (handles promises, and only if the URL has not changed). A function `target` is treated as a lazy resolver re-attempted on every scan. Marks wrapped functions with `__splitscopeWrapped` to avoid double wrapping. Registers a cleanup that restores the original.
- `wrapQueue(globalName, ...)`: for queue style globals such as `VWO`, `_vis_opt_queue`, `optimizely`, `kameleoonQueue`. Uses `trapGlobal` to define a getter/setter on `window[name]` so that when the site later assigns the real object, `push` is wrapped at that moment. Also re-wraps on each scan.
- `listen(name, handler)`: capture phase window listener (used for `Kameleoon::*` and `at-*` DOM events).
- `addExperiment(activity)`: lets an adapter record an activity it learned from an event rather than from polling. Gets default evidence (`assigned`, `stored` or `detected`).
- `invalidate(platform)`, `addCleanup`, `clean` (= `sanitize`).

### scan()
Runs every adapter's `detect()`. If confidence is 0 or there are no signals the platform is skipped, unless the platform has been observed making calls, in which case it is reported as detected at 0.95. For each detected platform it calls `listExperiments()` and merges with `observed` (observed wins for the same key). Adapter exceptions never kill the scan: they become a `diagnostic` and a `status` message, and the platform is still listed if it was observed. Activities without evidence get an `evidence` object whose `observedAt` is stable while URL, status and assigned variation stay the same.

### When it publishes
On handshake, every 1.5 s while the document is visible (every 3 s once the page is more than 30 s old), 100 ms after any emitted event, on route changes, and on `rescan`/`refresh` commands.

### Network hooks
It patches `window.fetch`, `XMLHttpRequest.prototype.open/send`, and `navigator.sendBeacon`. A request is emitted only if `identifyEndpoint(url)` (the hostname table in `platform-endpoints.ts`) maps it to a platform, or, when analytics capture is enabled, `analyticsEndpoint(url)` recognises GA4 `/g/collect`, Segment `api.segment.io`, or Adobe Analytics `/b/ss/`.

### History hooks
Wraps `history.pushState` / `replaceState` and listens to `popstate` / `hashchange`; each emits a `page` platform event named `Route <pathname>` and republishes.

### Analytics capture (`analytics.ts`)
Off by default, toggled by a setting. When on, wraps `gtag`, `dataLayer.push`, `analytics.track/page/identify/group/alias` (Segment) and the Adobe Analytics `s.t` / `s.tl` methods. A 500 ms interval re-applies wraps. Capture is future only, nothing is replayed, no tracking method is ever invoked on the site's behalf.

### Platform capabilities
A static table in `capabilities(id)` at the bottom of `install.ts` declares for each platform what the UI may offer (`listAll`, `listActive`, `forceVariation`, `trafficSplit`, `changes`, `events`, plus notes). The UI keys off this, so **adding or changing a platform's abilities means editing this table**.

### Force / preview commands
- `forceVariation` command: finds the activity via the adapter, validates the variation still exists, calls `adapter.force(experimentId, variationId, location.href)` to produce a `ForcePlan`, stores it as `preparedPlan`, and posts a `status` message with `message: 'force-plan'`. AB Tasty is explicitly refused.
- `executeForcePlan` command: the plan from the UI must JSON-equal the stored prepared plan (otherwise "Preview expired. Select the variation again."). Then it runs one of: `url` (same origin only, `location.assign`), `pre-snippet-api` (stash commands in `sessionStorage['__splitscope_pending_force__']` and reload), `runtime-api-then-reload` (only `Kameleoon.API.Experiments.assignVariation` is allowed).
- `applyPendingForce` runs at install on the next page load: reads the `__splitscope_vwo=exp:var` and `__splitscope_kameleoon=exp:var` URL parameters, strips them with `history.replaceState`, and queues the real vendor call (`VWO.push(['setVariation', ...])` or the Kameleoon queue function from `kameleoon-preview.ts`). Those two platforms therefore need Splitscope active in the destination tab.

---

## 7. Data model (`src/core/model.ts`)

- `PlatformId`: `growthbook | statsig | posthog | optimizely | adobe-target | vwo | kameleoon | ab-tasty | convert | dynamic-yield | unbounce | monetate | pagesense | onesignal`.
- `NormalizedExperiment` (the "activity"): `platform`, `id`, `name`, `kind` (`ab | mvt | split-url | personalization | feature-flag | layer | configuration | survey | recommendation | other`), `status`, `statusReason`, `evidence {state, observedAt, pageUrl}`, `variations[]`, `changes[]`, `assignedVariationId`, `evaluatedValue`, `trafficAllocation`, `targeting {urls, audiences, conditions}`, `goals`, `campaignId`, `dashboardContext {projectId, accountId, runtime}`, `source[]` (where the data came from), and `raw`.
- Status values (`ExperimentStatus`): `running-in` (active on this page, this is what "current decision" and the toolbar badge count mean), `running-excluded` (holdback), `bucketed-elsewhere` (stored assignment but not active here), `not-targeted`, `not-on-page`, `preview`, `unknown`.
- Evidence states: `applied | assigned | stored | detected | failed`. The UI label (`activityStatus` in `qa/presentation.ts`) prefers evidence state over status.
- `CapturedEvent`: `id`, `t`, `platform` (a PlatformId or `datalayer | ga4 | segment | adobe-analytics | page`), `category`, `name`, `properties`, `experimentId`, `variationId`, `via` (`api-call | listener | dom-event | network | queued-before-load`), `caller`.
- `ForcePlan`: union of `url`, `cookie`, `pre-snippet-api`, `runtime-api-then-reload`, `preview-link`, each carrying an `explanation` and (mostly) a `tracking` field of `counted | disabled | unknown`.
- `DetectionRecord`: `{id, displayName, result: DetectionResult, capabilities}`.

**Dead code warning:** `PlatformAdapter` and `AdapterContext` at the bottom of `model.ts` are not used anywhere. The live adapter contract is `PageAdapter` / `HookHelpers` in `src/core/hooks/runtime.ts`.

---

## 8. Adapters (`src/adapters/`)

### The contract (`PageAdapter`)
```ts
{
  id: PlatformId;
  displayName: string;
  category: 'experimentation' | 'engagement';
  detect(): DetectionResult;            // cheap, called every scan
  listExperiments(): NormalizedExperiment[];   // pure read of current runtime state
  install(helpers: HookHelpers): void;  // one time: wrap methods, add listeners
  force?(experimentId, variationId, pageUrl): ForcePlan | unknown;  // optional preview
}
```
Order in `adapters/index.ts` is: GrowthBook, Statsig, PostHog, Optimizely, Adobe Target, VWO, Kameleoon, AB Tasty, Convert, Dynamic Yield, Unbounce, Monetate, PageSense, OneSignal.

Shared helpers in `runtime.ts`: `detection(state, signals, confidence, version)`, `normalizedExperiment(partial)` (fills defaults and sanitizes `raw`), `variationList(raw, {names, weights, changes})`, `asArray`, `getPath`, `isObject`.

### Typical pattern (VWO as the example)
- `detect`: look for `VWO`, `_vwo_exp`, `_vwo_code`, `_vis_opt_queue` globals (confidence 0.98 when `VWO` exists), else a script tag containing `visualwebsiteoptimizer` (0.7), else confidence 0 so it is skipped.
- `listExperiments`: reads `window._vwo_exp`, reads the `_vis_opt_exp_<id>_combi` cookie as fallback for the chosen combination, builds variations from `combs`, derives status (`running-in` only if the runtime says `combination_chosen`, else `bucketed-elsewhere` when only a cookie knows).
- `install`: `wrapQueue('VWO', ...)` and `wrapQueue('_vis_opt_queue', ...)`.
- `force`: returns a `url` plan that adds `__splitscope_vwo=exp:var`.

### Platform specifics worth remembering
- **Optimizely** (the largest, ~16 KB): reads `optimizely.get('data')` (cached, because it is expensive) and `optimizely.get('state')`. Indexes experiments and campaign nested experiences (personalization). Status logic uses `getActiveExperimentIds`, experiment/campaign states and holdback flags, and distinguishes "runtime did not expose an active list" from "not active". Registers its own listeners through `optimizely.push({type:'addListener', ...})` with tokens prefixed `splitscope:` (and `wrapMethod` filters those out of the event feed). `force` builds the `optimizely_x` URL parameter, refuses if `enableForceParameters === false` or `optimizely_disable=true`, replaces earlier selections for the same experiment/campaign. Supports Web and, read only, Classic (`optimizely.data`).
- **Kameleoon**: reads `Kameleoon.API.Experiments/Personalizations` `getAll`/`getActive`, optionally enriches variations from `Kameleoon.Internals.runtime.variations` (read without executing). Listens for `Kameleoon::*` DOM events. `force` is only for A/B (personalization throws) and needs numeric IDs.
- **Adobe Target** (adapter is different in kind): it mostly does not read a global catalog. It exports `readTargetActivities(payload, evidence)`, which walks any delivery payload looking for `activity.id` / `experience.id` response tokens, and the adapter receives data from `installTargetCapture` (fetch/XHR wire capture), from `adobe.target.*` method wrapping (`getOffer(s)`, `applyOffer(s)`, `trackEvent`, `triggerView`, `sendNotifications`), from the `at-*` DOM events, and from Alloy monitors (`window.__alloyMonitors`). Evidence ladder: `cached` (prefetched only) < `delivered` < `rendered` (`at-content-rendering-succeeded`) with `failed` as a side branch. Only `running-in` when delivered for this request or rendered. Responses from non-TGT providers (e.g. AJO) are excluded.
- **Other adapters**: not read in detail. Based on the README, several are partial (Dynamic Yield, Monetate, PageSense), several observation only (GrowthBook, Statsig, PostHog), and OneSignal only emits events.

### Adding a new platform: checklist
1. Create `src/adapters/<name>.ts` implementing `PageAdapter`.
2. Add it to the array in `src/adapters/index.ts`.
3. Add the id to `PlatformId` in `src/core/model.ts`.
4. Add the id to the `Platform` picklist in `src/core/bridge/protocol.ts`. **If you forget this, every activity from the new platform is silently dropped as an "unsupported data shape".**
5. Add its entry to the `capabilities()` table in `src/core/hooks/install.ts`.
6. Add its display name to `platformNames` in `src/core/qa/presentation.ts`.
7. Add hostnames to `src/core/platform-endpoints.ts` if network calls should be captured.
8. Optionally add `activityKind` mappings, a dashboard link rule, tests, and a README row.

---

## 9. Turning raw vendor data into something safe and bounded

### `sanitize(value, maxBytes, maxDepth)` (`src/core/sanitize.ts`)
Used on essentially everything that leaves the page. It: redacts values under keys matching `password|authorization|cookie|token|secret|email|phone|mobile|external id`; replaces email addresses in strings with `[email]`; strips sensitive query parameters; replaces functions with their source text; summarizes DOM nodes as `<tag#id.class>`; handles Error, Map, Set, circular references; reads only data descriptors (getters become `[getter]`, never invoked); caps depth (14), items (500), string length (100,000) and total bytes. Over budget produces `[payload truncated]`.

### `variationChanges(raw)` (`src/core/changes.ts`)
A generic extractor that walks a vendor object and returns `NormalizedChange[]` (types `js | css | html | attribute | redirect | offer | unknown`). It reads only own data properties, looks in known code fields (`code`, `js`, `customJs`, ...), in containers named `actions`, `changes`, `options`, understands AEP proposition schemas and Target action lists, caps at 2000 visited nodes and 200 changes. `mergeChanges` de-duplicates. Function values are shown via `functionSource` (the browser's source text without calling the function), and native or bound functions are marked `codeUnavailable`.

### `serializeSnapshot` (`src/core/bridge/snapshot.ts`)
Budgets the snapshot: up to 1000 activities, about 2.4 MB shared as a per-activity allowance, 3.5 MB hard cap. Each activity is first serialized as a bare summary (no `changes`, no `raw`, variations without `changes`) and checked by `parseSnapshot`; then `changes` (70% of the remaining allowance, split between activity level and each variation) and finally `raw` are attached only if they fit. If attaching `changes` breaks validation they are dropped and `detailLimit` is set. The design intent: optional detail must never cause the core summary to be lost.

### `activityKind(platform, raw)` (`src/core/activity-kind.ts`)
Maps only explicit vendor metadata strings to a kind; variation count is never used as evidence. Unknown stays `other` ("Type not exposed").

---

## 10. The background worker (`entrypoints/background.ts`)

### Message router
One `browser.runtime.onMessage` listener built with `messageListener(accepts, handle)` from `extension/messages.ts`. It uses explicit callback replies (works on the whole supported Chrome range), replies with `{ok:true}` for handlers that return nothing, and wraps errors as `{__splitscopeError: "..."}` which `unwrapReply` re-throws on the receiving side. **Any new message type must be added to the allow list array at the top of the listener** or it is ignored.

Handled types: `background.ping`, `target.command` (main frame only), `journey.get/start/stop/clear`, `page.snapshot`, `preview.save/get/open`, `panel.remember/restore`, `page.event`, `page.clearEvents`, `page.restore`, `popup.toggle/openExperiment/state/rescan`, `settings.get/set`.

The background also sends messages to the page: `bridge.ping`, `panel.open/toggle/openExperiment`, `page.getState`, `page.rescan`, `page.networkEvent`. Calls use `sendToTab` with an 8 s timeout.

### Other responsibilities
- **Toolbar**: `updateBadge` sets icon (`detected.png` or `idle.png`), title, and badge text (count of `running-in` activities, `99+` cap, green `#08764f` or grey). Badge resets when a tab starts loading. On open failure it shows a red `!` and injects a standalone error box (`showOpenError`, closed shadow root) so a broken bridge still produces a visible message.
- **Event persistence**: events arrive one by one as `page.event`, are batched for 150 ms, and are written to `storage.session['splitscope:events:<tabId>']` only if the `keepLog` setting is on (max 5000 events and about 1.5 MB per tab). Writes are serialized per tab through `serialEventWrite`.
- **Journey**: stored in `storage.session['splitscope:journey:<tabId>']`; updates are batched (100 ms, up to 1000 updates) and serialized per tab.
- **Preview**: `preview.save/get` per tab; `preview.open` validates same origin and http(s), creates a new tab at `about:blank`, writes preview and panel state for the new tab id, then navigates (so the panel reopens there).
- **Network observers**: `webRequest.onBeforeRequest` for image requests matching a platform endpoint is forwarded as a `page.networkEvent`; `onCompleted` for Adobe Analytics beacons is run through `normalizeWire` and `enrichIntegrity` and forwarded as an `adobe-analytics` event. Both are in try/catch so a missing permission cannot stop the worker registering.
- **Tab cleanup** on `tabs.onRemoved`: clears timers, Target captures, Target baseline blocking rules, journey and per-tab session keys.
- **Adobe Target commands** are delegated to `src/core/adobe-target/background.ts` (section 13).

---

## 11. The bridge and panel host (`entrypoints/bridge.content.tsx`)

The bridge is the composition root of the UI. It owns state as Preact signals and passes them into `<App>`:

- `state: Signal<PageState>`: connection health, platforms, experiments, events (max 5000), page info, statuses (last 50), preview record.
- `settings`, `workspace`, `expectations`, `checkRun`, `journey`, `requestedExperiment`, `requestedTab`.
- Platform "evidence" entries: if an event arrives from a platform that was not detected, the bridge creates a minimal `DetectionRecord` (confidence 0.9) so it appears in the platform strip.

What it does:
- Mounts the panel using WXT `createShadowRootUi` in a **closed** shadow root, `position: 'overlay'`, max z-index, anchored to `html`, with keyboard events isolated from the page. CSS is imported inline (`panel.css?inline`). The whole app is wrapped in `PanelBoundary`, an error boundary that shows copyable diagnostics.
- Handles page messages (section 5) and runtime messages from the background.
- Persists per origin: workspace under `splitscope:workspace:<origin>` and expectations under `splitscope:expectations:<origin>` in `storage.local`, with write chains so saves cannot interleave, and a `storage.onChanged` listener to sync other tabs on the same origin (skipping while a local write is pending).
- Polls `journey.get` every 2.5 s and `background.ping` every 15 s (health) while the panel is mounted.
- Restores the panel after reload if `restorePanel` is on and the session record for this tab says it was open on the same origin.
- Lifecycle safety: `isAlive()` checks that the extension context is still valid; on "Extension context invalidated" it calls `dispose()` and runs every registered cleanup. This is how orphaned content scripts after an extension reload shut up.

The `summarize(state)` function at the bottom is what the background and popup see (a trimmed view without `raw` or `changes`).

---

## 12. The panel UI (`src/ui/`)

`App.tsx` (about 20 KB) is the entire panel shell:

- Tabs: `activities | events | page | tools | settings` (settings via the gear, keyboard `1` to `4` for the first four).
- **Activities**: search (`core/search`, ranked: exact id 1000, prefix 700, word prefix 450, substring 250, edit distance 1 for 5+ chars: 100), scope (All / Here / Other / Pinned), platform and kind filters, grouped into "Current page decisions" (`running-in`) and "Configuration & stored decisions". Selecting a card opens `ActivityDetail`. Each card has a `DashboardLink` where `dashboardDestination` can build one.
- **Adobe Target tools** appear as a collapsible section inside Activities (not a top tab) when Target is detected, blocked, or has events.
- **Events**: `Expectations` (event checks) above `EventFeed`. The section is hidden rather than unmounted so scroll and state survive tab switches.
- **Page**: `PageView` (URL, scan, connection health, detection evidence). **Settings**: `SettingsView`. **Tools**: Report, Compare, Journey, Workspace sub tabs (`ToolsView`, `JourneyView`, `WorkspaceView`).
- Preview flow in the UI: user picks a variation in `ActivityDetail` and `onForce` calls `props.onForceRequest`, which the bridge turns into a `forceVariation` command. When the hook replies with a `force-plan` status, `App` opens `ConfirmDialog` (shows `plan.explanation` and tracking impact). On confirm, `onForceExecute` in the bridge builds a `PreviewRecord`, saves it via background, and either opens a new tab or posts `executeForcePlan`.
- A preview banner ("Preview: <variation>") uses `previewOutcome` to compare the requested variation to the later observed assignment, and offers Reset.
- Minimized state renders a small button with the decision count. Dock position (left/right/bottom), theme and text size come from settings.

Shared bits: `ui/shared/components.tsx` (Brand, Icon, IconButton, Status, Empty), `theme.css`, `panel.css`.

---

## 13. Adobe Target subsystem (`src/core/adobe-target/`)

This is a full feature set layered on the generic model. Files and roles (exports confirmed, internals of `findings`, `integrity`, `timing`, `privacy` only skimmed):

- `wire.ts`: `classifyTarget(url)` into pipes `atjs1` (`/m2/<client>/mbox/json`), `atjs2` (`/rest/v1/delivery?client=`), `edge` (`/v1/interact|collect?configId=`), `ode` (on-device decisioning `rules.json` from `assets.adobetarget.*`), `analytics` (`/b/ss/`). `normalizeWire` produces a `TargetWire` (schema `target-wire-v1`) with locations (mboxes/views/pageLoad, phase execute/prefetch/notification/decision), session, client, and a `target` flag (true only with explicit Target evidence, so generic Alloy/AEP is not mistaken for Target).
- `capture.ts`: in the page world, wraps `fetch` and XHR for Target URLs only. It clones the response and reads it with a 1 MB cap (`readResponse`), never consuming the site's body. For each exchange it normalizes, adds privacy signals, rewrites `pageLoad` to the global mbox name, feeds timing, calls the `decision` callback (which makes the adapter publish activities as `delivered`), runs `enrichIntegrity`, then emits one big event (400 KB budget) on platform `adobe-target` (or `adobe-analytics`). `isWire` is the runtime type guard used later.
- `background.ts`: executes `target.command` actions: `captures` (session ring), `memory` / `save-dom` / `clear-memory` (local experience history), `status` (cookie identity, saved QA links, whether baseline blocking is on), `save` / `remove` / `open` (QA links, max 50 per origin), `exit` (removes `at_preview_*` and `at_qa_mode` cookies and navigates to a cleaned URL), `block` (installs or removes `declarativeNetRequest` session rules scoped to the tab, ids from 10000, then reloads). `retainTargetExperience` is called for every incoming `page.event` and keeps up to 100 captures (about 1 MB) per tab+origin in session storage, and up to 100 remembered experiences per origin in local storage. `captureQaNavigation` saves a QA link automatically when the tab navigates to a URL containing `at_preview_token=`.
- `qa.ts`: `parseQaLink` (same origin, token required, indexes must be real Adobe style `1`, `1_2`, comma lists), `exitQaUrl`, `baselineRules` (block patterns for at.js, rest delivery, ODE assets, and optionally Edge), `targetCookieIdentity` (mbox session/PC, AMCV ECID, `kndctr_*` cookies, QA cookies).
- `inventory.ts`: `mboxInventory` (schema drift detection across pages), `inventoryCsv`, `odeInventory`, `selectorConflicts` (Target vs other platforms on the same DOM node), `rememberExperiences`.
- `findings.ts` (`targetFindings`) and `integrity.ts` (`enrichIntegrity`, `a4tMatrix`, `integrityFindings`): evidence linked findings and the credential ledger / Target to Analytics correlation. Stored credentials are fingerprinted, never raw.
- `timing.ts`, `privacy.ts`, `replay.ts`: flicker/prehide timing evidence, PII-ish signal detection in requests, and the deliberately limited text-only replay (never evaluates offer HTML, JS or CSS).
- UI: `ui/panel/TargetView.tsx`, `TargetInventory.tsx`, `TargetQa.tsx`.

The docs repeatedly state the epistemic rules the code follows: a delivered response is not proof of render, a missing notification is not proof of lost tracking, QA indexes are not activity ids, and the extension cannot mint QA tokens.

---

## 14. QA features (`src/core/qa/`)

| Feature | Files | How it works |
| --- | --- | --- |
| **Event checks** | `expectations.ts`, `check-run.ts`, `ui/qa/Expectations.tsx` | A rule = platform (or `all`), exact `eventName`, `required` property paths (dot paths), `equals` map (deep equal), and optional `minCount` / `maxCount` (0 to 1000). `maxCount` fails as soon as it is exceeded; `minCount` is judged when the check finishes; `minCount: 0` with no matches passes. The count logic lives in `applyCounts` in `expectations.ts`. `startCheck` snapshots the rules. `recordCheck` is called for every incoming event, independent of the visible log, so clearing the list cannot erase failures. Results: `waiting`, `passed`, `failed`, `unverifiable` (when expected values were redacted or truncated), and at finish `not-observed`. Events with `via: 'queued-before-load'` are ignored. Pausing marks the run `interrupted`. Max 50 rules. |
| **Workspace** | `workspace.ts`, `ui/qa/WorkspaceView.tsx` | Per origin: name, notes, search/filter state, selected activity, pins (max 100), baseline, saved in `storage.local`. `normalizeWorkspace` clamps everything. |
| **Compare** | `ToolsView.tsx` + workspace baseline | Baseline = list of `Assignment {key, name, status, variation, value}` with time and URL. Diff shows additions, changes, and activities no longer reported. |
| **Journey** | `journey.ts`, `ui/qa/JourneyView.tsx`, background | Opt in, per tab, session storage. Entries: `navigation | decision | event | note`. `recordSnapshot` logs a navigation when URL or document id changes and a decision when an activity's signature (`status`, variation, evidence, value) changes. Limits: 500 entries and 750 KB (oldest dropped, `omitted` counted), decision cache capped at 1000. Same origin only. |
| **Report export** | `export.ts` | `createReport` (JSON, `raw` removed), `markdownReport`, `eventsCsv` (formula injection guarded by prefixing `=+@-` cells with `'`), `downloadFile` via Blob. |
| **Preview** | `preview.ts` | `createPreview` diffs query params and path before/after, merges with a previous preview on the same origin, flags `persistent` for VWO, Kameleoon, Convert. `resetPreviewUrl` undoes only parameters that still hold the value Splitscope set. `previewOutcome` reports "Requested assignment observed", a different assignment, or unconfirmed. |
| **Highlight / overlap** | `highlight.ts`, `presentation.ts#selectorConflicts` | Outlines elements for 5 s (up to 100). Overlap hints compare selectors only among assigned variations of active activities. |

---

## 15. Storage map

| Key pattern | Area | Contents |
| --- | --- | --- |
| `splitscope:settings` | local | `analyticsCapture`, `keepLog`, `restorePanel`, `theme`, `dock`, `textSize` (normalized by `normalizeSettings`) |
| `splitscope:workspace:<origin>` | local | Workspace |
| `splitscope:expectations:<origin>` | local | Event check rules |
| `splitscope:target-qa:<origin>` | local | Saved Adobe QA links (max 50) |
| `splitscope:target-qa-observed:<origin>` | local | First time QA cookies were seen |
| `splitscope:target-memory:<origin>` | local | Experience history (max 100) |
| `splitscope:tab:<tabId>` | session | Latest page summary (debounced 500 ms) |
| `splitscope:events:<tabId>` | session | Retained event log (only with `keepLog`) |
| `splitscope:journey:<tabId>` | session | Journey |
| `splitscope:panel:<tabId>` | session | `{open, origin}` for panel restore |
| `splitscope:preview:<tabId>` | session | Preview record |
| `splitscope:target-captures:<tabId>:<origin>` | session | Target wire ring (max 100 / about 1 MB) |
| `__splitscope_pending_force__` | page `sessionStorage` | Queued VWO commands across reload |

---

## 16. Invariants the code is deliberately protecting

Break these and you break the product's trust model:

1. **Observation must not change page behavior.** Every wrapper calls the original with `Reflect.apply`, every observation is in try/catch, response bodies are cloned, nothing is awaited on the site's critical path.
2. **No execution of captured code.** Code is displayed as text. Getters are never invoked. `toString` overrides are bypassed (`function-source.ts`).
3. **Everything crossing a boundary is sanitized and size bounded.** New data paths should go through `sanitize` and, for snapshots, `serializeSnapshot`.
4. **Evidence over assumption.** Statuses like `running-in` require runtime evidence; unknown stays `unknown`; copy in the UI avoids claiming rendering or reporting success. Many tests and docs encode this.
5. **Capture is future only.** Nothing replays old calls; queued messages exist only to cover the handshake window.
6. **Same origin for previews and journeys.**
7. **Message hygiene.** Namespace, per page nonce, `event.source === window`, schema validation, size limits.

---

## 17. Tests and the dev harness

Tests live in `tests/` (`*.test.ts`, run by `tsx --test`): `accor-engine`, `background-bundle`, `bridge-bundle`, `code-capture`, `dashboard-links`, `optimizely-snapshot`, `panel-mount`, `qa-workflows`, `regressions`, `target-module`. The bundle tests read the built output, which is why `npm test` builds first. `panel-mount.test.ts` (13 KB) and `regressions.test.ts` were staged but I did not read them in detail. `linkedom` provides the DOM for adapter tests.

`dev/preview.tsx` renders the panel with sample data, with `dev/mock-browser.ts` standing in for the `browser` API. It is a design fixture only.

---

## 18. Things that will bite you

- **Three version strings** (`package.json`, `wxt.config.ts`, `EXTENSION_BUILD`).
- **`Platform` picklist in `protocol.ts` and the `capabilities()` table in `install.ts`** are easy to forget when touching platforms.
- **Background message allow list** at the top of the router.
- **Dormant popup/options code**: edits there will not show up in the extension unless the manifest hook in `wxt.config.ts` is changed.
- **Dead interfaces** `PlatformAdapter` / `AdapterContext` in `model.ts` can mislead; use `PageAdapter` / `HookHelpers`.
- **Docs can drift from code.** Example: `docs/preview-and-detection.md` says the Kameleoon path is followed by `Experiments.trigger`, but `kameleoon-preview.ts` only calls `assignVariation(…, true)` and then reloads a cleaned URL. When the two disagree, trust the code.
- **Hand-minified style in newer files**: the Adobe Target modules and parts of `background.ts` are written as dense one-liners without spacing. Match surrounding style when editing, or reformat the function you touch.
- **Rebuild is not enough**: after any change, reload the extension and the tab, or old injected scripts keep running (the `bridge.ping` build check is what flags this to the user).
- **Hook and bridge share only `postMessage`**. Anything the bridge needs from a page global must be added as a field in the snapshot or a new command, not read directly.
- Panel keyboard handling uses `isolateEvents` for keydown/keyup/keypress; shortcuts in `App.tsx` skip inputs.

---

## 19. Quick routing: where to change what

| If the task is about... | Start in |
| --- | --- |
| A platform shows wrong status, variation or missing activity | `src/adapters/<platform>.ts` (`listExperiments`) |
| A platform is not detected | the adapter's `detect()`; also `install.ts#scan` observed-platform fallback |
| New or changed event capture for a platform | the adapter's `install()` using `wrapMethod` / `wrapQueue` / `listen` |
| Events missing from network capture | `platform-endpoints.ts`, `install.ts#installNetworkHooks`, background `webRequest` listeners |
| Code / CSS / HTML of a variation not shown | `src/core/changes.ts` and the adapter's `changes` callback |
| Preview / force variation behavior | adapter `force()`, `install.ts` (`handleCommand`, `executeForcePlan`, `applyPendingForce`), `qa/preview.ts`, `ui/panel/PreviewDialog.tsx` |
| Panel layout, tabs, filters, search | `src/ui/panel/App.tsx`, `core/search`, `panel.css` |
| Activity detail screen | `src/ui/panel/ActivityDetail.tsx`, `core/qa/activity-details.ts` |
| Event list, filters, CSV | `src/ui/events/EventFeed.tsx`, `core/qa/export.ts` |
| Event checks | `core/qa/expectations.ts`, `check-run.ts`, `ui/qa/Expectations.tsx` |
| Settings and persistence | `core/settings.ts`, `SettingsView.tsx`, background `settings.*` handlers |
| Toolbar badge, icon, shortcuts | `entrypoints/background.ts` |
| Adobe Target features | `src/core/adobe-target/*`, `src/adapters/adobe-target.ts`, `ui/panel/Target*.tsx` |
| Vendor console links | `src/core/dashboard-links.ts` |
| Size limits or truncation | `core/sanitize.ts`, `core/bridge/snapshot.ts`, `core/bridge/protocol.ts` |

## Changes in 0.3.0

See `CHANGELOG.md`. Points that affect where to change things: `parseWorkspaceImport` in `core/qa/workspace.ts` reads files made by Export workspace; `history` route events are deduplicated by `location.href` in `installHistoryHooks`; Adobe Target timing widens its MutationObserver only while a response is pending; background `popup.*` handlers reject messages that carry `sender.tab`; `webRequest` listeners are filtered to `image` and `ping` request types.

## Changes in 0.4.0 (panel redesign)

The panel layout now follows the screen atlas. In `ui/panel/App.tsx` the order is header, platform chips, preview banner, main, bottom nav, then overlays (settings drawer, toast, preview dialog). Settings is no longer a tab: `changeTab('settings')` opens the drawer, so a `panel.open` request for `settings` still works. `EventFeed` takes a `lead` slot that App uses for Event checks. `ToolsView` has three sections (`report`, `compare`, `overlap`); Journey and Workspace are separate views. Colors live in the token block at the top of `ui/shared/theme.css`; atlas-specific layout rules are at the end of `ui/panel/panel.css`. Icon-only buttons carry an `aria-label`, and `tests/panel-mount.test.ts` finds buttons by text or aria-label.

Also new in 0.4.0: `ui/shared/ConfirmModal.tsx` is the shared confirmation dialog (clear event log, replace or delete a journey). `ui/panel/target-data.ts` holds `useTargetData`, which loads Target wire captures and findings once; App uses it for the findings count on the Adobe Target toggle and passes the same data to `TargetView`. Activity preview now starts from one Preview button in the detail Actions row, which opens a variation picker before the page is asked for a force plan.

## Changes in 0.4.1 (capture budgeting and platform extractors)

`core/bridge/snapshot.ts` now serializes a snapshot in three passes: structural summaries for every activity, then change code (shared fairly with a water-filling allocator, so small items always fit and only large ones are clipped), then raw platform data with whatever is left. `fitChanges` drops malformed change records instead of invalidating an activity. `core/sanitize.ts` clips an oversized string in place (keeping its start and a `…[truncated]` marker) rather than replacing it with `[payload truncated]`. `core/changes.ts` also reads `modifications` (AB Tasty), `domMutations` (GrowthBook) and a change's `data` object (Convert). `core/hooks/runtime.ts` exports `mapSafely`, which every adapter uses so one bad record cannot hide a platform's other activities. VWO code is read from `sections[*].variations[combinationId]`.

## Changes in 0.5.0 (Reset visitor)

`core/visitor-reset.ts` holds the pure logic: `resetRules` (cookie and storage name patterns per platform, split into assignment and identity groups), `planReset` (what exists now), `runReset` (expire cookies on the host and parent domains and remove storage keys, then report what remains) and `browserEnv`. `ui/qa/ResetVisitor.tsx` is the screen, reached from Tools, Reset visitor. It runs in the content script, which shares cookies and storage with the page, so no hook or background message is needed. Add a platform by adding an entry to `resetRules`.

## Changes in 0.6.0 (platform tools)

A platform adapter can now declare `actions`, a map of page world functions the panel can call. The panel calls `onPlatformAction(platform, action, args)`, which `entrypoints/bridge.content.tsx` turns into a `platformAction` command with a request ID. The hook (`core/hooks/install.ts`, `handleCommand`) runs the action and answers with a `status` message of `platform-result`, which the bridge matches to the waiting promise (8 second timeout). Results must be plain data and are sanitized on the way out.

Optimizely: actions live in `adapters/optimizely.ts` (visitor, setAttribute, setPage, trackEvent, audiences). `core/optimizely/audiences.ts` evaluates audience conditions in the panel, with unknown as a third result. The UI is `ui/qa/OptimizelyTools.tsx`. The last seen snippet revision per project is stored in `Workspace.revisions`.

Kameleoon: actions live in `adapters/kameleoon.ts` (visitor, experiments, setCustomData, resetCustomData, processConversion, setConsent, block, reevaluateSegment), following the Kameleoon Activation API. The UI is `ui/qa/KameleoonTools.tsx`. Both tool screens appear as extra tabs under Tools when their platform is detected. To add tools for another platform, add `actions` to its adapter and a screen that calls `onPlatformAction`.

## Changes in 0.6.1 (polish)

Navigation with many items uses `.ss-chips` (wrapping pill buttons): the Tools menu in `App.tsx` and the Adobe Target tool menu in `TargetView.tsx`. Platform sub tabs keep the underline `.ss-tabs`. The hook (`install.ts`) now skips posting a snapshot whose content (ignoring `capturedAt`) matches the previous one, except for a 15 second heartbeat, and spaces scans by the measured scan cost (`scanCost`). `forcePublish` bypasses the dedupe for Rescan and for the first snapshot after connecting.
