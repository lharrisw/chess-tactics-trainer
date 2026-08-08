/* Chess Tactics Trainer — Build 2.0
 * Reusable Stockfish engine service + small diagnostics UI.
 *
 * This file does not implement Play vs Computer yet. It creates the engine
 * foundation that later game play, puzzle validation, post-game review,
 * opening sparring, and endgame training will reuse.
 */
(function (global) {
  'use strict';

  const BUILD_ID = 'stockfish-engine-layer-2.0';
  const SETTINGS_KEY = 'chess-tactics-stockfish-settings-v1';
  const SELF_TEST_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  if (!global.TacticsStockfish || !global.TacticsStockfish.StockfishController) {
    console.error('[Tactics Trainer] Stockfish controller is missing.');
    return;
  }

  const {
    StockfishController,
    CancelledError,
    formatScore
  } = global.TacticsStockfish;

  const listeners = new Set();

  let controller = null;
  let status = {
    state: 'idle',
    message: 'Stockfish has not been started.',
    downloadPercent: null,
    engineName: 'Stockfish 18',
    ready: false
  };

  let settings = loadSettings();

  function loadSettings() {
    const fallback = {
      hashMb: 64,
      strength: { mode: 'full' }
    };

    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (!parsed || typeof parsed !== 'object') return fallback;

      return {
        hashMb: Number(parsed.hashMb || 64),
        strength:
          parsed.strength && typeof parsed.strength === 'object'
            ? parsed.strength
            : { mode: 'full' }
      };
    } catch (_) {
      return fallback;
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (_) {}
  }

  function publish(patch) {
    status = Object.assign({}, status, patch || {});

    for (const fn of listeners) {
      try { fn(Object.assign({}, status)); } catch (_) {}
    }

    updateUi();
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.add(fn);
    try { fn(Object.assign({}, status)); } catch (_) {}
    return function () { listeners.delete(fn); };
  }

  function getController() {
    if (controller) return controller;

    controller = new StockfishController({
      engineUrl: 'engine/stockfish-18-single.js',
      hashMb: settings.hashMb,
      onStatus: function (message, stateName) {
        publish({
          state: stateName || (controller ? controller.state : 'idle'),
          message: message || '',
          engineName: controller && controller.idName
            ? controller.idName
            : status.engineName,
          ready: !!(controller && controller.state === 'ready')
        });
      },
      onDownloadProgress: function (data) {
        const raw = Number(data && data.percent);
        if (!Number.isFinite(raw)) return;

        const percent = Math.max(0, Math.min(100, Math.round(raw * 100)));
        publish({
          downloadPercent: percent,
          message: percent < 100
            ? 'Downloading Stockfish engine… ' + percent + '%'
            : 'Stockfish engine downloaded. Starting…'
        });
      }
    });

    return controller;
  }

  async function applySavedStrength() {
    const c = getController();

    try {
      const applied = await c.setStrength(settings.strength || { mode: 'full' });
      settings.strength = applied;
      saveSettings();
      syncStrengthUiFromSettings();
      return applied;
    } catch (error) {
      // Full strength must always remain a usable fallback.
      settings.strength = { mode: 'full' };
      saveSettings();

      try {
        await c.setStrength({ mode: 'full' });
      } catch (_) {}

      syncStrengthUiFromSettings();
      throw error;
    }
  }

  async function init() {
    const c = getController();

    try {
      await c.init();
      await applySavedStrength();

      publish({
        state: 'ready',
        message: (c.idName || 'Stockfish 18') + ' ready.',
        downloadPercent: 100,
        engineName: c.idName || 'Stockfish 18',
        ready: true
      });

      return api;
    } catch (error) {
      publish({
        state: 'error',
        message: error && error.message ? error.message : String(error),
        ready: false
      });
      throw error;
    }
  }

  async function setStrength(config) {
    settings.strength = Object.assign({}, config || { mode: 'full' });
    saveSettings();
    syncStrengthUiFromSettings();

    // Selecting a future playing strength should not by itself force the
    // 100+ MB engine download. Apply it immediately only if the engine exists.
    if (!controller || !controller.readyPromise) {
      return Object.assign({}, settings.strength);
    }

    const applied = await controller.setStrength(settings.strength);
    settings.strength = applied;
    saveSettings();
    syncStrengthUiFromSettings();
    return Object.assign({}, applied);
  }

  function getStrength() {
    return Object.assign({}, settings.strength);
  }

  async function analyzeFen(fen, options) {
    await init();
    return getController().analyze(fen, options || {});
  }

  async function bestMove(fen, options) {
    const result = await analyzeFen(fen, options || {});
    return result.bestmove;
  }

  async function newGame() {
    await init();
    return getController().newGame();
  }

  function stop() {
    if (!controller) return false;
    return controller.cancel();
  }

  function terminate() {
    if (controller) controller.terminate();
    controller = null;

    publish({
      state: 'idle',
      message: 'Stockfish is stopped.',
      downloadPercent: null,
      engineName: 'Stockfish 18',
      ready: false
    });
  }

  async function selfTest() {
    await init();

    const c = getController();
    const previousStrength = Object.assign({}, settings.strength);

    publish({
      state: 'testing',
      message: 'Running a private Stockfish self-test on the normal starting position…',
      ready: true
    });

    try {
      await c.setStrength({ mode: 'full' });

      const result = await c.analyze(SELF_TEST_FEN, {
        depth: 10,
        multiPv: 1
      });

      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(result.bestmove || '')) {
        throw new Error('Stockfish returned an invalid best-move format.');
      }

      const first = result.lines && result.lines[0];
      const score = first && first.score ? formatScore(first.score) : '—';
      const depth = first && first.depth ? first.depth : '—';

      publish({
        state: 'ready',
        message:
          'Self-test passed · best move ' + result.bestmove +
          ' · depth ' + depth +
          ' · evaluation ' + score,
        ready: true
      });

      return {
        ok: true,
        bestmove: result.bestmove,
        depth: first ? first.depth : 0,
        score: first ? first.score : null,
        engine: result.engine
      };
    } finally {
      try {
        await c.setStrength(previousStrength);
      } catch (_) {
        settings.strength = { mode: 'full' };
        saveSettings();
      }

      syncStrengthUiFromSettings();
    }
  }

  const api = {
    build: BUILD_ID,
    engine: {
      name: 'Stockfish',
      version: '18',
      distribution: 'nmrugg/stockfish.js v18.0.0',
      flavor: 'full single-threaded WebAssembly',
      workerUrl: 'engine/stockfish-18-single.js'
    },
    init,
    subscribe,
    getStatus: function () { return Object.assign({}, status); },
    getController,
    analyzeFen,
    bestMove,
    setStrength,
    getStrength,
    newGame,
    stop,
    terminate,
    selfTest,
    CancelledError
  };

  global.ChessEngine = api;

  // -------------------------------------------------------------------------
  // Small Build 2.0 diagnostics/settings card in the existing Database pane.
  // Play vs Computer receives its own dedicated UI in Build 2.1.
  // -------------------------------------------------------------------------

  let ui = null;

  function injectStyle() {
    if (document.getElementById('ct-stockfish-2-style')) return;

    const style = document.createElement('style');
    style.id = 'ct-stockfish-2-style';
    style.textContent = `
      #sf-engine-card .sf-row{
        display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px;
      }
      #sf-engine-card .sf-row > *{ min-width:0; }
      #sf-engine-card select,
      #sf-engine-card input{
        background:#262522; color:#ddd; border:1px solid #4a4844;
        border-radius:5px; padding:8px 10px; font:inherit;
      }
      #sf-engine-card select{ flex:1 1 170px; }
      #sf-engine-card input[type="number"]{ width:110px; }
      #sf-engine-card .sf-indicator{
        display:inline-block; width:10px; height:10px; border-radius:50%;
        margin-right:6px; background:#777;
      }
      #sf-engine-card .sf-indicator.ready{ background:#81b64c; }
      #sf-engine-card .sf-indicator.busy{ background:#e3a008; }
      #sf-engine-card .sf-indicator.error{ background:#d64b4b; }
      #sf-engine-card .sf-technical{
        overflow-wrap:anywhere;
      }
      #sf-engine-card .sf-hidden{ display:none !important; }
    `;
    document.head.appendChild(style);
  }

  function buildUi() {
    if (ui) return ui;

    const pane = document.getElementById('pane-db');
    if (!pane) return null;

    injectStyle();

    const card = document.createElement('div');
    card.className = 'db-card';
    card.id = 'sf-engine-card';

    card.innerHTML = `
      <strong>Local Stockfish engine</strong>
      <div class="db-big">
        <span class="sf-indicator" id="sf-indicator"></span>
        <span id="sf-status-title">Not loaded</span>
      </div>
      <div class="db-sub" id="sf-status-message">
        Stockfish 18 is installed in the deployed site but is downloaded by your browser only when needed.
      </div>
      <div class="db-sub sf-technical">
        Full single-threaded WebAssembly · runs locally in this browser · no chess positions are sent to a server.
      </div>

      <label class="db-sub" for="sf-strength-mode" style="display:block;margin-top:10px;">
        Strength setting for future computer play
      </label>

      <div class="sf-row">
        <select id="sf-strength-mode">
          <option value="full">Full strength</option>
          <option value="elo">Elo-limited</option>
          <option value="skill">Skill level</option>
        </select>

        <input id="sf-elo" class="sf-hidden" type="number" min="1320" max="3190" step="50" value="1800" aria-label="Stockfish Elo">
        <input id="sf-skill" class="sf-hidden" type="number" min="0" max="20" step="1" value="10" aria-label="Stockfish skill level">
      </div>

      <div class="btns" style="margin-top:10px;">
        <button class="act primary" id="sf-start">Start Stockfish 18</button>
        <button class="act" id="sf-test">Run self-test</button>
        <button class="act" id="sf-stop">Stop engine</button>
      </div>

      <div class="feedback neutral" id="sf-feedback" style="margin-top:8px;">
        Build 2.0 engine foundation. The self-test uses the standard starting position and cannot reveal a puzzle solution.
      </div>

      <div class="note">
        First launch may be a large download. Later builds reuse this same engine for Play vs Computer, objective move checking, game review, opening sparring, and endgames.
      </div>
    `;

    // Put the engine card near the top of Database without disrupting its
    // existing cloud/local database controls.
    const firstCard = pane.querySelector('.db-card');
    if (firstCard) firstCard.insertAdjacentElement('afterend', card);
    else pane.insertAdjacentElement('afterbegin', card);

    ui = {
      card,
      indicator: card.querySelector('#sf-indicator'),
      title: card.querySelector('#sf-status-title'),
      message: card.querySelector('#sf-status-message'),
      feedback: card.querySelector('#sf-feedback'),
      start: card.querySelector('#sf-start'),
      test: card.querySelector('#sf-test'),
      stop: card.querySelector('#sf-stop'),
      mode: card.querySelector('#sf-strength-mode'),
      elo: card.querySelector('#sf-elo'),
      skill: card.querySelector('#sf-skill')
    };

    ui.start.addEventListener('click', async function () {
      ui.start.disabled = true;
      try {
        await init();
      } catch (error) {
        ui.feedback.textContent = error && error.message ? error.message : String(error);
        ui.feedback.className = 'feedback bad';
      } finally {
        ui.start.disabled = false;
      }
    });

    ui.test.addEventListener('click', async function () {
      ui.test.disabled = true;
      try {
        const result = await selfTest();
        ui.feedback.textContent =
          'Self-test passed. ' + (result.engine || 'Stockfish 18') +
          ' returned ' + result.bestmove + ' at depth ' + result.depth + '.';
        ui.feedback.className = 'feedback good';
      } catch (error) {
        ui.feedback.textContent = error && error.message ? error.message : String(error);
        ui.feedback.className = 'feedback bad';
      } finally {
        ui.test.disabled = false;
      }
    });

    ui.stop.addEventListener('click', function () {
      terminate();
      ui.feedback.textContent = 'Stockfish stopped. It will start again automatically when a future feature needs it.';
      ui.feedback.className = 'feedback neutral';
    });

    ui.mode.addEventListener('change', async function () {
      syncStrengthInputs();

      const cfg = readStrengthFromUi();
      try {
        const applied = await setStrength(cfg);
        ui.feedback.textContent = describeStrength(applied) + ' saved.';
        ui.feedback.className = 'feedback good';
      } catch (error) {
        ui.feedback.textContent = error && error.message ? error.message : String(error);
        ui.feedback.className = 'feedback bad';
      }
    });

    for (const input of [ui.elo, ui.skill]) {
      input.addEventListener('change', async function () {
        const cfg = readStrengthFromUi();
        try {
          const applied = await setStrength(cfg);
          ui.feedback.textContent = describeStrength(applied) + ' saved.';
          ui.feedback.className = 'feedback good';
        } catch (error) {
          ui.feedback.textContent = error && error.message ? error.message : String(error);
          ui.feedback.className = 'feedback bad';
        }
      });
    }

    syncStrengthUiFromSettings();
    updateUi();
    return ui;
  }

  function describeStrength(cfg) {
    if (!cfg || cfg.mode === 'full') return 'Full strength';
    if (cfg.mode === 'elo') return 'Elo-limited strength ' + cfg.elo;
    if (cfg.mode === 'skill') return 'Skill level ' + cfg.skill;
    return 'Strength';
  }

  function readStrengthFromUi() {
    if (!ui) return Object.assign({}, settings.strength);

    if (ui.mode.value === 'elo') {
      return { mode: 'elo', elo: Number(ui.elo.value || 1800) };
    }
    if (ui.mode.value === 'skill') {
      return { mode: 'skill', skill: Number(ui.skill.value || 10) };
    }
    return { mode: 'full' };
  }

  function syncStrengthInputs() {
    if (!ui) return;

    ui.elo.classList.toggle('sf-hidden', ui.mode.value !== 'elo');
    ui.skill.classList.toggle('sf-hidden', ui.mode.value !== 'skill');
  }

  function syncStrengthUiFromSettings() {
    if (!ui) return;

    const cfg = settings.strength || { mode: 'full' };
    ui.mode.value = ['full', 'elo', 'skill'].includes(cfg.mode) ? cfg.mode : 'full';

    if (cfg.elo != null) ui.elo.value = String(cfg.elo);
    if (cfg.skill != null) ui.skill.value = String(cfg.skill);

    if (controller) {
      const elo = controller.getOption('UCI_Elo');
      if (elo) {
        if (Number.isFinite(elo.min)) ui.elo.min = String(elo.min);
        if (Number.isFinite(elo.max)) ui.elo.max = String(elo.max);
      }

      const skill = controller.getOption('Skill Level');
      if (skill) {
        if (Number.isFinite(skill.min)) ui.skill.min = String(skill.min);
        if (Number.isFinite(skill.max)) ui.skill.max = String(skill.max);
      }
    }

    syncStrengthInputs();
  }

  function updateUi() {
    if (!ui) return;

    const state = status.state || 'idle';
    const ready = !!status.ready;

    ui.indicator.classList.remove('ready', 'busy', 'error');

    if (state === 'ready') ui.indicator.classList.add('ready');
    else if (state === 'error') ui.indicator.classList.add('error');
    else if (state !== 'idle') ui.indicator.classList.add('busy');

    if (state === 'ready') ui.title.textContent = 'Ready';
    else if (state === 'searching') ui.title.textContent = 'Thinking';
    else if (state === 'testing') ui.title.textContent = 'Testing';
    else if (state === 'starting') ui.title.textContent = 'Starting';
    else if (state === 'error') ui.title.textContent = 'Engine error';
    else ui.title.textContent = 'Not loaded';

    ui.message.textContent = status.message || '—';
    ui.stop.disabled = !controller;
    syncStrengthUiFromSettings();
  }

  // The engine binary stays lazy: creating the card does NOT call init().
  buildUi();

  console.info('[Tactics Trainer] Loaded ' + BUILD_ID);
}(typeof globalThis !== 'undefined' ? globalThis : this));
