(async function(){
  // History and the active season are required. Auxiliary awards and columns
  // degrade gracefully so a missing optional JSON file cannot blank the site.
  async function loadJson(filename, fallback) {
    try {
      const response = await fetch(`data/${filename}`, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`${filename}: HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (fallback === undefined) throw error;
      console.warn(`Optional ${filename} unavailable:`, error);
      return fallback;
    }
  }
  const [managerData, recordData, historyData, seasonData, awardsData, recapData] = await Promise.all([
    loadJson('managers.json'), loadJson('records.json'), loadJson('history.json'),
    loadJson('season-2026.json'), loadJson('awards.json', { seasons: {} }),
    loadJson('recaps.json', { recaps: [] })
  ]);

  const teams = managerData.teams;
  const { records, playerRecords, bench, draftRecords } = recordData;
  const { champions, playoffs, baselines } = historyData;
  const currentStandings = seasonData.currentStandings;
  const matchups = seasonData.matchups;
  // Missing summary values must never crash the whole website. The ESPN
  // importer normally writes these; use verified published standings as fallback.
  const count = Number(seasonData.completedWeek);
  const validSummaryCount = Number.isInteger(count) && count > 0 && Array.isArray(currentStandings) && currentStandings.length > 0;
  const calculatedAvg = validSummaryCount
    ? currentStandings.reduce((sum, t) => sum + Number(t.pf || 0), 0) / (count * currentStandings.length)
    : null;
  const scoringLeader = validSummaryCount
    ? [...currentStandings].sort((a, b) => Number(b.pf) - Number(a.pf))[0] : null;
  const summaryAvg = typeof seasonData.summary?.avg === 'number' && Number.isFinite(seasonData.summary.avg)
    ? seasonData.summary.avg : calculatedAvg;
  const summaryTop = typeof seasonData.summary?.top === 'string' && seasonData.summary.top.trim()
    ? seasonData.summary.top
    : (scoringLeader ? `${scoringLeader.manager} · ${(Number(scoringLeader.pf) / count).toFixed(2)} PPG` : '—');
  const seasons = {
    ...historyData.seasons,
    [seasonData.season]: {
      avg: Number.isFinite(summaryAvg) ? summaryAvg : null,
      top: summaryTop,
      standings: currentStandings.map(t => [t.name, t.wl, Number(t.pf).toFixed(2), t.manager])
    }
  };

function teamForName(name){return teams.find(t=>t.name===name||t.old.includes(name))}function managerForName(name){return teamForName(name)?.manager||name}function teamForManager(name){return teams.find(t=>t.manager===name)}function money(n){return Number(n).toFixed(2)}
function bestFinish(t){return t.titles?'Champion':t.finals?'Runner-up':'No final'}
function managerTeamHTML(manager,team){return `<div class="name-main">${escapeHTML(manager)}</div><div class="name-sub">${escapeHTML(team)}</div>`}
// URL state uses permanent IDs and game identity, never mutable team names.
let routeReady=false, applyingRoute=false;
let selectedView='home', selectedWeek='upcoming', selectedYear=seasonData.season;
let selectedManager=null, selectedRival=null, selectedGame=null;
let huddleUI=null, selectedHuddleWeek=seasonData.completedWeek, selectedHuddleFocus='all';
function writeRoute(replace=false){
 if(!routeReady||applyingRoute)return;
 const params=new URLSearchParams();
 if(selectedView==='matchups'&&selectedWeek!=='upcoming')params.set('week',selectedWeek);
 if(selectedView==='seasons')params.set('year',selectedYear);
 if(selectedView==='huddle'){params.set('week',selectedHuddleWeek);if(selectedHuddleFocus!=='all')params.set('focus',selectedHuddleFocus);}
 if(selectedManager!==null)params.set('manager',selectedManager);
 if(selectedRival!==null)params.set('rival',selectedRival);
 if(selectedGame)params.set('game',selectedGame);
 const hash='#'+selectedView+(params.size?'?'+params.toString():'');
 if(location.hash!==hash)history[replace?'replaceState':'pushState'](null,'',hash);
}
function gameKey(g){return [g.year,g.week,g.phase,g.a.id,g.b.id].join(':')}
function setView(id){
 if(!['home','huddle','matchups','records','managers','seasons'].includes(id))id='home';
 // Switching sections also dismisses overlays without creating intermediate URLs.
 const wasApplying=applyingRoute;applyingRoute=true;closeManager();closeMatchup();applyingRoute=wasApplying;
 selectedView=id;
 if(id==='huddle'&&!applyingRoute)huddleUI?.render(selectedHuddleWeek,selectedHuddleFocus);
 document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
 window.scrollTo({top:0,behavior:'smooth'});writeRoute();
}
function applyRoute(){
 const [view,query='']=location.hash.slice(1).split('?');
 const params=new URLSearchParams(query);applyingRoute=true;
 try{
  setView(view);
  const week=Number(params.get('week'));
  renderMatchups(matchups.some(m=>m.week===week)?week:'upcoming');
  if(selectedView==='huddle'){
   selectedHuddleWeek=matchups.some(m=>m.week===week)?week:seasonData.completedWeek;
   selectedHuddleFocus=params.has('focus')&&teams.some(t=>String(t.id)===params.get('focus'))?params.get('focus'):'all';
   huddleUI?.render(selectedHuddleWeek,selectedHuddleFocus);
  }
  const year=Number(params.get('year'));
  renderSeason(Object.hasOwn(seasons,year)?year:seasonData.season);
  const manager=Number(params.get('manager')),rival=Number(params.get('rival'));
  if(params.has('manager')&&teams.some(t=>t.id===manager)){
   openManager(manager);
   if(params.has('rival')&&rival!==manager&&teams.some(t=>t.id===rival))openRivalry(manager,rival);
  }
  const game=gameArchive.findIndex(g=>gameKey(g)===params.get('game'));
  if(game>=0)openArchivedGame(game);
 }finally{applyingRoute=false;}
 writeRoute(true);
}
window.addEventListener('popstate',applyRoute);
window.addEventListener('hashchange',applyRoute);
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.go)));

function renderHome(){
 // Optional visual module: a chart error must never block standings or matchups.
 try {
  if (typeof LeagueStandingTrend !== 'undefined') LeagueStandingTrend.mount(seasonData);
 } catch (error) {
  console.warn('Standings chart unavailable:',error);
 }
 document.querySelector('.update-badge').textContent=`Updated through ${seasonData.season} Week ${seasonData.completedWeek}`;
 document.querySelector('.home-status strong').textContent=`${seasonData.season} Week ${seasonData.completedWeek} complete`;
 document.querySelector('.home-status span').textContent=`Results updated: ${seasonData.updatedAt}`;
 document.querySelector('footer div:last-child').textContent=`2022–present · Updated through ${seasonData.season} Week ${seasonData.completedWeek}`;
 document.querySelector('#home article.panel .pill').textContent=`Through W${seasonData.completedWeek}`;
 document.getElementById('standings2026').innerHTML=currentStandings.map((t,i)=>`<tr><td class="rank">${i+1}</td><td>${managerTeamHTML(t.manager,t.name)}</td><td><b>${escapeHTML(t.wl)}</b></td><td>${money(t.pf)}</td></tr>`).join('');
 // Dashboard metrics come only from the verified published ESPN snapshot.
 const latestWeek=Number(seasonData.completedWeek);
 const latestGames=matchups.filter(g=>Number(g.week)===latestWeek);
 const weekHigh=latestGames.flatMap(g=>[g.a,g.b]).sort((a,b)=>Number(b.score)-Number(a.score))[0];
 const firstPlace=currentStandings[0];
 const snapshot=[
   ['FIRST PLACE',firstPlace?.manager||'—',firstPlace?.wl||'Official standings'],
   ['LEAGUE AVERAGE',Number.isFinite(summaryAvg)?money(summaryAvg):'—','Points / team / week'],
   [`WEEK ${latestWeek} HIGH`,weekHigh?cleanScore(weekHigh.score):'—',weekHigh?managerForId(weekHigh.id):'Awaiting results']
 ];
 document.getElementById('homeTicker').innerHTML=snapshot.map(([label,value,context])=>
   `<div class="home-ticker-cell"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong><small>${escapeHTML(context)}</small></div>`
 ).join('');
 document.getElementById('homeResultsEyebrow').textContent=`WEEK ${latestWeek} · FINAL`;
 document.getElementById('homeLatestGames').innerHTML=latestGames.length
   ?latestGames.map(g=>{
     const aWins=Number(g.a.score)>Number(g.b.score),bWins=Number(g.b.score)>Number(g.a.score);
     return `<a class="home-game" href="#matchups?week=${latestWeek}" aria-label="Week ${latestWeek}: ${escapeHTML(managerForId(g.a.id))} ${cleanScore(g.a.score)} versus ${escapeHTML(managerForId(g.b.id))} ${cleanScore(g.b.score)}. View full matchup results.">
       <span class="home-game-team ${aWins?'is-winner':''}"><span class="home-game-name">${escapeHTML(managerForId(g.a.id))}</span><strong>${cleanScore(g.a.score)}</strong></span>
       <span class="home-game-team ${bWins?'is-winner':''}"><span class="home-game-name">${escapeHTML(managerForId(g.b.id))}</span><strong>${cleanScore(g.b.score)}</strong></span>
     </a>`;
   }).join('')
   :'<p class="home-pending">Completed games will appear after ESPN confirms the week.</p>';
 const standingsPanel=document.querySelector('.home-standings');
 const standingsToggle=document.getElementById('standingsToggle');
 standingsToggle.textContent=`Show all ${currentStandings.length} teams ↓`;
 standingsToggle.onclick=()=>{
   const expanded=standingsPanel.classList.toggle('expanded');
   standingsToggle.setAttribute('aria-expanded',String(Boolean(expanded)));
   standingsToggle.textContent=expanded?'Show fewer teams ↑':`Show all ${currentStandings.length} teams ↓`;
 };

 const leaders=[['2×','Most championships','Mike'],['32–24','Best 4-year record','JT'],['130.16','Best historical PPG','Coy'],['204.24','Highest team score','Golly'],['58.1%','Best all-play rate','Coy']];
 document.getElementById('leaderGrid').innerHTML=leaders.map(x=>`<div class="leader-card"><p class="eyebrow">${x[1]}</p><div class="leader-value">${x[0]}</div><div class="leader-owner">${x[2]}</div></div>`).join('');
 const notable=[['0.05','Closest game','JT over Austin · 126.60–126.55 · 2025 W4'],['52.86','Bench disaster','Isaiah left Tua on the bench · 2022 W2'],['54.85','Lowest team score','Jazz · Team Binning · 2025 W12'],['+25.8%','Largest schedule win gap','Lance · Team Phillips · 2025 actual vs all-play']];
 document.getElementById('notableGrid').innerHTML=notable.map(x=>`<div class="mini-record"><p class="eyebrow">${x[1]}</p><strong>${x[0]}</strong><div class="meta">${x[2]}</div></div>`).join('');
 const currentById=Object.fromEntries(currentStandings.map(x=>[x.id,x]));
 document.getElementById('managerQuick').innerHTML=teams.map(t=>{const c=currentById[t.id];return `<button data-manager="${escapeHTML(t.id)}"><div class="mq-name">${escapeHTML(t.manager)}</div><div class="mq-team">${escapeHTML(t.name)}</div><div class="mq-meta"><span>2026 <b>${escapeHTML(c?.wl||'—')}</b></span><span>Titles <b>${escapeHTML(t.titles)}</b></span></div></button>`}).join('');
 document.querySelectorAll('[data-manager]').forEach(b=>b.onclick=()=>openManager(+b.dataset.manager));
 document.getElementById('champions').innerHTML=champions.map(c=>`<div class="champ-row"><div class="year-chip">${escapeHTML(c.year)}</div><div><div class="champ-name">${escapeHTML(managerForName(c.name))} · ${escapeHTML(c.name)}</div><div class="champ-sub">Beat ${escapeHTML(managerForName(c.runner))} · ${escapeHTML(c.runner)} · ${escapeHTML(c.score)}</div></div><span class="pill gold">Champion</span></div>`).join('');
}


const lineupOrder=['QB','RB1','RB2','WR1','WR2','TE','FLEX','K','D/ST'];
const lineupColors={'QB':'#e47a7a','RB1':'#2fb66f','RB2':'#73cf99','WR1':'#49a8dc','WR2':'#84c5e9','TE':'#eab05b','FLEX':'#9a78dc','K':'#cf58e8','D/ST':'#6f7168'};
function managerForId(id){return teams.find(t=>t.id===id)?.manager||'Unknown'}
function cleanScore(n){return Number(n).toFixed(2).replace(/\.00$/,'')}
function sideWinnerClass(side,other){return side.score>other.score?'winner':'loser'}
function weekRecapStats(week){
  const rows=matchups.filter(m=>m.week===week);
  const sides=rows.flatMap(m=>[{side:m.a,opp:m.b,match:m},{side:m.b,opp:m.a,match:m}]);
  const high=[...sides].sort((x,y)=>y.side.score-x.side.score)[0];
  const close=[...rows].sort((x,y)=>Math.abs(x.a.score-x.b.score)-Math.abs(y.a.score-y.b.score))[0];
  const blowout=[...rows].sort((x,y)=>Math.abs(y.a.score-y.b.score)-Math.abs(x.a.score-x.b.score))[0];
  const starters=rows.flatMap(m=>[
    ...m.a.starters.map(p=>({p,side:m.a,match:m})),
    ...m.b.starters.map(p=>({p,side:m.b,match:m}))
  ]);
  const mvp=[...starters].sort((x,y)=>y.p[2]-x.p[2])[0];
  const bench=rows.flatMap(m=>[
    m.a.bench?{b:m.a.bench,side:m.a,match:m}:null,
    m.b.bench?{b:m.b.bench,side:m.b,match:m}:null
  ]).filter(Boolean).sort((x,y)=>y.b[1]-x.b[1])[0];
  const closeWinner=close.a.score>close.b.score?close.a:close.b;
  const closeLoser=close.a.score>close.b.score?close.b:close.a;
  const blowWinner=blowout.a.score>blowout.b.score?blowout.a:blowout.b;
  const blowLoser=blowout.a.score>blowout.b.score?blowout.b:blowout.a;
  return {
    high:{label:'High score',value:cleanScore(high.side.score),title:managerForId(high.side.id),meta:high.side.team},
    close:{label:'Closest game',value:cleanScore(Math.abs(close.a.score-close.b.score)),title:`${managerForId(closeWinner.id)} over ${managerForId(closeLoser.id)}`,meta:`${cleanScore(closeWinner.score)}–${cleanScore(closeLoser.score)}`},
    mvp:{label:'Week MVP',value:cleanScore(mvp.p[2]),title:mvp.p[1],meta:`${managerForId(mvp.side.id)} · ${mvp.p[0]}`},
    blowout:{label:'Biggest blowout',value:cleanScore(Math.abs(blowout.a.score-blowout.b.score)),title:`${managerForId(blowWinner.id)} over ${managerForId(blowLoser.id)}`,meta:`${cleanScore(blowWinner.score)}–${cleanScore(blowLoser.score)}`},
    bench:{label:'Bench disaster',value:cleanScore(bench.b[1]),title:bench.b[0],meta:`${managerForId(bench.side.id)} · left on bench`}
  };
}
function renderWeekRecap(week){
  const r=weekRecapStats(week);
  const cards=[[r.high,''],[r.close,''],[r.mvp,'mvp'],[r.blowout,''],[r.bench,'bench']];
  const written=(recapData.recaps||[]).find(x=>x.season===seasonData.season&&x.week===week);
  document.getElementById('weekRecap').innerHTML=`<div class="week-recap-head"><div><p class="eyebrow">Week ${escapeHTML(week)} at a glance</p><h2>Weekly results</h2></div><span>Five quick stories from the week</span></div><div class="week-recap-grid">${cards.map(([x,cls])=>`<div class="week-recap-card ${cls}"><div class="recap-label">${escapeHTML(x.label)}</div><div class="recap-value">${escapeHTML(x.value)}</div><div class="recap-title">${escapeHTML(x.title)}</div><div class="recap-meta">${escapeHTML(x.meta)}</div></div>`).join('')}</div><div class="matchup-written-report">${written?recapHTML(written,false):'<div class="panel"><strong>Written recap pending</strong><p class="history">The week is final, but its report has not been published yet.</p></div>'}</div>`;
}
function renderMatchups(week='upcoming'){
  selectedWeek=week;writeRoute();
  const weeks=[...new Set(matchups.map(m=>m.week))].sort((a,b)=>b-a);
  document.getElementById('weekTabs').innerHTML=`<button class="week-btn ${week==='upcoming'?'active':''}" data-this-week="true">This Week · W${seasonData.completedWeek+1}</button>`+weeks.map(w=>`<button class="week-btn ${w===week?'active':''}" data-week="${escapeHTML(w)}">Week ${escapeHTML(w)}</button>`).join('');
  document.querySelector('[data-this-week]').onclick=()=>renderMatchups('upcoming');
  document.querySelectorAll('[data-week]').forEach(b=>b.onclick=()=>renderMatchups(+b.dataset.week));
  const upcoming=week==='upcoming';
  document.getElementById('matchupWeekPreview').hidden=!upcoming;
  document.getElementById('weekRecap').hidden=upcoming;
  document.getElementById('matchupList').hidden=upcoming;
  if(upcoming)return;
  const rows=matchups.filter(m=>m.week===week);
  renderWeekRecap(week);
  document.getElementById('matchupList').innerHTML=rows.map((m,i)=>{
    const am=managerForId(m.a.id),bm=managerForId(m.b.id),margin=Math.abs(m.a.score-m.b.score);
    return `<button class="matchup-card" data-match="${matchups.indexOf(m)}">
      <div class="matchup-side ${sideWinnerClass(m.a,m.b)}"><div class="matchup-manager">${escapeHTML(am)}</div><div class="matchup-team">${escapeHTML(m.a.team)}</div><div class="matchup-score">${cleanScore(m.a.score)}</div></div>
      <div><div class="matchup-vs">Final</div></div>
      <div class="matchup-side right ${sideWinnerClass(m.b,m.a)}"><div class="matchup-manager">${escapeHTML(bm)}</div><div class="matchup-team">${escapeHTML(m.b.team)}</div><div class="matchup-score">${cleanScore(m.b.score)}</div></div>
    </button>`;
  }).join('');
  document.querySelectorAll('[data-match]').forEach(b=>b.onclick=()=>openMatchup(+b.dataset.match));
  bindRecaps();
}
function matchupInsights(m){
  const all=[...m.a.starters.map(p=>({side:m.a,p})),...m.b.starters.map(p=>({side:m.b,p}))];
  const mvp=[...all].sort((x,y)=>y.p[2]-x.p[2])[0];
  const dud=[...all].sort((x,y)=>x.p[2]-y.p[2])[0];
  const bench=[{side:m.a,b:m.a.bench},{side:m.b,b:m.b.bench}].filter(x=>x.b).sort((x,y)=>y.b[1]-x.b[1])[0];
  return {mvp,dud,bench}
}
function positionTotals(side){
  const slots=['QB','RB','WR','TE','FLEX','K','D/ST'],o=Object.fromEntries(slots.map(s=>[s,0]));
  side.starters.forEach(([slot,name,pts])=>{o[slot]=(o[slot]||0)+pts});return o;
}
function battleRows(m){
  const slots=['QB','RB','WR','TE','FLEX','K','D/ST'],a=positionTotals(m.a),b=positionTotals(m.b);
  return slots.map(slot=>{const d=a[slot]-b[slot];return {slot,a:a[slot],b:b[slot],edge:Math.abs(d)<.005?'Even':d>0?managerForId(m.a.id):managerForId(m.b.id),diff:Math.abs(d)}})
}
function recordNotes(m){
  const allSides=matchups.flatMap(x=>[x.a,x.b]),allMargins=matchups.map(x=>Math.abs(x.a.score-x.b.score));
  const maxScore=Math.max(...allSides.map(s=>s.score)),minMargin=Math.min(...allMargins),maxMargin=Math.max(...allMargins),margin=Math.abs(m.a.score-m.b.score),notes=[];
  if(Math.max(m.a.score,m.b.score)===maxScore)notes.push('2026 high score');
  if(Math.abs(margin-minMargin)<.001)notes.push('Closest game of 2026');
  if(Math.abs(margin-maxMargin)<.001)notes.push('Largest margin of 2026');
  return notes;
}
function matchupSummary(m,ins,battles){
  const winner=m.a.score>m.b.score?m.a:m.b,loser=winner===m.a?m.b:m.a,margin=Math.abs(m.a.score-m.b.score);
  const swing=[...battles].sort((x,y)=>y.diff-x.diff)[0];
  return `${managerForId(winner.id)} beat ${managerForId(loser.id)} by ${margin.toFixed(2)} points. The largest positional swing came at ${swing.slot}, where ${swing.edge==='Even'?'the matchup was even':swing.edge+' held a '+swing.diff.toFixed(2)+'-point edge'}. ${ins.mvp.p[1]} was the matchup MVP with ${ins.mvp.p[2].toFixed(2)} points.`;
}
function orderedStarterRows(side){
  const groups={};side.starters.forEach(([slot,name,pts])=>{(groups[slot]??=[]).push({name,pts})});
  const one=(slot,key,idx=0)=>({key,name:groups[slot]?.[idx]?.name||'—',pts:groups[slot]?.[idx]?.pts||0});
  return [one('QB','QB'),one('RB','RB1',0),one('RB','RB2',1),one('WR','WR1',0),one('WR','WR2',1),one('TE','TE'),one('FLEX','FLEX'),one('K','K'),one('D/ST','D/ST')];
}
function donutHTML(side){
  const rows=orderedStarterRows(side),positive=rows.reduce((sum,r)=>sum+Math.max(0,r.pts),0)||1;
  let cursor=0;const stops=[];
  rows.forEach(r=>{const pct=Math.max(0,r.pts)/positive*100;if(pct>0){stops.push(`${lineupColors[r.key]} ${cursor.toFixed(3)}% ${(cursor+pct).toFixed(3)}%`);cursor+=pct;}});
  const bg=stops.length?`conic-gradient(from -90deg,${stops.join(',')})`:'#e6e7e4';
  const negatives=rows.filter(r=>r.pts<0),negTotal=negatives.reduce((sum,r)=>sum+r.pts,0);
  return `<div class="donut-team"><div class="donut-team-head"><strong>${escapeHTML(managerForId(side.id))}</strong><span>${escapeHTML(side.team)}</span></div><div class="donut-chart" style="background:${bg}"><div class="donut-hole"><div><strong>${cleanScore(side.score)}</strong><span>team points</span></div></div></div><div class="donut-list">${rows.map(r=>{const pct=Math.max(0,r.pts)/positive*100;return `<div class="donut-row"><div class="donut-slot">${r.key}</div><span class="donut-dot" style="background:${lineupColors[r.key]}"></span><div class="donut-player">${escapeHTML(r.name)}</div><div class="donut-points">${cleanScore(r.pts)}</div><div class="donut-pct">${r.pts>0?pct.toFixed(1)+'%':r.pts<0?'NEG':'0%'}</div></div>`}).join('')}</div>${negatives.length?`<div class="negative-adjust">Negative adjustment: ${negatives.map(r=>`${r.key} ${escapeHTML(r.name)} ${cleanScore(r.pts)}`).join(' · ')} (${cleanScore(negTotal)} total)</div>`:''}</div>`;
}
function recordedBench(week, id){
  const rows=awardsData.seasons?.[seasonData.season]?.lineups;
  if(!Array.isArray(rows))return [];
  return rows.filter(x=>Number(x.week)===Number(week)&&Number(x.managerId)===Number(id)&&x.started===false&&typeof x.name==='string'&&Number.isFinite(Number(x.points)))
    .sort((a,b)=>Number(b.points)-Number(a.points));
}
function benchSnapshotHTML(week, sides){
  const available=sides.map(side=>({side,rows:recordedBench(week,side.id)}));
  if(!available.some(x=>x.rows.length))return '<p class="history">A complete bench snapshot was not preserved for this week. The highest-scoring bench player may appear above.</p>';
  return `<section class="chart-panel"><h3>Recorded bench · Week ${escapeHTML(week)}</h3><p class="history">Players listed on each team’s ESPN bench for this scoring week. Scores are actual fantasy points, not projected points.</p><div class="roster-grid">${available.map(({side,rows})=>`<div><h4>${escapeHTML(managerForId(side.id))} · ${escapeHTML(side.team)}</h4>${rows.length?`<div class="roster-rows">${rows.map(x=>`<div class="roster-row"><span>${escapeHTML(x.name)}</span><strong>${money(x.points)}</strong></div>`).join('')}</div>`:'<p class="history">Bench data not available</p>'}</div>`).join('')}</div></section>`;
}
function openMatchup(index){
  const m=matchups[index];if(!m)return;selectedGame=gameKey({...m,year:seasonData.season,phase:'regular'});writeRoute();const ins=matchupInsights(m),battles=battleRows(m),notes=recordNotes(m);
  const winner=m.a.score>m.b.score?m.a:m.b;
  document.getElementById('matchupModal').innerHTML=`<div class="matchup-modal-inner">
    <div class="matchup-modal-head"><div><p class="eyebrow">2026 · Week ${escapeHTML(m.week)}</p><h2>${escapeHTML(managerForId(m.a.id))} vs ${escapeHTML(managerForId(m.b.id))}</h2></div><button class="close-btn" id="closeMatchup" aria-label="Close matchup">×</button></div>
    <div class="modal-scoreboard">
      <div class="modal-team"><div class="modal-manager">${escapeHTML(managerForId(m.a.id))}</div><div class="modal-team-name">${escapeHTML(m.a.team)}</div><div class="modal-score">${cleanScore(m.a.score)}</div></div>
      <div class="modal-vs">FINAL</div>
      <div class="modal-team right"><div class="modal-manager">${escapeHTML(managerForId(m.b.id))}</div><div class="modal-team-name">${escapeHTML(m.b.team)}</div><div class="modal-score">${cleanScore(m.b.score)}</div></div>
    </div>
    <div class="insight-grid">
      <div class="insight-card mvp"><p class="eyebrow">Matchup MVP</p><strong>${escapeHTML(ins.mvp.p[1])}</strong><div class="meta">${escapeHTML(managerForId(ins.mvp.side.id))} · ${escapeHTML(ins.mvp.p[0])} · ${cleanScore(ins.mvp.p[2])} pts</div></div>
      <div class="insight-card dud"><p class="eyebrow">Biggest dud</p><strong>${escapeHTML(ins.dud.p[1])}</strong><div class="meta">${escapeHTML(managerForId(ins.dud.side.id))} · ${escapeHTML(ins.dud.p[0])} · ${cleanScore(ins.dud.p[2])} pts</div></div>
      <div class="insight-card bench-regret"><p class="eyebrow">Bench regret</p><strong>${escapeHTML(ins.bench.b[0])}</strong><div class="meta">${escapeHTML(managerForId(ins.bench.side.id))} · ${cleanScore(ins.bench.b[1])} pts on the bench</div></div>
    </div>
    <div class="chart-panel"><div class="chart-head"><div><h3>Scoring breakdown</h3><p>Each starter has a fixed lineup position so both teams read the same way every week.</p></div><span class="pill">${escapeHTML(managerForId(winner.id))} won by ${Math.abs(m.a.score-m.b.score).toFixed(2)}</span></div>
      <div class="donut-compare">${donutHTML(m.a)}${donutHTML(m.b)}</div>
      <div class="chart-note">Percentages show each starter's share of positive starter production. Negative scores are called out separately so the circle is not mathematically misleading.</div>
    </div>
    <div class="chart-panel battle-table"><div class="chart-head"><div><h3>Position battle</h3><p>RB and WR combine both starting slots.</p></div></div>
      <div class="table-wrap compact-table"><table><thead><tr><th>Position</th><th>${escapeHTML(managerForId(m.a.id))}</th><th>${escapeHTML(managerForId(m.b.id))}</th><th>Edge</th></tr></thead><tbody>${battles.map(r=>`<tr><td><b>${escapeHTML(r.slot)}</b></td><td>${r.a.toFixed(2)}</td><td>${r.b.toFixed(2)}</td><td class="battle-edge ${r.edge==='Even'?'tie':''}">${escapeHTML(r.edge)}${r.edge==='Even'?'':' +'+r.diff.toFixed(2)}</td></tr>`).join('')}</tbody></table></div>
    </div>
    ${benchSnapshotHTML(m.week,[m.a,m.b])}
    <div class="matchup-summary">${escapeHTML(matchupSummary(m,ins,battles))}${notes.length?'<div>'+notes.map(n=>`<span class="record-note">${n}</span>`).join('')+'</div>':''}</div>
  </div>`;
  document.getElementById('matchupBackdrop').classList.add('open');document.getElementById('matchupModal').classList.add('open');document.getElementById('matchupModal').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';document.getElementById('closeMatchup').onclick=closeMatchup;
}
function archiveGameIndex(g){
  return gameArchive.findIndex(x=>x.year===g.year && x.week===g.week && x.phase===g.phase &&
    x.a.id===g.a.id && x.b.id===g.b.id);
}
function bindArchivedMatchupLinks(scope){
  scope.querySelectorAll('[data-archive-index]').forEach(button=>button.onclick=()=>openArchivedGame(Number(button.dataset.archiveIndex)));
}
function openArchivedGame(index){
  const g=gameArchive[index];if(!g)return;selectedGame=gameKey(g);writeRoute();
  if(g.year===seasonData.season&&g.phase==='regular'){
    const liveIndex=matchups.findIndex(m=>m.week===g.week&&m.a.id===g.a.id&&m.b.id===g.b.id);
    if(liveIndex>=0)return openMatchup(liveIndex);
  }
  document.getElementById('matchupModal').innerHTML=`<div class="matchup-modal-inner">
    <div class="matchup-modal-head"><div><p class="eyebrow">${escapeHTML(g.year)} · Week ${escapeHTML(g.week)} · ${g.phase==='playoffs'?'Playoffs':'Regular season'}</p><h2>${escapeHTML(managerForId(g.a.id))} vs ${escapeHTML(managerForId(g.b.id))}</h2></div><button class="close-btn" id="closeMatchup" aria-label="Close matchup">×</button></div>
    <div class="modal-scoreboard"><div class="modal-team"><div class="modal-manager">${escapeHTML(managerForId(g.a.id))}</div><div class="modal-team-name">${escapeHTML(g.a.team)}</div><div class="modal-score">${money(g.a.score)}</div></div><div class="modal-vs">FINAL</div><div class="modal-team right"><div class="modal-manager">${escapeHTML(managerForId(g.b.id))}</div><div class="modal-team-name">${escapeHTML(g.b.team)}</div><div class="modal-score">${money(g.b.score)}</div></div></div>
    <section class="chart-panel"><h3>Historical starting lineup</h3><p class="history">The imported ${escapeHTML(g.year)} archive preserves the result and team identities, but not this game’s player-by-player lineup or bench. We won’t substitute a current roster for a historical one. A verified ESPN box-score import could fill this gap later.</p></section>
  </div>`;
  document.getElementById('matchupBackdrop').classList.add('open');document.getElementById('matchupModal').classList.add('open');document.getElementById('matchupModal').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
  document.getElementById('closeMatchup').onclick=closeMatchup;
}
function closeMatchup(){selectedGame=null;writeRoute();document.getElementById('matchupBackdrop').classList.remove('open');document.getElementById('matchupModal').classList.remove('open');document.getElementById('matchupModal').setAttribute('aria-hidden','true');document.body.style.overflow=''}
document.getElementById('matchupBackdrop').onclick=closeMatchup;


function rankedRecordCard(r,extra=''){
 const runners=(r.runners||[]);
 return `<article class="record-card ${extra} ${r.danger?'danger':''}">
   <p class="eyebrow">${escapeHTML(r.label)}</p>
   <div class="value">${escapeHTML(r.value)}</div>
   <h3>${escapeHTML(r.title)}</h3>
   <p>${escapeHTML(r.meta)}</p>
   ${runners.length?`<div class="record-runners"><div class="runner-head">Runners up</div>${runners.map((x,i)=>`<div class="runner-row"><div class="runner-rank">${i+2}</div><div class="runner-value">${escapeHTML(x.value)}</div><div class="runner-main"><div class="runner-name">${escapeHTML(x.title)}</div><div class="runner-meta">${escapeHTML(x.meta)}</div></div></div>`).join('')}</div>`:''}
 </article>`;
}
function renderRecords(filter='Team'){
 const cats=['Team','Player','Luck & Schedule','Draft','Bench'];document.getElementById('recordFilters').innerHTML=cats.map(c=>`<button class="filter-btn ${c===filter?'active':''}" data-filter="${c}">${c}</button>`).join('');document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>renderRecords(b.dataset.filter));
 const root=document.getElementById('recordContent');
 if(filter==='Team'){const rows=records.filter(r=>r.cat==='Team'||r.cat==='Franchise');root.innerHTML=`<div class="record-grid">${rows.map((r,i)=>rankedRecordCard(r,i===0?'dark':'')).join('')}</div>`;}
 else if(filter==='Player'){root.innerHTML=`<article class="panel"><div class="panel-head"><div><p class="eyebrow">Single-week records</p><h2>Position records</h2></div></div><div class="player-grid">${playerRecords.map(r=>`<div class="player-card"><div class="pos">${escapeHTML(r.pos)}</div><div class="pts">${escapeHTML(r.points)}</div><div class="player">${escapeHTML(r.player)}</div><div class="meta">${escapeHTML(r.meta)}</div></div>`).join('')}</div></article>`;}
 else if(filter==='Luck & Schedule'){const rows=records.filter(r=>r.cat==='Luck');root.innerHTML=`<div class="record-grid">${rows.map(r=>rankedRecordCard(r)).join('')}</div><article class="panel" style="margin-top:14px"><p class="eyebrow">What this means</p><div style="font-size:13px;line-height:1.55;color:var(--muted)">All-play compares each team against every other team each week. The gap between actual winning percentage and all-play winning percentage is a useful way to show schedule fortune without pretending it explains every result.</div></article>`;}
 else if(filter==='Draft'){root.innerHTML=`<div class="record-grid">${draftRecords.map(r=>`<article class="record-card"><p class="eyebrow">${escapeHTML(r.label)}</p><div class="value">${escapeHTML(r.value)}</div><h3>${escapeHTML(r.title)}</h3><p>${escapeHTML(r.meta)}</p></article>`).join('')}</div><article class="panel" style="margin-top:14px"><p class="eyebrow">Important</p><div style="font-size:13px;line-height:1.55;color:var(--muted)">Projection records use ESPN's draft-day projected finish, not an independent grade of every drafted player.</div></article>`;}
 else{root.innerHTML=`<article class="panel"><div class="panel-head"><div><p class="eyebrow">Bench hall of shame</p><h2>Points nobody got credit for</h2></div><span class="pill red">Pain</span></div><div class="timeline">${bench.map((b,i)=>`<div class="timeline-row"><div class="timeline-rank">${i+1}</div><div><div class="timeline-title">${escapeHTML(b.player)} · ${escapeHTML(b.manager)}</div><div class="timeline-sub">${escapeHTML(b.team)} · ${escapeHTML(b.meta)}</div></div><div class="timeline-value">${b.points.toFixed(2)}</div></div>`).join('')}</div></article>`;}
}

function renderManagers(q=''){const query=q.toLowerCase().trim();const currentById=Object.fromEntries(currentStandings.map(x=>[x.id,x]));const filtered=teams.filter(t=>[t.manager,t.name,...t.old].join(' ').toLowerCase().includes(query));document.getElementById('managerGrid').innerHTML=filtered.map(t=>{const c=currentById[t.id];return `<button class="manager-card" data-manager="${escapeHTML(t.id)}"><div class="manager-top"><div><span class="manager-avatar" aria-hidden="true">${escapeHTML(String(t.manager).slice(0,2).toUpperCase())}</span><h3>${escapeHTML(t.manager)}</h3><div class="manager-current">${escapeHTML(t.name)}</div></div>${t.titles?`<span class="pill gold">${escapeHTML(t.titles)}× Champ</span>`:'<span class="pill">'+bestFinish(t)+'</span>'}</div><div class="manager-stats"><div class="manager-stat"><strong>${escapeHTML(t.record)}</strong><span>2022–25 record</span></div><div class="manager-stat"><strong>${t.ppg.toFixed(2)}</strong><span>PPG</span></div><div class="manager-stat"><strong>${escapeHTML(t.titles)}</strong><span>Titles</span></div><div class="manager-stat"><strong>${escapeHTML(c?.wl||'—')}</strong><span>2026</span></div></div><div class="manager-foot"><span>Best week <b>${t.high.toFixed(2)}</b></span><span>All-play <b>${t.allplay.toFixed(1)}%</b></span></div><div class="manager-h2h-teaser">Open profile for records vs all 9 opponents →</div></button>`}).join('')||'<div class="panel">No matching manager or team.</div>';document.querySelectorAll('[data-manager]').forEach(b=>b.onclick=()=>openManager(+b.dataset.manager))}
function openManager(id){const t=teams.find(x=>x.id===id);if(!t)return;selectedManager=id;selectedRival=null;writeRoute();document.getElementById('teamDrawer').innerHTML=`<div class="drawer-head"><div><p class="eyebrow">Manager profile</p><h2>${escapeHTML(t.manager)}</h2><div class="history"><strong>${escapeHTML(t.name)}</strong>${t.old.length?'<br>Previous team names: '+t.old.map(escapeHTML).join(' → '):'<br>Same team name since 2022.'}</div></div><button class="close-btn" id="closeDrawer" aria-label="Close manager profile">×</button></div><div class="drawer-grid"><div class="drawer-stat"><strong>${escapeHTML(t.record)}</strong><span>2022–25 regular-season record</span></div><div class="drawer-stat"><strong>${t.ppg.toFixed(2)}</strong><span>2022–25 PPG</span></div><div class="drawer-stat"><strong>${escapeHTML(t.titles)}</strong><span>Championships</span></div><div class="drawer-stat"><strong>${escapeHTML(t.finals)}</strong><span>Finals</span></div><div class="drawer-stat"><strong>${t.high.toFixed(2)}</strong><span>Best week</span></div><div class="drawer-stat"><strong>${t.low.toFixed(2)}</strong><span>Worst week</span></div><div class="drawer-stat"><strong>${escapeHTML(t.boom)}</strong><span>150+ weeks</span></div><div class="drawer-stat"><strong>${escapeHTML(t.sub100)}</strong><span>Sub-100 weeks</span></div></div>${positionProfileHTML(t)}${h2hHTML(id)}`;document.getElementById('teamDrawer').classList.add('open');document.getElementById('drawerBackdrop').classList.add('open');document.getElementById('teamDrawer').setAttribute('aria-hidden','false');document.getElementById('closeDrawer').onclick=closeManager;bindH2H(id);document.getElementById('teamDrawer').scrollTop=0}
function closeManager(){selectedManager=null;selectedRival=null;writeRoute();document.getElementById('teamDrawer').classList.remove('open');document.getElementById('drawerBackdrop').classList.remove('open');document.getElementById('teamDrawer').setAttribute('aria-hidden','true')}document.getElementById('drawerBackdrop').onclick=closeManager;document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeManager();closeMatchup()}});

function playoffTeamHTML(t,winner){
  if(!t)return '';
  const [id,name,score]=t;
  return `<div class="bracket-team ${winner===id?'winner':''}"><div><div class="bracket-manager">${escapeHTML(managerForId(id))}</div><div class="bracket-teamname">${escapeHTML(name)}</div></div><div class="bracket-score">${score==null?'—':cleanScore(score)}</div></div>`;
}
function playoffGameHTML(g,isFinal=false,year=null,week=null){
  const index=g.b?archiveGameIndex({year,week,phase:'playoffs',a:{id:g.a[0]},b:{id:g.b[0]}}):-1;
  const tag=index>=0?'button':'div';
  return `<${tag} class="bracket-game ${isFinal?'bracket-champ':''} ${index>=0?'archive-game-link':''}" ${index>=0?`data-archive-index="${index}" aria-label="View ${escapeHTML(year)} Week ${escapeHTML(week)} playoff matchup"`:''}>${playoffTeamHTML(g.a,g.winner)}${g.b?playoffTeamHTML(g.b,g.winner):'<div class="bracket-bye">First-round bye</div>'}</${tag}>`;
}
function renderSeason(year=2026){selectedYear=year;writeRoute();const yrs=[2026,2025,2024,2023,2022];document.getElementById('seasonTabs').innerHTML=yrs.map(y=>`<button class="season-btn ${y===year?'active':''}" data-year="${y}">${y}</button>`).join('');document.querySelectorAll('[data-year]').forEach(b=>b.onclick=()=>renderSeason(+b.dataset.year));const s=seasons[year];const championManager=year===2026?'—':managerForName(s.champ);const runnerManager=year===2026?'—':managerForName(s.runner);document.getElementById('seasonPanel').innerHTML=`<div class="panel-head"><div><p class="eyebrow">${escapeHTML(year)} season</p><h2>${year===2026?'Season in progress':escapeHTML(championManager)+' — Champion'}</h2></div>${year===2026?'<span class="pill green">Current</span>':'<span class="pill gold">Completed</span>'}</div><div class="season-summary"><div class="season-mini"><strong>${Number.isFinite(s.avg)?s.avg.toFixed(2):'—'}</strong><span>League PPG</span></div><div class="season-mini"><strong>${year===2026?'—':escapeHTML(championManager)}</strong><span>Champion</span></div><div class="season-mini"><strong>${year===2026?'—':escapeHTML(runnerManager)}</strong><span>Runner-up</span></div><div class="season-mini"><strong>${escapeHTML(s.top)}</strong><span>Scoring leader</span></div></div><div class="table-wrap compact-table"><table><thead><tr><th>#</th><th>Manager</th><th>W-L</th><th>PF</th></tr></thead><tbody>${s.standings.map((r,i)=>`<tr><td class="rank">${i+1}</td><td>${managerTeamHTML(r[3] ?? managerForName(r[0]),r[0])}</td><td>${escapeHTML(r[1])}</td><td>${escapeHTML(r[2])}</td></tr>`).join('')}</tbody></table></div>${playoffHTML(year)}${awardsHTML(year)}${recapArchiveHTML(year)}`;bindRecaps();bindArchivedMatchupLinks(document.getElementById('seasonPanel'))}

function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const gameArchive=LeagueStats.archive(seasonData,historyData);
function coverageHTML(){return `<p class="history coverage">2022–25: all 56 regular-season weeks and championship-bracket games. ${escapeHTML(seasonData.season)}: through Week ${escapeHTML(seasonData.completedWeek)}. Consolation games are excluded; byes do not count as meetings.</p>`;}
function recordLabel(r){return r.games?`${r.wins}–${r.losses}${r.ties?'–'+r.ties:''}`:'—';}
function rivalryCards(id,phase){
 const rows=teams.filter(t=>t.id!==id).map(t=>LeagueStats.h2h(gameArchive,id,t.id,phase)).filter(r=>r.games);
 if(!rows.length)return '<p class="history">No games in this selection.</p>';
 const most=[...rows].sort((a,b)=>b.games-a.games||a.opponent-b.opponent)[0];
 const competitive=rows.filter(r=>r.games>=3),closest=[...competitive].sort((a,b)=>Math.abs(a.pct-50)-Math.abs(b.pct-50)||b.games-a.games)[0],toughest=[...competitive].sort((a,b)=>a.pct-b.pct||b.games-a.games)[0];
 return `<div class="rivalry-cards">${[['Most played',most],['Closest rivalry',closest],['Toughest opponent',toughest]].map(([label,r])=>`<div class="season-mini"><span>${label}</span><strong>${r?escapeHTML(managerForId(r.opponent)):'Building history'}</strong><div class="history">${r?recordLabel(r)+' · '+r.games+' games':'Needs 3+ meetings'}</div></div>`).join('')}</div>`;
}
function h2hHTML(id,phase='all'){
 return `<section class="profile-section h2h-section"><h3>Rivalries & head-to-head</h3>${coverageHTML()}<div class="filter-row">${[['all','All meetings'],['regular','Regular season'],['playoffs','Playoffs']].map(([key,label])=>`<button class="filter-btn ${phase===key?'active':''}" data-h2h-phase="${key}">${label}</button>`).join('')}</div>${rivalryCards(id,phase)}<div class="table-wrap h2h-table"><table><caption class="sr-only">${escapeHTML(managerForId(id))} versus every other manager</caption><thead><tr><th>Opponent</th><th>W-L-T</th><th>Win %</th><th>PF</th><th>PA</th></tr></thead><tbody>${teams.filter(t=>t.id!==id).map(t=>{const r=LeagueStats.h2h(gameArchive,id,t.id,phase);return `<tr><td><button class="text-link" data-rival="${escapeHTML(t.id)}">${escapeHTML(t.manager)} →</button></td><td>${recordLabel(r)}</td><td>${r.games?r.pct.toFixed(1)+'%':'—'}</td><td>${r.games?money(r.pf):'—'}</td><td>${r.games?money(r.pa):'—'}</td></tr>`;}).join('')}</tbody></table></div><p class="history">Tap an opponent for playoff splits, scoring averages and every recorded meeting. Win % counts a tie as half a win.</p></section>`;
}
function bindH2H(id){const drawer=document.getElementById('teamDrawer');drawer.querySelectorAll('[data-h2h-phase]').forEach(b=>b.onclick=()=>{drawer.querySelector('.h2h-section').outerHTML=h2hHTML(id,b.dataset.h2hPhase);bindH2H(id)});drawer.querySelectorAll('[data-rival]').forEach(b=>b.onclick=()=>openRivalry(id,+b.dataset.rival));}
function openRivalry(id,opponent){
 selectedManager=id;selectedRival=opponent;writeRoute();
 const r=LeagueStats.h2h(gameArchive,id,opponent),p=LeagueStats.h2h(gameArchive,id,opponent,'playoffs');
 const closest=[...r.history].sort((a,b)=>a.margin-b.margin)[0],highest=[...r.history].sort((a,b)=>b.me.score+b.other.score-a.me.score-a.other.score)[0];
 let longest=0,streak=0;for(const g of r.history){streak=g.result==='W'?streak+1:0;longest=Math.max(longest,streak)}
 const label=g=>g?`${g.year} W${g.week} · ${money(g.me.score)}–${money(g.other.score)}`:'No meetings';
 document.getElementById('teamDrawer').innerHTML=`<div class="drawer-head"><div><button class="text-link" id="backToManager">← ${escapeHTML(managerForId(id))} profile</button><p class="eyebrow">Rivalry receipts</p><h2>${escapeHTML(managerForId(id))} vs ${escapeHTML(managerForId(opponent))}</h2></div><button class="close-btn" aria-label="Close rivalry" id="closeDrawer">×</button></div>${coverageHTML()}<div class="drawer-grid">${[[recordLabel(r),'Overall record'],[recordLabel(p),'Playoff record'],[p.history.filter(g=>g.round==='final').length,'Championship meetings'],[r.games?money(r.pf/r.games)+' / '+money(r.pa/r.games):'—','Average PF / PA'],[longest,'Longest winning streak'],[r.games,'Recorded meetings']].map(([value,label])=>`<div class="drawer-stat"><strong>${value}</strong><span>${label}</span></div>`).join('')}</div><div class="profile-section"><h3>The memorable ones</h3><p class="history"><b>Closest:</b> ${escapeHTML(label(closest))}${closest?' · '+money(closest.margin)+' points':''}<br><b>Highest combined score:</b> ${escapeHTML(label(highest))}</p><h3>Matchup history</h3>${r.history.length?`<div class="rival-history">${[...r.history].reverse().map(g=>`<button class="rival-history-row archive-game-link" data-archive-index="${archiveGameIndex(g)}" aria-label="Open ${escapeHTML(g.year)} Week ${escapeHTML(g.week)} matchup details"><span class="pill ${g.result==='W'?'green':g.result==='L'?'red':''}">${g.result}</span><div><b>${escapeHTML(g.year)} · Week ${escapeHTML(g.week)}</b><div class="history">${g.phase==='playoffs'?'Playoffs':'Regular season'}</div></div><strong>${money(g.me.score)}–${money(g.other.score)} <span class="archive-chevron">↗</span></strong></button>`).join('')}</div>`:'<p class="history">No imported meetings yet.</p>'}</div>`;
 document.getElementById('backToManager').onclick=()=>openManager(id);document.getElementById('closeDrawer').onclick=closeManager;document.getElementById('teamDrawer').scrollTop=0;bindArchivedMatchupLinks(document.getElementById('teamDrawer'));
}
function positionProfileHTML(t){return `<div class="profile-section"><h3>Position profile</h3><p class="history">2022–25 starter production · League average = 100. Scale: 40–160 (zoomed for readability). The middle line is 100, our league average; the actual index is unchanged. Blue is above average; red is below.</p><div class="position-list">${Object.entries(t.pos).map(([p,v])=>{const index=v/baselines[p]*100,bar=LeagueStats.positionBar(index);return `<div class="position-row"><div class="position-label">${escapeHTML(p)}</div><div class="position-track" role="img" aria-label="${escapeHTML(p)}: ${index.toFixed(1)}, league average 100"><div class="position-baseline"></div><div class="position-deviation ${bar.below?'below':''}" style="left:${bar.left}%;width:${bar.width}%"></div></div><div class="position-val">${index.toFixed(1)}</div></div>`;}).join('')}</div><div class="position-scale"><span>40</span><span>100 · League average</span><span>160</span></div></div>`;}
function playoffHTML(year){
 if(year===2026)return `<div class="playoff-section"><h3>Playoff bracket</h3><div class="playoff-pending">Playoffs have not started yet.</div></div>`;
 const p=playoffs[year];if(!p)return '';
 const first=LeagueStats.orderedFirstRound(p),final=p.final[0],winner=final.a[0]===final.winner?final.a:final.b;
 const path=(x,y,toY)=>`<path d="M ${x} ${y} H ${x+20} V ${toY} H ${x+40}"/>`;
 const lines=[path(220,78,148),path(220,218,148),path(220,358,428),path(220,498,428),path(480,148,288),path(480,428,288),'<path d="M 740 288 H 780"/>'].join('');
 return `<section class="playoff-section"><div class="playoff-head"><div><p class="eyebrow">The road to the title</p><h3>${escapeHTML(year)} playoff bracket</h3><p>Winners highlighted · swipe sideways on mobile</p></div></div><div class="bracket-scroll" tabindex="0" aria-label="${escapeHTML(year)} playoff bracket, scroll horizontally"><div class="sports-bracket"><svg class="bracket-lines" viewBox="0 0 1000 560" aria-hidden="true">${lines}</svg><div class="bracket-lane"><div class="round-title">Round 1 · Week 15</div>${first.map((g,i)=>`<div class="bracket-node" style="top:${30+i*140}px">${playoffGameHTML(g,false,year,15)}</div>`).join('')}</div><div class="bracket-lane"><div class="round-title">Semifinals · Week 16</div>${p.r2.map((g,i)=>`<div class="bracket-node" style="top:${100+i*280}px">${playoffGameHTML(g,false,year,16)}</div>`).join('')}</div><div class="bracket-lane"><div class="round-title">Championship · Week 17</div><div class="bracket-node" style="top:240px">${playoffGameHTML(final,true,year,17)}</div></div><div class="bracket-lane"><div class="round-title">Champion</div><div class="bracket-node champion-node" style="top:240px"><span class="eyebrow">${escapeHTML(year)} champion</span><strong>${escapeHTML(managerForId(winner[0]))}</strong><div class="history">${escapeHTML(winner[1])}</div><span class="pill gold">${cleanScore(winner[2])} in the final</span></div></div></div></div></section>`;
}
function awardsHTML(year){
 const input=awardsData.seasons?.[year],bust=LeagueStats.draftAwards(input)[0],saver=LeagueStats.waiverAwards(input)[0];
 return `<section class="profile-section"><div class="panel-head"><div><p class="eyebrow">Season yearbook</p><h3>Draft & waiver awards</h3></div>${year===2026?'<span class="pill">In-season watch</span>':''}</div><div class="award-grid"><article class="award-card"><p class="eyebrow">Biggest draft bust</p><h3>${bust?escapeHTML(bust.name):(input?.sourceDraftPicks?.length?'Draft imported · scoring pending':'Awaiting draft history')}</h3><p>${bust?`${escapeHTML(managerForId(bust.managerId))} · Pick ${escapeHTML(bust.overallPick)} · ${escapeHTML(bust.position)}${bust.finish}<br>${money(bust.points)} points · ${money(bust.deficit)} below draft-slot value<br>Missed games: ${escapeHTML(bust.missedGames??'Not recorded')}`:(input?.sourceDraftPicks?.length?`${input.sourceDraftPicks.length} picks imported. Needs complete player production in this league’s scoring before naming a winner.`:'Needs the complete draft order and player season totals in this league’s scoring.')}</p></article><article class="award-card"><p class="eyebrow">Season saver · Waiver wire steal</p><h3>${saver?escapeHTML(saver.name):'Awaiting waiver history'}</h3><p>${saver?`${escapeHTML(managerForId(saver.managerId))} · Added Week ${escapeHTML(saver.startWeek)}<br>${money(saver.points)} starter points · ${escapeHTML(saver.starts)} starts`:(year<2026?'Historical transactions are unavailable through ESPN’s connector. An export of pickups and weekly lineups is needed.':'Needs complete ownership and weekly starter logs. Only points delivered after the pickup count.')}</p></article></div><details class="method-details"><summary>How we decide the awards</summary><p><b>Draft bust:</b> compare the player’s season points with the points scored by the player who finished at their draft-time rank within that position. Lost value ÷ log₂(overall pick + 1) is the bust score, so an early wasted pick counts more. QB/RB/WR/TE only; missed games are shown separately so injuries have context. It measures lost draft value, not player ability. Tied season scores share a finish rank.</p><p><b>Season saver:</b> total actual starter points during waiver/free-agent ownership stints, starting with the first eligible scoring week and ending before the drop or trade. Bench points and production before acquisition do not count. Re-acquisitions count once per week. Highest delivered points wins; starts break a tie.</p><p>${year===2026?'Results remain provisional until the season ends.':'Completed-season awards require complete source logs.'}</p></details></section>`;
}
function recapHTML(recap,showMatchupLink=true){return `<article class="league-column"><div class="panel-head"><div><p class="eyebrow">The weekly report · ${escapeHTML(recap.season)} Week ${escapeHTML(recap.week)}</p><h2>${escapeHTML(recap.title)}</h2><p class="history">${escapeHTML(recap.publishedAt)} · THE League</p></div><span class="pill">Week ${escapeHTML(recap.week)} recap</span></div>${recap.paragraphs.map(p=>`<p>${escapeHTML(p)}</p>`).join('')}${showMatchupLink?`<button class="text-link" data-recap-matchups="${escapeHTML(recap.week)}">See the matchup receipts →</button>`:''}</article>`;}
function bindRecaps(){document.querySelectorAll('[data-recap-matchups]').forEach(b=>b.onclick=()=>{renderMatchups(+b.dataset.recapMatchups);setView('matchups')});}
function renderRecaps(){const latest=[...(recapData.recaps||[])].sort((a,b)=>b.season-a.season||b.week-a.week)[0];document.getElementById('homeColumn').innerHTML=latest?recapHTML(latest):'<div class="panel"><h2>The weekly report</h2><p class="history">The first recap is on its way.</p></div>';bindRecaps();}
function recapArchiveHTML(year){const rows=(recapData.recaps||[]).filter(r=>r.season===year).sort((a,b)=>b.week-a.week);return `<section class="profile-section"><h3>Weekly recaps</h3>${rows.length?rows.map(r=>`<details class="recap-archive"><summary>Week ${escapeHTML(r.week)} · ${escapeHTML(r.title)}<span>${escapeHTML(r.publishedAt)}</span></summary>${recapHTML(r)}</details>`).join(''):'<p class="history">No weekly columns have been archived for this season yet.</p>'}</section>`;}

document.getElementById('teamSearch').addEventListener('input',e=>renderManagers(e.target.value));
const toast=document.getElementById('toast');function showToast(msg='Link copied'){toast.textContent=msg;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1600)}document.getElementById('shareBtn').onclick=async()=>{try{if(navigator.share){await navigator.share({title:'THE League Record Book',url:location.href})}else{await navigator.clipboard.writeText(location.href);showToast()}}catch(e){if(e.name!=='AbortError')showToast('Copy the address bar link')}};
if(typeof LeagueHuddle!=='undefined'&&typeof HuddleUI!=='undefined'){
 try{
  const model=LeagueHuddle.build(seasonData,historyData,teams);
  huddleUI=HuddleUI.mount(model,(week,focus)=>{const active=document.activeElement?.id;selectedHuddleWeek=week;selectedHuddleFocus=focus;writeRoute();huddleUI.render(week,focus);if(active)document.getElementById(active)?.focus();});
  huddleUI.render(selectedHuddleWeek,selectedHuddleFocus);
 }catch(error){console.warn('Huddle unavailable:',error);document.getElementById('huddleContent').innerHTML='<div class="hd-empty"><h2>The receipts are being checked.</h2><p>We could not reconcile this archive. Published matchups remain available while the Huddle waits for a complete snapshot.</p><a href="#matchups">Open matchups →</a></div>';}
}
renderHome();renderRecaps();renderMatchups();renderRecords();renderManagers();renderSeason();routeReady=true;applyRoute();

})().catch(err=>{console.error(err);document.querySelector("main")?.insertAdjacentHTML("afterbegin", '<div class="panel" role="alert"><h2>League data temporarily unavailable</h2><p>We could not load the published season data. Please try refreshing the page.</p><button class="share-btn" id="retryLeague">Retry</button></div>');document.getElementById('retryLeague')?.addEventListener('click',()=>location.reload());});
