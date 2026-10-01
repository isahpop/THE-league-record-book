(async function(){
  const [managerData, recordData, historyData, seasonData, awardsData, recapData] = await Promise.all([
    fetch('data/managers.json').then(r => { if(!r.ok) throw new Error('managers.json failed'); return r.json(); }),
    fetch('data/records.json').then(r => { if(!r.ok) throw new Error('records.json failed'); return r.json(); }),
    fetch('data/history.json').then(r => { if(!r.ok) throw new Error('history.json failed'); return r.json(); }),
    fetch('data/season-2026.json').then(r => { if(!r.ok) throw new Error('season-2026.json failed'); return r.json(); }),
    fetch('data/awards.json').then(r=>{if(!r.ok)throw new Error('awards.json failed');return r.json()}),
    fetch('data/recaps.json').then(r=>{if(!r.ok)throw new Error('recaps.json failed');return r.json()})
  ]);

  const teams = managerData.teams;
  const { records, playerRecords, bench, draftRecords } = recordData;
  const { champions, playoffs, baselines } = historyData;
  const currentStandings = seasonData.currentStandings;
  const matchups = seasonData.matchups;
  const seasons = {
    ...historyData.seasons,
    2026: {
      ...seasonData.summary,
      standings: currentStandings.map(t => [t.name, t.wl, Number(t.pf).toFixed(2)])
    }
  };

function teamForName(name){return teams.find(t=>t.name===name||t.old.includes(name))}function managerForName(name){return teamForName(name)?.manager||name}function teamForManager(name){return teams.find(t=>t.manager===name)}function money(n){return Number(n).toFixed(2)}
function bestFinish(t){return t.titles?'Champion':t.finals?'Runner-up':'No final'}
function managerTeamHTML(manager,team){return `<div class="name-main">${manager}</div><div class="name-sub">${team}</div>`}
function setView(id){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id));window.scrollTo({top:0,behavior:'smooth'});history.replaceState(null,'','#'+id)}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.go)));

