const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/app.js'),'utf8');
const load=()=>Object.fromEntries(['managers','records','history','season-2026','awards','recaps'].map(n=>[n+'.json',JSON.parse(fs.readFileSync(path.join(__dirname,'../data',n+'.json'),'utf8'))]));
async function app(hash='',data=load()){
 const nodes=new Map(),listeners={};
 const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',classList:{add(){},remove(){},toggle(){}},style:{},setAttribute(){},addEventListener(){},querySelectorAll(){return []},querySelector:node});return nodes.get(key)};
 const location={hash};
 const context={document:{getElementById:node,querySelector:node,querySelectorAll:()=>[],addEventListener(){},body:{style:{}}},window:{scrollTo(){},addEventListener:(name,fn)=>listeners[name]=fn},location,history:{pushState:(_,__,url)=>location.hash=url,replaceState:(_,__,url)=>location.hash=url},URLSearchParams,setTimeout,console:{warn(){},error(e){throw e}},LeagueStats:require('../assets/stats.js'),fetch:async url=>({ok:true,json:async()=>structuredClone(data[url.split('/').pop()])})};
 const expose='window.testAPI={setView,renderMatchups,renderRecords,renderSeason,openManager,openRivalry,openMatchup,openArchivedGame,closeMatchup,closeManager,applyRoute};';
 await vm.runInNewContext(source.replace('renderHome();renderRecaps();',expose+'renderHome();renderRecaps();'),context);
 return {nodes,node,location,api:context.window.testAPI,listeners};
}
test('week, manager, rivalry, season and game links restore their contents',async()=>{
 const a=await app();a.api.setView('matchups');a.api.renderMatchups(3);
 assert.equal(a.location.hash,'#matchups?week=3');
 let b=await app(a.location.hash);assert.match(b.node('weekRecap').innerHTML,/Week 3 at a glance/);
 a.api.openMatchup(0);assert.match(a.location.hash,/game=/);
 b=await app(a.location.hash);assert.match(b.node('matchupModal').innerHTML,/Scoring breakdown/);
 a.api.closeMatchup();assert.doesNotMatch(a.location.hash,/game=/);
 a.api.setView('managers');a.api.openManager(1);a.api.openRivalry(1,2);
 b=await app(a.location.hash);assert.match(b.node('teamDrawer').innerHTML,/Rivalry receipts/);
 a.api.setView('seasons');a.api.renderSeason(2024);
 b=await app(a.location.hash);assert.match(b.node('seasonPanel').innerHTML,/2024 season/);
});
test('invalid links fall back safely; history restores the selected week',async()=>{
 const a=await app('#invalid?week=999&manager=999&game=bogus');assert.equal(a.location.hash,'#home');
 a.location.hash='#matchups?week=2';a.listeners.popstate();assert.match(a.node('weekRecap').innerHTML,/Week 2 at a glance/);
 a.location.hash='#matchups?week=999';a.listeners.hashchange();assert.equal(a.location.hash,'#matchups');
});
test('external names and editorial text remain escaped across app renderers',async()=>{
 const data=load(),attack='<img data-injection="yes" src=x onerror="alert(1)"> & "';
 const textKeys=new Set(['name','manager','team','title','meta','label','value','player','summaryTop']);
 function poison(value){if(!value||typeof value!=='object')return;for(const [key,v] of Object.entries(value)){if(typeof v==='string'&&textKeys.has(key))value[key]=attack;else poison(v)}}
 Object.values(data).forEach(poison);
 data['managers.json'].teams.forEach(t=>t.old=[attack]);
 data['season-2026.json'].matchups.forEach(g=>[g.a,g.b].forEach(s=>{s.starters.forEach(p=>p[1]=attack);s.bench[0]=attack}));
 data['recaps.json'].recaps.forEach(r=>r.paragraphs=[attack]);
 const a=await app('',data);
 function safe(){for(const [key,n] of a.nodes)assert.ok(!n.innerHTML.includes('<img data-injection'),`Unescaped text in ${key}`)}
 safe();
 for(const category of ['Team','Player','Luck & Schedule','Draft','Bench']){a.api.renderRecords(category);safe()}
 a.api.renderMatchups(1);safe();a.api.openMatchup(0);safe();a.api.openManager(1);safe();a.api.openRivalry(1,2);safe();
 for(const year of [2022,2023,2024,2025,2026]){a.api.renderSeason(year);safe()}
 assert.match(a.node('managerGrid').innerHTML,/&lt;img/);
});
test('late preview response never unhides an archived week tab',async()=>{
 const preview=require('../assets/preview.js');
 const matchup={hidden:true,innerHTML:''};
 const previous={document:global.document,window:global.window,fetch:global.fetch};
 global.document={getElementById:id=>id==='matchupWeekPreview'?matchup:null};
 global.window={LeagueStats:require('../assets/stats.js')};
 const data=load();global.fetch=async url=>({ok:true,json:async()=>data[url.split('/').pop()]});
 try{await preview.mount();assert.equal(matchup.hidden,true);assert.match(matchup.innerHTML,/Matchup Preview/)}
 finally{for(const [k,v] of Object.entries(previous)){if(v===undefined)delete global[k];else global[k]=v}}
});
