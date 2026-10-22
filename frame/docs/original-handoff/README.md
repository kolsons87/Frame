# Frame — complete prototype source and Claude handoff

Snapshot: October 22, 2026. Source commit: 559ed9d60d30a963b2bac3cce805d1004066c921.

## Read this first
This is the complete authored frontend prototype, not a production iOS app. There is NO backend implementation to audit yet. All data is hardcoded or stored locally in the browser. Review existing frontend logic and then propose a backend; do not assume accounts, servers, database tables, APIs, jobs, or push delivery already exist.

Latest product requirement: Frame must be completely free for users. There is no requested monetization model. Do not add subscriptions, paid tiers, ads, affiliate tracking, or data-sale features. Operating costs would be funded by the owner unless they later choose another funding source. Free access does not by itself establish eligibility for any provider's noncommercial data license; confirm actual intended use with providers.

## Run locally
From this folder, with Python 3 installed:

    python3 -m http.server 8000 --bind 127.0.0.1 --directory dist

On Windows, `py -3` can replace `python3`. Open http://localhost:8000/ for concept 02; http://localhost:8000/v1/ for the original concept. Use a modern browser. No npm install, build step, environment variables, API keys, or external dependencies are needed. This is a local preview server, not an application backend.

## Included
- dist/index.html: concept 02 shell, base styles, desktop phone presentation, dialogs.
- dist/app.js: shared sample catalog, local state, sample ranking and episode logic, original render functions.
- dist/ios.css: iPhone-oriented layout, navigation, card and sheet styling.
- dist/ios.js: concept 02 navigation and render overrides, finite sample calendar.
- dist/v1/index.html and app.js: preserved original concept.
- dist/Frame-UI-UX-Handoff.md: detailed design intent and acceptance scenarios.
- docs/CLAUDE-AUDIT-BRIEF.md: current architecture, known limitations, and requested audit scope.
- docs/CLAUDE-START-HERE.md: ready-to-paste instruction for Claude.
- SHA256SUMS.txt: checksums of the included files (except this checksum file).

The runnable source files are copied unchanged from the current checkout. Git history, host-specific deployment IDs/manifests, credentials, and runtime browser data are excluded. No native Swift/Xcode project or backend code exists in this snapshot. No third-party code license or data license is granted by this archive.

## Current persistence
Browser localStorage key: frame-v1 (shared by both concepts on the same origin). No cross-device sync or real users. Reset using the notification/preferences button then Reset demo changes. A public link does not share individual browsers' stored ratings.

## Validation
JavaScript syntax checks passed for both versions. Previous browser checks covered layout, comparison ranking, episode ratings, and revised navigation. This is not a production security, accessibility, legal, or backend audit.
