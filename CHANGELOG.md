# Changelog

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
