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

test('League Pulse derives real weekly headlines without fabricated projections', () => {
  const p = calculatePulse(demo());
  assert.equal(p.week, 2);
  assert.deepEqual(p.high, { manager: 'B', score: 120 });
  assert.deepEqual(p.closest, { a: 'A', b: 'C', margin: 5 });
  assert.deepEqual(p.hardLuck, { manager: 'D', score: 110 });
  assert.equal(p.weeklyAverage, 106.25);
  assert.equal(p.allPlay.length, 4);
  assert.equal(p.allPlay[0].manager, 'D'); // Scores well despite 0–2 record.
  assert.equal(p.allPlay.find(x => x.id === 4).luckGap, -1.33);
  assert.equal(p.allPlay.find(x => x.id === 1).luckGap, 0.67);
});

test('Every published week requires one valid result for each manager', () => {
  const missing = demo(); missing.matchups.pop();
  assert.throws(() => calculatePulse(missing), /Incomplete Week 2/);
  const duplicate = demo(); duplicate.matchups[3].a.id = 1;
  assert.throws(() => calculatePulse(duplicate), /Invalid matchup/);
  const zeroes = demo(); zeroes.matchups[3].a.score = 0; zeroes.matchups[3].b.score = 0;
  assert.throws(() => calculatePulse(zeroes), /Invalid matchup/);
  const future = demo(); future.matchups.push({ week: 3, a: { id: 1, score: 0 }, b: { id: 2, score: 0 } });
  assert.throws(() => calculatePulse(future), /uncompleted week/);
});

test('A discrepant official standings snapshot is not used for stories', () => {
  const invalid = demo(); invalid.currentStandings[0].pf = 300;
  assert.throws(() => calculatePulse(invalid), /do not reconcile/);
  const incomplete = demo(); incomplete.currentStandings[0].wl = '2–0';
  assert.throws(() => calculatePulse(incomplete), /do not reconcile/);
});

test('ESPN-provided names are HTML-escaped', () => {
  const evil = demo(); evil.currentStandings[1].manager = '<img src=x onerror=alert(1)>';
  const html = renderPulse(calculatePulse(evil));
  assert.equal(html.includes('<img'), false);
  assert.ok(html.includes('&lt;img'));
});

test('The committed current season has a valid summary and complete matchup archive', t => {
  const filename = path.join(__dirname, '../data/season-2026.json');
  if (!fs.existsSync(filename)) return t.skip('Requires the complete repository data directory');
  const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const p = calculatePulse(data);
  assert.equal(p.week, data.completedWeek);
  assert.equal(p.allPlay.length, data.currentStandings.length);
  assert.ok(data.summary && Number.isFinite(data.summary.avg) && typeof data.summary.top === 'string');
  const avg = data.currentStandings.reduce((n, team) => n + team.pf, 0) /
    (data.currentStandings.length * data.completedWeek);
  assert.ok(Math.abs(data.summary.avg - avg) < 0.015);
  const leader = [...data.currentStandings].sort((a, b) => b.pf - a.pf)[0];
  assert.equal(data.summary.top, `${leader.manager} · ${(leader.pf / data.completedWeek).toFixed(2)} PPG`);
});
