# Product and implementation review

Reviewed September 29, 2026. This document records the implementation review and redesign; `plan.md` remains the user's original roadmap.

## Assessment

The core idea is useful for CRO practitioners: answer **what is active for this visitor, what variation was assigned, what changed, and what event was called** without repeatedly navigating vendor consoles. The MAIN-world hook, isolated state owner, Shadow DOM panel, and MV3 worker are appropriate boundaries. Vendor adapters are also the right abstraction because their visibility differs substantially.

The earlier implementation blurred configuration, stored assignments, and current decisions; combined that with optimistic capability claims and a payload-heavy event view; and provided several settings that did nothing. That undermined the core QA workflow. A larger feature list would not solve those problems. This pass prioritizes trustworthy interpretation, progressive disclosure, and useful evidence for reporting an issue.

## Delivered in this redesign

| User question | Implementation |
| --- | --- |
| What's active here? | Active-first activity groups, scope/platform/type filters, current-visitor explanation, active toolbar badge. |
| Is this a test or personalization? | Shared type labels, explicit Optimizely campaign-policy handling; unknown types remain generic. |
| Which variation am I seeing? | Assigned versus stored assignment labels, copyable IDs, reported allocation only. Missing weights use a neutral hatch. |
| What event fired? | Collapsed timeline rows containing metadata only. Click reveals properties, nested object tree, caller and page context where available. |
| How do I isolate the relevant events? | Search properties/name/activity ID; filter platform/category; pause/resume; paginate older events; export filtered CSV. |
| Is an event connected to this activity? | Activity details include only explicit platform + activity-ID matches. No inferred relationship from platform alone. |
| Where are the changes? | Collapsed change definitions, copy controls and temporary selector outlines, without changing target elements. |
| Could activities overlap? | Exact-selector overlap hints for assigned variations of active activities. Hints are not proof of conflicting execution. |
| How can I hand off QA evidence? | JSON/Markdown reports, notes, detection evidence and assignments; JSON includes sanitized event payloads. |
| Did navigation change my assignment? | Baseline comparison retained across panel tab changes until the panel closes. |
| Can I read it comfortably? | Shared light/dark/system themes, larger text, right/left/bottom docking, minimize, search and section shortcuts. |

Popup, panel, activity details, event timeline, preview confirmation and settings now share the same visual components and typography. Settings only show implemented options. The design preview under `dev/` is explicitly sample data and is excluded from the extension build.

## Reliability changes

- Removed permanent content-based event deduplication. Repeated identical calls are separate observations. API and network observations remain separate; the UI does not claim confirmed delivery.
- Batched session writes retain every queued event rather than only the last event in a burst. Writes are serialized per tab and events use a separate storage key from summaries.
- Restored events merge by identity and timestamp with events already captured. Clear removes saved session history as well as the visible log. Disabling persistence clears saved logs.
- Saved logs have both a 5,000-event cap and a roughly 1.5-million-character per-tab limit. In-memory logs remain capped at 5,000. Browser-wide session storage quota can still limit many simultaneous tabs.
- Fixed panel mount/removal state and repeated popup-open requests, including opening Events directly.
- Fixed late bridge handshake; snapshot and event structures are validated separately. Malformed activity records are omitted with diagnostics instead of crashing the whole UI.
- Snapshot transport now permits larger activity inventories than individual events. Sanitization depth no longer cuts off change definitions merely because they are nested in a snapshot envelope.
- Event-derived activities survive ordinary scans and are cleared on route changes. Page navigation is labeled as page activity rather than Optimizely.
- Detected runtimes refresh every 1.5 seconds while visible; runtime reads stop after the initial 10-second window if nothing is detected. Manual refresh remains available. Existing queue/method hooks are revisited to accommodate late runtime replacement.
- Preserved dictionary variation IDs. Nested change groups are normalized recursively. Adobe trace traversal is bounded and cycle-safe.
- Optimizely current active IDs take precedence over historic assignment maps; a campaign's selected experience is not applied to every nested experience. VWO cookies and AB Tasty history alone no longer establish current activity.
- Preview execution must match the prepared adapter plan; URL previews stay on the current origin and runtime calls use a fixed allowlist. Removed the unverified AB Tasty cookie rewrite and unused cookies permission. Vendor QA links remain the fallback where switching is unavailable.

