# On-page workflow, preview and detection changes

## Behavior

- The built manifest has no action popup or standalone options entry. Clicking the toolbar opens the on-page panel; its gear opens Settings within that panel.
- Per-tab open state is stored in extension session storage, scoped to the site's origin. “Restore panel after reload” controls restoration. Explicit close records a closed state; page unloading does not.
- A platform strip stays above the inspector tabs. Toolbar badge reports `running-in` activity count; detection changes both the badge background and toolbar icon color. Navigation resets the toolbar until the next scan.
- Scans continue while the page is visible, even when a platform loads late after consent. History, popstate, hash changes and captured events also refresh state. Missing runtime state stays unknown rather than being treated as active.
- Preview confirmation provides current-tab and new-tab destinations. New tabs are created by the extension, with the inspector open state saved before navigating. Shared cookies mean this is not visitor isolation.

## Adobe Target

Observed platform calls provide fallback detection evidence independently of activity availability. A failed experiment reader no longer loses the platform record. Detection records are validated independently so one malformed vendor result does not discard every platform. Numeric SDK versions are normalized before transport.

DOM listeners use the capture phase, including events dispatched on `document`. Adobe token extraction handles arrays and nested delivery objects, preserves experience ID zero, and maps explicit activity type metadata. Historical traces or delivery responses alone are not proof of current rendering; successful rendering events supply the stronger active signal.

This addresses plausible code causes of “getOffers is logged but Adobe is not detected.” The exact site-specific cause still requires the reported URL and diagnostics.

## Convert

The prior merge replaced each full configuration record with its current decision, frequently losing the variation list. Configuration and assignment fields are now merged per activity.

The preview action now uses `convert_action=convert_vpreview`, `convert_e` and `convert_v`, removing conflicting `_conv_eforce`. This differs from forcing a live experience: force URLs require an active experience and matching Site Area/Audience conditions. The configured site and experience location must support the page being previewed. Vendor reporting behavior is described in the confirmation.

References:

