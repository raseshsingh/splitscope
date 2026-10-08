# Splitscope: Build Plan

A Manifest V3 Chrome extension for the A/B testing and CRO community. It detects experimentation platforms on any page, lists every experiment and variation it can see, explains each one in depth (variations, traffic split, changes, code), lets you switch variations for QA where the platform allows it, and streams every platform event into a live log that sits on top of the page.

> Working name: **Splitscope** (an instrument for looking inside split tests). Easy to rename later; the name only appears in the manifest, the panel header and the store listing.

Date of plan: 28 September 2026
Status: Plan, pre-build. Nothing in this document has been implemented yet.

---

## Table of contents

1. Goals, users and scope
2. Platform research findings
3. Capability matrix
4. Architecture
5. Adapter contract and data model
6. Detection engine
7. Event tracker
8. Variation switching and the Forcing Manager
9. UI and UX design
10. Search
11. Extra features beyond the brief
12. Tech stack and project structure
13. Manifest and permissions
14. Performance budgets
15. Privacy and security
16. Testing strategy
17. Delivery phases and acceptance criteria
18. Risks and mitigations
19. Open questions
20. References

---

## 1. Goals, users and scope

### Who it is for

| User | What they need from the tool on a typical day |
|---|---|
| CRO / experimentation developer | Confirm the variation code actually ran, see which selectors it touched, force each variation during build and QA, watch the goals fire. |
| QA engineer | Walk through every variation of every test on a page, check tracking events, produce evidence for a ticket. |
| Analyst | Check which events and properties are sent to which platform, find duplicate or missing goals. |
| Strategist / PM / client | See what is live on a page without logging into five platform UIs. |

### The five jobs the extension must do well

1. **Tell me what is here.** Which platform(s) are on this page, which experiments are live, which variation am I in.
2. **Explain one experiment.** Variations, traffic distribution, what each variation changes, the code it applies, targeting and goals where exposed.
3. **Let me switch.** Force a specific variation for QA, then reset cleanly.
4. **Show me the tracking.** A live log of every event pushed to the platform (name, properties, source, time, who called it).
5. **Find anything fast.** A search box that matches experiment name, experiment ID, variation ID or variation name across all platforms on the page.

### Platforms in scope (v1)

Adobe Target, Optimizely, VWO, Kameleoon, AB Tasty, Convert, Dynamic Yield, Unbounce, Monetate, Zoho PageSense, OneSignal.

> "Chameleon" in the brief is interpreted as **Kameleoon** (the experimentation platform). Chameleon.io (product tours with experiments) can be added later as its own adapter if wanted.

### Out of scope for v1 (planned later)

Server-side SDK introspection beyond what reaches the browser, a DevTools panel, cross-browser builds (Firefox, Edge store listing), team sharing / cloud sync, element picker ("which test changed this element?") beyond selector highlighting.

### Guiding principle: honesty about what the browser can see

Each platform exposes a different amount of data to the browser. Some ship their whole configuration in the snippet (Optimizely, VWO, Kameleoon, AB Tasty, Convert), some only return what was decided for this visitor (Adobe Target, Monetate, Dynamic Yield), and one is not an experimentation tool at all (OneSignal). The UI must never pretend. Every field shows where it came from, and every missing capability is explained in plain words ("Adobe Target only sends the activities you qualified for, so the full list is not available in the browser").

---

## 2. Platform research findings

This section records what was confirmed in official documentation, what comes from widely used community integrations, and what must be verified on a live site during the Phase 0 spike. Confidence labels:

* **Documented**: taken from the vendor's own docs.
* **Community**: used in public integration code (GTM templates, gists, partner docs) for years, but not a vendor contract.
* **Verify**: plausible or partially documented; must be confirmed against a live install in Phase 0 before the adapter depends on it.

### 2.1 Optimizely Web Experimentation (and Performance Edge)

**Detection signals**
* `window.optimizely` with a `get` function (Web Experimentation). `window.optimizelyEdge` for Performance Edge. *Documented*
* Script from `cdn.optimizely.com/js/<projectId>.js`. Event beacons to `logx.optimizely.com`. *Community*

**Reading data** *Documented*
* `optimizely.get('data')`: saved project data (campaigns, experiments, pages, events, audiences, revision).
* `optimizely.get('state')`: `getActiveExperimentIds()`, `getCampaignStates()`, `getExperimentStates()`, `getPageStates()`, `getRedirectInfo()`, `getVariationMap()`, `getDecisionString()`, `getDecisionObject()`.
* `optimizely.get('visitor')`: visitor attributes, device, first session, source type.
* Variation change definitions (custom code, CSS, attribute changes, redirects) are present in the snippet data; exact field names for weights and changes will be pinned in Phase 0. *Verify*

**Events** *Documented*
* All commands go through `window.optimizely.push({ type: ... })` (for example `event`, `page`, `user`, `activate`, `bucketVisitor`, `optOut`). Wrapping `push` gives a full command log.
* `addListener` with filter types `lifecycle` and `analytics`; names include `initialized`, `activated`, `campaignDecided`, `pageActivated`, `pageDeactivated`, `originsSynced`, `trackEvent`.

**Switching variations** *Documented*
* `?optimizely_x=<variationIds>` (comma-separated variation IDs) overrides bucketing and disables tracking. Requires the project setting "Disable the force variation parameter" to be turned off.
* `?optimizely_token=PUBLIC` shows draft or paused experiments if the project allows it.
* `bucketVisitor` API assigns a visitor to a variation (fallback when force parameters are disabled).
* Other useful parameters: `optimizely_disable=true`, `optimizely_x_audiences=<ids>`, `optimizely_force_tracking=true`, `optimizely_log=info|debug|all`, `optimizely_opt_out=true`.

**Also worth supporting**
* Optimizely Feature Experimentation in the browser: when the page fetches a datafile (`cdn.optimizely.com/datafiles/<sdkKey>.json`), parse it to list flags, rules, variations and traffic allocation. Decisions themselves are not visible unless the SDK instance is reachable. *Verify* (partial support, labelled as such).

### 2.2 Adobe Target (at.js 2.x and Adobe Experience Platform Web SDK)

**Detection signals**
* at.js: `window.adobe.target` with `VERSION`; requests to `*.tt.omtrdc.net/rest/v1/delivery`. Cookies `mbox`, `at_check`. *Community*
* Web SDK: the global instance (usually `alloy`); edge requests to `*.adobedc.net/ee/...`. *Community*
* Often loaded through Adobe Launch / Tags (`assets.adobedtm.com`). *Community*

**Reading data**
* Target only returns activities the visitor qualified for. There is no full activity list in the browser.
* **Response tokens** carry `activity.id`, `activity.name`, `experience.id`, `experience.name`, `offer.id`, `option.id` and profile values, but only the tokens an admin has switched on. *Documented*
* at.js custom events: `document.addEventListener(adobe.target.event.REQUEST_SUCCEEDED, e => e.detail.responseTokens)`. *Documented*
* The delivery response itself contains the offer content (HTML, JSON, or action lists with selectors), so intercepting it lets us show "what code is being applied". *Verify* (shape per at.js version).
* Web SDK monitoring hooks: push an object onto `window.__alloyMonitors` before the SDK loads to receive `onInstanceCreated`, `onInstanceConfigured`, `onBeforeCommand`, `onCommandResolved` (with `result`, which contains propositions), `onCommandRejected`, `onBeforeNetworkRequest`, `onNetworkResponse`. *Documented*. This is the cleanest official hook of any platform in the list.

**Events**
* at.js functions to wrap: `getOffer`, `getOffers`, `applyOffer`, `applyOffers`, `trackEvent`, `triggerView`, `sendNotifications`. at.js lifecycle DOM events (`at-library-loaded`, `at-request-start`, `at-request-succeeded`, `at-request-failed`, `at-content-rendering-*`). *Documented / Verify exact names in spike*
* Web SDK commands via monitors (`sendEvent`, `applyPropositions`, `setConsent`, and so on).

