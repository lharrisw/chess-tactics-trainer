const assert = require('assert');

const {
  StockfishController,
  parseUciOption,
  parseUciInfo,
  scoreToCp,
  formatScore,
  makeGoCommand
} = require('../js/stockfish-controller.js');

(function testParsers() {
  const elo = parseUciOption(
    'option name UCI_Elo type spin default 1320 min 1320 max 3190'
  );
  assert.strictEqual(elo.name, 'UCI_Elo');
  assert.strictEqual(elo.type, 'spin');
  assert.strictEqual(elo.min, 1320);
  assert.strictEqual(elo.max, 3190);

  const info = parseUciInfo(
    'info depth 18 seldepth 24 multipv 2 score cp 37 nodes 1000 nps 50000 time 20 pv e2e4 e7e5'
  );
  assert.strictEqual(info.depth, 18);
  assert.strictEqual(info.multipv, 2);
  assert.deepStrictEqual(info.score, {
    type: 'cp',
    value: 37,
    lowerbound: false,
    upperbound: false
  });
  assert.deepStrictEqual(info.pv, ['e2e4', 'e7e5']);

  assert.strictEqual(formatScore({ type: 'cp', value: 37 }), '+0.37');
  assert.strictEqual(formatScore({ type: 'mate', value: 3 }), 'Mate in 3');
  assert(scoreToCp({ type: 'mate', value: 3 }) > 90000);

  assert.strictEqual(
    makeGoCommand({ wtime: 60000, btime: 59000, winc: 1000, binc: 1000 }),
    'go wtime 60000 btime 59000 winc 1000 binc 1000 depth 18'
  );
})();

class MockWorker {
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
    this.listeners = new Map();
    this.commands = [];
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }

  removeEventListener(type, fn) {
    const set = this.listeners.get(type);
    if (set) set.delete(fn);
  }

  emit(data) {
    const event = { data };
    if (typeof this.onmessage === 'function') this.onmessage(event);

    const set = this.listeners.get('message');
    if (set) {
      for (const fn of Array.from(set)) fn(event);
    }
  }

  postMessage(command) {
    this.commands.push(command);

    if (typeof command !== 'string') return;

    if (command === 'uci') {
      queueMicrotask(() => {
        this.emit('id name Stockfish 18 Mock');
        this.emit('id author Stockfish developers');
        this.emit('option name Hash type spin default 16 min 1 max 1024');
        this.emit('option name MultiPV type spin default 1 min 1 max 8');
        this.emit('option name Skill Level type spin default 20 min 0 max 20');
        this.emit('option name UCI_LimitStrength type check default false');
        this.emit('option name UCI_Elo type spin default 1320 min 1320 max 3190');
        this.emit('uciok');
      });
    } else if (command === 'isready') {
      queueMicrotask(() => this.emit('readyok'));
    } else if (command.startsWith('go ')) {
      queueMicrotask(() => {
        this.emit('info depth 10 multipv 1 score cp 20 nodes 2000 nps 100000 pv e2e4 e7e5');
        this.emit('bestmove e2e4 ponder e7e5');
      });
    } else if (command === 'stop') {
      queueMicrotask(() => this.emit('bestmove e2e4'));
    }
  }

  terminate() {}
}

(async function testControllerLifecycle() {
  let worker;

  const controller = new StockfishController({
    workerFactory: url => {
      worker = new MockWorker(url);
      return worker;
    }
  });

  await controller.init();

  assert.strictEqual(controller.idName, 'Stockfish 18 Mock');
  assert.strictEqual(controller.state, 'ready');
  assert(controller.hasOption('UCI_Elo'));
  assert(controller.hasOption('skill level'));

  const limited = await controller.setStrength({ mode: 'elo', elo: 1800 });
  assert.strictEqual(limited.mode, 'elo');
  assert.strictEqual(limited.elo, 1800);

  assert(
    worker.commands.includes('setoption name UCI_LimitStrength value true')
  );
  assert(
    worker.commands.includes('setoption name UCI_Elo value 1800')
  );

  const result = await controller.analyze(
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    { depth: 10, multiPv: 1 }
  );

  assert.strictEqual(result.bestmove, 'e2e4');
  assert.strictEqual(result.lines[0].depth, 10);

  controller.terminate();

  console.log('Stockfish controller tests passed.');
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
