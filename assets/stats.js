(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LeagueStats=api;})(globalThis,function(){
  const round=n=>Math.round((n+Number.EPSILON)*100)/100;
  function archive(current,history){
    const regular=[...(history.regularSeasonMatchups||[]),...current.matchups.map(m=>({...m,year:current.season,phase:'regular'}))];
    const postseason=Object.entries(history.playoffs).flatMap(([year,p])=>['r1','r2','final'].flatMap((r,i)=>p[r].filter(g=>g.b).map(g=>({year:+year,week:15+i,phase:'playoffs',round:r,a:{id:g.a[0],team:g.a[1],score:g.a[2]},b:{id:g.b[0],team:g.b[1],score:g.b[2]}}))));
    return [...regular,...postseason].sort((a,b)=>a.year-b.year||a.week-b.week);
  }
  function h2h(games,id,opponent,phase='all'){
    const rows=games.filter(g=>(phase==='all'||g.phase===phase)&&[g.a.id,g.b.id].includes(id)&&[g.a.id,g.b.id].includes(opponent)&&id!==opponent);
    let wins=0,losses=0,ties=0,pf=0,pa=0;
    const history=rows.map(g=>{const me=g.a.id===id?g.a:g.b,other=g.a.id===id?g.b:g.a;pf+=me.score;pa+=other.score;const result=me.score>other.score?'W':me.score<other.score?'L':'T';if(result==='W')wins++;else if(result==='L')losses++;else ties++;return {...g,me,other,result,margin:round(Math.abs(me.score-other.score))};});
    return {opponent,wins,losses,ties,pf:round(pf),pa:round(pa),games:rows.length,pct:rows.length?(wins+ties*.5)/rows.length*100:null,history};
  }
  function orderedFirstRound(p){
    return p.r2.flatMap(g=>[g.a[0],g.b[0]].map(id=>p.r1.find(x=>(x.bye?x.a[0]:x.winner)===id))).filter(Boolean);
  }
  // A rank gap measures lost draft value; missed games remain visible alongside it.
  // Full draft + positional season totals are required; early picks carry more weight.
  function draftAwards(input){
    if(!input?.draftComplete||!input?.productionComplete)return [];
    const players=input.players.filter(p=>['QB','RB','WR','TE'].includes(p.position));
    const byPosition={};for(const p of players)(byPosition[p.position]??=[]).push(p);
    for(const list of Object.values(byPosition))list.sort((a,b)=>b.points-a.points);
    const draft=input.draft.filter(p=>['QB','RB','WR','TE'].includes(p.position)).sort((a,b)=>a.overallPick-b.overallPick),counts={};
    return draft.map(p=>{const slot=counts[p.position]=(counts[p.position]||0)+1;const list=byPosition[p.position],actual=list?.find(x=>x.playerId===p.playerId),expected=list?.[slot-1];if(!actual||!expected)return null;return {...p,...actual,expectedPoints:expected.points,deficit:round(expected.points-actual.points),bustScore:round(Math.max(0,expected.points-actual.points)/Math.log2(p.overallPick+1)),draftPositionRank:slot,finish:1+list.filter(x=>x.points>actual.points).length};}).filter(Boolean).sort((a,b)=>b.bustScore-a.bustScore||a.overallPick-b.overallPick);
  }
  function waiverAwards(input){
    if(!input?.transactionsComplete||!input?.lineupsComplete)return [];
    // Ownership stints use [startWeek,endWeek) to exclude points after a drop/trade.
    const totals=new Map();for(const stint of input.acquisitions||[]){if(!['waiver','free-agent'].includes(stint.type))continue;const key=stint.managerId+':'+stint.playerId;
      const rows=(input.lineups||[]).filter(r=>r.managerId===stint.managerId&&r.playerId===stint.playerId&&r.started&&r.week>=stint.startWeek&&r.week<(stint.endWeek??Infinity));
      const item=totals.get(key)||{...stint,points:0,starts:0,weeks:new Set()};for(const r of rows){if(!item.weeks.has(r.week)){item.weeks.add(r.week);item.points+=r.points;item.starts++;}}totals.set(key,item);
    }return [...totals.values()].map(({weeks,...p})=>({...p,points:round(p.points)})).filter(p=>p.starts>0).sort((a,b)=>b.points-a.points||b.starts-a.starts);
  }
  return {round,archive,h2h,orderedFirstRound,draftAwards,waiverAwards};
});