**Switching variations**
* No client-side force API. Target QA links (`at_preview_token`, `at_preview_index`, `at_preview_listed_activities_only`, audience override params) are generated in the Target UI. The extension will: detect when a QA link is active, parse it, let the user save QA links per activity, and switch experience index within a saved link. *Verify parameter semantics in spike*
* Useful toggles: `mboxDisable=1` to see the page without Target.

### 2.3 VWO

**Detection signals** *Community*
* `window._vwo_code`, `window._vwo_exp`, `window._vwo_exp_ids`, `window.VWO`, `window._vis_opt_queue`.
* SmartCode from `dev.visualwebsiteoptimizer.com/j.php` (or `/lib/<acc>.js`). Cookies `_vwo_uuid*`, `_vis_opt_exp_<id>_combi`.

**Reading data** *Community (stable for many years, used by GTM templates and analytics vendors)*
* `_vwo_exp[id]`: `name`, `type` (`VISUAL_AB`, `SPLIT_URL`, `VISUAL`, `SURVEY`, ...), `status`, `pc_traffic` (percent of traffic in the test), `combs` (weight per variation), `comb_n` (variation names), `sections[n].variations[v]` (a JSON string of changes with `js`, `css`, `xpath`), `goals`, `combination_chosen` (your variation), `ready`, `url` / `urlRegex` / `exclude_url`.

**Events** *Documented*
* `VWO.push(['onVariationApplied', cb])` gives `['vS', expId, variationId]`.
* `VWO.push(['onEventReceive', <code>, cb])` for lifecycle codes such as `vA` (variation applied), `cC` (bucketed), `rC` (goal conversion), `uC`, `vAE` (variation apply error, with the error object).
* `VWO.event(name, properties)` for Data360 custom events (routes through `VWO.push(['event', ...])`).
* Legacy: `_vis_opt_queue`, `_vis_opt_revenue_conversion`, `VWO.push(['track.revenueConversion', value])`.

**Switching variations**
* `VWO.push(['setVariation', [{ e: '<campaignId>', v: '<variationId>' }]])` must run **before SmartCode**. Only works in live mode. *Documented*
* Fallback: rewrite `_vis_opt_exp_<id>_combi` cookie and reload. *Community*
* Preview mode sets cookies prefixed `debug_` (for example `debug_vis_opt_exp_14_combi`); the extension should detect and label preview sessions. *Documented*

### 2.4 Kameleoon

**Detection signals**
* `window.Kameleoon` with `Kameleoon.API`; command queue `window.kameleoonQueue`. Engine file `engine.js` (formerly `kameleoon.js`) from a `*.kameleoon.*` host. *Documented / Community*

**Reading data** *Documented*
* `Kameleoon.API.Experiments.getAll()`, `getActive()`, `getById(id)`, `getByName(name)`; experiment objects include `associatedVariation` and a `variations` list with `deviation` (allocation). Personalizations mirror this under `Kameleoon.API.Personalizations`.
* `Kameleoon.API.Visitor` and `Kameleoon.API.CurrentVisit` for visitor code, consent state, visits, geolocation.
* Variation CSS/JS exposure on the variation object: *Verify*.

**Events** *Documented*, fired as DOM events on `window`:
`Kameleoon::Loaded`, `Kameleoon::Aborted` (with reason: BROWSER, PRERENDER, STORAGE, TIMEOUT, DISABLED, PARAMETER, SCRIPT), `Kameleoon::Started`, `Kameleoon::DataGathered`, `Kameleoon::FeatureFlagFileLoaded`, `Kameleoon::RemoteSynchronizationPerformed`, `Kameleoon::LegalConsentUpdated`, `Kameleoon::ExperimentTriggered`, `Kameleoon::ExperimentActivated`, `Kameleoon::PersonalizationTriggered`, `Kameleoon::PersonalizationActivated`, `Kameleoon::CustomDataSet`, `Kameleoon::ConversionTriggered`, `Kameleoon::SegmentTriggered`, `Kameleoon::ConversionScoreComputed`.
Plus wrapped calls: `Kameleoon.API.Events.trigger`, `Kameleoon.API.Goals.processConversion`, `Kameleoon.API.Data.setCustomData`, `kameleoonQueue.push`.

**Switching variations**
* `Kameleoon.API.Experiments.assignVariation(experimentId, variationId, override)` then reload. *Documented (override entry point)*
* `?kameleoonDisabled=true` disables the engine (Aborted reason PARAMETER). *Documented*

### 2.5 AB Tasty

**Detection signals** *Documented / Community*
* `window.ABTasty`, tag from `try.abtasty.com/<id>.js`, cookies `ABTasty` and `ABTastySession`, hits to `ariane.abtasty.com`.

**Reading data** *Documented*
* `ABTasty.accountData.tests`: every active campaign on the account (full detail).
* `ABTasty.results`: simplified per-campaign status, including **why** a campaign was rejected for this visitor. This is gold for QA and will get first-class UI ("Why am I not in this test?").
* `ABTasty.getTestsOnPage()`, `ABTasty.getCampaignHistory()`, `ABTasty.visitor.id`, `ABTasty.accountData.accountSettings`, `ABTasty.redirectedFrom`.
* Versioned API: `ABTasty.api.v1.getValue(...keys, callback)` with change callbacks for mutable values (consent, started).
* Variation modifications and traffic weights inside `accountData.tests[id]`: *Verify field names*.

**Events** *Documented*
* Window/document events prefixed `abtasty_` (for example `abtasty_executedCampaign` with `detail.campaignId` and `detail.variationId`, `abtasty_consentValid`, `abtasty_resetActionTracking`). `ABTasty.eventState` keeps state of some of them.
* Tracking functions to wrap: `ABTastyClickTracking(name, null, campaignId)`, deprecated `ABTastyEvent`, `abtasty.send(hitType, params)` (Universal Collect hits: event, transaction, item, pageview, batch).

**Switching variations** *Documented*
* Rewrite the `th` part of the `ABTasty` cookie (campaignId.variationId pairs; original is `0`) and reload.
* The vendor's own QA Assistant (Alt+Q+A / Ctrl+Q+A) also switches; we link to it rather than compete with it.

### 2.6 Convert Experiences

Convert has the most complete, current developer docs in this list.

**Detection signals** *Documented / Community*
* `window.convert`, `window._conv_q`. Script from `cdn-*.convertexperiments.com`. Cookies `_conv_v`, `_conv_s`.

**Reading data** *Documented*
* `convert.currentData.experiences[id].variation` with `id`, `name`, `key`, `status`, `traffic_allocation`, `changes`.
* `convert.historicalData` for past participation, `convert.data` for configuration (device, geo, and in the current script the experiences list), `convert.getVisitorSegments()`.
* Legacy script used `experiments` instead of `experiences` and different field names; the adapter handles both.

**Events** *Documented*
* `_conv_q.push({ what: 'addListener', params: { event, handler } })` with events `snippet.initialized`, `snippet.segments_evaluated`, `snippet.experiences_evaluated`, `snippet.goals_evaluated`, `experience.activated`, `experience.variation_decided`, `goal.triggered`, `location.activated`, `location.deactivated`, `url.changed`, `render.complete`. Listeners must be registered before the script processes them, which our document_start hook guarantees.
* Commands to log: `triggerConversion(s)`, `sendRevenue`, `pushRevenue`, `identify`, `consentRequired`, `consentGiven`, `executeExperience`, `setIntegrationVariable`, and the rest of the queue API.

**Switching variations** *Documented*
* `?_conv_eforce=<expId>.<varId>` (comma-separated for several).
* `triggerExperienceVariation` command for runtime forcing.
* Preview: `convert_action=convert_vpreview&convert_e=<expId>&convert_v=<varId>`.
* Tooling params: `convert_disable=true`, `_conv_prevent_tracking=true`, `convert_log_level=debug`.

### 2.7 Dynamic Yield

**Detection signals** *Community*
* `window.DY`, `window.DYO`, scripts `cdn.dynamicyield.com/api/<sectionId>/api_dynamic.js` and `api_static.js`, cookies `_dyid`, `_dyjsession`, `_dyid_server`.