function renderHome(){
 document.querySelector('.update-badge').textContent=`Updated through ${seasonData.season} Week ${seasonData.completedWeek}`;
 document.querySelector('.home-status strong').textContent=`${seasonData.season} Week ${seasonData.completedWeek} complete`;
 document.querySelector('.home-status span').textContent=`Results updated: ${seasonData.updatedAt}`;
 document.querySelector('footer div:last-child').textContent=`2022–present · Updated through ${seasonData.season} Week ${seasonData.completedWeek}`;
 document.querySelector('#home article.panel .pill').textContent=`Through W${seasonData.completedWeek}`;
 document.getElementById('standings2026').innerHTML=currentStandings.map((t,i)=>`<tr><td class="rank">${i+1}</td><td>${managerTeamHTML(t.manager,t.name)}</td><td><b>${t.wl}</b></td><td>${money(t.pf)}</td></tr>`).join('');
 const leaders=[['2×','Most championships','Mike'],['32–24','Best 4-year record','JT'],['130.16','Best all-time PPG','Coy'],['204.24','Highest team score','Golly'],['58.1%','Best all-play rate','Coy']];
 document.getElementById('leaderGrid').innerHTML=leaders.map(x=>`<div class="leader-card"><p class="eyebrow">${x[1]}</p><div class="leader-value">${x[0]}</div><div class="leader-owner">${x[2]}</div></div>`).join('');
 const notable=[['0.05','Closest game','JT over Austin · 126.60–126.55 · 2025 W4'],['52.86','Bench disaster','Isaiah left Tua on the bench · 2022 W2'],['54.85','Lowest team score','Jazz · Team Binning · 2025 W12'],['+25.8%','Luckiest season','Lance · Team Phillips · 2025 actual vs all-play']];
 document.getElementById('notableGrid').innerHTML=notable.map(x=>`<div class="mini-record"><p class="eyebrow">${x[1]}</p><strong>${x[0]}</strong><div class="meta">${x[2]}</div></div>`).join('');
 const currentById=Object.fromEntries(currentStandings.map(x=>[x.id,x]));
 document.getElementById('managerQuick').innerHTML=teams.map(t=>{const c=currentById[t.id];return `<button data-manager="${t.id}"><div class="mq-name">${t.manager}</div><div class="mq-team">${t.name}</div><div class="mq-meta"><span>2026 <b>${c?.wl||'—'}</b></span><span>Titles <b>${t.titles}</b></span></div></button>`}).join('');
 document.querySelectorAll('[data-manager]').forEach(b=>b.onclick=()=>openManager(+b.dataset.manager));
 document.getElementById('champions').innerHTML=champions.map(c=>`<div class="champ-row"><div class="year-chip">${c.year}</div><div><div class="champ-name">${managerForName(c.name)} · ${c.name}</div><div class="champ-sub">Beat ${managerForName(c.runner)} · ${c.runner} · ${c.score}</div></div><span class="pill gold">Champion</span></div>`).join('');
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
  document.getElementById('weekRecap').innerHTML=`<div class="week-recap-head"><div><p class="eyebrow">Week ${week} at a glance</p><h2>Weekly recap</h2></div><span>Five quick stories from the week</span></div><div class="week-recap-grid">${cards.map(([x,cls])=>`<div class="week-recap-card ${cls}"><div class="recap-label">${x.label}</div><div class="recap-value">${x.value}</div><div class="recap-title">${x.title}</div><div class="recap-meta">${x.meta}</div></div>`).join('')}</div>`;
}
function renderMatchups(week=seasonData.completedWeek){
  const weeks=[...new Set(matchups.map(m=>m.week))].sort((a,b)=>b-a);
  document.getElementById('weekTabs').innerHTML=weeks.map(w=>`<button class="week-btn ${w===week?'active':''}" data-week="${w}">Week ${w}</button>`).join('');
  document.querySelectorAll('[data-week]').forEach(b=>b.onclick=()=>renderMatchups(+b.dataset.week));
  const rows=matchups.filter(m=>m.week===week);
  renderWeekRecap(week);
  document.getElementById('matchupList').innerHTML=rows.map((m,i)=>{
    const am=managerForId(m.a.id),bm=managerForId(m.b.id),margin=Math.abs(m.a.score-m.b.score);
    return `<button class="matchup-card" data-match="${matchups.indexOf(m)}">
      <div class="matchup-side ${sideWinnerClass(m.a,m.b)}"><div class="matchup-manager">${am}</div><div class="matchup-team">${m.a.team}</div><div class="matchup-score">${cleanScore(m.a.score)}</div></div>
      <div><div class="matchup-vs">Final</div></div>
      <div class="matchup-side right ${sideWinnerClass(m.b,m.a)}"><div class="matchup-manager">${bm}</div><div class="matchup-team">${m.b.team}</div><div class="matchup-score">${cleanScore(m.b.score)}</div></div>
    </button>`;
  }).join('');
  document.querySelectorAll('[data-match]').forEach(b=>b.onclick=()=>openMatchup(+b.dataset.match));
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
  if(m.a.score>=179.95||m.b.score>=179.95)notes.push('Top-10 all-time team score');
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
  return `<div class="donut-team"><div class="donut-team-head"><strong>${managerForId(side.id)}</strong><span>${side.team}</span></div><div class="donut-chart" style="background:${bg}"><div class="donut-hole"><div><strong>${cleanScore(side.score)}</strong><span>team points</span></div></div></div><div class="donut-list">${rows.map(r=>{const pct=Math.max(0,r.pts)/positive*100;return `<div class="donut-row"><div class="donut-slot">${r.key}</div><span class="donut-dot" style="background:${lineupColors[r.key]}"></span><div class="donut-player">${r.name}</div><div class="donut-points">${cleanScore(r.pts)}</div><div class="donut-pct">${r.pts>0?pct.toFixed(1)+'%':r.pts<0?'NEG':'0%'}</div></div>`}).join('')}</div>${negatives.length?`<div class="negative-adjust">Negative adjustment: ${negatives.map(r=>`${r.key} ${r.name} ${cleanScore(r.pts)}`).join(' · ')} (${cleanScore(negTotal)} total)</div>`:''}</div>`;
}
function openMatchup(index){
  const m=matchups[index];if(!m)return;const ins=matchupInsights(m),battles=battleRows(m),notes=recordNotes(m);
  const winner=m.a.score>m.b.score?m.a:m.b;
  document.getElementById('matchupModal').innerHTML=`<div class="matchup-modal-inner">
    <div class="matchup-modal-head"><div><p class="eyebrow">2026 · Week ${m.week}</p><h2>${managerForId(m.a.id)} vs ${managerForId(m.b.id)}</h2></div><button class="close-btn" id="closeMatchup" aria-label="Close matchup">×</button></div>
    <div class="modal-scoreboard">
      <div class="modal-team"><div class="modal-manager">${managerForId(m.a.id)}</div><div class="modal-team-name">${m.a.team}</div><div class="modal-score">${cleanScore(m.a.score)}</div></div>
      <div class="modal-vs">FINAL</div>
      <div class="modal-team right"><div class="modal-manager">${managerForId(m.b.id)}</div><div class="modal-team-name">${m.b.team}</div><div class="modal-score">${cleanScore(m.b.score)}</div></div>
    </div>
    <div class="insight-grid">
      <div class="insight-card mvp"><p class="eyebrow">Matchup MVP</p><strong>${ins.mvp.p[1]}</strong><div class="meta">${managerForId(ins.mvp.side.id)} · ${ins.mvp.p[0]} · ${cleanScore(ins.mvp.p[2])} pts</div></div>
      <div class="insight-card dud"><p class="eyebrow">Biggest dud</p><strong>${ins.dud.p[1]}</strong><div class="meta">${managerForId(ins.dud.side.id)} · ${ins.dud.p[0]} · ${cleanScore(ins.dud.p[2])} pts</div></div>
      <div class="insight-card bench-regret"><p class="eyebrow">Bench regret</p><strong>${ins.bench.b[0]}</strong><div class="meta">${managerForId(ins.bench.side.id)} · ${cleanScore(ins.bench.b[1])} pts on the bench</div></div>
    </div>
    <div class="chart-panel"><div class="chart-head"><div><h3>Scoring breakdown</h3><p>Each starter has a fixed lineup position so both teams read the same way every week.</p></div><span class="pill">${managerForId(winner.id)} won by ${Math.abs(m.a.score-m.b.score).toFixed(2)}</span></div>
      <div class="donut-compare">${donutHTML(m.a)}${donutHTML(m.b)}</div>
      <div class="chart-note">Percentages show each starter's share of positive starter production. Negative scores are called out separately so the circle is not mathematically misleading.</div>
    </div>
    <div class="chart-panel battle-table"><div class="chart-head"><div><h3>Position battle</h3><p>RB and WR combine both starting slots.</p></div></div>
      <div class="table-wrap compact-table"><table><thead><tr><th>Position</th><th>${managerForId(m.a.id)}</th><th>${managerForId(m.b.id)}</th><th>Edge</th></tr></thead><tbody>${battles.map(r=>`<tr><td><b>${r.slot}</b></td><td>${r.a.toFixed(2)}</td><td>${r.b.toFixed(2)}</td><td class="battle-edge ${r.edge==='Even'?'tie':''}">${r.edge}${r.edge==='Even'?'':' +'+r.diff.toFixed(2)}</td></tr>`).join('')}</tbody></table></div>
    </div>
    <div class="matchup-summary">${matchupSummary(m,ins,battles)}${notes.length?'<div>'+notes.map(n=>`<span class="record-note">${n}</span>`).join('')+'</div>':''}</div>
  </div>`;
  document.getElementById('matchupBackdrop').classList.add('open');document.getElementById('matchupModal').classList.add('open');document.getElementById('matchupModal').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';document.getElementById('closeMatchup').onclick=closeMatchup;
}
function closeMatchup(){document.getElementById('matchupBackdrop').classList.remove('open');document.getElementById('matchupModal').classList.remove('open');document.getElementById('matchupModal').setAttribute('aria-hidden','true');document.body.style.overflow=''}
document.getElementById('matchupBackdrop').onclick=closeMatchup;


