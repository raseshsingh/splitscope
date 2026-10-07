# Activity code inspection — 0.1.12

## What changed

- Function values now retain the browser-exposed source instead of a function-name placeholder. Reading source uses the intrinsic function stringifier, never calls the function or a custom `toString`, and keeps redaction/truncation. Native and bound functions explicitly report unavailable source.
- A shared bounded reader extracts JavaScript, CSS, HTML, attribute changes and redirects from activity/variation code fields and nested action collections. It skips getters, handles cycles, and records the source field.
- Optimizely merges referenced variation definitions with local metadata and includes campaign/experiment shared code. Nested page actions and custom-code values are handled.
- Adobe Target keeps offer content associated with its response metadata, reads actions and AEP proposition item data, and merges repeated entries for the same activity/experience so sparse tokens cannot erase code.
- Other adapters use the same reader before raw data is sanitized. VWO nested change payloads are decoded where exposed.
- Activity details have a **Code & changes** tab with expandable source, variation IDs, copy/save controls and line wrapping. Missing source is explained. Code is displayed as text and is never executed in the inspector.

## Limits

This shows source the page actually exposes, which can be minified and can contain closures whose private values are unavailable. It cannot reconstruct private SDK modules, server-side implementations or source for an unloaded variation. No source maps are fetched, no vendor accounts are queried, and no arbitrary page scripts are attributed to an activity. Code inspection does not prove execution. Strings are limited to 100,000 characters with truncation markers; overall snapshot limits still apply. Automated redaction can alter sensitive literals.

## Documentation checked

- [Optimizely Data API](https://docs.optimizely.com/web-experimentation/api/Vxfn-data): campaign changes, variation actions and global variation dictionary.
- [Optimizely asynchronous changes](https://docs.optimizely.com/web-experimentation/docs/load-synchronous-and-asynchronous-code-changes-in-optimizely-web-experimentation): variation code can load separately.
- [Adobe getOffers](https://experienceleague.adobe.com/en/docs/target-dev/developer/client-side/functions-overview/adobe-target-getoffers-atjs-2): offer content and delivery response structures.

## Verification

Regression fixtures cover function bodies without execution, nested Optimizely changes, referenced variation definitions, Adobe multiple offers and Web SDK item metadata, long source through bridge validation, and null Journey replies. Existing compiled background/bridge/panel tests have been updated to supply the browser APIs the implementation now uses. Live customer SDK configurations require separate validation; fixture success does not establish universal vendor coverage.
