const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { calculate } = require('../assets/standings-chart.js');

const load = name => JSON.parse(fs.readFileSync(path.join(__dirname, '../data', name), 'utf8'));

test('standings trajectory has every recorded week and uses ESPN official current ranks', () => {
  const data = load('season-2026.json');
  const trend = calculate(data);
  assert.equal(trend.weeks.length, data.completedWeek);
  assert.equal(trend.teams.length, data.currentStandings.length);
  for (const [index, row] of data.currentStandings.entries()) {
    const entry = trend.teams.find(team => team.id === row.id);
    assert.ok(entry, 'Every official team must be present');
    assert.equal(entry.ranks.at(-1), index + 1, 'Latest rank must match ESPN standings');
    assert.equal(entry.ranks.length, data.completedWeek);
  }
  for (let weekIndex=0; weekIndex<data.completedWeek; weekIndex++) {
    const ordered = trend.teams.map(team => team.ranks[weekIndex]).sort((a,b)=>a-b);
    assert.deepEqual(ordered, Array.from({length: data.currentStandings.length},(_,i)=>i+1));
  }
});

test('recomputed earlier ranks use wins, then cumulative points as a tiebreak', () => {
  const source = {
    completedWeek:2,
    currentStandings:[
      {id:1,manager:'Alpha',pf:210},{id:2,manager:'Bravo',pf:210},
      {id:3,manager:'Charlie',pf:160},{id:4,manager:'Delta',pf:150}
    ],
    matchups:[
      {week:1,a:{id:1,score:120},b:{id:2,score:100}},
      {week:1,a:{id:3,score:90},b:{id:4,score:80}},
      {week:2,a:{id:1,score:90},b:{id:3,score:70}},
      {week:2,a:{id:2,score:110},b:{id:4,score:70}}
    ]
  };
  const rows=calculate(source).teams;
  const alpha=rows.find(x=>x.id===1),charlie=rows.find(x=>x.id===3);
  assert.equal(alpha.ranks[0],1);
  assert.equal(charlie.ranks[0],3);
  assert.equal(alpha.ranks.at(-1),1);
});

test('incomplete, duplicate and inconsistent ESPN snapshots do not create misleading trends', () => {
  const source=load('season-2026.json');
  const broken=[
    x=>x.matchups.splice(0,1),
    x=>x.matchups[1].a.id=x.matchups[0].a.id,
    x=>x.matchups[0].a.score+=10,
    x=>x.currentStandings[0].pf+=10
  ];
  for(const damage of broken) {
    const snapshot=structuredClone(source);
    damage(snapshot);
    assert.throws(()=>calculate(snapshot), /week|matchup|points|coverage|team/i);
  }
});

test('homepage offers official-standings table and visible weekly trajectory controls', () => {
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../assets/home.css'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../assets/app.js'),'utf8');
  assert.match(html,/id="standings2026"/);
  assert.match(html,/id="standingsTrend"/);
  assert.match(html,/assets\/standings-chart\.js\?v=1/);
  assert.match(app,/LeagueStandingTrend\.mount\(seasonData\)/);
  assert.match(css,/\.st-scroll/);
  assert.match(css,/\.st-legend/);
  assert.match(css,/\.home-dashboard-grid/);
});