**Reading data**
* `DYO.getUserObjectsAndVariations()`: campaigns executed on the page for this user. `DYO.getRenderedObjectsOnPage()`: campaigns rendered. *Community (referenced in partner docs)*
* `DY.recommendationContext` (page type and data), section ID. *Community*
* No full campaign list and limited variation detail in the browser.

**Events**
* `DY.API('event', { name, properties })` for custom events (also `'spa'`, `'context'` calls). *Documented in partner integrations*
* Beacons to DY collection hosts via network capture.

**Switching variations**
* No client-side force. Preview links are generated in the DY console (valid 45 days); API campaigns use `?dyApiPreview=<token>`. *Documented*. The extension will detect and label preview mode, and store preview links per campaign so QA can jump between them.

### 2.8 Unbounce

**Detection signals** *Community*
* `window.ub.page` with `id`, `variantId`, `usedAs`; Unbounce page markup (`lp-pom-*` classes), `lp` global. Popups and sticky bars through `*.ubembed.com`.

**Reading data**
* Current page ID and variant letter only. Smart Traffic and A/B weights are server-side.

**Events**
* Form submissions, button and link clicks (Unbounce conversion goals, click-tracking links), network beacons.

**Switching variations** *Community (Unbounce staff answer)*
* Append `/<letter>.html` to the page URL (for example `/b.html`). These visits are not counted in stats, which is exactly what QA wants.
* "Discover variants" button: probes `a.html` to `z.html` with same-origin `HEAD` requests on demand (never automatically).

### 2.9 Monetate (Kibo)

**Detection signals** *Documented / Community*
* `window.monetateQ`, `window.monetateT`, tag from `se.monetate.net`, engine calls to `engine.monetate.net` and tracking to `f.monetate.net`.

**Reading data**
* Experiences for this visitor come back from the engine request. During third-party analytics integration Monetate exposes a `campaigns` array with `id`, `key`, `split`. *Documented*. The adapter will read decisions from intercepted engine responses. *Verify shape*

**Events** *Documented*
* `monetateQ.push([...])` commands: `setPageType`, `addProducts`, `addProductDetails`, `addCartRows`, `addPurchaseRows`, `addCategories`, `setCustomVariables`, `trackEvent`, and `trackData` (which flushes and clears the queue). The log will show the full data feed per `trackData`, which is the most common Monetate debugging need.

**Switching variations**
* Not available client-side; preview and public preview links come from the platform. Detect and label preview mode, store links.

### 2.10 Zoho PageSense

The thinnest public developer documentation in the list; the custom event snippet is only shown as an image in Zoho's help centre. PageSense needs the most Phase 0 work.

**Detection signals** *Verify*
* Tracking script from `cdn.pagesense.io/js/<org>/<hash>.js`, a `window.pagesense` queue.

**Reading data** *Verify*
* Runtime experiment and variation objects to be mapped on a live site.

**Events** *Verify*
* Custom event goals via a `pagesense.push(['trackEvent', '<name>'])` style queue call; network beacons.

**Switching variations** *Verify*
* Preview links from the PageSense UI; runtime forcing to be investigated.

### 2.11 OneSignal (Web SDK v16)

OneSignal is a messaging platform, not a page experimentation tool. Its A/B tests run on push messages server-side. The adapter is an **engagement inspector**, and the UI says so clearly.

**Detection signals** *Documented*
* `window.OneSignalDeferred`, `window.OneSignal`, script `cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js`, service worker `OneSignalSDKWorker.js`.

**Reading data** *Documented*
* App ID (from `init`), `OneSignal.Notifications.permission`, `OneSignal.Notifications.isPushSupported()`, `OneSignal.User.PushSubscription.id` / `optedIn` / `token`, `OneSignal.User.externalId`, tags.

**Events** *Documented*
* `OneSignal.Notifications.addEventListener` for `click`, `foregroundWillDisplay`, `dismiss`, `permissionChange`, `permissionPromptDisplay`; `OneSignal.Slidedown.addEventListener('slidedownShown')`; `OneSignal.User.PushSubscription.addEventListener('change')`.
* Wrapped calls: `login`, `logout`, `User.addTag(s)`, `User.removeTag(s)`, `User.addEmail`, `User.addSms`, `Session.sendOutcome`.

**Tools instead of switching**
* Show the slidedown prompt, copy subscription ID, add or remove a test tag.

---

## 3. Capability matrix

What each adapter can deliver in v1. "Partial" always comes with an explanation in the UI.

| Platform | Detect | All experiments | Live on page + my variation | Switch variation | Traffic split | Changes / code | Event log |
|---|---|---|---|---|---|---|---|
| Optimizely Web | Yes | Yes | Yes | Yes (URL force, `bucketVisitor`) | Yes (verify fields) | Yes | Yes (push + listeners + beacons) |
| Adobe Target | Yes | No (qualified only) | Yes (tokens, delivery, Web SDK) | Via saved QA links | No | Yes (delivered offers) | Yes (at.js + Web SDK monitors) |
| VWO | Yes | Yes | Yes | Yes (`setVariation`, cookie) | Yes | Yes | Yes |
| Kameleoon | Yes | Yes | Yes | Yes (`assignVariation`) | Yes | Partial (verify) | Yes (15 DOM events + calls) |
| AB Tasty | Yes | Yes | Yes (+ rejection reasons) | Yes (cookie `th`) | Verify | Verify | Yes |
| Convert | Yes | Yes | Yes | Yes (`_conv_eforce`, command) | Yes | Yes | Yes |
| Dynamic Yield | Yes | Partial | Yes | Via saved preview links | Partial | Partial | Yes |
| Unbounce | Yes | Variants of this page | Yes (variant letter) | Yes (`/x.html`) | No | No | Yes (forms, clicks) |
| Monetate | Yes | No | Yes (engine response) | Via saved preview links | Split name | Verify | Yes (full `monetateQ` feed) |
| PageSense | Yes | Verify | Verify | Verify | Verify | Verify | Yes (queue + beacons) |
| OneSignal | Yes | Not applicable | Not applicable | Not applicable | Not applicable | Not applicable | Yes (SDK events + calls) |

The capability flags live in each adapter (section 5), so the UI renders buttons, empty states and explanations from the same source of truth.

---

## 4. Architecture

### 4.1 Runtime contexts

```
+------------------------------------------------------------------------------+
|  Web page (any site)                                                         |
|                                                                              |
|   MAIN world                          ISOLATED world (content script)        |
|   +--------------------------+        +-----------------------------------+  |
|   | hook.main.ts             |        | bridge.content.ts                 |  |
|   | runs at document_start,  | <----> | validates every message,          |  |
|   | before any page script   |  post  | keeps per-tab state,              |  |
|   |                          |  Msg   | mounts the on-page panel          |  |
|   | - global traps + queue   |        |                                   |  |
|   |   wrappers per platform  |        | +-------------------------------+ |  |
|   | - DOM event listeners    |        | | Shadow root (closed)          | |  |
|   | - fetch/XHR/beacon taps  |        | |  Splitscope panel (Preact)    | |  |
|   | - adapters' read + act   |        | +-------------------------------+ |  |
|   +--------------------------+        +-----------------------------------+  |
+------------------------------------------------------------------------------+
                                                 |  chrome.runtime ports
                                                 v
+------------------------------------------------------------------------------+
|  Service worker (background.ts)                                              |
|  - tab registry in chrome.storage.session   - toolbar badge per tab          |
|  - webRequest observer for platform hosts   - cookies API (force / reset)   |
|  - keyboard commands                        - settings in chrome.storage     |
+------------------------------------------------------------------------------+
        ^                                   ^
        | toolbar click                     | options
  +--------------+                    +---------------+
  | popup.html   |                    | options.html  |
  +--------------+                    +---------------+
```

### 4.2 Why a MAIN world hook at document_start

Platform globals (`window.optimizely`, `_vwo_exp`, `Kameleoon`, ...) live in the page's JavaScript world, which an ordinary content script cannot see. Chrome 111+ lets a manifest content script declare `"world": "MAIN"`, so `hook.main.ts` runs in the page world. Running at `document_start` means it executes before any page script, so it can:

