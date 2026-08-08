/* Chess Tactics Trainer — Build 2.0
 * Stockfish 18 browser controller
 *
 * Stockfish runs in a Web Worker. The 100+ MB engine is NOT downloaded until
 * init() is called by a feature that needs it.
 */
(function (global) {
  'use strict';

  const BUILD_ID = 'stockfish-controller-2.0';
  const DEFAULT_ENGINE_URL = 'engine/stockfish-18-single.js';
  const DEFAULT_HASH_MB = 64;
  const MATE_SCORE = 100000;

  class CancelledError extends Error {
    constructor(message) {
      super(message || 'Stockfish search cancelled.');
      this.name = 'CancelledError';
    }
  }

  class EngineBusyError extends Error {
    constructor(message) {
      super(message || 'Stockfish is already searching.');
      this.name = 'EngineBusyError';
    }
  }

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function parseUciOption(line) {
    if (typeof line !== 'string' || !line.startsWith('option name ')) return null;
    const body = line.slice('option name '.length);
    const split = body.indexOf(' type ');
    if (split < 1) return null;

    const name = body.slice(0, split).trim();
    const rest = body.slice(split + 6);
    const typeMatch = rest.match(/^(check|spin|combo|button|string)\b/);
    if (!typeMatch) return null;

    const type = typeMatch[1];
    const option = { name, type, raw: line };

    const min = rest.match(/\bmin\s+(-?\d+)/);
    const max = rest.match(/\bmax\s+(-?\d+)/);
    if (min) option.min = Number(min[1]);
    if (max) option.max = Number(max[1]);

    const defaultMatch = rest.match(/\bdefault\s+(.+?)(?=\s+(?:min|max|var)\s+|$)/);
    if (defaultMatch) option.default = defaultMatch[1].trim();

    const vars = [];
    const varRegex = /\bvar\s+(.+?)(?=\s+var\s+|$)/g;
    let match;
    while ((match = varRegex.exec(rest))) vars.push(match[1].trim());
    if (vars.length) option.vars = vars;

    return option;
  }

  function parseUciInfo(line) {
    if (typeof line !== 'string' || !line.startsWith('info ')) return null;

    const tokens = line.trim().split(/\s+/);
    const out = {
      raw: line,
      multipv: 1,
      depth: 0,
      seldepth: 0,
      nodes: 0,
      nps: 0,
      time: 0,
      pv: []
    };

    for (let i = 1; i < tokens.length; i += 1) {
      const token = tokens[i];

      if (token === 'depth') out.depth = Number(tokens[++i] || 0);
      else if (token === 'seldepth') out.seldepth = Number(tokens[++i] || 0);
      else if (token === 'multipv') out.multipv = Number(tokens[++i] || 1);
      else if (token === 'nodes') out.nodes = Number(tokens[++i] || 0);
      else if (token === 'nps') out.nps = Number(tokens[++i] || 0);
      else if (token === 'time') out.time = Number(tokens[++i] || 0);
      else if (token === 'hashfull') out.hashfull = Number(tokens[++i] || 0);
      else if (token === 'score') {
        const type = tokens[++i];
        const value = Number(tokens[++i] || 0);
        if (type === 'cp' || type === 'mate') {
          out.score = {
            type,
            value,
            lowerbound: false,
            upperbound: false
          };
          if (tokens[i + 1] === 'lowerbound') {
            out.score.lowerbound = true;
            i += 1;
          } else if (tokens[i + 1] === 'upperbound') {
            out.score.upperbound = true;
            i += 1;
          }
        }
      } else if (token === 'wdl') {
        out.wdl = [
          Number(tokens[i + 1] || 0),
          Number(tokens[i + 2] || 0),
          Number(tokens[i + 3] || 0)
        ];
        i += 3;
      } else if (token === 'pv') {
        out.pv = tokens.slice(i + 1);
        break;
      }
    }

    // Stockfish can occasionally emit useful info lines before a PV exists.
    // Consumers interested in principal variations only need scored PV lines.
    return out.score && out.pv.length ? out : null;
  }

  function scoreToCp(score) {
    if (!score) return Number.NEGATIVE_INFINITY;
    if (score.type === 'cp') return Number(score.value) || 0;
    if (score.type === 'mate') {
      const m = Number(score.value) || 0;
      if (m > 0) return MATE_SCORE - Math.min(999, m) * 100;
      if (m < 0) return -MATE_SCORE - Math.max(-999, m) * 100;
      return 0;
    }
    return Number.NEGATIVE_INFINITY;
  }

  function formatScore(score) {
    if (!score) return '—';
    if (score.type === 'mate') {
      if (score.value > 0) return 'Mate in ' + score.value;
      if (score.value < 0) return 'Mated in ' + Math.abs(score.value);
      return 'Mate';
    }
    const pawns = Number(score.value || 0) / 100;
    return (pawns >= 0 ? '+' : '') + pawns.toFixed(2);
  }

  function makeGoCommand(options) {
    const opts = options || {};
    const parts = ['go'];

    if (Array.isArray(opts.searchMoves) && opts.searchMoves.length) {
      parts.push('searchmoves', ...opts.searchMoves.map(String));
    }

    if (Number(opts.wtime) >= 0 && Number.isFinite(Number(opts.wtime))) {
      parts.push('wtime', String(Math.floor(Number(opts.wtime))));
    }
    if (Number(opts.btime) >= 0 && Number.isFinite(Number(opts.btime))) {
      parts.push('btime', String(Math.floor(Number(opts.btime))));
    }
    if (Number(opts.winc) >= 0 && Number.isFinite(Number(opts.winc))) {
      parts.push('winc', String(Math.floor(Number(opts.winc))));
    }
    if (Number(opts.binc) >= 0 && Number.isFinite(Number(opts.binc))) {
      parts.push('binc', String(Math.floor(Number(opts.binc))));
    }
    if (Number(opts.movestogo) > 0) {
      parts.push('movestogo', String(Math.floor(Number(opts.movestogo))));
    }

    if (Number(opts.movetime) > 0) {
      parts.push('movetime', String(Math.max(25, Math.floor(Number(opts.movetime)))));
    } else if (Number(opts.nodes) > 0) {
      parts.push('nodes', String(Math.floor(Number(opts.nodes))));
    } else if (opts.infinite) {
      parts.push('infinite');
    } else {
      const depth = clamp(opts.depth == null ? 18 : opts.depth, 1, 60);
      parts.push('depth', String(Math.floor(depth)));
    }

    return parts.join(' ');
  }

  class StockfishController {
    constructor(options) {
      const opts = options || {};

      this.engineUrl = opts.engineUrl || DEFAULT_ENGINE_URL;
      this.hashMb = clamp(opts.hashMb == null ? DEFAULT_HASH_MB : opts.hashMb, 16, 512);

      this.onStatus = typeof opts.onStatus === 'function' ? opts.onStatus : function () {};
      this.onDownloadProgress =
        typeof opts.onDownloadProgress === 'function' ? opts.onDownloadProgress : function () {};
      this.onRawLine = typeof opts.onRawLine === 'function' ? opts.onRawLine : function () {};

      this.workerFactory =
        typeof opts.workerFactory === 'function'
          ? opts.workerFactory
          : function (url) {
              if (typeof Worker !== 'function') {
                throw new Error('This browser does not support Web Workers.');
              }
              return new Worker(url);
            };

      this.worker = null;
      this.readyPromise = null;
      this.waiters = [];
      this.current = null;

      this.idName = '';
      this.idAuthor = '';
      this.options = new Map();
      this.state = 'idle';
      this.lastError = null;
      this.strength = { mode: 'full' };
    }

    _setState(state, message) {
      this.state = state;
      if (message) {
        try { this.onStatus(message, state); } catch (_) {}
      }
    }

    _post(command) {
      if (!this.worker) throw new Error('Stockfish is not running.');
      this.worker.postMessage(command);
    }

    _waitFor(predicate, timeoutMs) {
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          resolve: null,
          reject: null,
          timer: null
        };

        waiter.timer = setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(new Error('Stockfish did not respond in time.'));
        }, timeoutMs || 120000);

        waiter.resolve = value => {
          clearTimeout(waiter.timer);
          resolve(value);
        };
        waiter.reject = error => {
          clearTimeout(waiter.timer);
          reject(error);
        };

        this.waiters.push(waiter);
      });
    }

    _handleMessage(event) {
      const raw = typeof event === 'string' ? event : event && event.data;
      if (raw === undefined || raw === null) return;

      const lines = String(raw).split(/\r?\n/).filter(Boolean);
      for (const line of lines) this._handleLine(line);
    }

    _handleLine(line) {
      try { this.onRawLine(line); } catch (_) {}

      if (line.startsWith('id name ')) {
        this.idName = line.slice('id name '.length).trim();
      } else if (line.startsWith('id author ')) {
        this.idAuthor = line.slice('id author '.length).trim();
      } else if (line.startsWith('option name ')) {
        const option = parseUciOption(line);
        if (option) this.options.set(option.name.toLowerCase(), option);
      }

      for (let i = this.waiters.length - 1; i >= 0; i -= 1) {
        const waiter = this.waiters[i];
        let matched = false;
        try { matched = !!waiter.predicate(line); } catch (_) {}
        if (matched) {
          this.waiters.splice(i, 1);
          waiter.resolve(line);
        }
      }

      const search = this.current;
      if (!search) return;

      const info = parseUciInfo(line);
      if (info) {
        const previous = search.lines.get(info.multipv);
        if (!previous || info.depth >= previous.depth) {
          search.lines.set(info.multipv, info);
        }

        if (typeof search.onInfo === 'function') {
          try {
            search.onInfo(
              info,
              Array.from(search.lines.values()).sort((a, b) => a.multipv - b.multipv)
            );
          } catch (_) {}
        }
        return;
      }

      if (line.startsWith('bestmove')) {
        const parts = line.trim().split(/\s+/);
        const bestmove = parts[1] && parts[1] !== '(none)' ? parts[1] : null;
        const ponder = parts[2] === 'ponder' ? (parts[3] || null) : null;

        this.current = null;
        this._setState('ready', (this.idName || 'Stockfish 18') + ' ready.');

        const result = {
          bestmove,
          ponder,
          engine: this.idName || 'Stockfish 18',
          lines: Array.from(search.lines.values()).sort((a, b) => a.multipv - b.multipv)
        };

        if (search.cancelled) {
          search.reject(new CancelledError());
        } else if (!bestmove) {
          search.reject(new Error('Stockfish returned no legal move.'));
        } else {
          search.resolve(result);
        }
      }
    }

    _rejectAll(error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.lastError = err;

      while (this.waiters.length) {
        const waiter = this.waiters.pop();
        waiter.reject(err);
      }

      if (this.current) {
        const current = this.current;
        this.current = null;
        current.reject(err);
      }
    }

    _option(name) {
      return this.options.get(String(name).toLowerCase()) || null;
    }

    hasOption(name) {
      return !!this._option(name);
    }

    _setOptionUnsafe(name, value) {
      if (!this.hasOption(name)) return false;
      this._post('setoption name ' + name + (value === undefined ? '' : ' value ' + value));
      return true;
    }

    async _syncReady() {
      const wait = this._waitFor(line => line === 'readyok', 120000);
      this._post('isready');
      await wait;
    }

    async init() {
      if (this.readyPromise) return this.readyPromise;

      this.readyPromise = (async () => {
        this._setState(
          'starting',
          'Starting full Stockfish 18. The first launch may download a large engine file…'
        );

        const worker = this.workerFactory(this.engineUrl);
        this.worker = worker;

        worker.onmessage = event => this._handleMessage(event);
        worker.onerror = event => {
          const message = event && event.message ? event.message : 'Stockfish worker failed.';
          const error = new Error(message);
          this._setState('error', message);
          this._rejectAll(error);
        };

        // stockfish.js supports an optional MessageChannel used to report the
        // large WASM download. Failure here is non-fatal.
        if (typeof MessageChannel === 'function') {
          try {
            const channel = new MessageChannel();
            channel.port1.onmessage = event => {
              const data = event.data || {};
              try { this.onDownloadProgress(data); } catch (_) {}
              if (data.percent === 1) channel.port1.close();
            };

            const progressListener = event => {
              if (event.data === 'info WillOutputEngineDownloadProgress') {
                worker.removeEventListener('message', progressListener);
                worker.postMessage({ progressPort: channel.port2 }, [channel.port2]);
              }
            };

            worker.addEventListener('message', progressListener);
            worker.postMessage('setoption name CanOutputEngineDownloadProgress');
          } catch (_) {}
        }

        const uciWait = this._waitFor(line => line === 'uciok', 180000);
        this._post('uci');
        await uciWait;

        // The full single-threaded build may omit Threads entirely. If the
        // option exists, explicitly keep it at 1 for predictable behavior.
        this._setOptionUnsafe('Threads', 1);
        this._setOptionUnsafe('Hash', Math.floor(this.hashMb));
        this._setOptionUnsafe('Ponder', 'false');

        await this._syncReady();

        this._setState('ready', (this.idName || 'Stockfish 18') + ' ready.');
        return this;
      })().catch(error => {
        this.lastError = error instanceof Error ? error : new Error(String(error));
        this.readyPromise = null;

        if (this.worker) {
          try { this.worker.terminate(); } catch (_) {}
        }
        this.worker = null;

        this._setState('error', this.lastError.message);
        throw this.lastError;
      });

      return this.readyPromise;
    }

    getOption(name) {
      const option = this._option(name);
      return option ? Object.assign({}, option) : null;
    }

    getOptions() {
      return Array.from(this.options.values()).map(option => Object.assign({}, option));
    }

    async setOption(name, value) {
      await this.init();
      if (this.current) throw new EngineBusyError('Stop the current search before changing engine options.');
      if (!this._setOptionUnsafe(name, value)) {
        throw new Error('Stockfish does not expose the UCI option "' + name + '".');
      }
      await this._syncReady();
      return true;
    }

    async setStrength(config) {
      await this.init();
      if (this.current) throw new EngineBusyError('Stop the current search before changing strength.');

      const cfg = config || { mode: 'full' };
      const mode = String(cfg.mode || 'full').toLowerCase();

      if (mode === 'full') {
        this._setOptionUnsafe('UCI_LimitStrength', 'false');

        const skill = this._option('Skill Level');
        if (skill) {
          const max = Number.isFinite(skill.max) ? skill.max : 20;
          this._setOptionUnsafe(skill.name, max);
        }

        this.strength = { mode: 'full' };
      } else if (mode === 'elo') {
        const limit = this._option('UCI_LimitStrength');
        const elo = this._option('UCI_Elo');

        if (!limit || !elo) {
          throw new Error('This Stockfish build does not expose calibrated UCI_Elo strength limiting.');
        }

        const min = Number.isFinite(elo.min) ? elo.min : 1320;
        const max = Number.isFinite(elo.max) ? elo.max : 3190;
        const value = Math.round(clamp(cfg.elo == null ? 1800 : cfg.elo, min, max));

        this._setOptionUnsafe(limit.name, 'true');
        this._setOptionUnsafe(elo.name, value);

        this.strength = { mode: 'elo', elo: value, min, max };
      } else if (mode === 'skill') {
        const skill = this._option('Skill Level');
        if (!skill) throw new Error('This Stockfish build does not expose Skill Level.');

        const min = Number.isFinite(skill.min) ? skill.min : 0;
        const max = Number.isFinite(skill.max) ? skill.max : 20;
        const value = Math.round(clamp(cfg.skill == null ? 10 : cfg.skill, min, max));

        this._setOptionUnsafe('UCI_LimitStrength', 'false');
        this._setOptionUnsafe(skill.name, value);

        this.strength = { mode: 'skill', skill: value, min, max };
      } else {
        throw new Error('Unknown Stockfish strength mode: ' + mode);
      }

      await this._syncReady();
      return Object.assign({}, this.strength);
    }

    async search(fen, options) {
      await this.init();

      if (this.current) {
        throw new EngineBusyError('Stockfish is already searching another position.');
      }
      if (typeof fen !== 'string' || !fen.trim()) {
        throw new Error('A FEN position is required.');
      }

      const opts = options || {};
      const multiPvOption = this._option('MultiPV');
      const multiPv = Math.max(
        1,
        Math.min(
          multiPvOption && Number.isFinite(multiPvOption.max) ? multiPvOption.max : 8,
          Math.floor(Number(opts.multiPv || 1))
        )
      );

      if (multiPvOption) {
        this._setOptionUnsafe(multiPvOption.name, multiPv);
        await this._syncReady();
      }

      this._post('position fen ' + fen.trim());

      return new Promise((resolve, reject) => {
        this.current = {
          resolve,
          reject,
          lines: new Map(),
          cancelled: false,
          onInfo: typeof opts.onInfo === 'function' ? opts.onInfo : null
        };

        this._setState('searching', 'Stockfish is thinking…');
        this._post(makeGoCommand(opts));
      });
    }

    analyze(fen, options) {
      return this.search(fen, options);
    }

    async bestMove(fen, options) {
      const result = await this.search(fen, options);
      return result.bestmove;
    }

    cancel() {
      if (!this.current || !this.worker) return false;
      this.current.cancelled = true;
      this._setState('stopping', 'Stopping Stockfish…');
      this._post('stop');
      return true;
    }

    async newGame() {
      await this.init();

      if (this.current) {
        throw new EngineBusyError('Stop the current search before starting a new game.');
      }

      this._post('ucinewgame');
      await this._syncReady();
      return true;
    }

    async ping() {
      await this.init();
      await this._syncReady();
      return {
        ok: true,
        name: this.idName || 'Stockfish 18',
        author: this.idAuthor || '',
        state: this.state
      };
    }

    terminate() {
      const stoppedError = new Error('Stockfish was stopped.');

      if (this.worker) {
        try { this.worker.postMessage('quit'); } catch (_) {}
        try { this.worker.terminate(); } catch (_) {}
      }

      this.worker = null;
      this.readyPromise = null;
      this._rejectAll(stoppedError);
      this._setState('idle', 'Stockfish is stopped.');
    }
  }

  const api = {
    BUILD_ID,
    StockfishController,
    CancelledError,
    EngineBusyError,
    parseUciOption,
    parseUciInfo,
    scoreToCp,
    formatScore,
    makeGoCommand,
    MATE_SCORE
  };

  global.TacticsStockfish = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
