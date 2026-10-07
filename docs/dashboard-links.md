# Dashboard links — 0.1.13

Researched October 7, 2026. Management links open a new tab and use the user's existing vendor sign-in. They do not activate an experiment or start a variation preview.

## Implementation

Every activity card and activity detail header has dashboard controls. Verified identifiers select automatic routes where available. General account destinations say **Open dashboard**; they are never presented as direct experiment links. When context or a reliable route is missing, **Add direct link** opens an in-page dialog.

Users can save an exact activity URL, or a reusable URL for one platform and activity type on the current website. Reusable links must contain `{id}` or `{campaignId}`. Optional `{projectId}` and `{accountId}` values come from normalized capture context. Missing values disable the link instead of opening a malformed URL. Different activity types and captured account/project IDs have separate templates. Reuse is explicitly opt-in: vendor subtypes can still need separate exact links. Exact activity links take precedence.

Links live in the existing origin-scoped workspace, survive reloads/restarts, are included in workspace exports, and are removed by clearing that workspace. The dialog supports editing/removal and shows the resolved destination before saving. Only HTTPS URLs without embedded credentials are accepted; template placeholders cannot alter the host. No URLs are taken from arbitrary vendor raw fields. IDs are encoded when interpolated. Links use `noopener noreferrer` and no referrer.

## Platform map

| Platform | Shipping behavior | Evidence and limits |
| --- | --- | --- |
| Optimizely Web | Automatic experiment `/v2/projects/{projectId}/experiments/{id}` and personalization `/v2/projects/{projectId}/campaigns/{campaignId}` links. | Uses the supplied route map and documented runtime project/campaign identifiers. Missing campaign IDs do not fall through to experiment links. Results routes were omitted because variants could not be established reliably. User-saved links can override account/version differences. |
| Optimizely Classic | Explicitly detected Classic runtimes use `https://www.optimizely.com/edit?experiment_id={id}`. | Legacy route from the supplied map; legacy product access may no longer be available to the user. It is labeled Classic editor. |
| Convert | Automatic `https://app.convert.com/accounts/{accountId}/projects/{projectId}/experiences/{id}`. | Vendor documentation supplies the dashboard route and the account/project structure in the snippet. Only one unique recognized CDN snippet pair is accepted. Multiple projects, private/custom-domain scripts and unavailable identifiers require a saved link. |
| Adobe Target | Saved activity URL; otherwise Experience Cloud dashboard. | Dashboard routing needs the organization URL segment and exact activity type. Delivery activity IDs, Target client codes and IMS organization IDs do not establish those values. Do not guess them from the website name. |
| VWO | Saved activity URL; otherwise VWO dashboard. | Documentation describes distinct testing flows. A reliable account/type-aware management route could not be established for all types from the captured runtime. |
| Kameleoon | Saved activity URL; otherwise Kameleoon dashboard. | Public guidance confirms the console but not a stable complete route for each experiment/personalization type from runtime IDs. |
| AB Tasty | Saved campaign URL; otherwise documented account login. | Campaign/account navigation is documented; a complete route from captured campaign ID alone was not established. |
| Dynamic Yield | Saved activity URL. | US and EU admin consoles differ; section and campaign routing cannot be inferred reliably from every captured decision. No US-only fallback is forced. |
| Unbounce | Saved page overview URL; otherwise Unbounce dashboard. | Published page IDs/variant letters do not reliably expose the account path used by management pages. |
| Monetate | Saved experience URL. | The public platform documentation does not establish a management URL from captured decision IDs. |
| PageSense | Saved experiment URL. | Portal, project link name and regional account context are needed. REST API URLs are not dashboard URLs. |
| GrowthBook | Saved feature/experiment URL. | Source confirms `/features/{fid}` and `/experiment/{eid}`, but the app may be self-hosted and an SDK experiment tracking key need not equal its management ID. |
| Statsig | Saved experiment/configuration link; otherwise Statsig console. | SDK evaluation names and the inspector's synthetic IDs do not establish the console project route. |
| PostHog | Saved flag URL. | Dashboard links use region/self-hosted base, project ID and numeric flag ID. The captured flag key is not a numeric flag ID; project API tokens are not project IDs. |
| OneSignal | No activity cards currently generated. | This adapter captures SDK events rather than a campaign catalog. The shared link registry supports its dashboard if an activity integration is added; no artificial experiments were introduced. |
| Chameleon | Research only; no adapter currently exists. | The dashboard manages multiple experience types. Adding the adapter is separate work; this change does not claim Chameleon detection or activity support. |