function rankedRecordCard(r,extra=''){
 const runners=(r.runners||[]);
 return `<article class="record-card ${extra} ${r.danger?'danger':''}">
   <p class="eyebrow">${r.label}</p>
   <div class="value">${r.value}</div>
   <h3>${r.title}</h3>
   <p>${r.meta}</p>
   ${runners.length?`<div class="record-runners"><div class="runner-head">Runners up</div>${runners.map((x,i)=>`<div class="runner-row"><div class="runner-rank">${i+2}</div><div class="runner-value">${x.value}</div><div class="runner-main"><div class="runner-name">${x.title}</div><div class="runner-meta">${x.meta}</div></div></div>`).join('')}</div>`:''}
 </article>`;
}
function renderRecords(filter='Team'){
 const cats=['Team','Player','Luck & Schedule','Draft','Bench'];document.getElementById('recordFilters').innerHTML=cats.map(c=>`<button class="filter-btn ${c===filter?'active':''}" data-filter="${c}">${c}</button>`).join('');document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>renderRecords(b.dataset.filter));
 const root=document.getElementById('recordContent');
 if(filter==='Team'){const rows=records.filter(r=>r.cat==='Team'||r.cat==='Franchise');root.innerHTML=`<div class="record-grid">${rows.map((r,i)=>rankedRecordCard(r,i===0?'dark':'')).join('')}</div>`;}
 else if(filter==='Player'){root.innerHTML=`<article class="panel"><div class="panel-head"><div><p class="eyebrow">Single-week records</p><h2>Position records</h2></div></div><div class="player-grid">${playerRecords.map(r=>`<div class="player-card"><div class="pos">${r.pos}</div><div class="pts">${r.points}</div><div class="player">${r.player}</div><div class="meta">${r.meta}</div></div>`).join('')}</div></article>`;}
 else if(filter==='Luck & Schedule'){const rows=records.filter(r=>r.cat==='Luck');root.innerHTML=`<div class="record-grid">${rows.map(r=>rankedRecordCard(r)).join('')}</div><article class="panel" style="margin-top:14px"><p class="eyebrow">What this means</p><div style="font-size:13px;line-height:1.55;color:var(--muted)">All-play compares each team against every other team each week. The gap between actual winning percentage and all-play winning percentage is a useful way to show schedule fortune without pretending it explains every result.</div></article>`;}
 else if(filter==='Draft'){root.innerHTML=`<div class="record-grid">${draftRecords.map(r=>`<article class="record-card"><p class="eyebrow">${r.label}</p><div class="value">${r.value}</div><h3>${r.title}</h3><p>${r.meta}</p></article>`).join('')}</div><article class="panel" style="margin-top:14px"><p class="eyebrow">Important</p><div style="font-size:13px;line-height:1.55;color:var(--muted)">Projection records use ESPN's draft-day projected finish, not an independent grade of every drafted player.</div></article>`;}
 else{root.innerHTML=`<article class="panel"><div class="panel-head"><div><p class="eyebrow">Bench hall of shame</p><h2>Points nobody got credit for</h2></div><span class="pill red">Pain</span></div><div class="timeline">${bench.map((b,i)=>`<div class="timeline-row"><div class="timeline-rank">${i+1}</div><div><div class="timeline-title">${b.player} · ${b.manager}</div><div class="timeline-sub">${b.team} · ${b.meta}</div></div><div class="timeline-value">${b.points.toFixed(2)}</div></div>`).join('')}</div></article>`;}
}

