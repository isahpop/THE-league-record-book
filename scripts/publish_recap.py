#!/usr/bin/env python3
"""Publish factual, frozen weekly columns from completed ESPN matchups.

Run automatically on Tuesday after ESPN sync; safe to run again (idempotent).
Previously published text is preserved, and older missing weeks are backfilled.
"""
import argparse
import json
import math
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def completed_games(data, manager_ids, week):
    games = [game for game in data['matchups'] if game['week'] == week]
    ids = [int(side['id']) for g in games for side in (g['a'], g['b'])]
    if (len(games) * 2 != len(manager_ids) or
            len(ids) != len(set(ids)) or set(ids) != set(manager_ids)):
        raise ValueError(f'Week {week} is missing a complete, unique matchup slate')
    for game in games:
        for side in (game['a'], game['b']):
            if not math.isfinite(float(side['score'])):
                raise ValueError(f'Invalid team score in Week {week}')
        if float(game['a']['score']) == float(game['b']['score']) == 0:
            raise ValueError(f'Week {week} contains an unplayed 0-0 matchup')
    return games


def generate(data, managers, published, week=None):
    week = int(week if week is not None else data['completedWeek'])
    names = {int(t['id']): t['manager'] for t in managers}
    games = completed_games(data, names, week)
    sides = [s for g in games for s in (g['a'], g['b'])]
    fmt = lambda x: f'{float(x):.2f}'
    highest = max(sides, key=lambda s: float(s['score']))
    nearest = min(games, key=lambda g: abs(g['a']['score']-g['b']['score']))
    blowout = max(games, key=lambda g: abs(g['a']['score']-g['b']['score']))

    def result(game):
        a, b = game['a'], game['b']
        if a['score'] == b['score']:
            return None
        return (a, b) if a['score'] > b['score'] else (b, a)

    closest_result = result(nearest)
    blowout_result = result(blowout)
    starters = [(p, side) for side in sides for p in side.get('starters', []) if len(p) >= 3]
    top_player, top_owner = max(starters, key=lambda x: x[0][2]) if starters else (None, None)
    losses = [loser for game in games if (pair := result(game)) for loser in [pair[1]]]
    tough_loser = max(losses, key=lambda x: x['score']) if losses else None
    mean = sum(float(side['score']) for side in sides) / len(sides)

    title = f"{names[highest['id']]} tops Week {week} with {fmt(highest['score'])} points"
    paragraphs = [
        f"Week {week}'s top score belonged to {names[highest['id']]} at {fmt(highest['score'])} points. "
        f"Across all {len(sides)} teams, the scoring average was {fmt(mean)} points."
    ]
    if closest_result:
        w, l = closest_result
        paragraphs.append(
            f"Closest finish: {names[w['id']]} beat {names[l['id']]} "
            f"{fmt(w['score'])}–{fmt(l['score'])}, a gap of "
            f"{fmt(abs(w['score']-l['score']))} points."
        )
    else:
        paragraphs.append('The closest matchup finished tied. No winner is assigned to a tie.')
    if blowout_result:
        w, l = blowout_result
        paragraphs.append(
            f"Biggest victory: {names[w['id']]} over {names[l['id']]} "
            f"{fmt(w['score'])}–{fmt(l['score'])}, a margin of "
            f"{fmt(abs(w['score']-l['score']))} points."
        )
    if tough_loser:
        paragraphs.append(
            f"Toughest high-scoring loss: {names[tough_loser['id']]} put up "
            f"{fmt(tough_loser['score'])} points and still lost."
        )
    if top_player:
        paragraphs.append(
            f"Top individual starter: {top_player[1]} scored {fmt(top_player[2])} "
            f"points for {names[top_owner['id']]}."
        )
    return {
        'season': int(data['season']), 'week': week,
        'publishedAt': published.isoformat(), 'title': title,
        'paragraphs': paragraphs, 'source': f"data/season-{data['season']}.json"
    }


def add_missing(data, managers, published, existing):
    """Return recaps with every complete missing week through the latest closed week."""
    recaps = list(existing)
    published_keys = {(int(r['season']), int(r['week'])) for r in recaps}
    for week in range(1, int(data['completedWeek']) + 1):
        key = (int(data['season']), week)
        if key in published_keys:
            continue
        try:
            recap = generate(data, managers, published, week)
        except ValueError as error:
            print(f'Skipping incomplete Week {week}: {error}')
            continue
        recaps.append(recap)
        published_keys.add(key)
    return sorted(recaps, key=lambda r: (int(r['season']), int(r['week'])))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--date', type=date.fromisoformat, default=date.today())
    args = parser.parse_args()
    data = json.loads((ROOT / 'data/season-2026.json').read_text())
    snapshot_date = date.fromisoformat(data['updatedAt'])
    if not 0 <= (args.date - snapshot_date).days <= 7:
        raise ValueError('Source snapshot is stale or future-dated; refresh ESPN data first.')
    managers = json.loads((ROOT / 'data/managers.json').read_text())['teams']
    path = ROOT / 'data/recaps.json'
    current = json.loads(path.read_text())
    updated = add_missing(data, managers, args.date, current['recaps'])
    count = len(updated) - len(current['recaps'])
    if updated != current['recaps']:
        current['recaps'] = updated
        path.write_text(json.dumps(current, ensure_ascii=False, indent=2) + '\n')
        print(f'Published {count} missing weekly recaps.')
    else:
        print('All completed weeks already have recaps; no changes.')


if __name__ == '__main__':
    main()
