const assert = require('assert');
const Core = require('../js/play-stockfish.js');

assert.strictEqual(Core.BUILD_ID, 'play-vs-stockfish-2.1.2');

const tenFive = Core.parseTimeControl('10+5');
assert.strictEqual(tenFive.enabled, true);
assert.strictEqual(tenFive.initialMs, 600000);
assert.strictEqual(tenFive.incrementMs, 5000);
assert.strictEqual(tenFive.pgn, '600+5');

const bullet = Core.parseTimeControl('1+0');
assert.strictEqual(bullet.initialMs, 60000);
assert.strictEqual(bullet.incrementMs, 0);

const untimed = Core.parseTimeControl('untimed');
assert.strictEqual(untimed.enabled, false);
assert.strictEqual(untimed.pgn, '-');

const custom = Core.parseTimeControl('custom', 12.5, 3);
assert.strictEqual(custom.initialMs, 750000);
assert.strictEqual(custom.incrementMs, 3000);
assert.strictEqual(custom.pgn, '750+3');

assert.strictEqual(Core.formatClock(600000), '10:00');
assert.strictEqual(Core.formatClock(19500), '0:19.5');
assert.strictEqual(Core.formatClock(-100), '0:00.0');

assert.strictEqual(
  Core.positionKey('8/8/8/8/8/8/8/8 w - - 12 44'),
  '8/8/8/8/8/8/8/8 w - -'
);

assert.strictEqual(Core.winnerResult('w'), '1-0');
assert.strictEqual(Core.winnerResult('b'), '0-1');
assert.strictEqual(Core.other('w'), 'b');
assert.strictEqual(Core.squareName(0), 'a1');
assert.strictEqual(Core.squareName(63), 'h8');

const pgn = Core.pgn(
  {
    event: 'Play vs Stockfish',
    site: 'test',
    date: '2026.08.07',
    white: 'You',
    black: 'Stockfish 18',
    timeControl: '180+2',
    mode: 'Training'
  },
  [
    { san: 'e4' },
    { san: 'e5' },
    { san: 'Nf3' },
    { san: 'Nc6' }
  ],
  '*',
  'Unfinished'
);

assert(pgn.includes('[White "You"]'));
assert(pgn.includes('[Black "Stockfish 18"]'));
assert(pgn.includes('[TimeControl "180+2"]'));
assert(pgn.includes('1. e4 e5 2. Nf3 Nc6 *'));

console.log('Play-vs-Stockfish core tests passed.');
process.exit(0);