function renderManagers(q=''){const query=q.toLowerCase().trim();const currentById=Object.fromEntries(currentStandings.map(x=>[x.id,x]));const filtered=teams.filter(t=>[t.manager,t.name,...t.old].join(' ').toLowerCase().includes(query));document.getElementById('managerGrid').innerHTML=filtered.map(t=>{const c=currentById[t.id];return `<button class="manager-card" data-manager="${t.id}"><div class="manager-top"><div><h3>${t.manager}</h3><div class="manager-current">${t.name}</div></div>${t.titles?`<span class="pill gold">${t.titles}× Champ</span>`:'<span class="pill">'+bestFinish(t)+'</span>'}</div><div class="manager-stats"><div class="manager-stat"><strong>${t.record}</strong><span>2022–25 record</span></div><div class="manager-stat"><strong>${t.ppg.toFixed(2)}</strong><span>PPG</span></div><div class="manager-stat"><strong>${t.titles}</strong><span>Titles</span></div><div class="manager-stat"><strong>${c?.wl||'—'}</strong><span>2026</span></div></div><div class="manager-foot"><span>Best week <b>${t.high.toFixed(2)}</b></span><span>All-play <b>${t.allplay.toFixed(1)}%</b></span></div><div class="manager-h2h-teaser">Open profile for records vs all 9 opponents →</div></button>`}).join('')||'<div class="panel">No matching manager or team.</div>';document.querySelectorAll('[data-manager]').forEach(b=>b.onclick=()=>openManager(+b.dataset.manager))}
function openManager(id){const t=teams.find(x=>x.id===id);if(!t)return;document.getElementById('teamDrawer').innerHTML=`<div class="drawer-head"><div><p class="eyebrow">Manager profile</p><h2>${t.manager}</h2><div class="history"><strong>${t.name}</strong>${t.old.length?'<br>Previous team names: '+t.old.join(' → '):'<br>Same team name since 2022.'}</div></div><button class="close-btn" id="closeDrawer" aria-label="Close manager profile">×</button></div><div class="drawer-grid"><div class="drawer-stat"><strong>${t.record}</strong><span>2022–25 regular-season record</span></div><div class="drawer-stat"><strong>${t.ppg.toFixed(2)}</strong><span>2022–25 PPG</span></div><div class="drawer-stat"><strong>${t.titles}</strong><span>Championships</span></div><div class="drawer-stat"><strong>${t.finals}</strong><span>Finals</span></div><div class="drawer-stat"><strong>${t.high.toFixed(2)}</strong><span>Best week</span></div><div class="drawer-stat"><strong>${t.low.toFixed(2)}</strong><span>Worst week</span></div><div class="drawer-stat"><strong>${t.boom}</strong><span>150+ weeks</span></div><div class="drawer-stat"><strong>${t.sub100}</strong><span>Sub-100 weeks</span></div></div>${positionProfileHTML(t)}${h2hHTML(id)}`;document.getElementById('teamDrawer').classList.add('open');document.getElementById('drawerBackdrop').classList.add('open');document.getElementById('teamDrawer').setAttribute('aria-hidden','false');document.getElementById('closeDrawer').onclick=closeManager;bindH2H(id);document.getElementById('teamDrawer').scrollTop=0}
function closeManager(){document.getElementById('teamDrawer').classList.remove('open');document.getElementById('drawerBackdrop').classList.remove('open');document.getElementById('teamDrawer').setAttribute('aria-hidden','true')}document.getElementById('drawerBackdrop').onclick=closeManager;document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeManager();closeMatchup()}});

