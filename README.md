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
