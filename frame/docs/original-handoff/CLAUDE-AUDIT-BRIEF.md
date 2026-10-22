# Frame: engineering audit and backend planning brief

## Product constraints
Frame is an iOS movie/TV tracker, release calendar, personal ranking system, and friends feed. Keep the existing warm ivory/lavender design; Kyle likes its relaxing feel. ChatGPT is handling UI/UX and Claude is being asked to review engineering and design the implementation. Deliver an iOS app, not merely a wrapped website. The browser source is the reference experience.

Frame must be completely free to users. No monetization is currently requested. Optimize cost and simplicity for a small initial group. Do not silently choose paid data subscriptions, create paid infrastructure, or insert revenue features.

## Actual implementation
Plain HTML/CSS/JavaScript, no dependencies. index.html loads app.js before ios.js. app.js defines shared global state and functions; ios.js captures some original functions and replaces others for the updated navigation. ios.css overrides base styles. This is intentionally fast prototype composition, not a maintainable production architecture.

A 12-title sample catalog supplies titles, types, providers, genres, illustrative artwork, recommendation explanations, and one-season episode counts. Recommendations and friend activity are static. Calendar dates and provider labels are demonstrations, not verified release information. Some title follows have no calendar event because only specific sample milestones are seeded.

State is a single JSON object in localStorage under frame-v1:
- watching/later: title-ID arrays
- progress: per-title count, assuming contiguous watched episodes in Season 1
- reactions: per-title episode reaction arrays (0 Bad, 1 Meh, 2 Fine, 3 Good, 4 Great)
- ranks: title ID, score, reaction, optional provisional flag
- follows: per-title theater/streaming/rental booleans
- likes: sample post indexes
- check: one seeded check-in flag
- notifications: one preference boolean; it sends nothing

There is no server, auth, database, API integration, scraper, background refresh, scheduler, notification delivery, real social graph, analytics, or native iOS code. Static hosting is infrastructure only. There are no existing backend endpoints to audit.

## Product rules to preserve
Five tabs: Calendar, Discover, My Watchlist, Friends, Profile. Watching and Watch Later are distinct states. Calendar scrolls by day/month, including future releases and missed episodes. Movies have separate theater, digital rental/purchase, and subscription milestones by region/service. Unknown dates remain TBA.

Movie and full-show rankings are separate. Initial verbal reaction chooses nearby comparisons; pairwise preferences primarily determine numeric placement. 0.0–10.0, one decimal, no fixed reaction score bands. Great/Good green; Fine/Meh yellow; Bad red. A Great movie can be below 9.0. Reserve rare 10.0 for top placement plus explicit all-time-favorite input. Full-show score is independent of episode reactions. Episodes use quick five-way reactions and a chart, not forced comparisons.

Still watching prompts must consider actual released-but-unwatched backlog, inactivity, hiatuses, and full-season drops. Ignore does not remove a title. Pause moves to Watch Later and disables active calendar/reminders while preserving history. Social episode data must respect spoiler preferences and watch progress.

## Concrete review targets / known limitations
1. Global function overrides, inline handlers, and regex slicing of rendered HTML are prototype shortcuts. Refactor into explicit components and domain services for production.
2. Rendering interpolates HTML strings. Before accepting external catalog data or user content, use safe text rendering/context-aware escaping; never feed untrusted strings into inline handlers.
3. localStorage parsing only catches invalid JSON. It does not validate schema, IDs, ranges, missing properties, or storage quota errors. Add migrations, validation, and recovery.
4. Rank insertion uses a sorted score list, reaction-selected first comparison, then binary narrowing and interpolation. It does not retain comparison evidence. One-decimal rounding can collapse distinct placements. Ties, contradictory choices, long-term calibration, cold start, sparse comparisons, and reranking need a defined independent model.
5. Explicit 10.0 promotion can change relative order without further comparison. Review rather than treating it as the final rule.
6. Skipping comparisons temporarily removes entries from the comparison pool. Confirm resulting placement and confidence semantics.
7. Score changes do not generate a real activity event; no idempotency or multi-device conflict model exists.
8. Episode progress assumes contiguous viewing and one season; no specials, out-of-order watches, undo, watch timestamps, rewatches, or season selection.
9. Check-in logic is a hardcoded White Lotus demo, not an inactivity detector. Reminders are only a preference UI.
10. Calendar starts at October 2026. ios.js calculates weekly offsets by subtracting local-midnight Date objects and dividing by 604800000; daylight-saving changes can break integer-week checks. Use date-only calendar arithmetic and separate release instants/time zones in production. Browser local time is not necessarily the displayed CT label.
11. ios.js finite sample season replaces the original repeating calendar. v1 deliberately retains its original behavior. Do not use either generator as a real data pipeline.
12. Lists mostly enforce active/saved separation in v2; corrupted/legacy local state can still contain both. Model invariants explicitly, including independent release follows for saved shows.
13. No real recommendation learning, friendships, privacy controls, moderation, notification permission, APNs tokens, or account deletion exists.
14. Prototype labels and touch targets can be small. Audit native Dynamic Type, contrast, VoiceOver, focus, gesture behavior, safe areas, and error/empty/loading states.
15. Both versions share a localStorage key. Production should have versioned schemas and identity-scoped state.

## Suggested backend scope — proposals, not implemented
Recommend a small, low-cost architecture with authentication, authorization and private per-user records. Suggested entities: users, titles, external-ID mappings, seasons, episodes, regional release events, user title status, watch events, episode reactions, raw comparison outcomes, ranking snapshots, release follows, notification preferences/devices/jobs, follow relationships, activity events, and reports/blocks.

Separate date-only announcements from precise instants. Store source, country, provider, release type, confidence/announcement status, last checked time, and change history. Require stable event identity and idempotent notification scheduling. Handle cancellation, rescheduling, provider removal, DST, user time-zone changes, and missed jobs.

Backend provider adapters should support caching, quotas, backoff, ID reconciliation, provenance, approved retention, and configurable refresh cadence. Store secrets server-side. Never invent subscription premieres from rental dates. Do not assume scraping permission; no scraper is included or authorized by this archive. Confirm provider licenses for intended usage before integration.

Potential sources discussed: TVmaze for episode schedules; TMDB for catalog/theatrical metadata under suitable access; future subscription-release coverage unresolved. Watchmode's paid release functionality was judged too expensive to commit to at this stage. Do not automatically subscribe to it. No need for streaming account passwords.

## Requested output
1. Concise inventory of what exists vs what is simulated/missing.
2. Prioritized findings with exact file/function references, severity, impact, and recommended remediation. Separate observed code issues from future risks; do not invent backend vulnerabilities in absent code.
3. Recommended native iOS/frontend and backend architecture with rationale, operating-cost drivers, privacy/security controls, and simpler alternatives. Distinguish verified prices from estimates.
4. Proposed database schema and API contracts, explicit permissions, and synchronization strategy.
5. Independent comparison ranking specification, calibration rationale, and meaningful tests.
6. Phased implementation plan: local/domain model, persistence/auth, catalog, schedules, notifications, social, recommendation refinement, then TestFlight readiness.
7. List decisions needed from Kyle before implementation. Preserve the design and free-user-access constraint.

No infrastructure provisioning, deployment, purchase, or third-party agreement is requested by this review brief.
