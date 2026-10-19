# Changelog

## 0.8.0

Phase 2 of the extension review: make the main jobs faster.

Activity detail
- Each variation has its own Preview button, so previewing is one click from the variation list. While the preview is prepared the button reads Preparing and a note names the variation.
- Goals show whether they fired on this page: "Fired 2x, last 14:03:11" or "Not seen yet". Matching uses the same platform, business event types, and skips events linked to another activity.
- Assignment shows the variation name and ID together. Fields the platform does not expose are listed in one line.
- Changes: the assigned variation comes first, the first change is open, "Expand all" opens the rest, and downloads are named after the platform, activity and change.
- The detail remembers the last tab per activity. The Events tab count matches what the tab lists.

Preview dialog
- "Preview in this tab" is the primary action. "Open in new tab" only appears when the platform can be previewed by link. Tracking effects are described per platform.

Adobe Target
- Target tools moved from the bottom of Activities to Tools, with four groups (Overview, QA, Delivery, Tracking) instead of twelve chips. The Activities link and "Manage blocking" open the right group. The last view is remembered.

Wording and events
- "Active on this page" is used everywhere: the scope filter is All / Active / Other / Pinned, the minimized pill says "N active", and the QA report counts "Active on this page".
- The Events badge counts goals and custom events (the default view); the tooltip gives the total.
- Stop / Start and Freeze / Resume are labelled buttons instead of icons.
- "Create check" on any event opens Event checks with the name, source and top-level properties filled in.
- Optimizely and Kameleoon tools keep their section, chosen experiment and results when you switch panel tabs (for the same page).

## 0.7.0

Phase 1 of the extension review: trust what the panel shows.

Capture timing and pages
- Optimizely, VWO and Convert listeners now attach the moment the site creates the vendor global or its documented pre-load queue, instead of on a 500 ms poll. The page load decisions (Optimizely initialized, activated and campaignDecided; VWO variation applied; Convert variation decided) are no longer missed. Each registers once; a short fallback poll covers sites where the global cannot be watched and stops after 30 seconds.
- A page is now its origin and path. Anchor links and query changes (for example UTM cleanup through replaceState) no longer clear Adobe Target, GrowthBook, Statsig and PostHog activities. On a real route change, activities from the previous page stay listed as "Observed on the previous page" until the new page reports them.

Analytics and network
- Adobe Analytics hits (eVars, props, visitor IDs) are recorded only when Capture analytics calls is on, in both the page and the background. The A4T view says so.
- Adobe Target and Analytics requests are logged once, by the Target inspector, instead of twice.

Platform statuses
- AB Tasty: Active here, the current variation and rejection reasons come from the documented getTestsOnPage() and results objects. Campaign types map to A/B, multivariate, personalization and split URL.
- Optimizely: global holdback is read through the State API method, so held back visitors show Holdback / excluded.
- VWO: VISUAL_AB tests are A/B tests and VISUAL tests multivariate; fractional weights show as percentages (50%, not 0.5%).
- Kameleoon: uses the documented triggered, activatedInVisit and nonExpositionReason fields for Not targeted, Holdback / excluded, Not on this page and Activated earlier in this visit; getActive is read once per scan.
- Dynamic Yield: only rendered objects count as Active here; the site wide allocation list is shown as stored; entries without an ID are skipped.
- Monetate and PageSense no longer mark every listed campaign as Active here.
- Statsig: experiments with no group for the user show Not targeted.

Event types and duplicates
- at.js calls are typed by purpose (getOffers decision, applyOffers activation, triggerView pageview, trackEvent goal). DY.API, PageSense and PostHog system events get proper types instead of custom, so they no longer crowd "Sent while active".
- GrowthBook and Statsig evaluations show as one row each instead of two or three.
- Only names like identify, login, logout, setUser or user ID count as identity events.

## 0.6.4

- One action now shows as one event. When a site calls a platform API (for example optimizely.push({ type: 'event' })) and the platform's own listener reports the same action a moment later, the two are merged into the API call row, marked "confirmed by Optimizely", with the platform's report under the event details. Before, both appeared as separate rows.
- Merging applies to every platform: same platform, within 2 seconds, matched by event name or goal ID (so Kameleoon processConversion plus Kameleoon::ConversionTriggered, and Convert triggerConversion plus goal.triggered, also become one row). Each call is confirmed at most once, so a real second event still shows. The listener can add the activity link the call lacked.
- Event checks count the merged event once.
- An activity's Events tab keeps the "Linked events" heading when nothing is linked yet.

