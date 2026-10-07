# Automatic activity links — 0.1.14

Activity cards and details show a new-tab link only when a supported activity-specific route can be built from captured identifiers. No dashboard fallback, manual URL, or template configuration is shown. Previously saved links are ignored.

Supported routes:
- Optimizely Web: project + experiment ID; personalization uses project + campaign ID.
- Optimizely Classic: explicitly detected legacy runtime + experiment ID.
- Convert: account + project IDs from one unambiguous official snippet, plus experience ID.
- Kameleoon: numeric activity ID, with separate experiment and personalization results routes.

Other platforms hide the action until enough identifiers and a reliable route are available. Numeric IDs are validated; links use noopener, noreferrer and no referrer. Vendor account permissions still apply.

Kameleoon routes were confirmed in the public official console bundle on October 7, 2026: https://static.experimentation.dev/app/assets/core-DPN9ka7d.js (loaded by https://app.kameleoon.com/). Its route definitions use /experiments/results/:id and /personalizations/results/:id. Authenticated navigation has not been verified.

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

