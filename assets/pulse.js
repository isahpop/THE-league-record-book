/* THE League — League Pulse
 * Derived entirely from validated, completed league games; no external services.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.LeaguePulse = api;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', api.mount, { once: true });
    else api.mount();
  }
})(globalThis, function () {
  'use strict';

  const round = x => Math.round((x + Number.EPSILON) * 100) / 100;
  const fmt = n => Number(n).toFixed(2);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function calculatePulse(data) {
    if (!data || !Number.isInteger(data.completedWeek) || data.completedWeek < 1 ||
        !Number.isInteger(data.season) || !Array.isArray(data.currentStandings) ||
        !Array.isArray(data.matchups)) throw new Error('Missing or invalid season data');

    const teams = data.currentStandings;
    const ids = teams.map(t => Number(t.id));
    if (ids.length < 2 || ids.length % 2 || new Set(ids).size !== ids.length ||
        ids.some(id => !Number.isInteger(id))) throw new Error('Invalid league team list');

    const byId = new Map(teams.map(t => [Number(t.id), t]));
    const byWeek = new Map();
    for (const matchup of data.matchups) {
      if (!Number.isInteger(matchup.week) || matchup.week < 1 || matchup.week > data.completedWeek) {
        throw new Error('Unexpected uncompleted week in season archive');
      }
      if (!byWeek.has(matchup.week)) byWeek.set(matchup.week, []);
      byWeek.get(matchup.week).push(matchup);
    }

    const totals = new Map(ids.map(id => [id, {
      id, manager: byId.get(id).manager || byId.get(id).name || `Team ${id}`,
      points: 0, wins: 0, losses: 0, ties: 0, allPlayWins: 0, allPlayGames: 0
    }]));

    for (let week = 1; week <= data.completedWeek; week++) {
      const games = byWeek.get(week) || [];
      const seen = new Set();
      const scores = [];
      if (games.length !== ids.length / 2) throw new Error(`Incomplete Week ${week}`);
      for (const game of games) {
        if (!game.a || !game.b) throw new Error(`Missing side in Week ${week}`);
        const a = Number(game.a.id), b = Number(game.b.id);
        const sa = Number(game.a.score), sb = Number(game.b.score);
        if (!byId.has(a) || !byId.has(b) || a === b || seen.has(a) || seen.has(b) ||
            !Number.isFinite(sa) || !Number.isFinite(sb) ||
            (sa === 0 && sb === 0)) throw new Error(`Invalid matchup in Week ${week}`);
        seen.add(a); seen.add(b);
        scores.push({ id: a, score: sa }); scores.push({ id: b, score: sb });
        totals.get(a).points += sa; totals.get(b).points += sb;
        if (sa > sb) { totals.get(a).wins++; totals.get(b).losses++; }
        else if (sa < sb) { totals.get(b).wins++; totals.get(a).losses++; }
        else { totals.get(a).ties++; totals.get(b).ties++; }
      }
      if (seen.size !== ids.length) throw new Error(`Missing teams in Week ${week}`);
      for (const a of scores) {
        for (const b of scores) {
          if (a.id === b.id) continue;
          const row = totals.get(a.id);
          row.allPlayGames++;
          row.allPlayWins += a.score > b.score ? 1 : a.score === b.score ? 0.5 : 0;
        }
      }
    }

    const standings = [...totals.values()].map(t => {
      const official = byId.get(t.id);
      const officialWLT = String(official.wl || '').split(/[–-]/).map(Number);
      if (officialWLT.length < 2 || officialWLT[0] !== t.wins ||
          officialWLT[1] !== t.losses || (officialWLT[2] || 0) !== t.ties ||
          Math.abs(Number(official.pf) - t.points) > 0.06) {
        throw new Error(`Standings do not reconcile for ${t.manager}`);
      }
      const expectedWins = t.allPlayWins / (ids.length - 1);
      return {
        ...t,
        points: round(t.points),
        allPlayPct: t.allPlayGames ? round(100 * t.allPlayWins / t.allPlayGames) : 0,
        expectedWins: round(expectedWins),
        luckGap: round(t.wins + 0.5 * t.ties - expectedWins)
      };
    }).sort((a, b) => b.allPlayPct - a.allPlayPct || b.points - a.points || a.id - b.id);

    const weekGames = byWeek.get(data.completedWeek);
    const latestTeams = weekGames.flatMap(g => [
      { ...g.a, id: Number(g.a.id), score: Number(g.a.score) },
      { ...g.b, id: Number(g.b.id), score: Number(g.b.score) }
    ]);
    const highest = [...latestTeams].sort((a, b) => b.score - a.score || a.id - b.id)[0];
    const closest = [...weekGames].sort((a, b) =>
      Math.abs(a.a.score - a.b.score) - Math.abs(b.a.score - b.b.score))[0];
    const losingScores = weekGames.flatMap(g =>
      g.a.score > g.b.score ? [g.b] : g.b.score > g.a.score ? [g.a] : []);
    const toughLoss = [...losingScores].sort((a, b) => b.score - a.score)[0] || null;
    const manager = id => totals.get(Number(id))?.manager || `Team ${id}`;

    return {
      season: data.season,
      week: data.completedWeek,
      updatedAt: String(data.updatedAt || ''),
      high: { manager: manager(highest.id), score: round(highest.score) },
      closest: {
        a: manager(closest.a.id), b: manager(closest.b.id),
        margin: round(Math.abs(closest.a.score - closest.b.score))
      },
      hardLuck: toughLoss ? { manager: manager(toughLoss.id), score: round(toughLoss.score) } : null,
      weeklyAverage: round(latestTeams.reduce((sum, t) => sum + t.score, 0) / ids.length),
      allPlay: standings,
      luckiest: [...standings].sort((a, b) => b.luckGap - a.luckGap || a.id - b.id)[0],
      unluckiest: [...standings].sort((a, b) => a.luckGap - b.luckGap || a.id - b.id)[0]
    };
  }

  function renderPulse(p) {
    const rows = p.allPlay.map((t, index) => `<tr>
      <td class="lp-rank">${index + 1}</td>
      <td class="lp-team">${escapeHTML(t.manager)}</td>
      <td>${t.wins}–${t.losses}${t.ties ? `–${t.ties}` : ''}</td>
      <td>${t.allPlayPct.toFixed(1)}%</td>
      <td class="${t.luckGap > 0.005 ? 'lp-positive' : t.luckGap < -0.005 ? 'lp-negative' : ''}">${t.luckGap > 0 ? '+' : ''}${fmt(t.luckGap)}</td>
    </tr>`).join('');
    const luckNote = p.luckiest.id !== p.unluckiest.id
      ? `<span><b>Schedule advantage:</b> ${escapeHTML(p.luckiest.manager)} (${p.luckiest.luckGap > 0 ? '+' : ''}${fmt(p.luckiest.luckGap)} wins)</span><span><b>Schedule disadvantage:</b> ${escapeHTML(p.unluckiest.manager)} (${p.unluckiest.luckGap > 0 ? '+' : ''}${fmt(p.unluckiest.luckGap)} wins)</span>`
      : '';
    return `<div class="lp-panel">
      <div class="lp-heading"><div><p class="eyebrow">The League Pulse · ${p.season}</p><h2>Week ${p.week}, by the numbers</h2></div><span class="lp-date">Updated ${escapeHTML(p.updatedAt || 'with the latest archive')}</span></div>
      <div class="lp-high"><span>HIGH SCORE OF THE WEEK</span><strong>${escapeHTML(p.high.manager)}</strong><div><b>${fmt(p.high.score)}</b> points</div></div>
      <div class="lp-stats">
        <div class="lp-stat"><span>Closest finish</span><strong>${fmt(p.closest.margin)}</strong><small>${escapeHTML(p.closest.a)} vs ${escapeHTML(p.closest.b)}</small></div>
        <div class="lp-stat"><span>League scoring average</span><strong>${fmt(p.weeklyAverage)}</strong><small>Points per team · Week ${p.week}</small></div>
        <div class="lp-stat"><span>Highest-scoring loss</span><strong>${p.hardLuck ? fmt(p.hardLuck.score) : '—'}</strong><small>${p.hardLuck ? escapeHTML(p.hardLuck.manager) : 'No losing teams this week'}</small></div>
      </div>
      <div class="lp-allplay"><div class="lp-allplay-header"><div><p class="eyebrow">Schedule-proof comparison</p><h3>All-play power standings</h3></div><span>Through Week ${p.week}</span></div>
        <p class="lp-explain">What if everyone faced all nine opponents each week? All-play % measures scoring strength. The schedule gap compares actual wins to all-play expected wins; it does not prove luck caused a result.</p>
        <div class="lp-table-wrap"><table><thead><tr><th>#</th><th>Manager</th><th>W–L</th><th>All-play</th><th>Win gap</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="lp-fortune">${luckNote}</div>
      </div>
    </div>`;
  }

  async function mount() {
    const el = document.getElementById('leaguePulse');
    if (!el) return;
    try {
      const response = await fetch('data/season-2026.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      el.innerHTML = renderPulse(calculatePulse(await response.json()));
    } catch (err) {
      console.warn('League Pulse unavailable:', err);
      el.innerHTML = '<div class="lp-unavailable"><b>League Pulse temporarily unavailable.</b> Current standings and historical records remain accessible.</div>';
    }
  }

  return { calculatePulse, renderPulse, mount, escapeHTML };
});
