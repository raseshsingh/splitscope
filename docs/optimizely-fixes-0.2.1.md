# 0.2.1 — snapshot, preview and Activities fixes

## Snapshot failure

Large normalized code/raw payloads exhausted a shared sanitizer budget before `page` was visited. The whole snapshot was then rejected, leaving the panel stale. The new serializer reserves the envelope and validates each complete activity summary independently. Optional detail gets a separate per-activity allowance; it cannot erase assignments or the page envelope. The regression uses 75 experiments with large code and raw fields, then changes an assignment and verifies its next snapshot.

## Optimizely preview

Current active experiment/campaign decisions take precedence over the historical variation map. Preview URLs consolidate duplicate force parameters, replace conflicting selections, and remove the selected experiment's legacy override. The requested variation is never presented as confirmed unless the runtime reports it.

On October 8, 2026 the public Keurig Canada snippet (`https://cdn.optimizely.com/js/20188537154.js`, revision 33263) contained `enableForceParameters: false`. This is a separate vendor configuration restriction: URL forcing is ignored. A project owner must enable forcing under Settings → Implementation and publish, or use an official vendor preview workflow. No site-specific bypass or falsified assignment was added. When the runtime exposes disabled forcing, the action gives an explicit error; unknown settings do not promise tracking is disabled.

Sources:
- https://docs.optimizely.com/web-experimentation/api/Ajgv-state
- https://docs.developers.optimizely.com/web-experimentation/docs/query-parameters
- https://docs.optimizely.com/personalization/docs/debug-variations-by-forcing-behavior-with-query-parameters

## Adobe Target layout

Removed the top-level Target tab and duplicate activity catalog. Adobe controls live in a collapsible **Adobe Target tools** section inside Activities, with a tool selector for delivery, QA and diagnostics. The shared activity cards and activity details remain the single activity list. Baseline mode's recovery control opens Activities and expands these controls.

Verification: production build and TypeScript passed; 61 tests passed, zero failed, one optional external check skipped. Browser preview confirms the four main tabs and the embedded Target tool selector. Keurig’s public snippet configuration was inspected; a successful live forced variation is not claimed while that configuration disables forcing.
