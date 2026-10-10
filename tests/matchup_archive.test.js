const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const S=require('../assets/stats.js');
const load=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'..','data',name),'utf8'));
const season=load('season-2026.json'),history=load('history.json'),awards=load('awards.json');

test('40–160 position scale widens actual differences without changing indexes',()=>{
  assert.deepEqual(S.positionBar(100),{left:50,width:0,below:false,clipped:false});
  const low=S.positionBar(80),high=S.positionBar(120);
  assert.ok(Math.abs(low.left-100/3)<1e-10);
  assert.ok(Math.abs(low.width-50/3)<1e-10);
  assert.equal(low.below,true);
  assert.equal(low.clipped,false);
  assert.ok(Math.abs(high.left-50)<1e-10);
  assert.ok(Math.abs(high.width-50/3)<1e-10);
  assert.equal(high.below,false);
  assert.equal(high.clipped,false);
  assert.equal(S.positionBar(175).width,50);
  assert.equal(S.positionBar(175).clipped,true);
  assert.equal(S.positionBar(25).left,0);
});

test('All completed 2026 games have individually recorded starting players',()=>{
  assert.equal(season.matchups.length,season.completedWeek*5);
  for(const game of season.matchups)for(const side of [game.a,game.b]){
    assert.ok(side.starters.length>=8);
    assert.ok(side.starters.every(p=>p.length===3&&typeof p[1]==='string'&&Number.isFinite(p[2])));
  }
});

test('2026 lineup snapshots provide recorded bench points, historical imports do not',()=>{
  const rows=awards.seasons['2026'].lineups;
  assert.ok(rows.some(x=>x.started===false&&x.week===1));
  for(const row of rows){assert.ok(row.week<=season.completedWeek);assert.ok(Number.isFinite(row.points));}
  for(const old of ['2022','2023','2024','2025'])assert.equal((awards.seasons[old].lineups||[]).length,0);
});

test('Every rivalry matchup has a unique canonical archive entry',()=>{
  const archive=S.archive(season,history);
  const keys=new Set();
  for(const g of archive){const key=[g.year,g.week,g.phase,g.a.id,g.b.id].join(':');assert.ok(!keys.has(key),`Duplicate archive row ${key}`);keys.add(key);}
  assert.ok(archive.some(g=>g.year===2026&&g.phase==='regular'));
  assert.ok(archive.some(g=>g.year===2022&&g.phase==='playoffs'));
});

test('Matchups UI has This Week and past written reports',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const code=fs.readFileSync(path.join(__dirname,'../assets/app.js'),'utf8');
 assert.match(html,/id="matchupWeekPreview"/);
 assert.match(code,/This Week · W/);
 assert.match(code,/recapHTML\(written,false\)/);
 assert.match(code,/data-archive-index/);
});
