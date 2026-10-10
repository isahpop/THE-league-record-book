/* THE League Pulse — facts derived only from completed, reconciled matchups. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.LeaguePulse = api;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', api.mount, { once: true });
    } else {
      api.mount();
    }
  }
})(globalThis, function () {
  'use strict';

  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const fmt = value => Number(value).toFixed(2);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function calculatePulse(data) {
    if (!data || !Number.isInteger(data.season) || !Number.isInteger(data.completedWeek) ||
        data.completedWeek < 1 || !Array.isArray(data.currentStandings) ||
        !Array.isArray(data.matchups)) throw new Error('Invalid season snapshot');

    const official = data.currentStandings;
    const ids = official.map(t => Number(t.id));
    if (ids.length < 2 || ids.length % 2 !== 0 ||
        ids.some(id => !Number.isInteger(id)) || new Set(ids).size !== ids.length) {
      throw new Error('Invalid league team list');
    }
    const byId = new Map(official.map(t => [Number(t.id), t]));
    const weeks = new Map();
    for (const matchup of data.matchups) {
      if (!Number.isInteger(matchup.week) || matchup.week < 1 || matchup.week > data.completedWeek) {
        throw new Error('Unexpected uncompleted week in season archive');
      }
      if (!weeks.has(matchup.week)) weeks.set(matchup.week, []);
      weeks.get(matchup.week).push(matchup);
    }

    const totals = new Map(ids.map(id => [id, {
      id,
      manager: byId.get(id).manager || byId.get(id).name || `Team ${id}`,
      points: 0, wins: 0, losses: 0, ties: 0,
      allPlayWins: 0, allPlayGames: 0
    }]));

    for (let week = 1; week <= data.completedWeek; week++) {
      const games = weeks.get(week) || [];
      if (games.length !== ids.length / 2) throw new Error(`Incomplete Week ${week}`);
      const seen = new Set();
      const weekScores = [];
      for (const game of games) {
        if (!game.a || !game.b) throw new Error(`Invalid matchup in Week ${week}`);
        const a = Number(game.a.id), b = Number(game.b.id);
        const ap = Number(game.a.score), bp = Number(game.b.score);
        if (!byId.has(a) || !byId.has(b) || a === b || seen.has(a) || seen.has(b) ||
            !Number.isFinite(ap) || !Number.isFinite(bp) || (ap === 0 && bp === 0)) {
          throw new Error(`Invalid matchup in Week ${week}`);
        }
        seen.add(a); seen.add(b);
        weekScores.push({ id: a, score: ap }, { id: b, score: bp });
        totals.get(a).points += ap;
        totals.get(b).points += bp;
        if (ap > bp) { totals.get(a).wins++; totals.get(b).losses++; }
        else if (bp > ap) { totals.get(b).wins++; totals.get(a).losses++; }
        else { totals.get(a).ties++; totals.get(b).ties++; }
      }
      if (seen.size !== ids.length) throw new Error(`Missing teams in Week ${week}`);
      for (const a of weekScores) {
        for (const b of weekScores) {
          if (a.id === b.id) continue;
          const row = totals.get(a.id);
          row.allPlayGames++;
          row.allPlayWins += a.score > b.score ? 1 : a.score === b.score ? 0.5 : 0;
        }
      }
    }

    const allPlay = [...totals.values()].map(t => {
      const source = byId.get(t.id);
      const record = String(source.wl || '').split(/[–-]/).map(Number);
      if (record.length < 2 || !record.every(Number.isFinite) ||
          record[0] !== t.wins || record[1] !== t.losses || (record[2] || 0) !== t.ties ||
          !Number.isFinite(Number(source.pf)) || Math.abs(Number(source.pf) - t.points) > 0.06) {
        throw new Error(`Standings do not reconcile for ${t.manager}`);
      }
      const expectedWins = t.allPlayWins / (ids.length - 1);
      return {
        ...t,
        points: round(t.points),
        allPlayPct: round(100 * t.allPlayWins / t.allPlayGames),
        expectedWins: round(expectedWins),
        scheduleGap: round(t.wins + 0.5 * t.ties - expectedWins)
      };
    }).sort((a, b) => b.allPlayPct - a.allPlayPct || b.points - a.points || a.id - b.id);

    const recentGames = weeks.get(data.completedWeek);
    const recentSides = recentGames.flatMap(g => [g.a, g.b]);
    const highest = [...recentSides].sort((a, b) => b.score - a.score || a.id - b.id)[0];
    const closest = [...recentGames].sort((a, b) =>
      Math.abs(a.a.score - a.b.score) - Math.abs(b.a.score - b.b.score))[0];
    const losingScores = recentGames.flatMap(g =>
      g.a.score < g.b.score ? [g.a] : g.b.score < g.a.score ? [g.b] : []);
    const toughLoss = [...losingScores].sort((a, b) => b.score - a.score)[0] || null;
    const manager = id => totals.get(Number(id))?.manager || `Team ${id}`;
    return {
      season: data.season,
      week: data.completedWeek,
      updatedAt: String(data.updatedAt || ''),
      high: { manager: manager(highest.id), score: round(Number(highest.score)) },
      closest: { a: manager(closest.a.id), b: manager(closest.b.id),
        margin: round(Math.abs(closest.a.score - closest.b.score)) },
      hardLuck: toughLoss ? { manager: manager(toughLoss.id), score: round(Number(toughLoss.score)) } : null,
      weeklyAverage: round(recentSides.reduce((sum, t) => sum + Number(t.score), 0) / ids.length),
      allPlay,
      largestAdvantage: [...allPlay].sort((a, b) => b.scheduleGap - a.scheduleGap || a.id - b.id)[0],
      largestDisadvantage: [...allPlay].sort((a, b) => a.scheduleGap - b.scheduleGap || a.id - b.id)[0]
    };
  }

  function renderPulse(p) {
    const rows = p.allPlay.map((t, index) => `<tr>
      <td class="lp-rank">${index + 1}</td>
      <td class="lp-team">${escapeHTML(t.manager)}</td>
      <td>${t.wins}–${t.losses}${t.ties ? `–${t.ties}` : ''}</td>
      <td>${t.allPlayPct.toFixed(1)}%</td>
      <td class="${t.scheduleGap > 0.005 ? 'lp-positive' : t.scheduleGap < -0.005 ? 'lp-negative' : ''}">${t.scheduleGap > 0 ? '+' : ''}${fmt(t.scheduleGap)}</td>
    </tr>`).join('');
    const label = t => `${escapeHTML(t.manager)} (${t.scheduleGap > 0 ? '+' : ''}${fmt(t.scheduleGap)} wins)`;
    return `<div class="lp-panel">
      <div class="lp-heading"><div><p class="eyebrow">THE League Pulse · ${p.season}</p><h2>Week ${p.week}, by the numbers</h2></div><span class="lp-date">Data updated ${escapeHTML(p.updatedAt || 'recently')}</span></div>
      <div class="lp-high"><span>HIGHEST SCORE THIS WEEK</span><strong>${escapeHTML(p.high.manager)}</strong><div><b>${fmt(p.high.score)}</b> points</div></div>
      <div class="lp-stats">
        <div class="lp-stat"><span>Closest finish</span><strong>${fmt(p.closest.margin)}</strong><small>${escapeHTML(p.closest.a)} vs ${escapeHTML(p.closest.b)}</small></div>
        <div class="lp-stat"><span>League scoring average</span><strong>${fmt(p.weeklyAverage)}</strong><small>Points per team · Week ${p.week}</small></div>
        <div class="lp-stat"><span>Highest-scoring loss</span><strong>${p.hardLuck ? fmt(p.hardLuck.score) : '—'}</strong><small>${p.hardLuck ? escapeHTML(p.hardLuck.manager) : 'No losses this week'}</small></div>
      </div>
      <div class="lp-allplay"><div class="lp-allplay-header"><div><p class="eyebrow">Schedule-adjusted perspective</p><h3>All-play standings</h3></div><span>Through Week ${p.week}</span></div>
        <p class="lp-explain">Everyone faces every other manager each week for this comparison. All-play % measures scoring strength; the win gap is actual wins minus all-play expected wins. It does not establish that luck caused a result.</p>
        <div class="lp-table-wrap"><table><thead><tr><th>#</th><th>Manager</th><th>W–L</th><th>All-play</th><th>Win gap</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="lp-fortune"><span><b>Biggest schedule advantage:</b> ${label(p.largestAdvantage)}</span><span><b>Biggest schedule disadvantage:</b> ${label(p.largestDisadvantage)}</span></div>
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
    } catch (error) {
      console.warn('League Pulse cannot display:', error);
      el.innerHTML = '<div class="lp-unavailable"><b>League Pulse temporarily unavailable.</b> The main standings and historical records may still be available.</div>';
    }
  }

  return { calculatePulse, renderPulse, mount, escapeHTML };
});
