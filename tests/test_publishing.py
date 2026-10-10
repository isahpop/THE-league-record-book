import copy
import importlib.util
import json
import unittest
from datetime import date
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def load_module(name,path):
    spec=importlib.util.spec_from_file_location(name,ROOT/path)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
recap=load_module('publish_recap',Path('scripts/publish_recap.py'))
sync=load_module('sync_espn',Path('scripts/sync_espn.py'))
season=json.loads((ROOT/'data/season-2026.json').read_text())
managers=json.loads((ROOT/'data/managers.json').read_text())['teams']
columns=json.loads((ROOT/'data/recaps.json').read_text())['recaps']

class ContentTests(unittest.TestCase):
    def test_week4_backfill_matches_recorded_results(self):
        r=recap.generate(season,managers,date(2026,10,10),4)
        games=[g for g in season['matchups'] if g['week']==4]
        maximum=max(side['score'] for g in games for side in (g['a'],g['b']))
        self.assertIn(f'{maximum:.2f}',r['title'])
        self.assertTrue(any('Closest finish' in p for p in r['paragraphs']))
        self.assertTrue(any('Top individual starter' in p for p in r['paragraphs']))

    def test_recaps_are_idempotent_and_preserve_original_week3(self):
        first=recap.add_missing(season,managers,date(2026,10,10),columns)
        second=recap.add_missing(season,managers,date(2026,10,11),first)
        self.assertEqual(first,second)
        self.assertEqual(len(first),int(season['completedWeek']))
        self.assertEqual(next(x for x in first if x['week']==3),next(x for x in columns if x['week']==3))

    def test_bogus_zero_score_matchup_never_published(self):
        copydata=copy.deepcopy(season)
        bad=next(g for g in copydata['matchups'] if g['week']==4)
        bad['a']['score']=0;bad['b']['score']=0
        with self.assertRaisesRegex(ValueError,'0-0'):
            recap.generate(copydata,managers,date(2026,10,10),4)

    def test_upcoming_schedule_requires_every_manager_once(self):
        names={int(x['id']): x['name'] for x in season['currentStandings']}
        ids=list(names)
        pairings=[{'matchupPeriodId':5,'away':{'teamId':ids[i]},'home':{'teamId':ids[i+1]}}
                  for i in range(0,len(ids),2)]
        rows=sync.upcoming_matchups(pairings,5,names)
        self.assertEqual(len(rows),5)
        self.assertFalse(sync.upcoming_matchups(pairings[:-1],5,names))
        duplicate=copy.deepcopy(pairings);duplicate[1]['home']['teamId']=ids[0]
        self.assertFalse(sync.upcoming_matchups(duplicate,5,names))
        self.assertFalse(sync.upcoming_matchups(pairings,6,names))

if __name__=='__main__':
    unittest.main()
