const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const P=require('../assets/preview.js');
const S=require('../assets/stats.js');
const current=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/season-2026.json')));
const history=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/history.json')));

function scheduleFixture(){
 const data=structuredClone(current);
 const ids=data.currentStandings.map(x=>x.id);
 data.upcomingWeek=data.completedWeek+1;
 data.upcomingMatchups=[];
 for(let i=0;i<ids.length;i+=2) data.upcomingMatchups.push({a:{id:ids[i]},b:{id:ids[i+1]}});
 return data;
}

test('Thursday preview opens at noon America/Chicago and ends after Monday',()=>{
 assert.equal(P.previewWindow(new Date('2026-10-15T16:59:00Z')),false);
 assert.equal(P.previewWindow(new Date('2026-10-15T17:00:00Z')),true);
 assert.equal(P.previewWindow(new Date('2026-10-17T18:00:00Z')),true);
 assert.equal(P.previewWindow(new Date('2026-10-20T16:00:00Z')),false);
 // November is standard time; noon Central is 18:00 UTC.
 assert.equal(P.previewWindow(new Date('2026-11-05T17:59:00Z')),false);
 assert.equal(P.previewWindow(new Date('2026-11-05T18:00:00Z')),true);
});

test('Upcoming ESPN slate builds five previews from completed stats',()=>{
 const model=P.calculatePreview(scheduleFixture(),history,S);
 assert.equal(model.week,current.completedWeek+1);
 assert.equal(model.matchups.length,5);
 assert.equal(new Set(model.matchups.flatMap(x=>[x.a.id,x.b.id])).size,10);
 assert.ok(model.spotlight);
 const h=model.matchups[0].series;
 assert.ok(h.games>=0);
 const output=P.renderPreview(model);
 assert.match(output,/Week 5 · Matchup Preview/);
 assert.match(output,/ESPN-confirmed pairings/);
 assert.ok(output.includes('Historical series'));
});

test('No incorrect or speculative pairings published',()=>{
 assert.throws(()=>P.calculatePreview(current,history,S),/No complete ESPN/);
 let data=scheduleFixture();data.upcomingMatchups.pop();
 assert.throws(()=>P.calculatePreview(data,history,S),/No complete ESPN/);
 data=scheduleFixture();data.upcomingMatchups[1].b.id=data.upcomingMatchups[0].a.id;
 assert.throws(()=>P.calculatePreview(data,history,S),/Duplicate or unknown/);
 data=scheduleFixture();data.upcomingWeek++;
 assert.throws(()=>P.calculatePreview(data,history,S),/No complete ESPN/);
});

test('Untrusted ESPN/team names cannot inject markup',()=>{
 const data=scheduleFixture();data.currentStandings[0].manager='<img src=x onerror=alert(1)>';
 const rendered=P.renderPreview(P.calculatePreview(data,history,S));
 assert.doesNotMatch(rendered,/<img/);
 assert.match(rendered,/&lt;img/);
});
