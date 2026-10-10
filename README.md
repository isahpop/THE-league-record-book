# THE League Record Book

V7: season yearbooks, connected playoff brackets, manager head-to-head and rivalry views, normalized position profiles, and archived Tuesday columns.

A static site served directly by GitHub Pages. Serve locally with `python3 -m http.server 8080`. Run calculation checks with `node --test tests/stats.test.js`.

## Data

- `data/managers.json`: permanent franchise IDs, aliases and historical position production.
- `data/history.json`: season summaries, regular-season archive and championship brackets.
- `data/season-2026.json`: current standings, completed week, team scores and lineups.
- `data/records.json`: preserved V6 record leaderboards and runners-up.
- `data/recaps.json`: weekly columns; newest column appears under the homepage week status.
- `data/awards.json`: inputs for draft-value and waiver-production awards.

The UI clearly states matchup coverage. No draft/waiver winner is invented from incomplete inputs. ESPN standings use their supplied rank/seed, including H2H tiebreakers.

## Weekly column

`python3 scripts/publish_recap.py` produces a short factual recap from a fresh, complete source snapshot. It preserves already published weeks. `.github/workflows/sync-espn.yml` pulls the live league directly from ESPN into the JSON files on a schedule. Private-league cookies live only in GitHub Actions Secrets. The Tuesday ChatGPT task is an editorial layer for the league column; it is not the primary data feed. No ESPN cookies or personal account credentials belong in this repository.

## Awards inputs

Under `awards.json` → `seasons` → year, supply:

- `draftComplete` and `productionComplete`: true only when full source coverage has been verified.
- `draft`: `{playerId, name, position, managerId, overallPick}` entries for every drafted QB/RB/WR/TE, ordered by actual pick.
- `players`: all fantasy-relevant players with `{playerId, name, position, points, missedGames?}` using that season's league scoring. Use the same IDs/types as the draft.
- `transactionsComplete` and `lineupsComplete`: source coverage flags.
- `acquisitions`: `{playerId, name, managerId, type, startWeek, endWeek?}`. Type is `waiver` or `free-agent`; ownership ranges are `[startWeek,endWeek)`. Use the first eligible scoring week, accounting for moves made midweek.
- `lineups`: `{playerId, managerId, week, points, started}` entries for each owned player each week.

Draft bust score = positive lost positional draft-slot production divided by `log2(overallPick + 1)`. The expected points are the season points of the player finishing at the selected player's draft-time positional rank. Missed games are shown separately. Waiver winner = actual starter points delivered during qualifying ownership stints, excluding pre-acquisition, post-drop/trade and bench production. Tied points use starts as the tiebreaker. Method version is 1.

Prior-season transactions are unavailable through the current ESPN connector, so historical waiver awards require a separate source export. Keep their coverage flags false until one is provided.


## Direct ESPN sync

League ID: `1838057056`. Add repository Actions secrets named `ESPN_SWID` and `ESPN_S2`. The workflow refreshes standings, completed-week box scores, starter/bench data, draft picks, and waiver/free-agent activity, runs tests, then commits changed `data/` files. The browser never receives the ESPN credentials.

## THE League 2.0: League Pulse

The homepage adds a completed-week League Pulse and season-long all-play rankings.
For each completed week, every team is compared with all other teams in the same week
(9 possible all-play opponents per team in this 10-team league). Expected wins are
all-play wins (ties count 0.5) divided by 9. **Win gap = actual wins + 0.5 × ties −
expected wins**; it is a descriptive schedule comparison, not proof of luck.

`assets/pulse.js` validates the weekly records against official standings before
rendering. If those records are incomplete, the Pulse panel explains that it is
unavailable rather than showing fabricated statistics. The rest of the website
continues to load if optional `awards.json` or `recaps.json` is unavailable.

Run all tests with `node --test tests/*.test.js`. Both the ESPN data sync and
validation workflows run these tests. Pushes to `development` also trigger the
validation workflow; only merge to `main` after its checks pass.

**Full ZIP installation:** Unzip these files *inside the repository root* (where
`index.html` is already located), not into a nested folder. This archive includes
all original `assets/`, `tests/`, `scripts/`, `data/` and `.github/` content so an
extractor that replaces folders will not delete website components. Before merging
back to `main`, ensure automated ESPN updates on `main` have been incorporated.

## THE League 2.1 — automatic weekly content

**Recap repair:** The ESPN sync workflow now invokes `scripts/publish_recap.py` after 8 a.m. America/Chicago on Tuesdays (using two UTC schedule entries to cover daylight saving time). The script checks every included game's participants, preserves existing articles, and backfills any previously missing completed-week recaps. A manual sync has a `publish_recaps` option to run it immediately. The 2026 archive initially backfills Weeks 1, 2 and 4 while preserving the original Week 3 article. The homepage always shows the newest published recap, not a hard-coded week.

**Thursday matchup preview:** `scripts/sync_espn.py` reads the following week's ESPN pairing list separately from completed matchups and writes `upcomingWeek` / `upcomingMatchups` when ALL managers are represented exactly once. `assets/preview.js` displays it on the homepage beginning Thursday noon America/Chicago through Monday night. The feature adds a headline matchup, all five matchups, recent three-week team scoring, standings, and recorded head-to-head history. Figures are backward-looking, not player projections or betting odds. If ESPN cannot supply a full upcoming slate, the site displays a pending message rather than invented matchups.

**Operational notes:** GitHub's scheduled actions only run from the default branch (`main`). For preproduction validation, use Actions → Sync ESPN league data → Run workflow → `development` with `publish_recaps` enabled. This retrieves future pairings and publishes any missing reports on that branch. The workflow may commit `data/` changes, so pull them into Working Copy afterward. The site's validation workflow runs both Node and Python tests.

**Development safeguard:** Since ESPN can update while the site is under development, always fetch and merge the latest `origin/main` into `development` before opening/merging a release PR. Do not overwrite more recent ESPN `data/season-2026.json` results with an old ZIP snapshot. After deploying, verify the homepage and the GitHub Actions run.

## Matchups 2.1 batch

- **This Week** is the default tab in Matchups and uses the same verified ESPN upcoming slate as the homepage Thursday preview. If a complete slate has not been imported, the tab shows a pending message rather than invented pairings. The homepage preview still appears Thursday noon CT through Monday.
- **Week archives** pair saved weekly editorials with completed results and full matchup drill-downs; the Seasons page retains the yearbook recap archive.
- **Historical rivalry rows** open the corresponding game's box-score detail. Completed 2026 matchups use saved starter scoring and ESPN-recorded bench rows from `data/awards.json`. Older historical matchups include game results but do not claim that missing 2022–25 player lineups are known. Historical lineups will require verified ESPN exports.
- **Position profiles** show indices on a zoomed 40–160 scale, centered at 100. Values are not modified; the bars are clamped if future indices fall outside this visual window.