function playoffTeamHTML(t,winner){
  if(!t)return '';
  const [id,name,score]=t;
  return `<div class="bracket-team ${winner===id?'winner':''}"><div><div class="bracket-manager">${managerForId(id)}</div><div class="bracket-teamname">${name}</div></div><div class="bracket-score">${score==null?'—':cleanScore(score)}</div></div>`;
}
function playoffGameHTML(g,isFinal=false){
  return `<div class="bracket-game ${isFinal?'bracket-champ':''}">${playoffTeamHTML(g.a,g.winner)}${g.b?playoffTeamHTML(g.b,g.winner):'<div class="bracket-bye">First-round bye</div>'}</div>`;
}
function renderSeason(year=2026){const yrs=[2026,2025,2024,2023,2022];document.getElementById('seasonTabs').innerHTML=yrs.map(y=>`<button class="season-btn ${y===year?'active':''}" data-year="${y}">${y}</button>`).join('');document.querySelectorAll('[data-year]').forEach(b=>b.onclick=()=>renderSeason(+b.dataset.year));const s=seasons[year];const championManager=year===2026?'—':managerForName(s.champ);const runnerManager=year===2026?'—':managerForName(s.runner);document.getElementById('seasonPanel').innerHTML=`<div class="panel-head"><div><p class="eyebrow">${year} season</p><h2>${year===2026?'Season in progress':championManager+' — Champion'}</h2></div>${year===2026?'<span class="pill green">Current</span>':'<span class="pill gold">Completed</span>'}</div><div class="season-summary"><div class="season-mini"><strong>${s.avg.toFixed(2)}</strong><span>League PPG</span></div><div class="season-mini"><strong>${year===2026?'—':championManager}</strong><span>Champion</span></div><div class="season-mini"><strong>${year===2026?'—':runnerManager}</strong><span>Runner-up</span></div><div class="season-mini"><strong>${s.top}</strong><span>Scoring leader</span></div></div><div class="table-wrap compact-table"><table><thead><tr><th>#</th><th>Manager</th><th>W-L</th><th>PF</th></tr></thead><tbody>${s.standings.map((r,i)=>`<tr><td class="rank">${i+1}</td><td>${managerTeamHTML(managerForName(r[0]),r[0])}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table></div>${playoffHTML(year)}${awardsHTML(year)}${recapArchiveHTML(year)}`;bindRecaps()}

function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const gameArchive=LeagueStats.archive(seasonData,historyData);
function coverageHTML(){return `<p class="history coverage">2022–25: all 56 regular-season weeks and championship-bracket games. ${seasonData.season}: through Week ${seasonData.completedWeek}. Consolation games are excluded; byes do not count as meetings.</p>`;}
function recordLabel(r){return r.games?`${r.wins}–${r.losses}${r.ties?'–'+r.ties:''}`:'—';}
function rivalryCards(id,phase){
 const rows=teams.filter(t=>t.id!==id).map(t=>LeagueStats.h2h(gameArchive,id,t.id,phase)).filter(r=>r.games);
 if(!rows.length)return '<p class="history">No games in this selection.</p>';
 const most=[...rows].sort((a,b)=>b.games-a.games||a.opponent-b.opponent)[0];
 const competitive=rows.filter(r=>r.games>=3),closest=[...competitive].sort((a,b)=>Math.abs(a.pct-50)-Math.abs(b.pct-50)||b.games-a.games)[0],toughest=[...competitive].sort((a,b)=>a.pct-b.pct||b.games-a.games)[0];
 return `<div class="rivalry-cards">${[['Most played',most],['Closest rivalry',closest],['Toughest opponent',toughest]].map(([label,r])=>`<div class="season-mini"><span>${label}</span><strong>${r?managerForId(r.opponent):'Building history'}</strong><div class="history">${r?recordLabel(r)+' · '+r.games+' games':'Needs 3+ meetings'}</div></div>`).join('')}</div>`;
}
function h2hHTML(id,phase='all'){
 return `<section class="profile-section h2h-section"><h3>Rivalries & head-to-head</h3>${coverageHTML()}<div class="filter-row">${[['all','All meetings'],['regular','Regular season'],['playoffs','Playoffs']].map(([key,label])=>`<button class="filter-btn ${phase===key?'active':''}" data-h2h-phase="${key}">${label}</button>`).join('')}</div>${rivalryCards(id,phase)}<div class="table-wrap h2h-table"><table><caption class="sr-only">${managerForId(id)} versus every other manager</caption><thead><tr><th>Opponent</th><th>W-L-T</th><th>Win %</th><th>PF</th><th>PA</th></tr></thead><tbody>${teams.filter(t=>t.id!==id).map(t=>{const r=LeagueStats.h2h(gameArchive,id,t.id,phase);return `<tr><td><button class="text-link" data-rival="${t.id}">${t.manager} →</button></td><td>${recordLabel(r)}</td><td>${r.games?r.pct.toFixed(1)+'%':'—'}</td><td>${r.games?money(r.pf):'—'}</td><td>${r.games?money(r.pa):'—'}</td></tr>`;}).join('')}</tbody></table></div><p class="history">Tap an opponent for playoff splits, scoring averages and every recorded meeting. Win % counts a tie as half a win.</p></section>`;
}
function bindH2H(id){const drawer=document.getElementById('teamDrawer');drawer.querySelectorAll('[data-h2h-phase]').forEach(b=>b.onclick=()=>{drawer.querySelector('.h2h-section').outerHTML=h2hHTML(id,b.dataset.h2hPhase);bindH2H(id)});drawer.querySelectorAll('[data-rival]').forEach(b=>b.onclick=()=>openRivalry(id,+b.dataset.rival));}
function openRivalry(id,opponent){
 const r=LeagueStats.h2h(gameArchive,id,opponent),p=LeagueStats.h2h(gameArchive,id,opponent,'playoffs');
 const closest=[...r.history].sort((a,b)=>a.margin-b.margin)[0],highest=[...r.history].sort((a,b)=>b.me.score+b.other.score-a.me.score-a.other.score)[0];
 let longest=0,streak=0;for(const g of r.history){streak=g.result==='W'?streak+1:0;longest=Math.max(longest,streak)}
 const label=g=>g?`${g.year} W${g.week} · ${money(g.me.score)}–${money(g.other.score)}`:'No meetings';
 document.getElementById('teamDrawer').innerHTML=`<div class="drawer-head"><div><button class="text-link" id="backToManager">← ${managerForId(id)} profile</button><p class="eyebrow">Rivalry receipts</p><h2>${managerForId(id)} vs ${managerForId(opponent)}</h2></div><button class="close-btn" aria-label="Close rivalry" id="closeDrawer" aria-label="Close manager profile">×</button></div>${coverageHTML()}<div class="drawer-grid">${[[recordLabel(r),'Overall record'],[recordLabel(p),'Playoff record'],[p.history.filter(g=>g.round==='final').length,'Championship meetings'],[r.games?money(r.pf/r.games)+' / '+money(r.pa/r.games):'—','Average PF / PA'],[longest,'Longest winning streak'],[r.games,'Recorded meetings']].map(([value,label])=>`<div class="drawer-stat"><strong>${value}</strong><span>${label}</span></div>`).join('')}</div><div class="profile-section"><h3>The memorable ones</h3><p class="history"><b>Closest:</b> ${label(closest)}${closest?' · '+money(closest.margin)+' points':''}<br><b>Highest combined score:</b> ${label(highest)}</p><h3>Matchup history</h3>${r.history.length?`<div class="rival-history">${[...r.history].reverse().map(g=>`<div class="rival-history-row"><span class="pill ${g.result==='W'?'green':g.result==='L'?'red':''}">${g.result}</span><div><b>${g.year} · Week ${g.week}</b><div class="history">${g.phase==='playoffs'?'Playoffs':'Regular season'}</div></div><strong>${money(g.me.score)}–${money(g.other.score)}</strong></div>`).join('')}</div>`:'<p class="history">No imported meetings yet.</p>'}</div>`;
 document.getElementById('backToManager').onclick=()=>openManager(id);document.getElementById('closeDrawer').onclick=closeManager;document.getElementById('teamDrawer').scrollTop=0;
}
function positionProfileHTML(t){return `<div class="profile-section"><h3>Position profile</h3><p class="history">2022–25 starter production · League average = 100. The middle line marks the baseline. Blue is above average; red is below.</p><div class="position-list">${Object.entries(t.pos).map(([p,v])=>{const index=v/baselines[p]*100,delta=Math.min(50,Math.abs(index-100)/2);return `<div class="position-row"><div class="position-label">${p}</div><div class="position-track" role="img" aria-label="${p}: ${index.toFixed(1)}, league average 100"><div class="position-baseline"></div><div class="position-deviation ${index<100?'below':''}" style="left:${index<100?50-delta:50}%;width:${delta}%"></div></div><div class="position-val">${index.toFixed(1)}</div></div>`;}).join('')}</div><div class="position-scale"><span>0</span><span>100 · League average</span><span>200</span></div></div>`;}
function playoffHTML(year){
 if(year===2026)return `<div class="playoff-section"><h3>Playoff bracket</h3><div class="playoff-pending">Playoffs have not started yet.</div></div>`;
 const p=playoffs[year];if(!p)return '';
 const first=LeagueStats.orderedFirstRound(p),final=p.final[0],winner=final.a[0]===final.winner?final.a:final.b;
 const path=(x,y,toY)=>`<path d="M ${x} ${y} H ${x+20} V ${toY} H ${x+40}"/>`;
 const lines=[path(220,78,148),path(220,218,148),path(220,358,428),path(220,498,428),path(480,148,288),path(480,428,288),'<path d="M 740 288 H 780"/>'].join('');
 return `<section class="playoff-section"><div class="playoff-head"><div><p class="eyebrow">The road to the title</p><h3>${year} playoff bracket</h3><p>Winners highlighted · swipe sideways on mobile</p></div></div><div class="bracket-scroll" tabindex="0" aria-label="${year} playoff bracket, scroll horizontally"><div class="sports-bracket"><svg class="bracket-lines" viewBox="0 0 1000 560" aria-hidden="true">${lines}</svg><div class="bracket-lane"><div class="round-title">Round 1 · Week 15</div>${first.map((g,i)=>`<div class="bracket-node" style="top:${30+i*140}px">${playoffGameHTML(g)}</div>`).join('')}</div><div class="bracket-lane"><div class="round-title">Semifinals · Week 16</div>${p.r2.map((g,i)=>`<div class="bracket-node" style="top:${100+i*280}px">${playoffGameHTML(g)}</div>`).join('')}</div><div class="bracket-lane"><div class="round-title">Championship · Week 17</div><div class="bracket-node" style="top:240px">${playoffGameHTML(final,true)}</div></div><div class="bracket-lane"><div class="round-title">Champion</div><div class="bracket-node champion-node" style="top:240px"><span class="eyebrow">${year} champion</span><strong>${managerForId(winner[0])}</strong><div class="history">${escapeHTML(winner[1])}</div><span class="pill gold">${cleanScore(winner[2])} in the final</span></div></div></div></div></section>`;
}
function awardsHTML(year){
 const input=awardsData.seasons[year],bust=LeagueStats.draftAwards(input)[0],saver=LeagueStats.waiverAwards(input)[0];
 return `<section class="profile-section"><div class="panel-head"><div><p class="eyebrow">Season yearbook</p><h3>Draft & waiver awards</h3></div>${year===2026?'<span class="pill">In-season watch</span>':''}</div><div class="award-grid"><article class="award-card"><p class="eyebrow">Biggest draft bust</p><h3>${bust?escapeHTML(bust.name):(input?.sourceDraftPicks?.length?'Draft imported · scoring pending':'Awaiting draft history')}</h3><p>${bust?`${managerForId(bust.managerId)} · Pick ${bust.overallPick} · ${bust.position}${bust.finish}<br>${money(bust.points)} points · ${money(bust.deficit)} below draft-slot value<br>Missed games: ${bust.missedGames??'Not recorded'}`:(input?.sourceDraftPicks?.length?`${input.sourceDraftPicks.length} picks imported. Needs complete player production in this league’s scoring before naming a winner.`:'Needs the complete draft order and player season totals in this league’s scoring.')}</p></article><article class="award-card"><p class="eyebrow">Season saver · Waiver wire steal</p><h3>${saver?escapeHTML(saver.name):'Awaiting waiver history'}</h3><p>${saver?`${managerForId(saver.managerId)} · Added Week ${saver.startWeek}<br>${money(saver.points)} starter points · ${saver.starts} starts`:(year<2026?'Historical transactions are unavailable through ESPN’s connector. An export of pickups and weekly lineups is needed.':'Needs complete ownership and weekly starter logs. Only points delivered after the pickup count.')}</p></article></div><details class="method-details"><summary>How we decide the awards</summary><p><b>Draft bust:</b> compare the player’s season points with the points scored by the player who finished at their draft-time rank within that position. Lost value ÷ log₂(overall pick + 1) is the bust score, so an early wasted pick counts more. QB/RB/WR/TE only; missed games are shown separately so injuries have context. It measures lost draft value, not player ability. Tied season scores share a finish rank.</p><p><b>Season saver:</b> total actual starter points during waiver/free-agent ownership stints, starting with the first eligible scoring week and ending before the drop or trade. Bench points and production before acquisition do not count. Re-acquisitions count once per week. Highest delivered points wins; starts break a tie.</p><p>${year===2026?'Results remain provisional until the season ends.':'Completed-season awards require complete source logs.'}</p></details></section>`;
}
function recapHTML(recap){return `<article class="league-column"><div class="panel-head"><div><p class="eyebrow">The Tuesday column · ${recap.season} Week ${recap.week}</p><h2>${escapeHTML(recap.title)}</h2><p class="history">${escapeHTML(recap.publishedAt)} · THE League</p></div><span class="pill">Week ${recap.week} recap</span></div>${recap.paragraphs.map(p=>`<p>${escapeHTML(p)}</p>`).join('')}<button class="text-link" data-recap-matchups="${recap.week}">See the matchup receipts →</button></article>`;}
function bindRecaps(){document.querySelectorAll('[data-recap-matchups]').forEach(b=>b.onclick=()=>{renderMatchups(+b.dataset.recapMatchups);setView('matchups')});}
function renderRecaps(){const latest=[...recapData.recaps].sort((a,b)=>b.season-a.season||b.week-a.week)[0];document.getElementById('homeColumn').innerHTML=latest?recapHTML(latest):'<div class="panel"><h2>The Tuesday column</h2><p class="history">The first recap is on its way.</p></div>';bindRecaps();}
function recapArchiveHTML(year){const rows=recapData.recaps.filter(r=>r.season===year).sort((a,b)=>b.week-a.week);return `<section class="profile-section"><h3>Weekly recaps</h3>${rows.length?rows.map(r=>`<details class="recap-archive"><summary>Week ${r.week} · ${escapeHTML(r.title)}<span>${escapeHTML(r.publishedAt)}</span></summary>${recapHTML(r)}</details>`).join(''):'<p class="history">No weekly columns have been archived for this season yet.</p>'}</section>`;}

document.getElementById('teamSearch').addEventListener('input',e=>renderManagers(e.target.value));
const toast=document.getElementById('toast');function showToast(msg='Link copied'){toast.textContent=msg;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1600)}document.getElementById('shareBtn').onclick=async()=>{try{if(navigator.share){await navigator.share({title:'THE League Record Book',url:location.href})}else{await navigator.clipboard.writeText(location.href);showToast()}}catch(e){if(e.name!=='AbortError')showToast('Copy the address bar link')}};
renderHome();renderRecaps();renderMatchups();renderRecords();renderManagers();renderSeason();const initial=location.hash.replace('#','');if(['home','matchups','records','managers','seasons'].includes(initial))setView(initial);

})().catch(err=>{console.error(err);document.querySelector("main").insertAdjacentHTML("afterbegin", '<div class="panel">League data could not load. Please refresh.</div>');});
