# Optimizely findings review — 0.1.5

The user supplied an AI-generated analysis, not the other extension's source. Statements about that extension's implementation are therefore hypotheses. This review compares them against Splitscope's code and Optimizely's published Web documentation.

## Findings and changes

| Finding | Assessment / implementation |
| --- | --- |
| Read vendor state in the MAIN world | Already implemented using MV3 MAIN-world content scripts. Retained this instead of adding script tags or inline injection. |
| Separate current activation from project configuration | Retained current-active filtering and the separate other-activities group. A stored variation alone does not establish current activation. An unavailable active list remains unknown. |
| Older state/data shapes | Added inspection of Classic `optimizely.data`, `state.activeExperiments`, primitive variation-map values and single-item Classic variation-ID arrays. Multi-section assignment arrays remain in Raw, not falsely flattened into one variation. |
| Variations referenced by ID | Added lookup of `variation_ids` / `variationIds` through the global variation dictionary. |
| Campaign membership | Added primitive experiment-ID references as well as nested experiment objects. Nested metadata is merged with the top-level experiment definition. |
| Activity classification | Retained explicit campaign/experiment type rules; added section metadata as MVT evidence. Unknown types do not silently default to A/B. |
| Holdbacks | Recognizes an exposed global holdback boolean alongside existing campaign/experiment holdbacks. Holdback information is explanatory state, not an invented selectable variation ID. |
| URL forcing | Correct format is `optimizely_x=variationId` with comma-separated variation IDs. The supplied `experimentId_variationId` format is not the documented Web format. Fixed accumulation of conflicting IDs: selecting a variation replaces earlier IDs for the same experiment/campaign and preserves other experiments. |
| Tracking | Existing `optimizely_force_tracking=true` now changes the warning to counted. Preview does not remove that user-supplied option silently. A disabled Optimizely URL produces an actionable error. |
| Native lifecycle/analytics listeners | Added documented initialized, activated, campaignDecided, pageActivated, pageDeactivated, applied and analytics trackEvent subscriptions. Explicit experiment/variation IDs link decision events to activities. Existing push-call capture remains; calls and native events describe different stages. |
| Late SDK load | Registers listeners when a usable SDK appears, once per runtime object, and removes tokenized listeners on cleanup. Does not create an Optimizely global on unrelated pages. Earlier native events cannot be recovered. |
| Changes | Includes exposed campaign/experiment code alongside variation changes. |
| Shareable preview | Added Copy preview link to the existing confirmation, alongside this-tab/new-tab opening. |

## Not adopted without supporting evidence

- The supplied `_x_includes`, `_x_excludes`, and `_x_disable` flags are not listed as the proposed Web mechanisms in the current query-parameter documentation. No speculative controls were added.
- Classic inspection does not imply verified Classic variation forcing; preview is unavailable for Classic records.
- Personalization holdback cannot safely be synthesized as an ordinary variation. Real exposed variation IDs remain previewable.
- QA does not guarantee the experience of an organically eligible visitor: force settings, consent, project configuration and tracking overrides matter. The panel asks users to check the assignment reported after loading.
- Generic QA cookies cannot be chosen without the site's actual audience rules. No cookies are written automatically.
- QR generation is not added in this pass; the exact preview URL can be copied for sharing. A QR code would not reproduce browser cookies or consent on another device.

## Evidence and validation

TypeScript compilation and the MV3 build were run for this change. No new automated tests or live Optimizely site checks were run in this pass. The previous background-worker availability issue cannot be confirmed resolved from this Optimizely-specific review.

Official sources:
- [Web query parameters](https://docs.developers.optimizely.com/web-experimentation/docs/query-parameters)
- [Web addListener and tokenized removal](https://docs.developers.optimizely.com/web-experimentation/reference/add-listener)
- [Web state](https://docs.developers.optimizely.com/web-experimentation/reference/state)
- [Web data](https://docs.developers.optimizely.com/web-experimentation/reference/data)
- [Performance Edge previews and project settings](https://docs.developers.optimizely.com/performance-edge/docs/preview-each-variation)
