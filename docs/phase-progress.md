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
