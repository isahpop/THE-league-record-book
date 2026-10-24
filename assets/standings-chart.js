/* Standings trajectory: reconstruct each completed week's table from recorded ESPN matchups.
   ESPN's official standings order is preserved at the current completed week.
   Earlier ranks use W-L-T and cumulative points as an explicit historical approximation. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LeagueStandingTrend = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
  const colors = ['#216a49','#b76a31','#4676b8','#8b5eae','#bc5673',
    '#40807f','#89742f','#5b6979','#895c43','#4b8663'];
  const fmtRank = rank => '#' + rank;
  const fmtDelta = delta => delta > 0 ? 'up ' + delta : delta < 0 ? 'down ' + Math.abs(delta) : 'unchanged';

  function calculate(data) {
    if (!data || !Number.isInteger(data.completedWeek) || data.completedWeek < 1 ||
      !Array.isArray(data.currentStandings) || !Array.isArray(data.matchups)) {
      throw new Error('Completed ESPN standings and matchup data are required.');
    }
    const teams = data.currentStandings.map(row => ({
      id: Number(row.id), name: String(row.manager || row.name || 'Team ' + row.id),
      wins: 0, losses: 0, ties: 0, points: 0, ranks: []
    }));
    if (teams.length < 2 || teams.length % 2 !== 0 ||
      teams.some(t => !Number.isSafeInteger(t.id)) ||
      new Set(teams.map(t => t.id)).size !== teams.length) {
      throw new Error('The league team list is incomplete or duplicated.');
    }
    const teamById = new Map(teams.map(t => [t.id,t]));
    const weeks = [];
    for (let week = 1; week <= data.completedWeek; week++) {
      const games = data.matchups.filter(game => Number(game.week) === week);
      const played = new Set();
      if (games.length * 2 !== teams.length) throw new Error('Missing Week ' + week + ' games.');
      for (const game of games) {
        const a = teamById.get(Number(game.a?.id)), b = teamById.get(Number(game.b?.id));
        const aScore = Number(game.a?.score), bScore = Number(game.b?.score);
        if (!a || !b || a.id === b.id || played.has(a.id) || played.has(b.id) ||
          !Number.isFinite(aScore) || !Number.isFinite(bScore)) {
          throw new Error('Invalid Week ' + week + ' matchup.');
        }
        played.add(a.id); played.add(b.id);
        a.points += aScore; b.points += bScore;
        if (aScore === bScore) { a.ties++; b.ties++; }
        else if (aScore > bScore) { a.wins++; b.losses++; }
        else { b.wins++; a.losses++; }
      }
      if (played.size !== teams.length) throw new Error('Incomplete Week ' + week + ' team coverage.');

      // Historical ranks cannot reproduce ESPN's week-specific H2H tiebreaks from
      // published final standings. Use cumulative points only for past tied records.
      // The latest week uses the authoritative ESPN table order.
      const ordered = week === data.completedWeek
        ? data.currentStandings.map(row => teamById.get(Number(row.id)))
        : [...teams].sort((a,b) => b.wins-a.wins || b.ties-a.ties ||
            b.points-a.points || a.id-b.id);
      if (ordered.some(t => !t) || new Set(ordered.map(t => t.id)).size !== teams.length) {
        throw new Error('ESPN current standings cannot be reconciled.');
      }
      for (let i=0;i<ordered.length;i++) ordered[i].ranks.push(i+1);
      weeks.push(week);
    }
    // Latest-week scores are validated independently against the official standings.
    for (const row of data.currentStandings) {
      const t = teamById.get(Number(row.id));
      const officialPoints = Number(row.pf);
      if (!Number.isFinite(officialPoints) || Math.abs(officialPoints-t.points) > .15) {
        throw new Error('Standings points differ from recorded matchups.');
      }
    }
    return {weeks,teams};
  }

  function mount(data, rootId='standingsTrend') {
    const host = document.getElementById(rootId);
    if (!host) return null;
    let model;
    try { model=calculate(data); }
    catch(err) {
      host.innerHTML='<p class="home-pending">The weekly standings chart is unavailable until all results reconcile.</p>';
      return null;
    }
    const official = model.teams.map(t=>t.id);
    const highlights = new Set(official.slice(0,Math.min(3,official.length)));
    const rankMap = new Map(model.teams.map((t,i)=>[t.id,i+1]));
    const width = Math.max(660, model.weeks.length*70+115),height=353;
    const left=46, right=width-28, top=30, bottom=309;
    const x = weekIndex => left+(right-left)*weekIndex/Math.max(1,model.weeks.length-1);
    const y = rank => top+(bottom-top)*(rank-1)/(model.teams.length-1);
    const color = id => colors[(rankMap.get(id)-1)%colors.length];
    const sorted = [...model.teams].sort((a,b)=>a.ranks.at(-1)-b.ranks.at(-1));

    function chart() {
      const grid = Array.from({length: model.teams.length},(_,idx)=>{
        const rank=idx+1;
        return `<line x1="${left}" y1="${y(rank)}" x2="${right}" y2="${y(rank)}" class="st-grid"/><text x="${left-16}" y="${y(rank)+4}" class="st-axis" text-anchor="end">${rank}</text>`;
      }).join('');
      const ticks=model.weeks.map((week,idx)=>
        `<text class="st-axis" x="${x(idx)}" y="${height-14}" text-anchor="middle">W${week}</text>`).join('');
      const lines=[...sorted].sort((a,b)=>Number(highlights.has(a.id))-Number(highlights.has(b.id)))
        .map(team=>{
          const active=highlights.has(team.id),stroke=active?color(team.id):'#bcc8c1';
          const points=team.ranks.map((rank,i)=>`${x(i).toFixed(2)},${y(rank).toFixed(2)}`);
          const dots=active?team.ranks.map((rank,i)=>
            `<circle cx="${x(i)}" cy="${y(rank)}" r="4" fill="${stroke}" stroke="#fff" stroke-width="1.6"><title>${escapeHTML(team.name)}: Week ${i+1}, rank ${rank}</title></circle>`).join(''):'';
          return `<g class="${active?'st-series-active':'st-series-muted'}"><polyline points="${points.join(' ')}" fill="none" stroke="${stroke}" stroke-width="${active?3.5:1.6}" stroke-linecap="round" stroke-linejoin="round"><title>${escapeHTML(team.name)}: ${team.ranks.map((r,i)=>'W'+(i+1)+' #'+r).join(', ')}</title></polyline>${dots}</g>`;
        }).join('');
      return `<div class="st-scroll" tabindex="0" aria-label="Scroll to see all completed weeks"><svg class="st-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Manager standings position from Week 1 to Week ${model.weeks.at(-1)}. First place is at the top."><title>Standings movement through Week ${model.weeks.at(-1)}</title>${grid}${ticks}${lines}</svg></div>`;
    }

    function render() {
      const active = sorted.filter(team=>highlights.has(team.id));
      const summary=active.length===1
        ?`${active[0].name}: ${fmtRank(active[0].ranks[0])} in Week 1 → ${fmtRank(active[0].ranks.at(-1))} now (${fmtDelta(active[0].ranks[0]-active[0].ranks.at(-1))}).`
        :`Highlighting ${active.length} of ${sorted.length} managers. Select a name to compare movement.`;
      host.innerHTML=`
        <div class="st-toolbar">
          <div class="st-presets">
            <button type="button" data-st-preset="leaders" class="${active.length===3 && sorted.slice(0,3).every(t=>highlights.has(t.id))?'selected':''}">Top 3</button>
            <button type="button" data-st-preset="all" class="${active.length===sorted.length?'selected':''}">All 10</button>
          </div>
          <span class="st-subtitle">1st place at top · through W${model.weeks.at(-1)}</span>
        </div>
        ${chart()}
        <div class="st-legend" aria-label="Highlight managers">${sorted.map(t=>
          `<button type="button" data-st-team="${t.id}" aria-pressed="${highlights.has(t.id)}" class="${highlights.has(t.id)?'selected':''}"><i style="--team-color:${color(t.id)}" aria-hidden="true"></i><b>#${t.ranks.at(-1)}</b> ${escapeHTML(t.name)}</button>`
        ).join('')}</div>
        <p class="st-live" role="status" aria-live="polite">${escapeHTML(summary)}</p>
        <p class="st-method">Earlier weeks are reconstructed from wins, losses, and cumulative points-for tiebreaks. The latest week follows ESPN's official table, which may use additional head-to-head tiebreakers.</p>`;
      host.querySelectorAll('[data-st-team]').forEach(button=>button.addEventListener('click',()=>{
        const id=Number(button.getAttribute('data-st-team'));
        if (highlights.size===1 && highlights.has(id)) highlights.clear();
        highlights.has(id)?highlights.delete(id):highlights.add(id);
        if (highlights.size===0) highlights.add(id);
        render();
      }));
      host.querySelectorAll('[data-st-preset]').forEach(button=>button.addEventListener('click',()=>{
        highlights.clear();
        if(button.getAttribute('data-st-preset')==='all') sorted.forEach(t=>highlights.add(t.id));
        else sorted.slice(0,3).forEach(t=>highlights.add(t.id));
        render();
      }));
    }
    render();
    return {model,render};
  }
  return {calculate,mount};
});