* install listeners that platforms require to exist before their snippet runs (Convert lifecycle listeners, VWO `setVariation`, `__alloyMonitors` for Adobe Web SDK);
* wrap command queues before the first `push`, so no event is ever missed;
* apply pending forced variations from the previous page load (section 8).

Scripts injected this way are inserted by the browser, so a strict page Content Security Policy does not block them.

### 4.3 How queue wrapping works without breaking sites

Most platforms use the "array queue" pattern: page code does `window.X = window.X || []; X.push(cmd)`, and later the platform snippet replaces the array with its own object whose `push` executes commands.

The hook handles both phases:

1. For each known global name, define an accessor property on `window` (configurable, enumerable) whose setter stores the real value and re-wraps its `push` method, and whose getter returns the stored value. If the global already exists, wrap in place instead.
2. The wrapper records the call (arguments cloned and sanitised), then calls the original `push` with the same `this` and arguments, and returns its result unchanged.
3. Every wrapper is a thin, synchronous function inside `try/catch`. The extension never throws into page code, never changes return values, never delays a call.
4. A per-site **Safe mode** switch disables property traps and falls back to polling plus official listener APIs, for the rare site where a trap conflicts with page code.

### 4.4 Message bridge

* Channel: `window.postMessage` with a fixed namespace (`__splitscope__`) and a per-load session nonce. The isolated script ignores any message without the namespace and a valid schema.
* All data from the page is treated as untrusted display data. It is validated with a small schema library (Valibot), size-capped, and rendered as text nodes. Nothing from the page is ever evaluated, injected as HTML, or used as a URL without checks.
* Commands from the panel to the page are a closed set of named operations (`adapter.forceVariation`, `adapter.refresh`, `adapter.getDetail`, `tools.clearStorage`, ...), never arbitrary code.
* The MAIN hook buffers messages until the isolated script announces itself, so events fired in the first milliseconds are not lost.

### 4.5 State flow

* **Page state** (platforms, experiments, events) lives in the content script per tab and is mirrored in summarised form to the service worker (for the badge and the popup).
* **Event log persistence**: an option "Keep log across page loads" stores the ring buffer in `chrome.storage.session` keyed by tab ID, so a redirect test or checkout flow keeps its history.
* **Settings** (theme, dock position, enabled adapters, safe-mode sites, capture sources) live in `chrome.storage.local`.

---

## 5. Adapter contract and data model

Every platform is one adapter module. Adding a platform later means writing one file plus fixtures; no UI changes.

### 5.1 Adapter interface

```ts
export interface PlatformAdapter {
  id: PlatformId;                     // 'optimizely' | 'adobe-target' | 'vwo' | ...
  displayName: string;
  capabilities: Capabilities;         // drives the UI, see below

  // Detection (MAIN world, synchronous and cheap)
  detect(): DetectionResult;          // signals found + confidence 0..1

  // Hooks installed at document_start, before the platform loads
  installHooks(ctx: HookContext): void;   // queue wrappers, listeners, monitors

  // Reads (MAIN world, called after ready or on demand)
  whenReady(): Promise<ReadyInfo>;    // resolves on platform lifecycle signal or timeout
  listExperiments(): NormalizedExperiment[];
  getExperiment(id: string): NormalizedExperiment | null;  // full detail incl. changes
  getVisitor(): VisitorInfo;          // ids, consent, opt-out, preview mode flags
  getHealth(): SnippetHealth;         // version, account/project id, revision, load timing

  // Actions (only when capability says so)
  forceVariation?(req: ForceRequest): ForcePlan;   // returns HOW it will force (see section 8)
  clearForcing?(): ForcePlan;
  resetVisitor?(): ResetPlan;         // cookies + storage keys to clear for a clean bucket
  disableUrl?(url: URL): URL;         // e.g. adds optimizely_disable=true
}

export interface Capabilities {
  listAll: 'full' | 'partial' | 'none';
  listActive: boolean;
  forceVariation: 'api' | 'url' | 'cookie' | 'preview-link' | 'none';
  trafficSplit: 'full' | 'partial' | 'none';
  changes: 'full' | 'partial' | 'none';
  events: boolean;
  notes: Record<string, string>;      // plain-language explanations shown in the UI
}
```

### 5.2 Normalised model

```ts
export interface NormalizedExperiment {
  platform: PlatformId;
  id: string;
  name: string;                        // falls back to "Experiment 12345" when hidden
  kind: 'ab' | 'mvt' | 'split-url' | 'personalization' | 'feature-flag' | 'survey' | 'other';
  status: ExperimentStatus;            // see below
  statusReason?: string;               // e.g. AB Tasty rejection reason, VWO excluded
  variations: NormalizedVariation[];
  assignedVariationId?: string;        // "you are here"
  trafficAllocation?: number;          // percent of visitors entering the test
  targeting?: { urls?: string[]; audiences?: NamedRef[]; conditions?: string[] };
  goals?: NamedRef[];
  campaignId?: string;                 // Optimizely campaign, DY campaign, etc.
  source: DataSource[];                // 'runtime-api' | 'snippet-data' | 'network' | 'cookie' | 'tokens'
  raw: unknown;                        // sanitised original object for the Raw tab
}

export interface NormalizedVariation {
  id: string;
  name: string;
  isControl?: boolean;
  weight?: number;                     // 0..100
  changes?: Change[];
}

export type Change =
  | { type: 'js'; code: string }
  | { type: 'css'; code: string }
  | { type: 'html'; selector?: string; code: string }
  | { type: 'attribute'; selector: string; attributes: Record<string, string> }
  | { type: 'redirect'; url: string }
  | { type: 'offer'; format: 'html' | 'json' | 'actions'; content: unknown }
  | { type: 'unknown'; label: string; data: unknown };

export type ExperimentStatus =
  | 'running-in'          // active on this page and you are bucketed
  | 'running-excluded'    // targeted but excluded (traffic, holdback)
  | 'bucketed-elsewhere'  // you are in it, but it is not active on this page
  | 'not-targeted'        // exists, conditions not met here
  | 'preview'             // draft/paused shown via preview or token
  | 'unknown';
```

### 5.3 Event model

```ts
export interface CapturedEvent {
  id: string;
  t: number;                           // epoch ms, from performance.timeOrigin + performance.now()
  platform: PlatformId | 'datalayer';
  category: 'custom' | 'goal' | 'revenue' | 'pageview' | 'decision' | 'activation'
          | 'lifecycle' | 'identity' | 'data-feed' | 'consent' | 'network' | 'error';
  name: string;                        // e.g. "add_to_cart", "Kameleoon::ExperimentActivated"
  properties?: unknown;                // sanitised payload
  experimentId?: string;
  variationId?: string;
  via: 'api-call' | 'listener' | 'dom-event' | 'network' | 'queued-before-load';
  caller?: string;                     // script URL + line from a captured stack frame
  networkRef?: string;                 // links an API call to the beacon that carried it
  raw?: unknown;
}
```

### 5.4 Sanitiser

A single `sanitize(value)` used by every adapter: handles cycles, functions (`[Function name]`), DOM nodes (`<button#buy.cta>`), Maps/Sets, BigInt, Errors, getters that throw; depth limit 8, string limit 20 KB, total payload limit 256 KB with a visible "truncated" marker. Never touches non-own getters that might have side effects.

---

## 6. Detection engine

Detection runs in two layers so it is fast and accurate.

**Layer 1: signals.** Each adapter declares signals with weights:

| Signal type | Example | Weight |
|---|---|---|
| Runtime global with expected shape | `typeof optimizely.get === 'function'` | high |
| Script `src` pattern | `cdn.optimizely.com/js/` | medium |
| Network host seen | `logx.optimizely.com` | medium |
| Cookie / storage key | `_vwo_uuid`, `kameleoonVisitorCode`, `ABTasty` | low |
| DOM marker | anti-flicker style element, `lp-pom-body` | low |

**Layer 2: states.** Detection reports a state, not just yes/no:

