/* THE League — verified ESPN matchup preview, shown Thursday noon CT onwards. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.LeaguePreview = api;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', api.mount, { once: true });
    else api.mount();
  }
})(globalThis, function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[c]);
  const fmt = value => Number(value).toFixed(2);

  function previewWindow(now = new Date()) {
    // Publishing window is Thursday noon CT through Monday night. This is
    // deliberately tied to the league timezone, not the viewer's location.
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', weekday: 'short', hour: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(now);
    const weekday = parts.find(p => p.type === 'weekday')?.value;
    const hour = Number(parts.find(p => p.type === 'hour')?.value);
    return (weekday === 'Thu' && hour >= 12) ||
      ['Fri', 'Sat', 'Sun', 'Mon'].includes(weekday);
  }

  function calculatePreview(season, history, stats) {
    if (!season || !Array.isArray(season.currentStandings) ||
        !Array.isArray(season.matchups) ||
        !Number.isInteger(season.completedWeek) || season.completedWeek < 1)
      throw Error('Invalid completed-season snapshot');
    const week = season.completedWeek + 1;
    if (Number(season.upcomingWeek) !== week ||
        !Array.isArray(season.upcomingMatchups) ||
        season.upcomingMatchups.length * 2 !== season.currentStandings.length)
      throw Error('No complete ESPN schedule for upcoming week');

    const byId = new Map(season.currentStandings.map((t,i) => [Number(t.id), {...t, standing: i+1}]));
    const seen = new Set();
    const allGames = stats.archive(season, history);

    function summary(side) {
      const id = Number(side.id), team = byId.get(id);
      if (!Number.isInteger(id) || !team || seen.has(id)) throw Error('Duplicate or unknown team in ESPN schedule');
      seen.add(id);
      const games = season.matchups.filter(m => m.a.id === id || m.b.id === id)
        .sort((a,b) => b.week-a.week).slice(0,3);
      const lastThree = games.length
        ? games.reduce((sum,g) => sum + Number(g.a.id === id ? g.a.score : g.b.score), 0)/games.length
        : null;
      const ppg = Number(team.pf)/season.completedWeek;
      if (!Number.isFinite(ppg)) throw Error('Invalid completed score');
      return {id, manager: team.manager, team: team.name,
        record: String(team.wl), rank: team.standing,
        ppg, recent: lastThree};
    }
    const matchups = season.upcomingMatchups.map(pair => {
      if (!pair.a || !pair.b || Number(pair.a.id) === Number(pair.b.id))
        throw Error('Invalid upcoming matchup');
      const a=summary(pair.a), b=summary(pair.b);
      const h = stats.h2h(allGames, a.id, b.id);
      return {a,b,series: {wins:h.wins,losses:h.losses,ties:h.ties,games:h.games},
        strength: a.rank+b.rank};
    });
    if (seen.size !== byId.size) throw Error('ESPN schedule is missing a manager');
    const spotlight = [...matchups].sort((x,y) =>
      x.strength-y.strength || (y.a.ppg+y.b.ppg)-(x.a.ppg+x.b.ppg))[0];
    return {season: season.season, week, completed: season.completedWeek,
      updatedAt: season.updatedAt, matchups, spotlight};
  }

  function renderPreview(preview) {
    const renderTeam = team => `<div class="wp-manager"><strong>${esc(team.manager)}</strong><span>${esc(team.team)}</span><small>Rank #${team.rank} · ${esc(team.record)} · ${fmt(team.ppg)} PPG</small><small>Last 3: ${team.recent === null ? '—' : fmt(team.recent)} PPG</small></div>`;
    const cards = preview.matchups.map((g) => {
      const h = g.series;
      const series = h.games
        ? `${esc(g.a.manager)} ${h.wins}–${h.losses}${h.ties ? '–'+h.ties : ''} vs ${esc(g.b.manager)}`
        : 'First recorded meeting';
      return `<article class="wp-card ${g===preview.spotlight?'wp-featured':''}">
        <div class="wp-card-label">${g===preview.spotlight?'Featured matchup':'Week '+preview.week+' matchup'}</div>
        <div class="wp-versus">${renderTeam(g.a)}<span class="wp-vs">VS</span>${renderTeam(g.b)}</div>
        <div class="wp-series">Historical series · ${series}</div>
      </article>`;
    }).join('');
    return `<div class="wp-panel"><div class="wp-heading">
      <div><p class="eyebrow">The Thursday scouting report</p>
        <h2>Week ${preview.week} · Matchup Preview</h2>
        <p>Five ESPN-confirmed pairings, ranked using results through Week ${preview.completed}.</p></div>
      <span class="wp-badge">Published Thursday · Central Time</span></div>
      <div class="wp-feature"><span>Matchup to watch · highest combined standings rank</span>
        <strong>${esc(preview.spotlight.a.manager)} vs ${esc(preview.spotlight.b.manager)}</strong>
        <p>#${preview.spotlight.a.rank} vs #${preview.spotlight.b.rank} · ${fmt(preview.spotlight.a.ppg)} and ${fmt(preview.spotlight.b.ppg)} season PPG</p></div>
      <div class="wp-grid">${cards}</div>
      <p class="wp-disclaimer">Source: ESPN upcoming schedule and completed league results. Historical head-to-head includes recorded regular-season and playoff games. No projected scores or win probabilities are implied. Preview statistics are through Week ${preview.completed}.</p>
    </div>`;
  }

  async function mount() {
    const home = document.getElementById('weekPreview');
    const matchup = document.getElementById('matchupWeekPreview');
    if (!home && !matchup) return;
    if (home && !previewWindow()) home.hidden = true;
    const nodes = [matchup,home && previewWindow() ? home : null].filter(Boolean);
    if (!nodes.length) return;
    try {
      const [seasonResponse, historyResponse] = await Promise.all([
        fetch('data/season-2026.json', {cache:'no-cache'}),
        fetch('data/history.json', {cache:'no-cache'})
      ]);
      if (!seasonResponse.ok || !historyResponse.ok) throw Error('League schedule is unavailable');
      const data = await seasonResponse.json(), history = await historyResponse.json();
      const report = calculatePreview(data, history, window.LeagueStats);
      nodes.forEach(node=>{node.innerHTML = renderPreview(report);node.hidden = false;});
    } catch (err) {
      console.warn('Upcoming matchups not ready:',err);
      nodes.forEach(node=>{node.innerHTML = '<div class="wp-pending"><strong>Week preview coming soon</strong><p>The next slate is awaiting complete ESPN matchup data. We’ll publish it when the schedule is confirmed.</p></div>';node.hidden = false;});
    }
  }
  return {previewWindow,calculatePreview,renderPreview,mount};
});