## 0.6.3

Goal reading and event naming, only where the vendor documentation supports it.

Kameleoon (Activation API reference and Activation API events)
- Experiments now carry their goals from Experiment.goals and mainGoal (Goal objects with id, name, type), so conversions match their experiment on the activity Events tab.
- Listens to the documented events, including Kameleoon::ConversionTriggered (named "Conversion: goal name", with the goal ID), Kameleoon::CustomDataSet and Kameleoon::SegmentTriggered. Experiment and personalization events read the variation from associatedVariation, as documented.
- Command queue calls are named: ['Kameleoon.API.Goals.processConversion', id] reads "Conversion: id" and is a goal; other commands are lifecycle.

VWO, now documented under the Wingify name (Lifecycle Events and Event Hooks)
- Registers the documented onEventReceive hooks for variation applied (vA), variation error (vAE), goal conversion (rC) and test not running (tNR). Conversions carry the campaign ID and goal ID, so they link directly to their campaign.
- Captures the documented custom event call Wingify.event(name, attributes) as a custom event. The same calls on the older VWO name are captured too.
- Queue commands are lifecycle, not custom events. VWO does not document a way to read campaign goals, so none are read.

AB Tasty (Global methods and variables)
- Captures the documented ABTastyClickTracking(name, null, campaignId), linked to the campaign when the ID is given, and abtasty.send(hitType, params), typed as revenue for transactions. The previous wrappers targeted ABTasty.ClickTracking and ABTasty.send, which are not the documented names, so these calls were missed.
- The deprecated _abtasty.push is still captured and typed. AB Tasty does not document campaign goal fields, so none are read.

Convert (Experiment life cycle events, Record conversions)
- Adds the documented lifecycle listeners experience.variation_decided, experience.activated and goal.triggered. Goal events carry the experience, variation and goal IDs and link to their experience.
- _conv_q.push(['triggerConversion', goalId]) reads "Conversion: goalId" and is a goal. Convert does not document a goal list per experience, so none are read.

General
- Listener registrations Splitscope adds are marked and never logged as site activity.
- Goal matching on the activity Events tab also uses goal IDs recorded on the event.

## 0.6.2

Counts
- The All, Here, Other and Pinned counts now follow the search, platform and type filters, so each count matches the list it opens. Before, they always counted every activity on the page (All 92 while the A/B test filter showed 12).
- The line under the counts says "12 of 92 activities" and names the active filters whenever something narrows the list.

Events on an activity
- An activity's Events tab used to show only events that carry that activity's ID. A custom event such as optimizely.push({ type: 'event', eventName }) has no activity ID, so it never appeared there, which looked like events were not being captured. They were always in the main Events tab.
- The activity Events tab now also lists the platform's goal and custom events that match one of the activity's metrics (tagged "Matches a metric") or were sent while the activity was active on the page (tagged "Sent while active"), with a note that the platform credits those to every active activity that tracks them.
- Optimizely goals now carry the event API name, so a pushed event matches its metric.
- Kameleoon events now carry the experiment and variation from the event detail, so they link to their activity.

Event names and types
- optimizely.push calls are named and typed by what they do: custom events keep their event name (revenue when tags include revenue), page commands read "Page activated: name", attribute updates are identity, everything else is lifecycle. Before, every push was a custom event, so page and user commands looked like conversions.

## 0.6.1

Polish pass, based on rendering every panel screen in light and dark and reviewing it.