* **Active**: loaded and running.
* **Loading**: signals seen, runtime not ready yet (spinner, with elapsed time).
* **Waiting for consent**: recognised consent gates (Kameleoon consent state, AB Tasty `waitForConsent`, Convert `consentRequired`, OneSignal consent, Optimizely opt-out). Shown in plain words, because "the tool is installed but did nothing" is one of the most common QA confusions.
* **Disabled / aborted**: for example `Kameleoon::Aborted` with its reason, `optimizely_disable` in URL.
* **Blocked**: script requested but failed (ad blocker, CSP, 4xx), detected from network errors.

Detection re-runs on SPA navigation (`history.pushState` / `replaceState` / `popstate` wrappers) and on demand via a Rescan button.

---

## 7. Event tracker

### 7.1 Capture sources (in priority order, per platform)

1. **Official listener APIs** (Optimizely `addListener`, Convert `addListener`, VWO `onEventReceive`, Kameleoon DOM events, AB Tasty `abtasty_*` events, Adobe `__alloyMonitors` and at.js events, OneSignal `addEventListener`).
2. **Command queue and function wrappers** (`optimizely.push`, `VWO.push`, `_conv_q.push`, `kameleoonQueue.push`, `monetateQ.push`, `DY.API`, `ABTastyClickTracking`, `abtasty.send`, `adobe.target.trackEvent`, ...). This is what answers the brief: when something calls `optimizely.push({ type: 'event', eventName: 'add_to_cart', tags: {...} })`, the log shows the name, the properties and who called it.
3. **Network taps** in the MAIN world (`fetch`, `XMLHttpRequest`, `navigator.sendBeacon`) filtered to platform hosts, plus a `webRequest` observer in the service worker for image pixels and requests that bypass JS. Payloads are decoded per platform (query strings, JSON bodies, batched hits).
4. **dataLayer bridge** (optional, off by default): logs `dataLayer.push` because many experiment integrations report through GTM.

### 7.2 De-duplication and correlation

One user action often produces an API call and then a beacon. The log shows one row for the API call with a small "sent" indicator when the matching beacon is seen (matched by platform, event name and a 2 second window), and the beacon details inside the expanded row. A setting shows raw beacons as separate rows for people debugging transport.

### 7.3 "Who called this?"

Each wrapped call captures `new Error().stack` lazily (only the top non-extension frame is parsed), giving the calling script URL and line, for example `gtm.js?id=GTM-XXXX:212` or `main.4f2a.js:1:88213`. This answers "is GTM or the site sending this?" instantly.

### 7.4 Events tab behaviour

* Live stream, newest at the bottom with auto-scroll that pauses when you scroll up (a "Jump to latest (12 new)" chip appears).
* Filters: platform, category, text filter over name and properties, "only this experiment".
* Row: time (relative to page start, absolute on hover), platform chip, category, name, one-line property preview.
* Expanded row: property tree (collapsible JSON with copy per node), caller, related beacon, raw payload.
* Actions: pause, clear, copy row as JSON, export all as JSON or CSV.
* Ring buffer of 5,000 events per tab, virtualised list rendering.
* Markers: page loads and SPA route changes appear as divider rows, so a checkout flow reads like a timeline.

---

## 8. Variation switching and the Forcing Manager

Switching looks like one button in the UI, but each platform needs a different mechanism. The adapter returns a **ForcePlan**, the Forcing Manager executes it, and the UI tells the user exactly what will happen before they confirm.

```ts
type ForcePlan =
  | { method: 'url'; url: string; tracking: 'disabled' | 'counted' | 'unknown' }
  | { method: 'cookie'; set: CookieSpec[]; reload: true; tracking: 'counted' }
  | { method: 'pre-snippet-api'; commands: unknown[]; reload: true; tracking: 'counted' }
  | { method: 'runtime-api-then-reload'; op: string; args: unknown[]; tracking: 'counted' }
  | { method: 'preview-link'; url: string };
```

| Platform | Primary method | Fallback | Tracking while forced |
|---|---|---|---|
| Optimizely | `?optimizely_x=<variationId>` | `bucketVisitor` + reload | Disabled by Optimizely (can opt in with `optimizely_force_tracking`) |
| VWO | `setVariation` pushed before SmartCode (pre-snippet API) | `_vis_opt_exp_<id>_combi` cookie + reload | Counted |
| Kameleoon | `assignVariation(expId, varId, true)` + reload | none | Counted |
| AB Tasty | `ABTasty` cookie `th` rewrite + reload | vendor QA Assistant | Counted |
| Convert | `?_conv_eforce=<expId>.<varId>` | `triggerExperienceVariation` | Optional `_conv_prevent_tracking=true` |
| Unbounce | navigate to `/<letter>.html` | none | Not counted by Unbounce |
| Adobe Target, DY, Monetate, PageSense | saved preview / QA link | none | Per platform |

**Pre-snippet handoff.** Some APIs (VWO `setVariation`) must run before the platform script. The MAIN hook cannot read `chrome.storage` synchronously, so before reloading, the Forcing Manager writes the pending commands to `sessionStorage` under a namespaced key (same origin, same tab, survives reload). On the next load the hook reads it synchronously at document_start and pushes the commands before the snippet arrives.

**Visible state.** While anything is forced, the panel header shows a persistent strip ("2 variations forced on this site") with a Reset button, and the experiment rows show a "forced" marker. Forcing never hides silently.

**Reset and clean slate.**
* *Reset forcing*: removes params, handoff keys and forced cookies, reloads.
* *New visitor* (per platform): clears that platform's cookies, localStorage and sessionStorage keys for the current site so you are re-bucketed like a first-time visitor. Always behind a confirmation listing what will be cleared.

**Counted-traffic warning.** When a method will send tracking to live reports, the confirm step says so in one line, with a "Don't count this visit" option where the platform supports it.

---

## 9. UI and UX design

### 9.1 Design direction

The panel floats over every kind of website, from luxury fashion to banking, so it has to read as a calm, precise instrument that never fights the page beneath it. The subject is measurement: traffic being split, visitors being assigned, events being recorded. The design borrows from lab glassware and specimen slides (cool, clear, labelled) rather than from the usual dark-hacker or SaaS-card looks.

**The one memorable element: the split bar.** Every experiment row carries a thin segmented bar that shows the traffic split across its variations, with the visitor's own variation filled in amber. It is information, not decoration: at a glance you see how many variations exist, how traffic is divided, and where you landed. When weights are unknown the segments are hatched, which also communicates honestly. In the detail view the same bar grows into a labelled, interactive control. Everything else in the UI stays quiet so this one element carries the identity.

### 9.2 Tokens

**Colour (light)**

| Token | Hex | Use |
|---|---|---|
| Plate | `#F4F7FA` | panel surface |
| Ink | `#14202E` | primary text |
| Hairline | `#D5DEE7` | rules, borders, idle split segments |
| Cobalt | `#2451D6` | interactive elements, focus ring, links |
| Bucket amber | `#F2A516` | "you are here" segment, forced state |
| Slate | `#6B7A89` | secondary text, control segments |
| Signal red | `#C8372D` | blocked, errors, failed variation apply |

**Colour (dark)**: Plate `#0F1620`, Raised `#16202B`, Ink `#E4ECF3`, Hairline `#26323F`, Cobalt `#7C9BFF`, Bucket amber `#F5B83A`, Slate `#8C9AA8`, Signal red `#F0685E`. Theme follows the system by default, with a manual override.

**Platform marks.** No vendor logos (trademark safety and visual noise). Each platform gets a two-letter monogram chip (OP, AT, VW, KA, AB, CV, DY, UB, MN, PS, OS) in Ink on Plate with a hairline border. The name is always written out next to it the first time it appears in a view.

**Type.** Atkinson Hyperlegible Next for interface text and Atkinson Hyperlegible Mono for IDs, code and payloads. Chosen for the subject: QA work means reading and copying long numeric IDs and variation keys, and this family was designed so that 0/O, 1/l/I and similar glyphs are unmistakable. Both are OFL-licensed and bundled with the extension (no remote font loading on customer sites). Scale: 11, 12, 13 (base), 15, 18 px; line height 1.45 for text, 1.35 for code. Sentence case everywhere, no all-caps labels.