- [Convert runtime and preview parameters](https://docs.developers.convert.com/v1.0-web/docs/window-convert-object)
- [Previewing variations](https://support.convert.com/hc/en-us/articles/204506649-how-do-i-preview-variations)
- [Force variation prerequisites](https://support.convert.com/hc/en-us/articles/204506629-how-do-i-force-a-specific-variation-for-an-experiment-based-on-query-strings)

## Kameleoon

The prior action passed string IDs and an undocumented third argument to `assignVariation`, then immediately reloaded. The new path queues `Experiments.assignVariation` with numeric IDs before engine activation, followed by `Experiments.trigger`. It supports reference variation ID zero. The extension consumes a temporary URL parameter before the vendor reads the page URL, so this works for either destination without invoking the assignment in the source tab first.

This is a counted assignment, not Kameleoon simulation mode. The UI explicitly restricts this action to A/B experiments; personalizations require a simulation link. Assignment may affect shared visitor state. SDK availability and consent still apply. No claim is made that an assignment is visually rendered until the platform reports it.

References:

- [Kameleoon command queue and documented two-argument assignment example](https://help.kameleoon.net/command-queue.html)
- [Kameleoon documented experiment trigger example](https://help.kameleoon.com/integrations/cms-e-commerce/shopify/shopify-checkout-ab-testing)
- [Simulation mode](https://www.kameleoon.com/v/Iwkxqx_SragcY5io/blog/kameleoon-simulation-mode)

## Activity types

All adapters use either explicit vendor metadata or distinct vendor collections. The shared mapping covers A/B, personalization, multivariate, split URL, feature tests, surveys, and recommendations. Optimizely retains its campaign-policy classification; Kameleoon uses separate experiment/personalization collections; Unbounce identifies its landing-page split.

Unknown vendor codes are displayed as “Type not exposed.” Counting variations, finding a cookie, or detecting a particular vendor is not sufficient to classify an activity. OneSignal does not expose page experiment inventory. Additional vendor-specific numeric codes require real runtime examples and documented mappings.

## Troubleshooting

Build minification is disabled and source maps are emitted. Diagnostics have timestamp, scope, message, and sanitized details, with bounded history and duplicate-rate limiting. The panel includes a render-error fallback and copyable diagnostics. Snapshot rejections, mount errors, storage failures and hook-reader failures are logged with a `Splitscope` prefix. The nonce remains correlation only, not authentication against the host page.

TypeScript and MV3 compilation were performed. Automated tests and live vendor switching were not run. The affected URLs and a new diagnostic capture are needed to verify the reported failures end to end.

## Bridge lifecycle hotfix (0.1.1)

Reported symptoms: missing `runtime.sendMessage`, invalidated extension contexts, opaque handler errors, and toolbar clicks without a panel.

Code findings and corrections:

- WXT stops the prior content script on reinjection. The old persistent installed flag prevented its replacement from starting. The bridge now has per-instance ownership and clears its marker during cleanup; it does not suppress replacement startup.
- Extension API calls can throw synchronously after an extension reload. All bridge sends now enter an async guarded wrapper that catches both synchronous exceptions and rejected promises. Invalid contexts retire quietly and unregister page, settings and runtime listeners.
- Runtime responses now use `sendResponse` with an explicit `true` return, compatible across the declared Chrome range. See [Chrome message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging).
- The toolbar checks a versioned `bridge.ping` reply before deciding whether to inject. It targets the top frame explicitly, serializes concurrent connection attempts, and requires a mounted acknowledgement when opening the panel. Failed startup produces an actionable toolbar error instead of silent success.
- Concurrent panel opens share the same mount promise. Late mounts check the context again before attaching. The host gets an explicit stacking order.
- Diagnostics serialize details into the log message, preserving readable error and stack information in Chrome's extension error list.

TypeScript compilation and the MV3 build succeeded. No live Chrome reproduction or automated tests were run in this hotfix. After loading 0.1.1, refresh existing website tabs once: previous builds' already-injected scripts cannot be retroactively repaired by rebuilding files.

## Detection, detail views and switching (0.1.2 — 2026-09-29)

### Adobe Target

- Neither `alloy`, an empty `adobe.target`, general `adobedc.net` traffic, nor Adobe Analytics `sc.omtrdc.net` traffic now identifies Target. Detection requires Target API methods, Target response tokens, a Target lifecycle event, or a delivery request to the Target-specific endpoint. URL classification parses the hostname; vendor names in arbitrary query strings do not qualify.
- Current delivered decisions appear active with a delivery explanation. Prefetch branches and historical trace data remain unconfirmed. Rendering success/failure events update the explanation and state, correlating sparse events only by an explicit request ID or mbox. The panel does not claim that a delivered offer necessarily rendered.
- Array and object response-token shapes are supported, including metadata beside offers. `getOffers` promise results are inspected without replacing the site's promise or changing its result. Sparse observations preserve captured change definitions.
- Web SDK monitoring emits only for Target response metadata. `renderAttempted` propositions count as delivered, not proof of successful visual execution.
- Response tokens are useful activity metadata and are retained in Raw; credentials and sensitive fields remain redacted.

References: [Adobe response tokens](https://experienceleague.adobe.com/en/docs/target-dev/developer/client-side/aep/accessing-response-tokens), [at.js lifecycle changes](https://experienceleague.adobe.com/en/docs/target-dev/developer/client-side/at-js-implementation/target-atjs-versions).

### Kameleoon / Accor

Opened https://all.accor.com/a/en.html in the browser and confirmed the DOM loads `https://qchmhd61sj.kameleoon.eu/engine.js`. Inspected that public source separately. Its `assignVariation` implementation preserves an existing registered variation unless its third argument is true. The previous two-argument queue call therefore silently kept prior assignments.

The replacement queues a callback, validates the activity/variation against the public API, calls `assignVariation(experimentId, variationId, true)`, checks the resulting assignment, and navigates to the clean URL for a fresh render. It does not apply a second set of changes on top of the first or manufacture a simulation URL. Normal site eligibility and tracking still apply. Personalizations require vendor simulation links. Numeric variation ID 0 is supported. Failures leave the page in place and produce a readable preview diagnostic.

The public API's `trafficDeviation` field supplies variation weights. Optional loaded variation definitions supply CSS and `javaScriptCode.code`, matched by variation and campaign IDs when present. These internal fields are best-effort, read-only, and may change; their absence does not prevent activity inspection.

References: [Kameleoon command queue](https://help.kameleoon.net/command-queue.html), [Accor's observed engine](https://qchmhd61sj.kameleoon.eu/engine.js).

### UI and Raw

Detail tabs reflect the specific activity: Changes requires captured definitions, Targeting requires actual rules, Events follows platform support. Unsupported switching stays unavailable, with explanatory text. Traffic allocation cards appear only when a number is exposed. Activity-level and variation-level code have expandable, copyable viewers; none is executed by the inspector.

Raw includes the entire captured normalized activity, original source data, platform detection/capabilities, and explicitly linked events. It is not a dump of vendor account data or secrets. Strings are bounded at 100,000 characters, collections at 500 items, and payload/depth bounds remain. Truncation and omitted getters are indicated. Screenshots in `docs/activity-code-preview.png` use sample data, not Accor or HCF.

### Bridge

Startup now catches context invalidation during extension listener registration and disposes its listeners and WXT lifecycle together. Error recognition handles errors from another execution context (where `instanceof Error` fails). This also preserves error messages instead of losing them as empty objects. Real startup failures still produce a readable diagnostic. Existing tabs must be refreshed after upgrading to replace code injected by the previous build.

### Checks and limits

- TypeScript and the Chrome MV3 build pass.
- Regression checks cover Adobe false positives, delivered versus prefetched activities, response-token shapes, rendering correlation/failure, offer code, redaction, adaptive tabs, Kameleoon overwrite and verification, and long code payloads.
- Tests execute the built bridge against missing runtime, listener-registration invalidation and rejected messaging scenarios.
- An optional compatibility test extracts only the assignment function from Accor's public engine and confirms both the old failure and the replacement behavior. Run with `SPLITSCOPE_KAMELEOON_ENGINE=/path/to/downloaded/engine.js npm test`.
- Browser checks of production UI components with sample data confirm collapsed/expanded code, Raw expansion and adaptive tabs; no console errors were reported.
- The rebuilt extension has **not** been exercised end to end inside Chrome on Accor, HCF or TF1. The available browser session has no loaded Splitscope extension. Live visual switching, HCF delivery coverage and Chrome extension reload behavior remain to be confirmed there.

## Panel opening follow-up (0.1.3)

The Keurig screenshot logs the catch site, not the underlying exception. Live Chrome access was unavailable, so the exact site-specific cause remains unconfirmed.

A separate panel lifecycle defect was found: reopening an existing UI can finish synchronously, clearing `mounting` before its resolved promise is assigned. Later opens then reuse that stale promise and never mount. Cleanup now runs in the promise's `finally` callback, after assignment. The production bundle is exercised through six open/close cycles in a DOM harness.

Panel CSS is bundled into the content script with `?inline`, so opening does not wait for a fetch of `chrome-extension://.../bridge.css`. The manifest no longer needs to expose that stylesheet. The mount acknowledgement checks that the host is actually connected.

The background now requires a matching bridge build as well as protocol. Logs include version 0.1.3. Page-handler errors include the original message, stack, incoming message type and page URL. If opening fails, an independent on-page error card displays the exact opening error and build version; it does not depend on the Preact panel rendering successfully.

TypeScript/build pass. The regression suite reports 19 passing tests and one optional Accor engine check skipped. The new tests exercise the actual compiled bridge, including real shadow DOM mounting, repeated reopening, blocked stylesheet fetching, snapshots and malformed events. These are simulated DOM checks, not a live Chrome/Keurig reproduction.

## Unreachable background worker (0.1.4)

The supplied page-console errors report `Could not establish connection. Receiving end does not exist.` for settings, summaries and saved events. They establish that the background message receiver is unreachable, but do not identify a worker registration/startup exception. The follow-up supplied the same bridge errors; no background startup trace was available.

Removed synchronous OffscreenCanvas icon drawing from background startup and from badge updates. Packaged PNG icons retain grey/green platform indication. All core listeners are registered before optional icon setup, whose errors are caught. Optional webRequest registration is also guarded, so its failure does not abort worker initialization. A `background.ping` endpoint returns the running build, and a successful startup logs `[Splitscope/background v0.1.4] Ready`.

New tests execute the built worker with no DOM, OffscreenCanvas or ImageData. They check settings replies, the build handshake, toolbar click forwarding, packaged icons, and continued operation when optional icon/network APIs fail. Full suite: 22 passed, one optional Accor-source test skipped. TypeScript and the MV3 build pass. The user's Chrome failure remains unconfirmed until the updated worker starts there or its startup error is available.
