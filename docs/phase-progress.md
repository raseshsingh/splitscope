# Refinement phases

## Phase 1 — Status and previews (0.1.6)

- Activities distinguish assigned/delivered decisions from confirmed Adobe rendering, stored assignments, detection only, and rendering failure. Evidence includes observation time and page URL.
- Preview requests survive reload in extension session storage, including new preview tabs. Requested assignments are compared to current page decisions. This verifies assignment, not visual rendering.
- Reset restores only URL parameters changed by Splitscope, and preserves subsequent edits. For VWO, Kameleoon, and Convert, persistent visitor assignments cannot safely be reset generically; the UI explicitly offers parameter cleanup only and explains the limitation.
- Extension-dependent preview links are labeled. Unknown allocations no longer resemble equal traffic splits. One-choice filters and duplicate Tools preferences are removed.
- Events default to goals/custom events; freeze list is independent of stop recording. Error notices remain until dismissed.

Validation: TypeScript and Chrome production build completed. No automated tests or live-site validation run in this phase.

## Phase 2 — Event expectations and analytics (0.1.7)

- Per-origin expectations are stored in extension local storage: exact event/source match, required dot paths, and structural JSON equality. All matching observations must pass. Start/finish produces a bounded recording-window result; checks are local to the mounted Events view and must finish before leaving it.
- Optional analytics capture defaults off. Future default `dataLayer` pushes, `gtag` event/consent calls, exposed Segment `analytics` calls, and AppMeasurement `s`/`s_c_il` calls are observed without invoking/replaying them. Late globals are retried; calls before attachment can be missed.
- Known GA4, Segment, and Adobe Analytics transport endpoints are observable separately. API observation and outgoing transport are not confirmation of ingestion. First-party proxy endpoints, renamed data layers, closed-over SDKs and Adobe Web SDK Analytics are not covered by this pass.
- Searchable event payload text is cached per retained event. Payloads remain collapsed and use existing redaction/size limits.

References: [Google data layer](https://developers.google.com/tag-platform/tag-manager/datalayer), [Google tag API](https://developers.google.com/tag-platform/gtagjs/reference), [Adobe AppMeasurement tl](https://experienceleague.adobe.com/en/docs/analytics/implementation/vars/functions/tl-method), [Segment Analytics.js](https://www.twilio.com/docs/segment/connections/sources/catalog/libraries/website/javascript).

Validation: TypeScript and Chrome production build completed. No automated tests or live-site validation run in this phase.

## Phase 3 — GrowthBook, Statsig, PostHog (0.1.8)

- GrowthBook reads exposed `_growthbook`/`growthbook` instances, feature definitions, visual experiments, and cached experiment results. Cached results are stored assignments; live subscriptions and observed evaluations provide current-page evidence. Dev mode commonly controls whether `_growthbook` is exposed.
- Statsig uses exposed modern clients/registry, observes returned evaluations and subscribes to SDK notifications. It never calls an evaluation API itself. Experiment, feature gate, layer and configuration types remain distinct. Only observed evaluations are listed; initial project enumeration and legacy clients are not supported.
- PostHog reads the default exposed instance's cached flag values and observes reads/capture calls. Flags are never automatically labeled A/B tests. Reported values are available in Overview, with full sanitized details in Raw.
- No evaluation or tracking calls are made for discovery. Switching controls stay unavailable for these initial adapters; use vendor override tooling. Private module instances, server-only decisions and proxy traffic may remain invisible. Network detection alone never fabricates an experiment list.

Research sources: [GrowthBook SDK guide](https://docs.growthbook.io/lib/js), [GrowthBook SDK source](https://github.com/growthbook/growthbook/blob/main/packages/sdk-js/src/GrowthBook.ts), [Statsig client source](https://github.com/statsig-io/js-client-monorepo/blob/main/packages/js-client/src/StatsigClient.ts), [Statsig event interfaces](https://github.com/statsig-io/js-client-monorepo/blob/main/packages/client-core/src/StatsigClientEventEmitter.ts), [PostHog flag source](https://github.com/PostHog/posthog-js/blob/main/packages/browser/src/posthog-featureflags.ts). SDK internals used for discovery are feature-detected and may change between versions.

Validation: TypeScript and Chrome production build completed. No automated tests or live-site validation run in this phase.

## Phase 4 — Journeys and saved workspaces (0.1.9)

- Extension-local per-origin workspace stores a name, notes, activity filters/selection, up to 100 pins, expectations and a bounded assignment baseline. Changes synchronize between same-origin tabs. Export and clear actions are available in Tools.
- Baseline comparisons survive reload and show before/after state, variation and reported feature values. Baselines include capture time and page URL; missing records are labeled no longer reported.
- Explicit tab/session journey recording survives navigation and reload. The background serializes writes, records navigation (including same-URL reload), changed decisions, and captured events on the starting origin. Other origins are excluded; recording resumes when returning. No activity disappearance is interpreted as proof of deactivation.
- Journey history is capped at 500 observations / 750 KB, with omission count, and its comparison cache is bounded. Closing the tab removes its recording. User can stop, export and delete; a new recording follows deletion of the previous recording. Stopping event capture leaves a documented gap.
- Design preview now exposes workspaces, example journey data and a sample event generator. It still does not exercise browser-extension persistence or vendor capture.

Validation: TypeScript and Chrome production build completed. No automated tests, browser interaction tests or live-site validation run in this phase. Initial SDK coverage and vendor assignment-reset limitations described above still apply.