**Shape and space.** 4 px spacing grid. Radius varies by role, not one value everywhere: 10 px on the panel shell, 6 px on inputs and buttons, 2 px on chips, 0 on split-bar segments (they must tile cleanly). Shadows only on the floating panel itself, never on rows.

**Motion.** One orchestrated moment: the panel slides in from its dock edge in 160 ms when opened. Everything else is motion that answers an action (row expand, tab switch, "switched to Variation B" confirmation). `prefers-reduced-motion` turns all of it into instant state changes.

### 9.3 Surfaces

**1. Toolbar popup (320 px wide)** is the "turn it on" moment.

```
+------------------------------------+
|  Splitscope                        |
|  This page                         |
|  OP Optimizely    4 experiments    |
|  VW VWO           2 experiments    |
|  3 running for you, 1 forced       |
|                                    |
|  [ Show on page            (on) ]  |
|                                    |
|  Alt+Shift+S toggles the panel     |
|  Settings                          |
+------------------------------------+
```

A setting lets power users make the toolbar click toggle the panel directly, skipping the popup. The badge on the toolbar icon shows the number of experiments running for you; it turns amber while anything is forced.

**2. On-page panel** (default: docked right, 400 px, full height with 8 px margins).

```
+-------------------------------------------------+
| Splitscope                      [dock] [_] [x]  |
| OP Optimizely  4    VW VWO  2        Rescan     |
| [ Search name, experiment ID or variation ID ]  |
|  Experiments    Events 23    Page    Tools      |
+-------------------------------------------------+
| 1 variation forced on this site         Reset   |
+-------------------------------------------------+
| Running for you  3                              |
|                                                 |
|  Checkout trust badges               OP         |
|  24510870123                                    |
|  [=========|#########|=========]  Variation B   |
|                                                 |
|  Hero headline                       VW         |
|  118                                            |
|  [##############|==============]  Control       |
|                                                 |
| Not running for you  5                          |
|  PDP gallery swipe                   OP         |
|  URL does not match targeting                   |
+-------------------------------------------------+
```

Grouped by status by default ("Running for you", "Excluded", "Bucketed on other pages", "Not targeted here"), with a toggle to group by platform. Each row: name, ID in mono (click to copy), platform chip, split bar, your variation name, and a forced marker when relevant.

Panel mechanics:
* Docking: right (default), left, bottom, or floating (drag by header, resize from edges). Remembered per site.
* "Make room" option: adds a margin to the page so the docked panel does not cover content.
* Minimise to a small pill on the dock edge showing the running count; one click restores.
* Lives in a closed Shadow DOM with `all: initial` on the host, highest z-index, no global CSS leakage in either direction, and no page event interception outside the panel.

**3. Experiment detail** (replaces the list; Back returns with scroll and search preserved).

```
+-------------------------------------------------+
| < Back                              OP Optimizely|
| Checkout trust badges                           |
| Experiment 24510870123   Campaign 24498810456   |
| Running. You are in Variation B.                |
|                                                 |
|  Overview  Changes  Targeting  Events 4  Raw    |
|-------------------------------------------------|
| 50% of visitors enter this test                 |
| [   Control 50%   |#### Variation B 50% ####]   |
|                                                 |
| Variations                                      |
|  Control       24519...   50%      Switch       |
|  Variation B   24519...   50%      You are here |
|                                                 |
| Switching uses ?optimizely_x=... and turns off  |
| Optimizely tracking for this view.              |
+-------------------------------------------------+
```

* **Overview**: status with reason, traffic allocation, variations with weights and IDs, switch buttons with a one-line explanation of the method, goals.
* **Changes**: per variation, a list of changes (CSS, JS, HTML, attributes, redirect, offer content) with syntax-highlighted, read-only code, "Pretty print" for minified code, copy, and "Highlight on page" for any change with a selector (outlines matching elements with a label, counts matches, says "0 elements match" when a selector is broken).
* **Targeting**: URLs, audiences, conditions, when exposed.
* **Events**: the event log pre-filtered to this experiment.
* **Raw**: the sanitised platform object as a collapsible JSON tree with copy per node, labelled with its source (for example "from `optimizely.get('data')`").

**4. Events tab**: specified in section 7.4. Row layout:

```
 +0.84s  CV  goal      goal.triggered        goalId 100231
 +1.02s  OP  custom    add_to_cart           price 49, sku "TB-2"   sent
 +1.03s  VW  custom    purchase              revenue 129.00
 ---- Page load: /checkout (SPA route) ----
```

**5. Page tab** (health per platform): version, account or project ID, snippet URL and size, load time, time to first decision, anti-flicker hold time, consent state, preview mode, visitor IDs (copy), and quick actions: "Reload without <platform>", "New visitor for <platform>", "Open vendor docs".

**6. Tools tab**: Forcing Manager (everything forced on this site with per-item reset), saved preview and QA links per site, dataLayer bridge toggle, Safe mode for this site, Export QA report.

### 9.4 States and copy

Written from the user's side, plain and specific, never apologetic.

* No platform found: "No experimentation platform detected on this page. Checked 11 platforms. Rescan" plus a quiet line listing any blocked script requests.
* Waiting for consent: "VWO is installed but waiting for cookie consent. Accept cookies on the site to let it run."
* Aborted: "Kameleoon stopped on this page: the URL contains kameleoonDisabled=true."
* Capability gap: "Adobe Target only sends the activities you qualify for, so this list shows what was delivered to you."
* Missing names: "Names are hidden because response tokens are off in Target. IDs are shown instead."
* Force confirm: "Switch to Variation B? The page reloads with ?_conv_eforce=... This visit will count in Convert reports. [Switch] [Switch without counting]"

### 9.5 Keyboard and accessibility

* `Alt+Shift+S` show or hide the panel (Chrome commands API, user-remappable).
* `/` focus search, arrow keys move through results, `Enter` opens detail, `Esc` goes back, then minimises.
* `1` to `4` switch tabs when focus is not in an input.
* Full keyboard reach, visible focus ring in Cobalt, ARIA tablist and listbox roles, WCAG AA contrast in both themes, text size setting (small, default, large).

---

## 10. Search

One input at the top of the panel. It searches experiments on the Experiments tab and events on the Events tab.

**Fields searched**: experiment name, experiment ID, campaign ID, variation ID, variation name and key, platform name.

**Ranking**
1. Exact ID match (experiment or variation).
2. ID prefix match (typing the first digits of a long ID).
3. Word-prefix match in names.
4. Substring match in names.
5. Typo-tolerant match (one edit) for words of five or more characters.

**Filter tokens** (shown as removable chips): `platform:vwo`, `status:running`, `id:123`, `var:456`, `is:forced`, `has:code`.

**Behaviour**
* Case and accent insensitive, instant (under 5 ms for 500 experiments with an in-memory index rebuilt on data change; no search library needed).
* Matched text is highlighted. When the match is a variation, the row reveals it: "Matched variation: Variation B (2451982)".
* When a variation ID is pasted and matches exactly one experiment, `Enter` opens that experiment with the variation selected.
* Empty result: "Nothing matches 'xyz' on this page. Try an ID, or clear the filters."

---

## 11. Extra features beyond the brief

Chosen because they solve the most common real QA problems, not to pad the feature list.

1. **"Why am I not in this test?"** Surfaces platform reasons (AB Tasty rejection reasons, Optimizely audience and holdback states, VWO exclusion, Kameleoon abort reasons, consent gates) in plain language on the row itself.
2. **Anti-flicker and timing report.** Detects each platform's page-hiding style and measures how long the page was hidden, plus snippet load and decision timing. Useful for performance conversations with clients.
3. **Highlight on page.** Outlines elements targeted by a variation's selectors; flags selectors that match nothing.
4. **Conflict hints.** Warns when two experiments (even across two platforms) change the same selector on this page.
5. **Reload without the platform.** One click to compare the page with and without a tool (`optimizely_disable`, `kameleoonDisabled`, `convert_disable`, `mboxDisable`, and equivalents).
6. **New visitor reset** per platform, with a list of exactly which cookies and storage keys will be cleared.
7. **Preview and QA link library** per site for platforms that only support preview links (Target, DY, Monetate, PageSense).
8. **QA report export.** Markdown and JSON: page URL, time, platforms, experiments with assigned variation, forced state, events captured, optional screenshot of the visible tab. Pastes cleanly into Jira or a client email.
9. **SPA timeline.** Route changes appear as dividers in the event log and trigger a re-scan.
10. **dataLayer bridge** (opt-in) for teams whose experiment tracking flows through GTM.
11. **Copy helpers.** Copy experiment ID, variation ID, a ready-made force URL, or a console one-liner that prints the same state.

