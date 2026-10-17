const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const H=require('../assets/huddle.js');
const read=n=>JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../data/'+n+'.json'),'utf8'));
const model=()=>H.build(read('season-2026'),read('history'),read('managers').teams);
test('real archive: every weekly claim links to a recorded game and excludes future weeks',()=>{
 const m=model();for(const w of m.weeks){const stories=H.weekly(m,w);assert.ok(stories.length>=3);for(const s of stories){assert.equal(s.game.week,w);assert.ok(m.games.some(g=>H.key(g)===H.key(s.game)));assert.ok(s.href.includes(encodeURIComponent(H.key(s.game))));}}
 const original=H.weekly(m,1);const modified={...m,scores:m.scores.map(s=>s.game.year===m.season.season&&s.game.week>1?{...s,score:99999}:s)};
 assert.deepEqual(H.weekly(modified,1),original);
});
test('all-play court agrees with independently calculated pairwise outcomes and total expected wins',()=>{
 const m=model();let expected=0;
 for(const t of m.season.currentStandings){const c=H.court(m,t.id);expected+=c.expected;assert.equal(H.record(c.actual),t.wl);
 for(const row of c.rows){const reciprocal=H.court(m,row.id).rows.find(r=>r.id===t.id);assert.equal(row.wins,reciprocal.losses);assert.equal(row.ties,reciprocal.ties);assert.equal(row.wins+row.losses+row.ties,m.weeks.length);}
 const week1=H.court(m,t.id,1);assert.equal(week1.actual.wins+week1.actual.losses+week1.actual.ties,1);
 }
 assert.ok(Math.abs(expected-m.current.length)<0.06);
});
test('record leaderboards preserve tied ranks and phase boundaries',()=>{
 const g=(a,b,phase='regular',week=1)=>({year:2026,week,phase,a:{id:1,score:a},b:{id:2,score:b}});
 const m={games:[g(100,100),g(110,90,'regular',2),g(999,1,'playoffs',15)],name:id=>'M'+id};
 assert.deepEqual(H.records(m,'score','regular').map(r=>[r.value,r.rank]),[[110,1],[100,2],[100,2],[90,4]]);
 assert.equal(H.records(m,'close','regular')[0].value,0);
 assert.equal(H.records(m,'score','playoffs')[0].value,999);
});
test('ties earn half credit and break a rivalry winning streak',()=>{
 const m=model();const a=m.managers[0].id,b=m.managers[1].id;
 m.games=[{year:2024,week:1,phase:'regular',a:{id:a,score:10},b:{id:b,score:1}},{year:2025,week:1,phase:'regular',a:{id:a,score:5},b:{id:b,score:5}}];
 const r=H.rivalry(m,a,b);assert.equal(r.streak,0);assert.equal(r.ties,1);assert.equal(r.closest.margin,0);
});
test('invalid current data and duplicate history never produce stories',()=>{
 const season=read('season-2026'),history=read('history'),managers=read('managers').teams;
 const broken=structuredClone(season);broken.matchups.pop();assert.throws(()=>H.build(broken,history,managers));
 history.regularSeasonMatchups.push(history.regularSeasonMatchups[0]);assert.throws(()=>H.build(season,history,managers),/Duplicate/);
});
test('Huddle renderer escapes imported names and provides usable filters and receipts',()=>{
 const m=model();m.name=()=>'<img src=x onerror=alert(1)>';m.managers=m.managers.map(t=>({...t,manager:'<script>alert(1)</script>'}));
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',addEventListener(){}});return nodes.get(id)};
 const context={LeagueHuddle:H,document:{getElementById:node},location:{href:'https://example.test/'}};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../assets/huddle-ui.js'),'utf8'),context);
 context.HuddleUI.mount(m,()=>{}).render(1,'all');const html=node('huddleContent').innerHTML;
 assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;img'));assert.match(html,/id="huddleWeek"/);assert.match(html,/data-image=/);assert.match(html,/Schedule Court/);
});

test('four-team league ties count as half a win without ten-team assumptions',()=>{
 const season={season:2030,completedWeek:1,currentStandings:[{id:1,manager:'A',pf:10,wl:'0–0–1'},{id:2,manager:'B',pf:10,wl:'0–0–1'},{id:3,manager:'C',pf:30,wl:'1–0'},{id:4,manager:'D',pf:20,wl:'0–1'}],matchups:[{week:1,a:{id:1,score:10},b:{id:2,score:10}},{week:1,a:{id:3,score:30},b:{id:4,score:20}}]};
 const m=H.build(season,{regularSeasonMatchups:[],playoffs:{}},season.currentStandings);
 const c=H.court(m,1);assert.equal(c.expected,0.17);assert.equal(c.gap,0.33);assert.equal(c.rows.find(r=>r.id===2).ties,1);
 assert.equal(H.personal(m,1,1).value,'10.00');assert.match(H.personal(m,1,1).body,/A tie/);
 assert.ok(H.weekly(m,1).some(s=>s.title==='Dead even. No escape.'));
});
