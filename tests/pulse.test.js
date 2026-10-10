const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { calculatePulse, renderPulse } = require('../assets/pulse.js');

const demo = () => ({
  season: 2026, completedWeek: 2, updatedAt: '2026-10-09',
  currentStandings: [
    { id: 1, manager: 'A', name: 'Team A', wl: '1–1', pf: 195 },
    { id: 2, manager: 'B', name: 'Team B', wl: '1–1', pf: 210 },
    { id: 3, manager: 'C', name: 'Team C', wl: '2–0', pf: 210 },
    { id: 4, manager: 'D', name: 'Team D', wl: '0–2', pf: 215 }
  ],
  matchups: [
    { week: 1, a: { id: 1, score: 100 }, b: { id: 2, score: 90 } },
    { week: 1, a: { id: 3, score: 110 }, b: { id: 4, score: 105 } },
    { week: 2, a: { id: 1, score: 95 }, b: { id: 3, score: 100 } },
    { week: 2, a: { id: 2, score: 120 }, b: { id: 4, score: 110 } }
  ]
});

test('League Pulse derives facts from completed games and all-play pairings', () => {
  const p = calculatePulse(demo());
  assert.equal(p.week, 2);
  assert.deepEqual(p.high, { manager: 'B', score: 120 });
  assert.deepEqual(p.closest, { a: 'A', b: 'C', margin: 5 });
  assert.deepEqual(p.hardLuck, { manager: 'D', score: 110 });
  assert.equal(p.weeklyAverage, 106.25);
  assert.equal(p.allPlay.length, 4);
  assert.equal(p.allPlay[0].manager, 'D');
  assert.equal(p.allPlay.find(t => t.id === 4).scheduleGap, -1.33);
  assert.equal(p.allPlay.find(t => t.id === 1).scheduleGap, 0.67);
  assert.equal(p.allPlay.find(t => t.id === 2).allPlayGames, 6);
});

test('Incomplete, duplicate, and future weeks fail closed', () => {
  const missing = demo(); missing.matchups.pop();
  assert.throws(() => calculatePulse(missing), /Incomplete Week 2/);
  const duplicate = demo(); duplicate.matchups[3].a.id = 1;
  assert.throws(() => calculatePulse(duplicate), /Invalid matchup/);
  const zeros = demo(); zeros.matchups[3].a.score = 0; zeros.matchups[3].b.score = 0;
  assert.throws(() => calculatePulse(zeros), /Invalid matchup/);
  const future = demo(); future.matchups.push({ week: 3, a: { id: 1, score: 0 }, b: { id: 2, score: 0 } });
  assert.throws(() => calculatePulse(future), /uncompleted week/);
});

test('Standings must match the actual scored games', () => {
  const pf = demo(); pf.currentStandings[0].pf = 300;
  assert.throws(() => calculatePulse(pf), /do not reconcile/);
  const wins = demo(); wins.currentStandings[0].wl = '2–0';
  assert.throws(() => calculatePulse(wins), /do not reconcile/);
});

test('HTML output safely escapes manager names', () => {
  const bad = demo(); bad.currentStandings[1].manager = '<img src=x onerror=alert(1)>';
  const html = renderPulse(calculatePulse(bad));
  assert.equal(html.includes('<img'), false);
  assert.ok(html.includes('&lt;img'));
});

test('Integrated homepage references existing scripts/styles and avoids stale Week 3 copy', () => {
  const file = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  for (const asset of ['assets/stats.js', 'assets/app.js', 'assets/pulse.js', 'assets/styles.css', 'assets/pulse.css']) {
    assert.ok(file.includes(`"${asset}"`), `Missing ${asset} reference`);
    assert.ok(fs.existsSync(path.join(__dirname, '..', asset)), `Missing ${asset} file`);
  }
  assert.ok(file.includes('id="leaguePulse"'));
  assert.ok(!file.includes('Updated through 2026 Week 3'));
  assert.ok(!file.includes('Through W3'));
});

test('Real season snapshot has a validated summary and completed matchup archive', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/season-2026.json'), 'utf8'));
  const p = calculatePulse(data);
  assert.equal(p.week, data.completedWeek);
  assert.equal(p.allPlay.length, data.currentStandings.length);
  assert.ok(data.summary && Number.isFinite(data.summary.avg) && typeof data.summary.top === 'string');
  const average = data.currentStandings.reduce((n, t) => n + t.pf, 0) /
    (data.currentStandings.length * data.completedWeek);
  assert.ok(Math.abs(data.summary.avg - average) < 0.015);
  const leader = [...data.currentStandings].sort((a, b) => b.pf - a.pf)[0];
  assert.equal(data.summary.top, `${leader.manager} · ${(leader.pf / data.completedWeek).toFixed(2)} PPG`);
});
