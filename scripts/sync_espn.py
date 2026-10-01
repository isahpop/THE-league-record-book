#!/usr/bin/env python3
"""Sync THE League current-season data directly from ESPN Fantasy.
Secrets stay in the runner environment; only derived public league data is committed.
"""
import json, os, sys
from datetime import date
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT=Path(__file__).resolve().parents[1]
SEASON=int(os.getenv('ESPN_SEASON','2026'))
LEAGUE_ID=os.getenv('ESPN_LEAGUE_ID','1838057056')
SWID=os.getenv('ESPN_SWID','')
S2=os.getenv('ESPN_S2','')
BASE=f'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{SEASON}/segments/0/leagues/{LEAGUE_ID}'
SLOT={0:'QB',2:'RB',4:'WR',6:'TE',16:'D/ST',17:'K',23:'FLEX'}
BENCH={20,21}


def get(params, fantasy_filter=None):
    q=urlencode(params, doseq=True)
    headers={'User-Agent':'THE-League-Record-Book/1.0'}
    if SWID and S2: headers['Cookie']=f'espn_s2={S2}; SWID={SWID}'
    if fantasy_filter: headers['X-Fantasy-Filter']=json.dumps(fantasy_filter,separators=(',',':'))
    try:
        with urlopen(Request(BASE+'?'+q,headers=headers),timeout=30) as r:
            return json.load(r)
    except HTTPError as e:
        if e.code in (401,403):
            raise SystemExit('ESPN denied access. Check ESPN_SWID and ESPN_S2 repository secrets.')
        raise


def pinfo(entry):
    pool=entry.get('playerPoolEntry') or {}; p=pool.get('player') or {}
    return str(entry.get('playerId') or pool.get('id')), p.get('fullName') or f"Player {entry.get('playerId')}", float(pool.get('appliedStatTotal') or 0)


def side(raw, team_names):
    tid=int(raw['teamId']); entries=((raw.get('rosterForCurrentScoringPeriod') or {}).get('entries') or [])
    starters=[]; bench=[]
    for e in entries:
        pid,name,pts=pinfo(e); slot=int(e.get('lineupSlotId',20))
        if slot in BENCH: bench.append((name,pts))
        elif slot in SLOT: starters.append([SLOT[slot],name,round(pts,2)])
    best=max(bench,key=lambda x:x[1]) if bench else ('—',0)
    return {'id':tid,'team':team_names.get(tid,f'Team {tid}'),'score':round(float(raw.get('totalPoints') or 0),2),'starters':starters,'bench':[best[0],round(best[1],2)]}


def main():
    meta=get([('view','mTeam'),('view','mStatus'),('view','mDraftDetail')])
    status=meta.get('status') or {}
    completed=int(status.get('latestScoringPeriod') or 0)
    if completed < 1: raise SystemExit('ESPN has no completed scoring period yet.')
    teams=meta.get('teams') or []; team_names={int(t['id']):t.get('name') or f"Team {t['id']}" for t in teams}
    managers=json.loads((ROOT/'data/managers.json').read_text())['teams']; manager_names={int(t['id']):t['manager'] for t in managers}

    standings=[]
    for t in teams:
        tid=int(t['id']); rec=((t.get('record') or {}).get('overall') or {})
        w,l,ti=int(rec.get('wins') or 0),int(rec.get('losses') or 0),int(rec.get('ties') or 0)
        wl=f'{w}–{l}'+(f'–{ti}' if ti else '')
        standings.append({'id':tid,'manager':manager_names.get(tid,team_names[tid]),'name':team_names[tid],'wl':wl,'pf':round(float(rec.get('pointsFor',t.get('points',0)) or 0),2),'seed':int(t.get('playoffSeed') or 0)})
    if all(x['seed']>0 for x in standings): standings.sort(key=lambda x:x['seed'])
    else: standings.sort(key=lambda x:(-int(x['wl'].split('–')[0]), int(x['wl'].split('–')[1]), -x['pf']))
    for x in standings: x.pop('seed',None)

    matchups=[]; lineup_log=[]; acquisitions=[]; open_stints={}; tx_ok=True
    for week in range(1,completed+1):
        box=get([('view','mBoxscore'),('view','mMatchupScore'),('scoringPeriodId',week),('matchupPeriodId',week)])
        games=[g for g in box.get('schedule',[]) if int(g.get('matchupPeriodId') or 0)==week and g.get('home') and g.get('away')]
        for g in games:
            a=side(g['away'],team_names); b=side(g['home'],team_names); matchups.append({'week':week,'a':a,'b':b})
            for raw in (g['away'],g['home']):
                tid=int(raw['teamId']); entries=((raw.get('rosterForCurrentScoringPeriod') or {}).get('entries') or [])
                for e in entries:
                    pid,name,pts=pinfo(e); slot=int(e.get('lineupSlotId',20))
                    lineup_log.append({'playerId':pid,'name':name,'managerId':tid,'week':week,'points':round(pts,2),'started':slot not in BENCH})
        try:
            tx=get([('view','mTransactions2'),('scoringPeriodId',week)])
            rows=sorted(tx.get('transactions',[]),key=lambda x:x.get('processDate') or 0)
            for tr in rows:
                if tr.get('status')!='EXECUTED' or tr.get('type') not in ('WAIVER','FREE_AGENT'): continue
                typ='waiver' if tr['type']=='WAIVER' else 'free-agent'
                for it in tr.get('items') or []:
                    pid=str(it.get('playerId')); action=it.get('type')
                    if action=='ADD' and it.get('toTeamId'):
                        tid=int(it['toTeamId']); key=(tid,pid)
                        if key not in open_stints:
                            # ESPN scoringPeriodId represents the week the move belongs to.
                            stint={'playerId':pid,'name':next((x['name'] for x in lineup_log if x['playerId']==pid),f'Player {pid}'),'managerId':tid,'type':typ,'startWeek':week}
                            acquisitions.append(stint); open_stints[key]=stint
                    elif action=='DROP' and it.get('fromTeamId'):
                        tid=int(it['fromTeamId']); key=(tid,pid)
                        if key in open_stints: open_stints.pop(key)['endWeek']=week
        except Exception as e:
            tx_ok=False; print(f'warning: transactions week {week}: {e}',file=sys.stderr)

    season={'season':SEASON,'completedWeek':completed,'updatedAt':date.today().isoformat(),'currentStandings':standings,'matchups':matchups}
    (ROOT/f'data/season-{SEASON}.json').write_text(json.dumps(season,ensure_ascii=False,indent=2)+'\n')

    awards_path=ROOT/'data/awards.json'; awards=json.loads(awards_path.read_text()); a=awards['seasons'].setdefault(str(SEASON),{})
    picks=(meta.get('draftDetail') or {}).get('picks') or []
    if picks:
        a['draftComplete']=True
        a['sourceDraftPicks']=[{'playerId':str(p['playerId']),'managerId':int(p['teamId']),'overallPick':int(p['overallPickNumber']),'round':int(p['roundId']),'selectionInRound':int(p['roundPickNumber'])} for p in picks]
    a['transactionsComplete']=tx_ok; a['lineupsComplete']=True; a['acquisitions']=acquisitions; a['lineups']=lineup_log
    a['coverageNote']=f'Direct ESPN sync through Week {completed}. Draft, weekly lineups and waiver/free-agent transactions are refreshed automatically.'
    awards_path.write_text(json.dumps(awards,ensure_ascii=False,indent=2)+'\n')
    print(f'Synced ESPN league {LEAGUE_ID}: {len(standings)} teams, Weeks 1–{completed}, {len(acquisitions)} acquisition stints.')

if __name__=='__main__': main()
