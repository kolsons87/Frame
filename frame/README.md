# Frame

Movie/TV tracker, release calendar, personal ranking and friends feed — an
iPhone app in planning. This repo holds the reference prototype (UI/UX by
ChatGPT), the ranking engine, and the backend schema. Nothing here connects to
a hosted service; no infrastructure has been provisioned.

The full audit, architecture, roadmap and open decisions live in the
"Frame — Engineering Audit & Backend Plan" doc.

## Layout

| Path | What | Status |
| --- | --- | --- |
| `prototype/` | Browser prototype, concept 02 (the reference UI). `v1/` is the original concept, untouched. | 6 bugs fixed; UI unchanged |
| `prototype/tests/regression.mjs` | Browser checks for each fixed bug + pixel comparison against the original | 13 checks |
| `packages/ranking/` | Comparison ranking: insertion session (which titles to ask about) + Bradley–Terry scoring with reaction priors | 25 tests |
| `supabase/migrations/` | Postgres/Supabase schema: 23 tables, row-level security, RPCs (`set_list_state`, `record_ranking`, `set_favorite`, `my_calendar`, `friends_feed`) | Not applied anywhere |
| `supabase/tests/` | Runs the migration on in-process Postgres 16 (PGlite) as real signed-in users | 14 tests |
| `docs/original-handoff/` | ChatGPT's README, audit brief and start-here, unchanged | — |

## Run

Requires Node 22.18+ (runs TypeScript directly).

```sh
npm install
npm test                  # ranking engine + database (39 tests)
npm run test:prototype    # browser regression checks (needs Chromium; set CHROMIUM_PATH if Playwright's isn't installed)
npm run preview           # prototype at http://localhost:8000
```

## View the prototype online (GitHub Pages)

`.github/workflows/pages.yml` publishes `prototype/` on every push to `main`.
One-time setup: **Settings → Pages → Source: GitHub Actions**. The site is at
`https://<username>.github.io/<repo>/`. On GitHub's free plan this requires a
public repo, and a Pages site is public either way. Ratings and lists you
change on the site are saved only in that browser.

## Ranking in one paragraph

The user's answers decide the order: a new title is binary-searched into their
list, starting among titles with the same reaction, and inserted exactly where
the answers put it. A Bradley–Terry model fit over every stored comparison
(with the reaction as a soft prior) decides the numbers, smoothed so a
higher-placed title never shows a lower score. Scores are 0.0–9.9; 10.0 needs
the explicit all-time-favorite flag, #1 placement and at least two comparisons.
See `packages/ranking/src/model.ts`.

## Fixes made to ChatGPT's prototype

1. Discover tab never opened (`ios.js`: hoisted `discover` made `oldDiscover` call itself).
2. Five November episodes missing for Central-time users (DST broke week math in `events()`).
3. Partial saved state blanked the app (now validated by `normalizeState()`).
4. Skipped episode ratings showed as a red "undefined" bar after reload.
5. "Don't remember" could re-open an answered comparison and misplace a title.
6. 10.0 offered to Bad reactions; two titles could hold 10.0.