## Sources

- Optimizely: [runtime project ID example](https://docs.optimizely.com/performance-edge/api/add-listener), [campaign/experience distinction and older personalization route](https://docs.developers.optimizely.com/web-experimentation/docs/troubleshooting). The supplied modern route map is used for Web; the legacy documentation still shows a different personalization path. Authenticated navigation is not verified.
- Convert: [documented dashboard URL](https://support.convert.com/hc/en-us/articles/connect-convert-experiences-to-looker-studio), [account/project snippet](https://docs.developers.convert.com/v1.0-web/docs/shopify-headless-storefronts), [custom domains](https://support.convert.com/hc/en-us/articles/custom-domains-cloudflare-for-the-convert-tracking-script).
- Adobe: [activity management and type-specific flows](https://experienceleague.adobe.com/en/docs/target/using/activities/activities).
- VWO: [A/B test creation and dashboard workflow](https://help.vwo.com/hc/en-us/articles/360021171954-How-to-Create-an-A-B-Test-in-VWO).
- Kameleoon: [official console location](https://www.kameleoon.com/legal-notice), [graphic experiment workflow](https://help.kameleoon.com/experimentation/web-experimentation/graphic-based-experiments/troubleshooting-the-graphic-editor/).
- AB Tasty: [navigation](https://docs.abtasty.com/onboarding/getting-started/how-to-navigate-in-the-ab-tasty-platform), [login](https://support.abtasty.com/hc/en-us/articles/6338832278172-Login).
- Dynamic Yield: [US/EU admin consoles](https://dy.dev/changelog/2026-01-tech-update), [dynamic content campaigns](https://support.dynamicyield.com/hc/en-us/articles/360021625514-Dynamic-Content-Campaigns).
- Unbounce: [platform/page overview](https://documentation.unbounce.com/hc/en-us/articles/203510184-Learning-the-Unbounce-Platform).
- Monetate: [platform dashboard](https://docs.monetate.com/docs/section-1-platform-tour-platform-dashboard).
- PageSense: [portal, project and experiment identifiers](https://www.zoho.com/pagesense/developerguide/apidocs/absplittestoverview.html).
- GrowthBook: [feature route source](https://github.com/growthbook/growthbook/blob/main/packages/front-end/pages/features/%5Bfid%5D.tsx), [experiment route source](https://github.com/growthbook/growthbook/blob/main/packages/front-end/pages/experiment/%5Beid%5D.tsx).
- Statsig: [console experiment workflow](https://docs.statsig.com/guides/abn-tests).
- PostHog: [flag URL example](https://github.com/PostHog/posthog/blob/master/services/mcp/README.md), [region/self-hosted endpoints](https://posthog.com/docs/api), [SDK UI host](https://posthog.com/docs/advanced/proxy).
- OneSignal: [official SDK repository dashboard configuration example](https://github.com/OneSignal/OneSignal-Website-SDK/issues/1412).
- Chameleon: [dashboard and experience types](https://help.chameleon.io/en/articles/13845759-what-is-the-chameleon-dashboard-and-how-is-it-organized).

## Verification

Production build completed. `npm test`: 46 passed, 0 failed, 1 optional Accor engine check skipped. TypeScript passed. Tests cover route selection, missing and malformed IDs, ambiguous Convert snippets, encoding, URL validation, context through adapter/bridge normalization, saved workspace links and compiled card/detail editing/removal. Existing tab/workflow regressions remain passing.

Browser review on the local sample page confirmed the card actions, the in-page link dialog, placeholder substitution, reusable-link saving and removal. [Card screenshot](dashboard-links-preview.png).

No authenticated vendor dashboard was opened or modified. These checks establish URL construction and inspector behavior, not access permissions or compatibility with every vendor account UI version.
