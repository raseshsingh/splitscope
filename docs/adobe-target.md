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