---

## 12. Tech stack and project structure

| Concern | Choice | Why |
|---|---|---|
| Extension framework | WXT (Vite based) | First-class MV3, MAIN world content scripts, HMR during development, store zips. |
| Language | TypeScript, strict | Adapters deal with untyped globals; types keep the normalised model honest. |
| UI | Preact + Signals | React ergonomics at a fraction of the size, which matters inside every page. |
| Styling | Hand-written CSS with custom properties, adopted into the shadow root as a constructable stylesheet | No framework runtime, full control of the token system. |
| Validation | Valibot | Tiny schema validation for the bridge. |
| Code viewer | highlight.js core (JS, CSS, XML only) and js-beautify, both lazy-loaded | Only loaded when a Changes tab is opened. |
| Lists | Virtualised list (TanStack Virtual core) | 5,000 events without jank. |
| Tests | Vitest, Playwright with the extension loaded | Unit plus real-browser end-to-end. |
| Quality | ESLint, Prettier, GitHub Actions (build, test, zip) | Standard. |

```
splitscope/
  plan.md
  wxt.config.ts
  package.json
  src/
    entrypoints/
      hook.main.ts            # MAIN world, document_start
      bridge.content.ts       # ISOLATED world, mounts the panel lazily
      background.ts           # service worker
      popup/                  # toolbar popup
      options/                # settings page
    core/
      bridge/                 # protocol, schemas, nonce handshake, buffering
      hooks/                  # trap(), wrapQueue(), wrapFn(), network taps, history taps
      sanitize.ts
      detection.ts
      events/                 # store, correlation, caller parsing, export
      forcing/                # ForcePlan executor, sessionStorage handoff, cookie ops
      search/                 # index + scorer
    adapters/
      optimizely.ts
      adobe-target.ts
      vwo.ts
      kameleoon.ts
      abtasty.ts
      convert.ts
      dynamic-yield.ts
      unbounce.ts
      monetate.ts
      pagesense.ts
      onesignal.ts
      index.ts                # registry
    ui/
      panel/                  # shell, docking, tabs
      experiments/            # list, row, split bar, detail views
      events/
      page/
      tools/
      components/             # chips, json tree, code block, confirm, toast
      styles/                 # tokens.css, base.css, themes
    assets/fonts/             # Atkinson Hyperlegible Next + Mono (woff2)
  fixtures/<platform>/*.json  # recorded runtime snapshots (Phase 0)
  test/
    unit/
    fixture-pages/            # simulated platform pages
    e2e/
  docs/
    platform-notes/<platform>.md
    qa/
    privacy-policy.md
```

---

## 13. Manifest and permissions

```json
{
  "manifest_version": 3,
  "name": "Splitscope",
  "minimum_chrome_version": "116",
  "action": { "default_popup": "popup.html" },
  "background": { "service_worker": "background.js", "type": "module" },
  "permissions": ["storage", "scripting", "cookies", "webRequest", "activeTab"],
  "host_permissions": ["<all_urls>"],
  "content_scripts": [
    { "matches": ["<all_urls>"], "js": ["hook.main.js"], "run_at": "document_start", "world": "MAIN" },
    { "matches": ["<all_urls>"], "js": ["bridge.content.js"], "run_at": "document_start" }
  ],
  "commands": {
    "toggle-panel": { "suggested_key": { "default": "Alt+Shift+S" }, "description": "Show or hide the Splitscope panel" }
  },
  "web_accessible_resources": [
    { "resources": ["fonts/*", "chunks/*"], "matches": ["<all_urls>"], "use_dynamic_url": true }
  ],
  "options_page": "options.html"
}
```

| Permission | Why it is needed (store justification text) |
|---|---|
| `<all_urls>` host access | Experiment platforms can run on any site; hooks must be in place before the platform loads or early events are lost. |
| `scripting` | Re-inject hooks into tabs that were open before install, run on-demand reads. |
| `storage` | Settings, per-tab event log, forced variations, saved preview links. |
| `cookies` | Force variations and reset visitors for platforms that store assignments in cookies. |
| `webRequest` | Observe (never block or modify) tracking beacons sent to experimentation platforms. |
| `activeTab` | Popup actions on the current tab. |

Iframes (`all_frames`) are off in v1 and become a per-site option later (Unbounce embeds, some DY placements).

---

## 14. Performance budgets

The extension runs on every page, so the always-on part must be close to free.

| Item | Budget |
|---|---|
| `hook.main.js` size | 12 KB minified or less |
| Hook install time | under 1 ms on a mid-range laptop |
| Work when no platform is found | none after load + 10 s (all polling stops) |
| Panel code | not loaded until the panel is first opened (lazy chunk) |
| Panel open to first paint | under 150 ms |
| Event log | 5,000 events per tab, virtualised, capped memory |
| Network taps | only clone bodies for known platform hosts; never read other responses |
| Page impact | no measurable change in LCP, INP or CLS in the Phase 7 A/B check (extension on vs off) |

---

## 15. Privacy and security

* No remote code, no telemetry, no analytics, no accounts. Nothing leaves the browser unless the user exports it.
* Captured data is kept per tab and cleared when the tab closes (unless "keep log" is on, still session-scoped).
* Page data is untrusted: schema-validated, size-limited, rendered as text only, never evaluated.
* Commands to the page are a closed, named set; no arbitrary code execution path exists from the panel.
* Closed Shadow DOM so page scripts cannot read or restyle the panel.
* The log reflects what the page reports; a page could spoof events. That is acceptable for a debugging tool and is documented.
* Store listing: single-purpose statement, permission justifications (section 13), privacy policy in `docs/privacy-policy.md`.
* Platform names are used descriptively only, no logos, with a "not affiliated with the listed vendors" note.

---

## 16. Testing strategy

**Unit (Vitest)**
* Sanitiser edge cases (cycles, throwing getters, huge payloads).
* Search scorer and filter parsing.
* Each adapter's normalisation against recorded fixtures (`fixtures/<platform>/*.json`), including legacy shapes (Convert `experiments` vs `experiences`, at.js versions).
* ForcePlan generation per platform.

**Fixture pages + Playwright (real Chromium with the extension loaded)**
* A local page per platform that recreates its globals from fixtures and emits events in the real order (including queue-before-load and replace-array-with-object patterns).
* Scenarios: detection states, list and detail, split bar, code viewer, highlight on page, every forcing method (URL, cookie, sessionStorage handoff, runtime API), reset, event capture from each source, correlation with beacons, search ranking, docking and keyboard flows.

**Live smoke checklist (manual, before each release)**
* A list of public sites per platform gathered in Phase 0, recorded in `docs/qa/smoke-<date>.md`.
* Compatibility set: strict CSP, Trusted Types, React/Next and Angular SPAs, heavy consent banners, pages with several platforms at once.

**Do-no-harm check**
* For a set of sites: console error diff and Web Vitals with the extension on vs off. Any new page error is a release blocker.

---

## 17. Delivery phases and acceptance criteria

Sizes are relative (S, M, L) so the plan stays useful whatever the team size or tooling.

### Phase 0: Verification spikes (M)
* Confirm every item marked **Verify** in section 2 on live installs: field names for Optimizely weights and changes, AB Tasty modifications and weights, Kameleoon variation code fields, Target delivery response shapes per at.js version, Monetate engine response, all of PageSense.
* Record sanitised runtime snapshots as fixtures for every platform.
* Build the live smoke site list.
* **Done when** each platform has a `docs/platform-notes/<platform>.md` with confirmed paths and fixtures committed, and every "Verify" label in this plan is resolved or explicitly moved to "not supported".

