/* Pure, provider-independent story calculations. No generated facts or network access. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./stats.js'),require('./pulse.js'));
  else root.LeagueHuddle=factory(root.LeagueStats,root.LeaguePulse);
})(globalThis,function(Stats,Pulse){
  'use strict';
  const cents=n=>Math.round(n*100),fmt=n=>Number(n).toFixed(2);
  const key=g=>[g.year,g.week,g.phase,g.a.id,g.b.id].join(':');
  const link=g=>'#matchups?week='+g.week+'&game='+encodeURIComponent(key(g));
  const record=r=>`${r.wins}–${r.losses}`+(r.ties?`–${r.ties}`:'');
  function build(season,history,managers){
    const pulse=Pulse.calculatePulse(season); // Reject incomplete or unreconciled current results.
    const names=new Map(managers.map(t=>[t.id,t.manager]));
    if(names.size!==managers.length)throw Error('Duplicate manager identity');
    if(season.currentStandings.some(t=>!names.has(t.id)))throw Error('Missing manager identity');
    const games=Stats.archive(season,history),seen=new Set();
    for(const g of games){
      if(!Number.isInteger(g.year)||!Number.isInteger(g.week)||!['regular','playoffs'].includes(g.phase)||!g.a||!g.b||g.a.id===g.b.id||![g.a,g.b].every(s=>names.has(s.id)&&Number.isFinite(s.score)))throw Error('Invalid historical matchup');
      const identity=[g.year,g.week,g.phase,...[g.a.id,g.b.id].sort((a,b)=>a-b)].join(':');
      if(seen.has(identity))throw Error('Duplicate historical matchup');seen.add(identity);
    }
    const name=id=>names.get(id)||`Manager ${id}`;
    const weeks=Array.from({length:season.completedWeek},(_,i)=>i+1);
    const current=games.filter(g=>g.year===season.season&&g.phase==='regular');
    const scores=games.flatMap(g=>[g.a,g.b].map(s=>({...s,game:g})));
    const years=[...new Set(games.map(g=>g.year))].sort((a,b)=>a-b);
    return {season,managers,name,games,current,scores,weeks,pulse,coverage:`${years[0]}–${years.at(-1)} recorded games · current season through Week ${season.completedWeek}`};
  }
  function weekly(model,week){
    if(!model.weeks.includes(week))return [];
    const games=model.current.filter(g=>g.week===week),rows=games.flatMap(g=>[g.a,g.b].map(s=>({...s,game:g})));
    const out=[];
    const add=(type,title,value,body,g,ids)=>out.push({id:type+'-'+key(g),type,title,value,body,game:g,ids,href:link(g),scope:`${model.season.season} · Week ${week} · regular season`});
    const sorted=[...rows].sort((a,b)=>b.score-a.score||a.id-b.id),top=sorted[0];
    const leaders=sorted.filter(s=>cents(s.score)===cents(top.score));
    const prior=model.scores.filter(s=>s.game.phase==='regular'&&(s.game.year<model.season.season||(s.game.year===model.season.season&&s.game.week<=week)));
    const rank=1+prior.filter(s=>cents(s.score)>cents(top.score)).length;
    add('high','The weekly ceiling',fmt(top.score),`${leaders.map(s=>model.name(s.id)).join(' & ')} ${leaders.length>1?'share':'owns'} the week's high score. Rank #${rank} among ${prior.length} recorded regular-season team scores through this week.`,top.game,leaders.map(s=>s.id));
    const decisive=games.filter(g=>cents(g.a.score)!==cents(g.b.score));
    const closest=[...games].sort((a,b)=>Math.abs(a.a.score-a.b.score)-Math.abs(b.a.score-b.b.score))[0];
    const margin=Stats.round(Math.abs(closest.a.score-closest.b.score));
    add('close',margin===0?'Dead even. No escape.':'Every decimal mattered',fmt(margin),`${model.name(closest.a.id)} ${margin===0?'tied':'vs'} ${model.name(closest.b.id)}: ${fmt(closest.a.score)}–${fmt(closest.b.score)}. ${margin===0?'A tied finish.':'The smallest margin of the week'+(games.filter(g=>cents(Math.abs(g.a.score-g.b.score))===cents(margin)).length>1?' (shared).':'.')}`,closest,[closest.a.id,closest.b.id]);
    const losers=decisive.map(g=>({...((g.a.score<g.b.score)?g.a:g.b),game:g})).sort((a,b)=>b.score-a.score);
    if(losers.length){const s=losers[0],wins=rows.filter(x=>x.id!==s.id&&cents(s.score)>cents(x.score)).length;
      add('pain',wins>=(rows.length-1)/2?'Wrong opponent. Great score.':'The toughest L this week',fmt(s.score),`${model.name(s.id)} posted the highest losing score${losers.filter(x=>cents(x.score)===cents(s.score)).length>1?' (tied)':''}. It would have beaten ${wins} of ${rows.length-1} other teams this week. The schedule had other plans.`,s.game,[s.id]);}
    for(const s of sorted){const before=prior.filter(x=>x.id===s.id&&(x.game.year<model.season.season||x.game.week<week));
      if(before.length&&cents(s.score)>Math.max(...before.map(x=>cents(x.score))))add('best','New personal ceiling',fmt(s.score),`${model.name(s.id)} just topped their previous recorded regular-season best of ${fmt(Math.max(...before.map(x=>x.score)))}. A new receipt for the trophy case.`,s.game,[s.id]);}
    const streaks=model.managers.map(t=>{const rows=model.current.filter(g=>g.week<=week&&[g.a.id,g.b.id].includes(t.id)).sort((a,b)=>b.week-a.week);let wins=0;for(const g of rows){const me=g.a.id===t.id?g.a:g.b,other=g.a.id===t.id?g.b:g.a;if(cents(me.score)<=cents(other.score))break;wins++;}return {id:t.id,wins,game:rows[0]};}).filter(t=>t.wins>=3).sort((a,b)=>b.wins-a.wins);
    for(const s of streaks)add('streak','The streak has receipts',s.wins+' straight',`${model.name(s.id)} has won ${s.wins} consecutive games this season through Week ${week}. Who's stopping the run?`,s.game,[s.id]);
    return out;
  }
  function personal(model,id,week){
    const g=model.current.find(g=>g.week===week&&[g.a.id,g.b.id].includes(id));if(!g)return null;
    const me=g.a.id===id?g.a:g.b,other=g.a.id===id?g.b:g.a;
    const peers=model.current.filter(g=>g.week===week).flatMap(g=>[g.a,g.b]);
    const rank=1+peers.filter(s=>cents(s.score)>cents(me.score)).length;
    const result=cents(me.score)>cents(other.score)?'A win':cents(me.score)<cents(other.score)?'A loss':'A tie';
    const before=model.scores.filter(s=>s.id===id&&s.game.phase==='regular'&&(s.game.year<model.season.season||(s.game.year===model.season.season&&s.game.week<week)));
    const best=before.length?Math.max(...before.map(s=>s.score)):null;
    const chase=best===null?'First recorded regular-season appearance.':cents(me.score)>cents(best)?'A new recorded personal best.':cents(me.score)===cents(best)?'Matched their recorded personal best.':`${fmt(best-me.score)} points shy of their prior recorded best (${fmt(best)}).`;
    return {id:'personal-'+id+'-'+week,type:'personal',title:model.name(id)+"'s weekly receipt",value:fmt(me.score),body:`${result} against ${model.name(other.id)} (${fmt(other.score)}). Rank #${rank} of ${peers.length} teams this week. ${chase}`,ids:[id],game:g,href:link(g),scope:`${model.season.season} · Week ${week} · regular season`};
  }
  function court(model,id,through=model.season.completedWeek){
    const weeks=model.weeks.filter(w=>w<=through);
    const score=(id,week)=>{const g=model.current.find(g=>g.week===week&&[g.a.id,g.b.id].includes(id));return g.a.id===id?g.a.score:g.b.score;};
    if(!model.managers.some(t=>t.id===id)||!weeks.length)throw Error('Unknown manager or week');
    const rows=model.managers.filter(t=>t.id!==id&&model.season.currentStandings.some(s=>s.id===t.id)).map(t=>{let wins=0,losses=0,ties=0;for(const w of weeks){const d=cents(score(id,w))-cents(score(t.id,w));if(d>0)wins++;else if(d<0)losses++;else ties++;}return {id:t.id,wins,losses,ties};});
    const allPlay=rows.reduce((s,r)=>s+r.wins+r.ties/2,0);
    const actual={wins:0,losses:0,ties:0};for(const g of model.current.filter(g=>g.week<=through&&[g.a.id,g.b.id].includes(id))){const me=g.a.id===id?g.a:g.b,opp=g.a.id===id?g.b:g.a;actual[cents(me.score)>cents(opp.score)?'wins':cents(me.score)<cents(opp.score)?'losses':'ties']++;}
    const expected=allPlay/rows.length;
    return {rows,actual,expected:Stats.round(expected),gap:Stats.round(actual.wins+actual.ties/2-expected),weeks:weeks.length};
  }
  function rivalry(model,a,b,phase='all'){
    const r=Stats.h2h(model.games,a,b,phase),sorted=[...r.history].sort((x,y)=>x.year-y.year||x.week-y.week);
    const recent=sorted.at(-1);let streak=0;if(recent&&recent.result!=='T'){for(const g of [...sorted].reverse()){if(g.result!==recent.result)break;streak++;}}
    return {...r,latest:recent,streak,closest:[...sorted].sort((x,y)=>x.margin-y.margin)[0],combined:[...sorted].sort((x,y)=>(y.a.score+y.b.score)-(x.a.score+x.b.score))[0],recent:sorted.slice(-5).reverse()};
  }
  function records(model,metric='score',phase='regular'){
    const games=model.games.filter(g=>phase==='all'||g.phase===phase);
    let rows=metric==='score'?games.flatMap(g=>[g.a,g.b].map(s=>({value:s.score,ids:[s.id],game:g,label:model.name(s.id)}))):games.map(g=>({value:Stats.round(metric==='combined'?g.a.score+g.b.score:Math.abs(g.a.score-g.b.score)),ids:[g.a.id,g.b.id],game:g,label:`${model.name(g.a.id)} vs ${model.name(g.b.id)}`}));
    rows.sort((a,b)=>(metric==='close'?a.value-b.value:b.value-a.value)||a.game.year-b.game.year||a.game.week-b.game.week);
    let rank=0;return rows.map((r,i)=>{if(i===0||cents(r.value)!==cents(rows[i-1].value))rank=i+1;return {...r,rank,href:link(r.game)};});
  }
  return {build,weekly,personal,court,rivalry,records,key,link,record,fmt};
});
