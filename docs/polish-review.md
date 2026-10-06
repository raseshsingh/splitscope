# October polish review

Reviewed the user plan, capture/bridge/background flow, adapters, previews, event checks, saved workspaces, journey recording, exports and UI surfaces. Existing vendor coverage remains partial where SDK state is private. This pass adds no new platforms.

## Phase A — Runtime reliability

- Shared endpoint classification matches vendor domain boundaries, avoiding substring false positives; image and page-network capture use the same rules.
- Capture failures no longer escape from the event emitter into the site's original API calls. Late asynchronous results are ignored for activity state if the URL changed while awaiting them.
- Evidence is timestamped when observed. Route changes clear observation timestamps; caches are bounded. PostHog/Statsig value updates invalidate previously observed decisions.
- Repeated previews retain the original parameter values, and direct variant path previews can restore their original path. Later unrelated URL edits are preserved. Unbounce no longer creates doubled path separators or accepts malformed variant IDs.
- Toolbar work is deduplicated and errors are handled. Journey observations are batched before serialized storage writes. Sanitization now budgets keys and primitive/container values as well as strings, and avoids evaluating array getters.

Validation: TypeScript and Chrome production build completed. No automated tests or live vendor validation run.

## Phase B — QA workflow polish

- Event checks are collapsed by default so the timeline remains primary. Expectations can be edited. Validation prevents silently clipped rule definitions.
- Check results accumulate independently of the event buffer and survive section changes and panel remounts in the same document. Clearing the log cannot erase a failed check. Paused capture marks the result incomplete; redacted comparisons have an unavailable state. Check exports sanitize values. Reload still ends a page-session check.
- Event filters and expanded rows survive navigation between panel sections.
- Journey replacement now starts a new recording after explicit confirmation; deletion is a distinct action. Controls show pending work and errors. Observation filters and chronological ordering improve navigation, and cross-origin recording gaps are visible. Exports omit the internal comparison cache.
- Workspace/expectation writes are serialized, and local storage echoes cannot replace text with an older in-flight value while typing. Journey polling cannot overwrite a later user action with an older response. Journey size limits account for encoded size.

Validation: TypeScript and Chrome production build completed. No automated tests or live vendor validation run.

## Phase C — Interface and maintainability

- Compact activity headings, current-page/configuration grouping, pin markers and a single filter reset make lists easier to scan. Detected-platform buttons open the matching list with other filters cleared. Stale saved filters remain visible and removable.
- Flag/configuration details emphasize reported values; missing traffic splits no longer add noise to activity cards. Platform capability notes explain partial coverage.
- Tools are split into Report, Compare, Journey and Workspace. The app's activity details, page information, preview dialog and reports now live in separate components.
- Event checks use a compact disclosure. Empty event results offer Show all events, frozen lists keep matching filter options, and styles improve small-screen wrapping, inputs, focus feedback and long IDs.
- Page and Settings show capture/background connection state, last snapshot, build mismatch guidance and combined copyable diagnostics. Background application errors are distinguished from transport failures. Older page hooks require a reload.
- The legacy options page reuses the panel settings component. Legacy popup actions respect error replies. Version bumped to 0.1.10.

Validation: TypeScript and Chrome production build completed. No automated tests or live vendor validation run. Visual preview review could not be completed: the local server was initially stopped, and after restarting it the in-app browser's URL policy blocked operations on its generated error page. No updated screenshot captured. The design server remains available at http://127.0.0.1:5178/dev/index.html.