### Phase 1: Foundation (M)
* WXT scaffold, manifest, hook framework (trap, queue wrapper, function wrapper, sanitiser, network and history taps), bridge with nonce and buffering, service worker registry and badge, panel shell with docking and minimise, tokens and fonts, popup, options page.
* **Done when** the panel opens on any site via toolbar and shortcut, survives SPA navigation, bridge passes fuzz tests with malformed messages, and 20 high-traffic sites show zero new console errors.

### Phase 2: Read-only adapters, tier 1 (L)
* Optimizely, VWO, Kameleoon, AB Tasty, Convert: detection states, experiment list, grouping, split bar, detail (Overview, Changes, Targeting, Raw), highlight on page.
* **Done when** on fixture pages and at least two live sites per platform, the list matches the platform's own console output, your variation is correct, and code for each variation is viewable.

### Phase 3: Event tracker (M)
* Capture sources 1 to 3 for tier 1, Events tab, correlation with beacons, caller attribution, route dividers, export.
* **Done when** every documented event type for tier 1 platforms appears with name and properties within 100 ms of firing, and a scripted checkout flow on a fixture page produces the expected timeline.

### Phase 4: Switching (M)
* Forcing Manager, ForcePlans for tier 1 plus Unbounce, forced strip, reset, new visitor, counted-traffic warnings.
* **Done when** each variation of each fixture experiment can be forced and reset in one click, the forced state survives reload until reset, and no forcing method leaves residue after reset.

### Phase 5: Tier 2 adapters (L)
* Adobe Target (at.js and Web SDK), Dynamic Yield, Monetate, Unbounce reads, PageSense, OneSignal; preview and QA link library.
* **Done when** each platform meets its row in the capability matrix (section 3), with capability gaps explained in the UI.

### Phase 6: Search and polish (M)
* Search with ranking and filter tokens, keyboard map, Page tab (health, timing, consent), Tools tab, QA report export, themes, text size, accessibility pass.
* **Done when** search returns an exact ID match first in under 5 ms with 500 experiments, the whole panel is operable by keyboard, and both themes pass WCAG AA contrast.

### Phase 7: Hardening and release (M)
* Performance budgets verified, Safe mode, compatibility set, do-no-harm check, store assets (screenshots, short video), privacy policy, v1.0.0 on the Chrome Web Store.
* **Done when** all budgets in section 14 are met and the smoke checklist passes on every platform.

---

## 18. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Vendors change undocumented runtime objects | Adapter shows wrong or no data | Prefer documented APIs; defensive parsing with versioned field maps; Raw tab always shows the source object; fixtures make breakages visible in CI. |
| Property traps conflict with a site's code | Site breaks | Wrappers never throw or change results; per-site Safe mode falls back to polling and official listeners; do-no-harm check before release. |
| Forcing pollutes live reports | Bad data for clients | Prefer non-tracking methods; explicit warning and "don't count" option where supported. |
| Chrome Web Store review of `<all_urls>` and `webRequest` | Delayed listing | Clear single purpose, observation-only webRequest, no remote code, detailed justifications and privacy policy. |
| Platforms that expose little client data (Target, DY, Monetate, PageSense) | Users expect parity | Capability matrix drives honest UI copy; preview link library covers the switching gap. |
| Events fired before hooks install (tabs open before install) | Missed events | Re-inject on install/update via `scripting`, replay queued commands, show "Reload to capture from page start" hint. |
| Very large snippet data (big Optimizely or AB Tasty accounts) | Slow panel | Lazy detail loading, sanitiser limits, list virtualisation. |

---

## 19. Open questions

1. Is "Splitscope" a name you like, or do you want the extension branded under Xperimently?
2. Confirm "Chameleon" means Kameleoon (assumed throughout).
3. Should Optimizely Feature Experimentation (datafile mode) ship in v1 or later?
4. Distribution: free on the Chrome Web Store, open source on GitHub, or both?
5. Phase 0 needs live pages for PageSense, Monetate, Dynamic Yield and Adobe Target (ideally with response tokens enabled). Which of these can you give access to through client or test accounts?

---

## 20. References

**Optimizely**
* JavaScript API overview: https://docs.developers.optimizely.com/web-experimentation/docs
* State object: https://docs.developers.optimizely.com/web-experimentation/docs/state
* Add listener: https://docs.developers.optimizely.com/web-experimentation/reference/add-listener
* Query parameters: https://docs.developers.optimizely.com/web-experimentation/docs/query-parameters
* Force parameters setting: https://support.optimizely.com/hc/en-us/articles/4410283898637
* Performance Edge preview: https://docs.developers.optimizely.com/performance-edge/docs/preview-each-variation

**Adobe Target / Web SDK**
* Response tokens: https://experienceleague.adobe.com/en/docs/target/using/administer/response-tokens
* Web SDK monitoring hooks: https://experienceleague.adobe.com/en/docs/experience-platform/web-sdk/monitoring-hooks
* at.js trackEvent: https://experienceleague.adobe.com/en/docs/target-dev/developer/client-side/functions-overview/adobe-target-trackevent

**VWO**
* Enforce variation (setVariation): https://developers.vwo.com/reference/enforce-variation
* Lifecycle events (onEventReceive): https://developers.vwo.com/reference/lifecycle-events
* Variation applied callback: https://developers.vwo.com/reference/variation-applied
* Preview variations: https://help.vwo.com/hc/en-us/articles/360021310593

**Kameleoon**
* Activation API reference: https://developers.kameleoon.com/apis/activation-api-js/api-reference/
* Activation API events: https://docs.kameleoon.com/developer-docs/apis/activation-api-js/api-reference/activation-api-events
* Custom analytics integration: https://docs.kameleoon.com/developer-docs/apis/activation-api-js/tutorials/custom-analytics-integration

**AB Tasty**
* Interacting with the tag: https://docs.abtasty.com/account/tag-integration/going-further-with-your-tag/how-to-interact-with-the-tag
* Tag API: https://docs.abtasty.com/client-side/tag/tag-api
* Tag JavaScript events: https://docs.abtasty.com/client-side/tag/tag-javascript-events
* Global methods: https://docs.abtasty.com/client-side/tag/tag-methods-variables
* Forcing a variation: https://docs.abtasty.com/help-center/troubleshooting/troubleshooting-how-to-force-the-display-of-a-variation

**Convert**
* JavaScript API: https://docs.developers.convert.com/v1.0-web/docs/javascript-api
* window.convert object and query parameters: https://docs.developers.convert.com/v1.0-web/docs/window-convert-object
* Reading experiment data: https://support.convert.com/hc/en-us/articles/204506359

**Dynamic Yield**
* Previewing API campaigns: https://dy.dev/docs/preview-api-web
* Script-based preview: https://support.dynamicyield.com/hc/en-us/articles/360022065253
* Client-side campaign data (partner doc): https://www.rudderstack.com/docs/destinations/streaming-destinations/dynamic-yield/

**Unbounce**
* Variants: https://documentation.unbounce.com/hc/en-us/articles/360000288406
* Variant URLs for preview: https://community.unbounce.com/uncategorized-1/how-can-my-client-with-no-login-to-unbounce-preview-all-variants-of-a-page-2571

**Monetate**
* trackData: https://developer.monetate.com/js-api/trackdata
* Third-party analytics and the campaigns variable: https://developer.monetate.com/js-api/integrate-analytics

**Zoho PageSense**
* Custom event goals: https://help.zoho.com/portal/en/kb/pagesense/optimize/a-b-test/articles/custom-event-goal

**OneSignal**
* Web SDK reference (v16): https://documentation.onesignal.com/docs/web-sdk-reference
* Player model to user model mapping: https://documentation.onesignal.com/docs/device-user-model-web-sdk-mapping

## Adobe Target enhancement implementation — October 8, 2026

The supplied Adobe-only expansion is documented in `docs/adobe-target.md`, including corrections to tracking and QA assumptions, six implementation phases, verification scope, permissions, and capture limits. It adds a dedicated Target workspace; other vendor capabilities remain separate. Automatic activity-specific dashboard links are documented in `docs/dashboard-links.md`.
