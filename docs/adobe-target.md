# Adobe Target module

The supplied six-phase specification is implemented incrementally, with a commit per phase. Adobe Target controls live in the Target section; other platform workflows are unchanged.

## Phase 1 — wire capture

Captures fetch/XHR responses using bounded clones without consuming the application's response. Path-based at.js 1/2 classification supports first-party CNAMEs. Generic Launch/alloy files do not establish Target detection. Edge decisions require an explicit TGT provider; AJO decisions remain separate. Captured requests/responses are inspectable in collapsed trees and copyable. Existing privacy redaction and capture limits apply. Capture begins at injection, not retroactively; service workers, image beacons and opaque responses may not expose bodies.

## Corrections to the supplied assumptions

- Execute requests can count impressions automatically. Absence of a separate notification is not proof of lost impressions.
- Adobe QA activity and experience indexes start at 1 and are not activity IDs. Only mappings from real QA links may be reused.
- HTTP status 0 cannot identify an ad blocker by itself.
- SDK delivery does not establish successful DOM rendering, and a later DOM mutation is only timing evidence.
- No client capture can prove server-side A4T reporting succeeded.

Sources (checked October 7, 2026):
- https://experienceleague.adobe.com/en/docs/target-dev/developer/server-side/python/send-notifications
- https://experienceleague.adobe.com/en/docs/target-dev/developer/client-side/functions-overview/adobe-target-sendnotifications-atjs-21
- https://experienceleague.adobe.com/en/docs/target/using/activities/activity-qa/activity-qa
- https://experienceleague.adobe.com/en/docs/target-dev/developer/client-side/aep/web-sdk-atjs-comparison

## Phase 2 — findings

Added evidence-indexed delivery, mixed-stack, edge, property, legacy, selector, JSON, redirect and response-metadata findings. Findings describe observations rather than claiming attribution. Session history follows the existing retained-event setting; clearing events clears these derived findings. Missing parent-level tokens are explicitly called out as an alternative to disabled token settings.

## Phase 3 — identity and correlation

Added identity inspection, same-page ±30-second A4T matching, and a tracking credential ledger. Credentials are SHA-256 fingerprinted before storage; raw sensitive fields remain redacted. Missing-notification warnings are deliberately not inferred from execute requests. A4T waits 30 seconds before reporting an unmatched capture and cannot establish backend reporting success.

## Phase 4 — QA and baseline controls

Saved QA links are origin-scoped and capped at 50. Indexes come exclusively from supplied Adobe links; no guessed experience indexes. Open in the current/new tab and confirm qaMode from subsequent delivery. Exit removes visible site QA cookies and preview parameters. The vendor processes the preview URL itself instead of inventing cookie encodings. A fresh delivery is necessary to verify exit too.

Baseline mode uses tab-scoped DNR session rules with tab-close cleanup. Optional Edge blocking explicitly warns that Analytics and identity are also affected. Cached/inline offers cannot be guaranteed blocked. Added cookies and declarativeNetRequest permissions. Rule state remains visible after reload even when delivery is blocked.

## Phase 5 — timing and telemetry

Added bounded selector-mutation observation, at-body-style prehide timing, and configuration snapshots. Existing behavior-preserving at.js wrappers are shown alongside timing evidence. Timing measures request-to-observed-mutation, not proven render attribution. The before snapshot is taken when the response is inspected and can miss earlier changes. No guessed Alloy style signature is used.