Layout and design
- Tools and Adobe Target tool menus are now wrapping chips instead of a scrolling strip, so Reset visitor, Optimizely, Kameleoon and the later Target tools (Timing, QA, Mboxes, On-device, Memory, Conflicts) are no longer hidden off screen.
- Adobe Target Mboxes, Memory, Conflicts and Timing tabs: labels sit above full width fields, text uses the caption style, headings and button spacing match the rest of the panel.
- "Waiting for delivery" only shows on tabs that depend on captured requests, and "No findings" only shows once something was captured.
- Section headings (Appearance, Capture, Detection evidence and others) get proper spacing; they were collapsed against the previous row.
- Status notes with a title now show the title on its own line ("The visitor qualifies" no longer runs into the sentence after it).
- List rows in the Optimizely and Kameleoon tools keep name and value or action on one line, instead of stretching buttons to full width.
- Variation bars use one color for your variation (amber, matching the split bar) and a neutral color for the others, in both themes. The split bar no longer uses fixed light colors in dark mode.
- The "Type not exposed" tag is no longer shown on activity cards and the detail header; it carried no information.
- The preview hint no longer appears twice while choosing a variation.
- "1 signals" now reads "1 signal".

Performance
- Unchanged snapshots are no longer re-sent every scan (a heartbeat still goes out every 15 seconds), which matters on projects with hundreds of activities.
- Scans back off automatically on pages where a scan is expensive. Rescan and connecting always send a fresh snapshot.

## 0.6.0

Optimizely tools (Tools tab, shown when Optimizely is detected)
- Visitor: visitor ID, project ID and snippet revision, plus the visitor's attributes with their dashboard names. Attributes can be set through Optimizely's own API to test targeting.
- Audiences: pick an experiment and see each audience's conditions evaluated against this visitor and page, as a pass, fail or unknown tree. Conditions Splitscope cannot read (location, device, custom JavaScript) stay Unknown instead of guessing.
- Pages: current activation state, with Activate and Deactivate for pages that have an API name.
- Events: project events that have an API name, with a confirmed Fire button to test a metric.
- Debug: reload with log level info or debug, or with Optimizely disabled.
- A note appears when the snippet was republished since you last inspected the project (the last seen revision is saved per project in the site workspace).

Kameleoon tools (Tools tab, shown when Kameleoon is detected)
- Visitor: visitor code, site code, visit count, current visit details and conversions.
- Consent: A/B testing and personalization consent state, with confirmed Grant and Withdraw buttons.
- Custom data: everything set for the visitor and page, with Set and Reset (confirmed) to test targeting.
- Experiments: whether each experiment or personalization ran on this page, the reason Kameleoon reports when a visitor is not exposed, and Block on this page, Block this visit or Disable. The reason also appears on the activity itself.
- Goals: send a test conversion (confirmed), with optional revenue.
- Segments and triggers: list, with Re-evaluate for segments.
- Kameleoon variation 0 is now marked as the original.

Under the hood
- The panel can now ask the page to run a platform action and wait for the answer (a request and response channel over the existing bridge). Adapters declare these as actions.

## 0.5.0

Reset visitor (Tools tab)
- New Reset visitor tool. It forgets this browser's stored assignment for the detected platforms so the next page load is bucketed again: Optimizely, Adobe Target, VWO, Kameleoon, AB Tasty, Convert, Dynamic Yield, Monetate, PageSense, Unbounce, GrowthBook, Statsig and PostHog.
- It lists exactly which cookies, local storage and session storage entries exist right now, grouped by platform, before anything is removed. Names only, never values.
- A switch also resets the visitor ID. It is on by default because most platforms choose a variation from the visitor ID, so clearing only the assignment usually lands in the same variation.
- Clear and reload, or clear without reloading. A confirmation dialog explains what will be removed. Cookies are removed on the host and on every parent domain. Anything that cannot be cleared (HttpOnly cookies, other paths) is reported by name.
- Names are matched by pattern. Platforms that assign on the server or by signed in user ID will bucket the same way again.

## 0.4.1

Fix: code showing "[payload truncated]"
- Cause: the snapshot divided one fixed byte allowance evenly across every activity. In projects with many Optimizely experiments, each activity received only a few kilobytes, and any code string larger than that was replaced entirely by the marker. Other platforms with many activities were affected the same way.
- Change code now gets first claim on the capture allowance, shared fairly (small items always fit completely, large ones share what remains). Raw platform data gets whatever is left.
- Oversized strings are clipped in place and keep their beginning instead of being discarded. The Code and changes tab explains when a source was shortened, and the activity shows a notice when any detail was reduced.
- A malformed change record no longer invalidates its whole activity. Invalid items are dropped and the rest are kept.

