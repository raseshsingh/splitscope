# Refinement phases

## Phase 1 — Status and previews (0.1.6)

- Activities distinguish assigned/delivered decisions from confirmed Adobe rendering, stored assignments, detection only, and rendering failure. Evidence includes observation time and page URL.
- Preview requests survive reload in extension session storage, including new preview tabs. Requested assignments are compared to current page decisions. This verifies assignment, not visual rendering.
- Reset restores only URL parameters changed by Splitscope, and preserves subsequent edits. For VWO, Kameleoon, and Convert, persistent visitor assignments cannot safely be reset generically; the UI explicitly offers parameter cleanup only and explains the limitation.
- Extension-dependent preview links are labeled. Unknown allocations no longer resemble equal traffic splits. One-choice filters and duplicate Tools preferences are removed.
- Events default to goals/custom events; freeze list is independent of stop recording. Error notices remain until dismissed.

Validation: TypeScript and Chrome production build completed. No automated tests or live-site validation run in this phase.
