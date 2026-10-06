# October polish review

Reviewed the user plan, capture/bridge/background flow, adapters, previews, event checks, saved workspaces, journey recording, exports and UI surfaces. Existing vendor coverage remains partial where SDK state is private. This pass adds no new platforms.

## Phase A — Runtime reliability

- Shared endpoint classification matches vendor domain boundaries, avoiding substring false positives; image and page-network capture use the same rules.
- Capture failures no longer escape from the event emitter into the site's original API calls. Late asynchronous results are ignored for activity state if the URL changed while awaiting them.
- Evidence is timestamped when observed. Route changes clear observation timestamps; caches are bounded. PostHog/Statsig value updates invalidate previously observed decisions.
- Repeated previews retain the original parameter values, and direct variant path previews can restore their original path. Later unrelated URL edits are preserved. Unbounce no longer creates doubled path separators or accepts malformed variant IDs.
- Toolbar work is deduplicated and errors are handled. Journey observations are batched before serialized storage writes. Sanitization now budgets keys and primitive/container values as well as strings, and avoids evaluating array getters.

Validation: TypeScript and Chrome production build completed. No automated tests or live vendor validation run.