## Architecture decisions and boundaries

- `src/core/qa` contains presentation mappings, report generation, event merging and selector tools; UI components consume these rather than inventing vendor interpretations.
- `src/ui/shared` provides design tokens, controls, disclosure and lazy object trees. `src/ui/events` owns timeline rendering. Activity, page and tools views remain within the panel component and can be split further as they grow.
- The isolated content script remains the owner of current page state. The worker owns session persistence and extension APIs; MAIN has no extension privileges.
- A page-visible nonce prevents accidental cross-session messages, **not forgery by the page**. Captured data is untrusted and must never be used as authorization for privileged actions. The Shadow DOM is style isolation, not a security boundary.
- Raw data is rendered as text. Redaction is best effort; code, custom properties, notes and exports may still contain sensitive content.
- A runtime's active decision does not establish that every DOM change rendered. A logged API call does not establish that a request succeeded or reached vendor reporting.

## Roadmap reconciliation and remaining work

The roadmap makes sense as a direction, but its acceptance criteria are not all met. In particular, “no event is ever missed” is too strong: late installation, late method creation, buffer limits and platform-private flows make that impossible to promise.

| Roadmap area | Current assessment |
| --- | --- |
| Foundation and interface | Implemented, with runtime reliability improvements in this pass. |
| Tier 1 reads | Initial adapters present; Optimizely interpretation improved. Real vendor fixtures still required. |
| Event capture | Queue/API/listener/network observations available. No reliable cross-source correlation or delivery confirmation. |
| Variation switching | Partial. No complete forcing registry, reset-all, or new-visitor workflow. AB Tasty cookie forcing disabled. |
| Tier 2 platforms | Partial browser visibility; Adobe/Monetate/DY/PageSense fields vary. OneSignal is an engagement SDK. |
| Search and polish | Search, filters, themes, exports, highlight and comparison implemented. Not a completed accessibility certification. |
| Hardening and release | Performance and multi-site compatibility acceptance criteria remain unverified. |

Specific next priorities:

1. Capture consented, sanitized runtime fixtures and compare against vendor consoles for each supported integration. Do not infer all-platform parity from detection alone.
2. Implement a reversible forcing manager with vendor-specific reset paths before adding more forced-variation methods.
3. Add explicit lifecycle decision listeners where available, including late SDK initialization, and validate SPA deactivation semantics. Adobe historical traces can still contain past deliveries.
4. Add per-site capture controls and a real safe mode; optional dataLayer capture is still absent.
5. Measure CPU/memory and timing on large projects. Hook bundle currently exceeds the plan's 12 KB target; UI is bundled with the bridge rather than fully lazy-loaded. Event pagination limits DOM work but is not virtualization.
6. Resolve platform naming: the existing plan implements **Kameleoon**, which is distinct from **Chameleon**. Chameleon support must not be claimed based on this adapter.

## Evidence for this pass

TypeScript compilation and the Chrome MV3 production build completed. The design was visually reviewed in the in-app browser using sample data for the activity panel, collapsed event timeline, popup and settings. No automated tests were added or run. Live Chrome extension lifecycle, forcing and all vendor SDK integrations were not verified in this pass.

Optimizely interpretation follows its official [state API](https://docs.developers.optimizely.com/web-experimentation/reference/state) and [data API](https://docs.developers.optimizely.com/web-experimentation/reference/data). In particular, `getVariationMap()` contains historical assignments; `getActiveExperimentIds()` is the current visitor/page signal, including holdback cases that must be interpreted separately.
