# Frame — iOS UI/UX handoff, concept 02

Product owner: Kyle Olson. Target: an iPhone app, distributed through TestFlight and the App Store. The browser prototype is an interaction reference, not the production app architecture. Claude owns implementation and architecture decisions; this document specifies intended design and behavior.

## Direction
Keep the relaxing visual character: warm ivory, muted lavender, understated sage, soft borders, ample spacing. Avoid a dense streaming-service storefront, neon scores, aggressive engagement prompts, and Beli's visual identity. Frame is a working name, pending trademark clearance. Comparison ranking is inspiration only; implementation and creative expression must be independent. Legal/patent clearance remains outstanding.

## Navigation
Five persistent bottom tabs: Calendar, Discover, My Watchlist, Friends, Profile. Watching and Watch Later are mutually exclusive segments within My Watchlist. Movie and TV rankings live in Profile. Preserve scroll position within each tab in production. Detail pages should use native navigation; quick reactions and release preferences use sheets. Respect safe areas, Dynamic Type, VoiceOver, Reduce Motion, and minimum 44-point touch targets. Do not reproduce simulated status bars in the native app.

## Visual tokens
- Canvas: #F7F6F2. Surface: #FFFFFF. Primary text: #242526.
- Secondary text: #797A77; increase contrast where needed for small native text.
- Borders: #E5E4DF. Lavender selection: #EAE3F2. Accent: #786794.
- Positive rating: #277557. Neutral: #99720B. Negative: #B84646.
- Use native SF typography, approximately 28pt page headings, 18pt section headings, 15–17pt primary body, 12–13pt supporting labels. The web reference compresses some labels; do not inherit undersized labels.
- 20–24pt page gutters; 8pt spacing rhythm; 12–16pt card corner radius. Avoid deep shadows inside screens.
- Poster treatments in this prototype are original typographic placeholders. Replace with properly licensed catalog artwork.
- Color is always accompanied by a text reaction, score, or release type.

## Calendar
Default to a vertically scrollable agenda grouped by day and month. Month grid is an optional view, with dots indicating releases and a selected-day list below. Allow scrolling through future months and revisiting missed releases. Filter by all releases, episodes, theaters, and subscription streaming; distinguish digital rental/purchase in detail. Production can add a dedicated rental filter.

Show title, season/episode, source/service, release type, localized date/time if known, and announcement status. Unknown dates stay TBA, never invented. Refresh changed dates without duplicate alerts. Batch a full-season drop into one release event. A missed episode stays on its original release date, while Watching tracks the backlog.

Shows in Watching appear automatically. Watch Later titles can follow release milestones without moving into Watching. For movies, independently follow theater, subscription streaming, and rental/purchase. Watching in theaters does not automatically disable a selected streaming rewatch alert.

## My Watchlist
Watching: title cards with season, progress, next episode, watched action, chart, and pause. Watched action offers an optional quick episode reaction. Production needs season selection, edit/undo progress, and confirmation before marking multiple episodes watched.

Watch Later: saved films and shows. Start watching moves a show into Watching. Keep movie saved/watched history distinct from active episodic tracking.

Still watching check-in: triggered by inactivity plus released-but-unwatched episodes, not a hiatus. Options: Still watching (snooze), I'm caught up (confirm episode range), Pause (move to Watch Later; stop calendar/reminders), Stopped (remove active tracking, preserve history). Ignoring the prompt never removes a show. Use a configurable threshold and different timing for full-season drops. Prototype check-in is manually seeded, not computed.

## Discover
Search, upcoming titles, and explainable recommendations. Start with movies/shows/coming-soon filters. Production recommendations should use user's relative rankings, reaction history, metadata similarities, selected services, and optionally compatible friends. Never imply sample recommendations are model-generated. Include Not interested, already watched, save, and start watching actions in production. Capture country, time zone, and streaming subscriptions during onboarding; no streaming account passwords are required for catalog discovery.

## Ranking
Movie and full-show pools remain separate. Initial reactions: Great, Good, Fine, Meh, Bad. Great/Good green; Fine/Meh yellow; Bad red. Colors encode reaction, not rigid numeric score bands.

Initial reaction selects nearby comparisons; answers primarily determine relative order. Scores are 0.0–10.0 with one decimal. Great can be below 9.0. Highest-ranked title does not automatically earn 10.0. A rare 10.0 requires top placement and an explicit all-time-favorite signal. Support ties, cannot remember, and reranking. Ongoing show ranks should include watched-through progress.

Production must define independent comparison selection, score anchoring/calibration, uncertainty, cold start, ties, and update stability. Keep the raw comparison history. Do not silently move a title across a user's reaction category; color remains user-selected. Prototype uses simple binary placement and interpolation among seeded scores. It is not the final ranking model, and the arbitrary provisional seed values are not fixed product score bands. Avoid false precision when history is sparse.

## Episode detail
Five quick reactions, no forced pairwise comparisons. Display an accessible episode-by-episode chart with labels and a season selector in production. Tapping a watched episode opens its rating and details. My favorites filters Great episodes. Overall show score remains independent of the episode mean. Mask unwatched episode titles/reactions if spoilers are possible. Prototype has only Season 1 and numeric episode labels.

## Friends
Feed of titles watched, started, ranked, or saved. Display friend identity, action, title, reaction/score where applicable, and optional note. Allow saving a title from the feed. Episode spoilers require an explicit reveal or appropriate watch progress. Likes are optional lightweight interactions. Production needs accounts, following, feed privacy, blocking/reporting, moderation for user content, and loading/empty/error states. All prototype friends are fictional samples.

## State and data
Prototype stores state only in localStorage. Production needs authenticated persistence, offline cache and sync, release refresh jobs, notification permission and delivery, preference editing, and deletion flows. Catalog/provider integrations are not present in the mockup. API credentials belong server-side. Provider identities and dates in the mockup are illustrative, not a data source.

## Acceptance scenarios
1. Follow both theater and subscription milestones for one movie; each appears independently once dates are known.
2. Pause an active show; it moves to Watch Later and disappears from future followed releases while ratings persist.
3. Mark one episode watched, optionally rate it, and see the chart update without modifying the overall show rank.
4. Rate a movie Great, lose comparisons against stronger titles, and receive a score below 9.0 while remaining green.
5. Save a friend's recommendation and find it in Watch Later immediately.
6. Browse future months, return to current month, filter releases, and open a title.
7. A user waiting through a hiatus never receives an abandonment prompt solely because time elapsed.
8. Support text scaling and screen readers; no action relies on color alone.

## Scope of this delivery
Clickable iPhone-oriented visual reference; five navigation tabs; local sample lists/progress; simple comparison ranking; quick episode reactions and chart; sample friends feed; sample release calendar. Not a signed iOS app, a complete design-system library, a final recommendation/scoring engine, or legal clearance.