Panel fixes
- Toast messages (for example after Highlight) were unreadable: dark text on a dark background, because the global button color rule beat the toast color. They now use the light page color, wrap on narrow panels, and say "1 matching element" in the singular.

- Adobe Target QA tab rebuilt: a clear status banner, QA sessions and Baseline view as separate cards, stacked full width fields, saved experiences as a list with Open here, New tab and Remove, and the Edge blocking option as a switch.

Platform fixes
- Convert: code stored under a change's data object (js, css, html) is now captured.
- AB Tasty: modifications (custom script, CSS, HTML, attributes) are now captured.
- GrowthBook: visual editor DOM mutations that set HTML are captured as HTML changes.
- VWO: per combination code is read from the experiment sections, where VWO actually stores it. A malformed cookie no longer stops the whole platform from loading, and control is recognised by name when VWO does not report it.
- Optimizely: audience IDs resolve to dashboard names, goal names resolve from project events, and page activation code is shown in Code and changes.
- Every platform reads each activity independently, so one malformed record no longer hides the rest.
- Variations named Original, Control or Baseline are marked as control on every platform.

## 0.4.0

Panel redesign to match the screen atlas
- New green light and dark themes, smaller denser type, and tag-style status labels.
- Header shows the version, with separate dock right and dock bottom buttons, settings, minimize and close. Dock left stays available in Settings.
- Detected platforms are colored chips that toggle the platform filter on and off.
- Navigation moved to the bottom with number key hints and the count of current activities on Activities.
- Settings open as a drawer with a back button. Theme, text size and dock use segmented controls, and capture options use switches. Settings also has a Clear site workspace button.
- Activities: new list row with the result count and Refresh, cards show a platform dot, kind tag, pin button and a variation line.
- Activity detail: platform line beside the back link, allocation bars on each variation.
- Events: goals and custom or all event types toggle, icon buttons for record, freeze, CSV and clear, a Recording or Paused tag, and a frozen list counter that shows how many new events are waiting. Event checks sit between the controls and the list.
- Tools: tab strip with QA report, Compare, Journey, Workspace and a separate Overlap tool.
- Page: inspected page card with Rescan, connection card, detection evidence and coverage notes.
- Preview status is a banner under the platform chips instead of a card in the page.
- New states: a lost connection card with recovery steps, a scanning skeleton while the first scan runs, toast messages, and a minimized pill that shows the number of current activities.
- Toolbar badge is hidden at 0 and red otherwise.
- Activities are one list with current decisions first. Cards show an open-in-console icon and a pin button, and the pinned list has its own empty state.
- Activity detail has an Assignment block (variation, variation ID, where it was observed) and an Actions row. One Preview button opens a variation picker, then the usual confirmation dialog.
- Clearing the event log and replacing a journey now use confirmation dialogs.
- Event details start with a summary (time, platform, source, page URL, activity). Event checks show as cards with tags and a running note.
- Compare has an empty state and tagged Added, Changed and No longer reported cards. Overlap shows a Highlight button per selector. QA report and Workspace show summary rows.
- Adobe Target tools use a tab strip, the toggle shows the number of findings, and Findings, Timeline, Raw, A4T, Tracking and Timing use the atlas layouts.
- Settings lists the Chrome version and the state of the page hook, bridge and service worker.

## 0.3.0

New
- Event checks can require a minimum and maximum number of times an event fires. Use a maximum of 1 to catch duplicate events, or a maximum of 0 to confirm an event does not fire.
- Site workspaces can be imported from a file made by Export workspace, so QA setups can be shared between people and browsers.

Reliability and performance
- Same-URL history.replaceState calls no longer log a fake route change or trigger an extra snapshot.
- The page rescan slows from every 1.5s to every 3s after the first 30 seconds on a page.
- Adobe Target timing only watches attribute and text changes while it is waiting to match a Target response, instead of on every page at all times.
- Background network listeners only receive image and ping requests, and check the request type before matching the URL.
- popup.* background messages are ignored when they come from a web page content script.
- AB Tasty activities are now listed when the page uses the lowercase abtasty global.

Accessibility and usability
- Copy buttons work on http pages and in frames where the clipboard API is blocked.
- Left and right arrow keys move between the panel sections.
- Highlighting a selector scrolls the first match into view.
- Smallest text sizes in the panel were raised for legibility.
