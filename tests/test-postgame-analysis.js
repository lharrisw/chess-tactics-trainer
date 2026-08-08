const assert = require('assert');
const Core = require('../js/postgame-analysis.js');

assert.strictEqual(Core.BUILD_ID, 'postgame-analysis-2.2');

assert.strictEqual(Core.formatScore({ type: 'cp', value: 35 }), '+0.35');
assert.strictEqual(Core.formatScore({ type: 'mate', value: 3 }), 'M3');
assert.strictEqual(Core.formatScore({ type: 'mate', value: -2 }), '-M2');

assert(Core.scoreToCp({ type: 'mate', value: 2 }) > 90000);
assert(Core.scoreToCp({ type: 'mate', value: -2 }) < -90000);

assert.strictEqual(Core.moveLabel(0, 'e4'), '1. e4');
assert.strictEqual(Core.moveLabel(1, 'e5'), '1... e5');
assert.strictEqual(Core.moveLabel(20, 'Nf3'), '11. Nf3');

const best = Core.classify({
  bestScore: { type: 'cp', value: 50 },
  playedScore: { type: 'cp', value: 50 },
  bestMove: 'e2e4',
  playedMove: 'e2e4'
});
assert.strictEqual(best.label, 'Best');

const blunder = Core.classify({
  bestScore: { type: 'cp', value: 150 },
  playedScore: { type: 'cp', value: -500 },
  bestMove: 'e2e4',
  playedMove: 'a2a3'
});
assert.strictEqual(blunder.label, 'Blunder');

const missedMate = Core.classify({
  bestScore: { type: 'mate', value: 2 },
  playedScore: { type: 'cp', value: 120 },
  bestMove: 'h5h7',
  playedMove: 'h5e5'
});
assert.strictEqual(missedMate.label, 'Missed mate');

const missedWin = Core.classify({
  bestScore: { type: 'cp', value: 600 },
  playedScore: { type: 'cp', value: 0 },
  bestMove: 'd1h5',
  playedMove: 'a2a3'
});
assert.strictEqual(missedWin.label, 'Missed win');

const summary = Core.summarize([
  { classification: best, critical: false, ply: 0, san: 'e4' },
  { classification: blunder, critical: true, ply: 2, san: 'Qh5' },
  { classification: missedMate, critical: true, ply: 4, san: 'Bc4' }
]);

assert.strictEqual(summary.total, 3);
assert.strictEqual(summary.critical, 2);
assert.strictEqual(summary.counts.Best, 1);
assert.strictEqual(summary.counts.Blunder, 1);
assert.strictEqual(summary.counts['Missed mate'], 1);
assert(summary.worst);

console.log('Post-game analysis core tests passed.');
process.exit(0);
