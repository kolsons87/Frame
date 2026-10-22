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
| `prototype/` | The app (browser version of concept 02), app-only shell. `v1/` and `Frame-UI-UX-Handoff.md` are ChatGPT's originals, not linked from the app | 6 bugs fixed |
| `prototype/tests/` | `regression.mjs`: checks for each fixed bug. `editing.mjs`: add/edit/delete/backup flow | 9 + 15 checks |
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

## Hosting (Netlify)

`prototype/` is a static site: no build step. In Netlify set Base directory and
Publish directory to the folder that contains `index.html` (`prototype`, or
`frame/prototype` if the repo has an extra top-level folder) and leave the
build command empty. You can add, edit and delete titles, rankings and
episode progress; the bell button has backup/restore, start fresh and
restore-sample-data. The page is app-only: no intro text or phone frame, full
screen on phones, a phone-width column on desktop. On iPhone, Safari → Share →
Add to Home Screen opens it full screen like an app. Data is sample data,
saved only in that browser.

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
