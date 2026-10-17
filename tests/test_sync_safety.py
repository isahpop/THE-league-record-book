"""Exercise importer failure paths without contacting ESPN or editing real data."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from test_publishing import sync, season, managers


class SnapshotTests(unittest.TestCase):
    def test_existing_snapshot_passes(self):
        sync.validate_snapshot(season, season, [m['id'] for m in managers])

    def test_degraded_snapshots_rejected(self):
        mutations = [
            lambda s: s.update(completedWeek=season['completedWeek'] - 1),
            lambda s: s['currentStandings'].pop(),
            lambda s: s['matchups'][0]['a'].update(starters=[]),
            lambda s: s['matchups'][0]['a'].update(score=float('nan')),
            lambda s: s['matchups'][0]['a'].update(score=999),
            lambda s: s['currentStandings'][0].update(pf=999),
            lambda s: s['currentStandings'][0].update(wl='99–0'),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                candidate = copy.deepcopy(season)
                mutate(candidate)
                with self.assertRaises(ValueError):
                    sync.validate_snapshot(candidate, season, [m['id'] for m in managers])

    def run_import(self, transaction_response=None, regression=False, malformed_awards=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / 'data'
            data.mkdir()
            (data / 'managers.json').write_text(json.dumps({'teams': managers}))
            (data / 'season-2026.json').write_text(json.dumps(season))
            awards = {'seasons': {'2026': {'acquisitions': [{'playerId': 'saved-evidence'}]}}}
            (data / 'awards.json').write_text('{invalid' if malformed_awards else json.dumps(awards))
            before = {p.name: p.read_bytes() for p in data.iterdir()}
            def fake_get(params, fantasy_filter=None):
                views = [v for k, v in params if k == 'view']
                if 'mTeam' in views:
                    teams = []
                    for row in season['currentStandings']:
                        record = [int(n) for n in row['wl'].split('–')]
                        if regression:
                            record = [1, 0, 0]
                        teams.append({'id': row['id'], 'name': row['name'], 'record': {'overall': {
                            'wins': record[0], 'losses': record[1], 'ties': record[2] if len(record) > 2 else 0,
                            'pointsFor': row['pf']}}})
                    return {'teams': teams, 'status': {'latestScoringPeriod': season['completedWeek']}}
                if 'mTransactions2' in views:
                    if isinstance(transaction_response, BaseException):
                        raise transaction_response
                    return transaction_response
                week = dict(params)['matchupPeriodId']
                games = []
                for game in season['matchups']:
                    if game['week'] != week:
                        continue
                    raw = {'matchupPeriodId': week}
                    for key, side in [('away', game['a']), ('home', game['b'])]:
                        entries = [{'playerId': i + 1, 'lineupSlotId': next(k for k, v in sync.SLOT.items() if v == p[0]),
                                    'playerPoolEntry': {'player': {'fullName': p[1]}, 'appliedStatTotal': p[2]}}
                                   for i, p in enumerate(side['starters'])]
                        raw[key] = {'teamId': side['id'], 'totalPoints': side['score'],
                                    'rosterForCurrentScoringPeriod': {'entries': entries}}
                    games.append(raw)
                return {'schedule': games}
            with patch.object(sync, 'ROOT', root), patch.object(sync, 'SEASON', 2026), patch.object(sync, 'get', fake_get):
                if regression or malformed_awards:
                    with self.assertRaises((ValueError, json.JSONDecodeError)):
                        sync.main()
                    self.assertEqual(before, {p.name: p.read_bytes() for p in data.iterdir()})
                else:
                    sync.main()
                    result = json.loads((data / 'awards.json').read_text())['seasons']['2026']
                    self.assertFalse(result['transactionsComplete'])
                    self.assertEqual(result['acquisitions'], awards['seasons']['2026']['acquisitions'])
                    self.assertEqual((data / 'managers.json').read_bytes(), before['managers.json'])

    def test_transaction_failure_preserves_evidence(self):
        for response in ({}, RuntimeError('offline'), SystemExit('denied')):
            with self.subTest(response=response):
                self.run_import(response)

    def test_regression_leaves_all_files_untouched(self):
        self.run_import({'transactions': []}, regression=True)

    def test_malformed_awards_leaves_all_files_untouched(self):
        self.run_import({'transactions': []}, malformed_awards=True)
