"""Publish a source-backed column once a complete week is present in repo data."""
import argparse
import json
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def generate(data, managers, published):
    week = data['completedWeek']
    games = [g for g in data['matchups'] if g['week'] == week]
    ids = [s['id'] for g in games for s in [g['a'], g['b']]]
    if len(games) != len(managers) // 2 or len(set(ids)) != len(managers):
        raise ValueError('The completed week must include one matchup for every manager.')
    names = {t['id']: t['manager'] for t in managers}
    fmt = lambda n: f'{n:.2f}'
    sides = [s for g in games for s in [g['a'], g['b']]]
    highest = max(sides, key=lambda s: s['score'])
    nearest = min(games, key=lambda g: abs(g['a']['score'] - g['b']['score']))
    blowout = max(games, key=lambda g: abs(g['a']['score'] - g['b']['score']))
    winner = lambda g: max([g['a'], g['b']], key=lambda s: s['score'])
    loser = lambda g: min([g['a'], g['b']], key=lambda s: s['score'])
    leaders = [s for s in data['currentStandings'] if s['wl'].split('–')[1] == '0']
    undefeated = ', '.join(names[s['id']] for s in leaders)
    players = [(p, s) for s in sides for p in s.get('starters', [])]
    top_player, top_owner = max(players, key=lambda x: x[0][2]) if players else (None, None)
    headline = f"{names[highest['id']]} sets the pace; every decimal counts"
    paragraphs = [
        f"Week {week} belongs to {names[highest['id']]}, who put up {fmt(highest['score'])} points. "
        + (f"{undefeated} remain unbeaten through {week} weeks. " if leaders else '')
        + "There is plenty of season left, but the scoreboard is already collecting receipts.",
        f"The closest finish: {names[winner(nearest)['id']]} edged {names[loser(nearest)['id']]} "
        f"{fmt(winner(nearest)['score'])}–{fmt(loser(nearest)['score'])}, a margin of "
        f"{fmt(abs(nearest['a']['score'] - nearest['b']['score']))}. "
        "That is the kind of result that sends someone back through every lineup decision.",
        f"At the other end, {names[winner(blowout)['id']]} beat {names[loser(blowout)['id']]} "
        f"by {fmt(abs(blowout['a']['score'] - blowout['b']['score']))}, "
        f"{fmt(winner(blowout)['score'])}–{fmt(loser(blowout)['score'])}. "
        "No last-minute decimal rescue was coming for that one.",
    ]
    if top_player:
        paragraphs.append(f"The biggest starter performance was {top_player[1]}: {fmt(top_player[2])} "
                          f"points for {names[top_owner['id']]}. "
                          "One monster score makes a great headline; the full lineup still has to finish the job. "
                          "The next chapter is Week " + str(week + 1) + ".")
    return {'season': data['season'], 'week': week, 'publishedAt': published.isoformat(),
            'title': headline, 'paragraphs': paragraphs, 'source': f"data/season-{data['season']}.json"}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--date', type=date.fromisoformat, default=date.today())
    args = parser.parse_args()
    path = ROOT / 'data/season-2026.json'
    data = json.loads(path.read_text())
    recaps_path = ROOT / 'data/recaps.json'
    recaps = json.loads(recaps_path.read_text())
    if any(r['season'] == data['season'] and r['week'] == data['completedWeek'] for r in recaps['recaps']):
        print('This week already has a column; preserving it.')
        return
    if not 0 <= (args.date - date.fromisoformat(data['updatedAt'])).days <= 7:
        raise ValueError('Source snapshot is stale; import fresh results before publishing a new column.')
    managers = json.loads((ROOT / 'data/managers.json').read_text())['teams']
    recaps['recaps'].append(generate(data, managers, args.date))
    recaps_path.write_text(json.dumps(recaps, ensure_ascii=False, indent=2) + '\n')
    print(f"Published {data['season']} Week {data['completedWeek']}.")

if __name__ == '__main__':
    main()
