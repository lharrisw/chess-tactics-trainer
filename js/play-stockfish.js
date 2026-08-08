/* Chess Tactics Trainer — Build 2.1
 * Play vs Stockfish
 *
 * Depends on:
 *   - the existing page's Engine(), drawBoard(), boardEl, shellEl, S, onSquare
 *   - Build 2.0 window.ChessEngine
 *
 * The module dynamically adds a Play tab and leaves the puzzle source intact.
 */
(function (global) {
  'use strict';

  const BUILD_ID = 'play-vs-stockfish-2.1';
  const SETTINGS_KEY = 'chess-tactics-play-stockfish-v1';
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const Core = {
    BUILD_ID,

    clamp(value, min, max) {
      const n = Number(value);
      if (!Number.isFinite(n)) return min;
      return Math.max(min, Math.min(max, n));
    },

    parseTimeControl(value, customMinutes, customIncrement) {
      const raw = String(value || '10+0');
      if (raw === 'untimed') {
        return {
          enabled: false,
          initialMs: 0,
          incrementMs: 0,
          label: 'Untimed',
          pgn: '-'
        };
      }

      let minutes;
      let increment;

      if (raw === 'custom') {
        minutes = Core.clamp(customMinutes, 0.25, 180);
        increment = Core.clamp(customIncrement, 0, 120);
      } else {
        const match = raw.match(/^(\d+(?:\.\d+)?)\+(\d+(?:\.\d+)?)$/);
        if (!match) throw new Error('Invalid time control.');
        minutes = Number(match[1]);
        increment = Number(match[2]);
      }

      const initialMs = Math.round(minutes * 60 * 1000);
      const incrementMs = Math.round(increment * 1000);

      return {
        enabled: true,
        initialMs,
        incrementMs,
        label: String(minutes).replace(/\.0$/, '') + '+' + String(increment).replace(/\.0$/, ''),
        pgn: Math.round(minutes * 60) + '+' + Math.round(increment)
      };
    },

    formatClock(ms) {
      const safe = Math.max(0, Number(ms) || 0);
      const totalTenths = Math.floor(safe / 100);
      const minutes = Math.floor(totalTenths / 600);
      const seconds = Math.floor((totalTenths % 600) / 10);
      const tenths = totalTenths % 10;

      if (safe < 20000) {
        return minutes + ':' + String(seconds).padStart(2, '0') + '.' + tenths;
      }
      return minutes + ':' + String(seconds).padStart(2, '0');
    },

    positionKey(fen) {
      return String(fen || '').trim().split(/\s+/).slice(0, 4).join(' ');
    },

    winnerResult(color) {
      if (color === 'w') return '1-0';
      if (color === 'b') return '0-1';
      return '1/2-1/2';
    },

    other(color) {
      return color === 'w' ? 'b' : 'w';
    },

    squareName(index) {
      return 'abcdefgh'[index & 7] + ((index >> 3) + 1);
    },

    dateForPgn(date) {
      const d = date || new Date();
      return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0')
      ].join('.');
    },

    pgn(meta, moves, result, termination) {
      const m = meta || {};
      const finalResult = result || '*';
      const headers = [
        ['Event', m.event || 'Play vs Stockfish'],
        ['Site', m.site || 'Chess Tactics Trainer'],
        ['Date', m.date || Core.dateForPgn()],
        ['Round', '-'],
        ['White', m.white || 'White'],
        ['Black', m.black || 'Black'],
        ['Result', finalResult],
        ['TimeControl', m.timeControl || '-'],
        ['Mode', m.mode || 'Training'],
        ['Termination', termination || 'Unfinished']
      ];

      const headerText = headers
        .map(([key, value]) => '[' + key + ' "' + String(value).replace(/"/g, "'") + '"]')
        .join('\n');

      const tokens = [];
      for (let i = 0; i < moves.length; i += 1) {
        if (i % 2 === 0) tokens.push((i / 2 + 1) + '.');
        tokens.push(moves[i].san);
      }
      tokens.push(finalResult);

      const lines = [];
      let line = '';
      for (const token of tokens) {
        if (!line) {
          line = token;
        } else if (line.length + token.length + 1 > 78) {
          lines.push(line);
          line = token;
        } else {
          line += ' ' + token;
        }
      }
      if (line) lines.push(line);

      return headerText + '\n\n' + lines.join('\n') + '\n';
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Core;
  }

  if (typeof document === 'undefined') return;

  if (document.getElementById('tab-play')) {
    console.info('[Tactics Trainer] ' + BUILD_ID + ' already installed.');
    return;
  }

  if (typeof Engine !== 'function' || typeof drawBoard !== 'function') {
    console.error('[Tactics Trainer] Build 2.1 cannot find the base chess board engine.');
    return;
  }

  if (!global.ChessEngine) {
    console.error('[Tactics Trainer] Build 2.1 requires the Build 2.0 Stockfish engine layer.');
    return;
  }

  const DEFAULT_SETTINGS = {
    side: 'white',
    strength: 'elo:1800',
    mode: 'training',
    time: '10+0',
    customMinutes: 10,
    customIncrement: 0,
    animation: 'normal',
    coordinates: true,
    legalDots: true,
    lastMove: true,
    sounds: true,
    autoQueen: true,
    drag: true
  };

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      return Object.assign({}, DEFAULT_SETTINGS, saved && typeof saved === 'object' ? saved : {});
    } catch (_) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(P.settings));
    } catch (_) {}
  }

  const P = {
    active: false,
    phase: 'setup',
    eng: null,
    gameOver: false,
    thinking: false,
    searchToken: 0,
    playerColor: 'w',
    computerColor: 'b',
    settings: loadSettings(),
    timeControl: Core.parseTimeControl('10+0'),
    clocks: { w: 0, b: 0 },
    clockSide: null,
    clockStartedAt: 0,
    timer: null,
    history: [],
    halfmoveClock: 0,
    positionKeys: [],
    repetitions: new Map(),
    result: '*',
    termination: 'Unfinished',
    userMoveCount: 0,
    lastMove: null,
    pendingPromotion: null,
    suppressClickUntil: 0,
    status: 'Choose your settings and start a game.',
    startedAt: null,
    audio: null
  };

  let ui = null;
  let topClockWrap = null;
  let bottomClockWrap = null;

  const baseActivateTab = activateTab;
  const baseOnSquare = onSquare;

  function injectStyle() {
    if (document.getElementById('ct-play-2-1-style')) return;

    const style = document.createElement('style');
    style.id = 'ct-play-2-1-style';
    style.textContent = `
      .tabs{overflow-x:auto;}
      .tabs .tab{min-width:70px;white-space:nowrap;}
      #pane-play .play-grid{
        display:grid;grid-template-columns:1fr 1fr;gap:8px;
      }
      #pane-play .play-field{display:flex;flex-direction:column;gap:5px;}
      #pane-play .play-field.wide{grid-column:1/-1;}
      #pane-play label{
        color:var(--muted);font-size:.72rem;font-weight:650;
      }
      #pane-play select,#pane-play input[type=number]{
        font-family:inherit;background:var(--panel2);color:var(--text);
        border:1px solid var(--line);border-radius:7px;padding:9px 10px;
        font-size:.84rem;width:100%;
      }
      #pane-play .play-options{
        display:grid;grid-template-columns:1fr 1fr;gap:7px;
      }
      #pane-play .play-check{
        display:flex;align-items:center;gap:7px;background:var(--panel2);
        border-radius:7px;padding:8px;font-size:.76rem;color:var(--text);
      }
      #pane-play .play-check input{accent-color:var(--green);}
      #pane-play .play-summary{
        background:var(--panel2);border-radius:8px;padding:10px 12px;
      }
      #pane-play .play-title{font-weight:800;font-size:1rem;}
      #pane-play .play-meta{color:var(--muted);font-size:.75rem;margin-top:4px;line-height:1.45;}
      #pane-play .play-thinking{
        color:var(--green-hi);font-size:.8rem;font-weight:700;min-height:18px;
      }
      #play-moves{max-height:190px;}
      #play-moves .move-pair{
        display:grid;grid-template-columns:34px 1fr 1fr;gap:4px;
      }
      #play-moves .move-no{color:var(--muted);}
      #play-moves .move-san{color:var(--text);}
      #play-promotion{
        position:absolute;inset:0;z-index:20;display:flex;align-items:center;
        justify-content:center;background:rgba(0,0,0,.56);
      }
      #play-promotion.hidden{display:none!important;}
      #play-promotion .promo-box{
        background:var(--panel);border:1px solid var(--line);border-radius:10px;
        padding:12px;box-shadow:0 12px 40px rgba(0,0,0,.5);
      }
      #play-promotion .promo-title{
        font-size:.8rem;color:var(--muted);text-align:center;margin-bottom:8px;
      }
      #play-promotion .promo-pieces{display:flex;gap:7px;}
      #play-promotion button{
        width:58px;height:58px;border:1px solid var(--line);border-radius:7px;
        background:var(--panel2);cursor:pointer;padding:4px;
      }
      #play-promotion button svg{width:100%;height:100%;}
      .play-clock{
        display:none;background:#211f1c;border:1px solid var(--line);
        border-radius:8px;padding:8px 11px;align-items:center;justify-content:space-between;
        min-height:44px;
      }
      .play-clock.visible{display:flex;}
      .play-clock .play-clock-name{font-weight:700;font-size:.82rem;}
      .play-clock .play-clock-time{
        font-variant-numeric:tabular-nums;font-size:1.35rem;font-weight:850;
      }
      .play-clock.active{outline:2px solid var(--green);outline-offset:-2px;}
      .play-clock.low .play-clock-time{color:var(--bad);}
      #board.ct-hide-coordinates .co{display:none!important;}
      #board.ct-hide-legal .hint{display:none!important;}
      #board.ct-hide-last .sq.last::before{display:none!important;}
      #board .ct-moving-piece{
        position:absolute;z-index:30;pointer-events:none;will-change:transform;
      }
      #board .ct-moving-piece svg{width:100%;height:100%;display:block;
        filter:drop-shadow(0 2px 2px rgba(0,0,0,.28));}
      #board.ct-drag-enabled .sq.play{cursor:grab;}
      #board.ct-drag-enabled .sq.play:active{cursor:grabbing;}
      @media(max-width:620px){
        #pane-play .play-grid{grid-template-columns:1fr;}
        #pane-play .play-field.wide{grid-column:auto;}
      }
    `;
    document.head.appendChild(style);
  }

  function createUi() {
    injectStyle();

    const tabs = document.querySelector('.tabs');
    const dbTab = document.getElementById('tab-db');
    const dbPane = document.getElementById('pane-db');

    const tab = document.createElement('button');
    tab.className = 'tab';
    tab.id = 'tab-play';
    tab.textContent = 'Play';
    tabs.insertBefore(tab, dbTab);

    const pane = document.createElement('div');
    pane.className = 'body hidden';
    pane.id = 'pane-play';
    pane.innerHTML = `
      <div id="play-setup">
        <div class="play-summary">
          <div class="play-title">Play Stockfish 18</div>
          <div class="play-meta">
            Full legal game · local browser engine · clocks · takebacks in Training mode · PGN export.
          </div>
        </div>

        <div class="play-grid">
          <div class="play-field">
            <label for="play-side">Your side</label>
            <select id="play-side">
              <option value="white">White</option>
              <option value="black">Black</option>
              <option value="random">Random</option>
            </select>
          </div>

          <div class="play-field">
            <label for="play-mode">Game mode</label>
            <select id="play-mode">
              <option value="training">Training</option>
              <option value="tournament">Tournament</option>
            </select>
          </div>

          <div class="play-field">
            <label for="play-strength">Stockfish strength</label>
            <select id="play-strength">
              <optgroup label="Elo-limited">
                <option value="elo:1320">1320</option>
                <option value="elo:1500">1500</option>
                <option value="elo:1700">1700</option>
                <option value="elo:1800">1800</option>
                <option value="elo:1900">1900</option>
                <option value="elo:2100">2100</option>
                <option value="elo:2300">2300</option>
                <option value="elo:2500">2500</option>
                <option value="elo:2800">2800</option>
                <option value="elo:3190">3190</option>
              </optgroup>
              <optgroup label="Skill level">
                <option value="skill:0">Skill 0</option>
                <option value="skill:5">Skill 5</option>
                <option value="skill:10">Skill 10</option>
                <option value="skill:15">Skill 15</option>
                <option value="skill:20">Skill 20</option>
              </optgroup>
              <option value="full">Full strength</option>
            </select>
          </div>

          <div class="play-field">
            <label for="play-time">Time control</label>
            <select id="play-time">
              <option value="untimed">Untimed</option>
              <option value="1+0">1+0</option>
              <option value="1+1">1+1</option>
              <option value="3+0">3+0</option>
              <option value="3+2">3+2</option>
              <option value="5+0">5+0</option>
              <option value="5+5">5+5</option>
              <option value="10+0">10+0</option>
              <option value="10+5">10+5</option>
              <option value="15+10">15+10</option>
              <option value="30+20">30+20</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div class="play-field play-custom-time hidden">
            <label for="play-custom-minutes">Minutes</label>
            <input id="play-custom-minutes" type="number" min="0.25" max="180" step="0.25">
          </div>

          <div class="play-field play-custom-time hidden">
            <label for="play-custom-increment">Increment (seconds)</label>
            <input id="play-custom-increment" type="number" min="0" max="120" step="1">
          </div>

          <div class="play-field">
            <label for="play-animation">Piece animation</label>
            <select id="play-animation">
              <option value="off">Off</option>
              <option value="fast">Fast</option>
              <option value="normal">Normal</option>
              <option value="slow">Slow</option>
            </select>
          </div>
        </div>

        <div class="play-options">
          <label class="play-check"><input id="play-coordinates" type="checkbox"> Coordinates</label>
          <label class="play-check"><input id="play-legal-dots" type="checkbox"> Legal-move dots</label>
          <label class="play-check"><input id="play-last-move" type="checkbox"> Last-move highlight</label>
          <label class="play-check"><input id="play-sounds" type="checkbox"> Move sounds</label>
          <label class="play-check"><input id="play-autoqueen" type="checkbox"> Auto-queen</label>
          <label class="play-check"><input id="play-drag" type="checkbox"> Drag pieces</label>
        </div>

        <button class="act primary wide" id="play-start">Start game</button>

        <div class="note">
          Training mode allows takebacks. Tournament mode disables takebacks. No evaluation bar or hidden engine line is shown during play.
        </div>
      </div>

      <div id="play-game" class="hidden">
        <div class="play-summary">
          <div class="play-title" id="play-game-title">You vs Stockfish 18</div>
          <div class="play-meta" id="play-game-meta"></div>
        </div>

        <div class="feedback neutral" id="play-status">Game ready.</div>
        <div class="play-thinking" id="play-thinking"></div>

        <div class="movelist" id="play-moves"></div>

        <div class="btns">
          <button class="act" id="play-takeback">Take back</button>
          <button class="act" id="play-draw">Offer draw</button>
          <button class="act" id="play-flip">Flip board</button>
          <button class="act" id="play-resign">Resign</button>
          <button class="act wide" id="play-export">Export PGN</button>
        </div>

        <div class="btns hidden" id="play-after-buttons">
          <button class="act primary" id="play-rematch">Rematch</button>
          <button class="act" id="play-new-settings">New settings</button>
        </div>
      </div>
    `;

    dbPane.parentNode.insertBefore(pane, dbPane);

    const boardCol = shellEl.parentNode;

    topClockWrap = document.createElement('div');
    topClockWrap.className = 'play-clock';
    topClockWrap.id = 'play-top-clock';
    topClockWrap.innerHTML =
      '<span class="play-clock-name"></span><span class="play-clock-time">0:00</span>';
    boardCol.insertBefore(topClockWrap, shellEl);

    bottomClockWrap = document.createElement('div');
    bottomClockWrap.className = 'play-clock';
    bottomClockWrap.id = 'play-bottom-clock';
    bottomClockWrap.innerHTML =
      '<span class="play-clock-name"></span><span class="play-clock-time">0:00</span>';
    shellEl.insertAdjacentElement('afterend', bottomClockWrap);

    const promo = document.createElement('div');
    promo.id = 'play-promotion';
    promo.className = 'hidden';
    promo.innerHTML = `
      <div class="promo-box">
        <div class="promo-title">Choose promotion</div>
        <div class="promo-pieces"></div>
      </div>
    `;
    shellEl.appendChild(promo);

    ui = {
      tab,
      pane,
      setup: pane.querySelector('#play-setup'),
      game: pane.querySelector('#play-game'),
      side: pane.querySelector('#play-side'),
      mode: pane.querySelector('#play-mode'),
      strength: pane.querySelector('#play-strength'),
      time: pane.querySelector('#play-time'),
      customRows: Array.from(pane.querySelectorAll('.play-custom-time')),
      customMinutes: pane.querySelector('#play-custom-minutes'),
      customIncrement: pane.querySelector('#play-custom-increment'),
      animation: pane.querySelector('#play-animation'),
      coordinates: pane.querySelector('#play-coordinates'),
      legalDots: pane.querySelector('#play-legal-dots'),
      lastMove: pane.querySelector('#play-last-move'),
      sounds: pane.querySelector('#play-sounds'),
      autoQueen: pane.querySelector('#play-autoqueen'),
      drag: pane.querySelector('#play-drag'),
      start: pane.querySelector('#play-start'),
      title: pane.querySelector('#play-game-title'),
      meta: pane.querySelector('#play-game-meta'),
      status: pane.querySelector('#play-status'),
      thinking: pane.querySelector('#play-thinking'),
      moves: pane.querySelector('#play-moves'),
      takeback: pane.querySelector('#play-takeback'),
      draw: pane.querySelector('#play-draw'),
      flip: pane.querySelector('#play-flip'),
      resign: pane.querySelector('#play-resign'),
      export: pane.querySelector('#play-export'),
      after: pane.querySelector('#play-after-buttons'),
      rematch: pane.querySelector('#play-rematch'),
      newSettings: pane.querySelector('#play-new-settings'),
      promo,
      promoPieces: promo.querySelector('.promo-pieces')
    };

    bindUi();
    syncSetupUi();
    showSetupPreview();
  }

  function bindUi() {
    ui.tab.addEventListener('click', function () {
      activateTab('play');
    });

    const setupFields = [
      ui.side, ui.mode, ui.strength, ui.time, ui.customMinutes,
      ui.customIncrement, ui.animation, ui.coordinates, ui.legalDots,
      ui.lastMove, ui.sounds, ui.autoQueen, ui.drag
    ];

    for (const field of setupFields) {
      field.addEventListener('change', function () {
        readSettingsFromUi();
        saveSettings();
        updateCustomTimeVisibility();
        applyBoardPreferenceClasses();
        if (P.phase === 'setup' && P.active) showSetupPreview();
      });
    }

    ui.start.addEventListener('click', function () {
      startGame(false);
    });

    ui.takeback.addEventListener('click', takeBack);
    ui.draw.addEventListener('click', offerDraw);
    ui.flip.addEventListener('click', function () {
      S.flipped = !S.flipped;
      renderPlayBoard();
    });
    ui.resign.addEventListener('click', resign);
    ui.export.addEventListener('click', exportPgn);
    ui.rematch.addEventListener('click', function () {
      startGame(true);
    });
    ui.newSettings.addEventListener('click', returnToSettings);

    document.addEventListener('visibilitychange', function () {
      if (P.phase === 'playing' && !P.gameOver) {
        syncClock();
        renderClocks();
      }
    });
  }

  function syncSetupUi() {
    const s = P.settings;
    ui.side.value = s.side;
    ui.mode.value = s.mode;
    ui.strength.value = s.strength;
    ui.time.value = s.time;
    ui.customMinutes.value = s.customMinutes;
    ui.customIncrement.value = s.customIncrement;
    ui.animation.value = s.animation;
    ui.coordinates.checked = !!s.coordinates;
    ui.legalDots.checked = !!s.legalDots;
    ui.lastMove.checked = !!s.lastMove;
    ui.sounds.checked = !!s.sounds;
    ui.autoQueen.checked = !!s.autoQueen;
    ui.drag.checked = !!s.drag;
    updateCustomTimeVisibility();
  }

  function readSettingsFromUi() {
    P.settings = {
      side: ui.side.value,
      mode: ui.mode.value,
      strength: ui.strength.value,
      time: ui.time.value,
      customMinutes: Number(ui.customMinutes.value || 10),
      customIncrement: Number(ui.customIncrement.value || 0),
      animation: ui.animation.value,
      coordinates: ui.coordinates.checked,
      legalDots: ui.legalDots.checked,
      lastMove: ui.lastMove.checked,
      sounds: ui.sounds.checked,
      autoQueen: ui.autoQueen.checked,
      drag: ui.drag.checked
    };
  }

  function updateCustomTimeVisibility() {
    const show = ui.time.value === 'custom';
    for (const row of ui.customRows) row.classList.toggle('hidden', !show);
  }

  activateTab = function (name) {
    if (name === 'play') {
      for (const n of ['lib', 'game', 'db']) {
        const tab = document.getElementById('tab-' + n);
        const pane = document.getElementById('pane-' + n);
        if (tab) tab.classList.remove('active');
        if (pane) pane.classList.add('hidden');
      }
      ui.tab.classList.add('active');
      ui.pane.classList.remove('hidden');
      P.active = true;
      S.active = false;
      updateClockVisibility();
      if (P.phase === 'setup') showSetupPreview();
      else renderPlayBoard();
      return;
    }

    P.active = false;
    ui.tab.classList.remove('active');
    ui.pane.classList.add('hidden');
    hidePromotion();
    updateClockVisibility();
    baseActivateTab(name);
  };

  onSquare = function (index) {
    if (P.active) {
      playSquare(index);
      return;
    }
    baseOnSquare(index);
  };

  function showSetupPreview() {
    const e = Engine();
    e.startpos();
    P.eng = P.phase === 'setup' ? e : P.eng;

    const side = P.settings.side === 'black' ? 'b' : 'w';
    S.flipped = side === 'b';
    S.selected = null;
    S.targets = [];
    S.solved = false;
    drawBoard(e, { selectable: false });
    applyBoardPreferenceClasses();
  }

  function strengthConfig(value) {
    const raw = String(value || 'full');
    if (raw === 'full') return { mode: 'full' };

    const parts = raw.split(':');
    if (parts[0] === 'elo') return { mode: 'elo', elo: Number(parts[1]) };
    if (parts[0] === 'skill') return { mode: 'skill', skill: Number(parts[1]) };

    return { mode: 'full' };
  }

  function strengthLabel(value) {
    const cfg = strengthConfig(value);
    if (cfg.mode === 'elo') return 'Elo ' + cfg.elo;
    if (cfg.mode === 'skill') return 'Skill ' + cfg.skill;
    return 'Full strength';
  }

  function choosePlayerColor(side, rematch) {
    if (rematch && P.playerColor) return Core.other(P.playerColor);
    if (side === 'black') return 'b';
    if (side === 'random') return Math.random() < 0.5 ? 'w' : 'b';
    return 'w';
  }

  async function startGame(rematch) {
    if (P.phase === 'playing' && !P.gameOver) return;

    readSettingsFromUi();
    saveSettings();

    let tc;
    try {
      tc = Core.parseTimeControl(
        P.settings.time,
        P.settings.customMinutes,
        P.settings.customIncrement
      );
    } catch (error) {
      setStatus(error.message || String(error), 'bad');
      return;
    }

    ui.start.disabled = true;
    ui.start.textContent = 'Starting Stockfish…';

    try {
      setStatus('Starting Stockfish 18…', 'neutral');
      await global.ChessEngine.init();
      await global.ChessEngine.setStrength(strengthConfig(P.settings.strength));
      await global.ChessEngine.newGame();
    } catch (error) {
      setStatus('Stockfish could not start: ' + (error.message || String(error)), 'bad');
      ui.start.disabled = false;
      ui.start.textContent = 'Start game';
      return;
    }

    P.searchToken += 1;
    P.phase = 'playing';
    P.gameOver = false;
    P.thinking = false;
    P.result = '*';
    P.termination = 'Unfinished';
    P.status = '';
    P.startedAt = new Date();
    P.playerColor = choosePlayerColor(P.settings.side, !!rematch);
    P.computerColor = Core.other(P.playerColor);
    P.timeControl = tc;
    P.clocks = {
      w: tc.enabled ? tc.initialMs : 0,
      b: tc.enabled ? tc.initialMs : 0
    };
    P.clockSide = null;
    P.history = [];
    P.halfmoveClock = 0;
    P.positionKeys = [];
    P.repetitions = new Map();
    P.userMoveCount = 0;
    P.lastMove = null;
    P.pendingPromotion = null;

    P.eng = Engine();
    P.eng.startpos();

    const initialKey = Core.positionKey(P.eng.toFEN());
    P.positionKeys.push(initialKey);
    P.repetitions.set(initialKey, 1);

    S.flipped = P.playerColor === 'b';
    S.selected = null;
    S.targets = [];
    S.solved = false;
    S.active = false;

    ui.setup.classList.add('hidden');
    ui.game.classList.remove('hidden');
    ui.after.classList.add('hidden');

    ui.title.textContent =
      (P.playerColor === 'w' ? 'You (White)' : 'You (Black)') +
      ' vs Stockfish 18';

    ui.meta.textContent =
      (P.settings.mode === 'training' ? 'Training' : 'Tournament') +
      ' · ' + strengthLabel(P.settings.strength) +
      ' · ' + P.timeControl.label;

    ui.start.disabled = false;
    ui.start.textContent = 'Start game';

    ensureAudio();
    updateClockVisibility();
    renderMoveList();
    renderControls();
    renderPlayBoard();

    startClock('w');

    if (P.eng.turn() === P.computerColor) {
      setStatus('Stockfish to move.', 'neutral');
      requestComputerMove();
    } else {
      setStatus('Your move.', 'neutral');
    }
  }

  function returnToSettings() {
    cancelEngineSearch();
    pauseClock();

    P.phase = 'setup';
    P.gameOver = false;
    P.thinking = false;

    ui.game.classList.add('hidden');
    ui.setup.classList.remove('hidden');
    ui.after.classList.add('hidden');

    updateClockVisibility();
    syncSetupUi();
    showSetupPreview();
  }

  function updateClockVisibility() {
    const visible = P.active && P.phase === 'playing' && P.timeControl.enabled;
    topClockWrap.classList.toggle('visible', visible);
    bottomClockWrap.classList.toggle('visible', visible);
    if (visible) renderClocks();
  }

  function clockName(color) {
    return color === P.playerColor
      ? 'You · ' + (color === 'w' ? 'White' : 'Black')
      : 'Stockfish 18 · ' + (color === 'w' ? 'White' : 'Black');
  }

  function renderClocks() {
    if (!P.timeControl.enabled) return;

    const topColor = P.playerColor === 'w' ? 'b' : 'w';
    const bottomColor = P.playerColor;

    const topName = topClockWrap.querySelector('.play-clock-name');
    const topTime = topClockWrap.querySelector('.play-clock-time');
    const bottomName = bottomClockWrap.querySelector('.play-clock-name');
    const bottomTime = bottomClockWrap.querySelector('.play-clock-time');

    topName.textContent = clockName(topColor);
    bottomName.textContent = clockName(bottomColor);
    topTime.textContent = Core.formatClock(P.clocks[topColor]);
    bottomTime.textContent = Core.formatClock(P.clocks[bottomColor]);

    topClockWrap.classList.toggle('active', P.clockSide === topColor);
    bottomClockWrap.classList.toggle('active', P.clockSide === bottomColor);
    topClockWrap.classList.toggle('low', P.clocks[topColor] < 20000);
    bottomClockWrap.classList.toggle('low', P.clocks[bottomColor] < 20000);
  }

  function now() {
    return typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  }

  function startClock(color) {
    if (!P.timeControl.enabled || P.gameOver) return;

    P.clockSide = color;
    P.clockStartedAt = now();

    if (!P.timer) {
      P.timer = setInterval(function () {
        if (P.phase !== 'playing' || P.gameOver || !P.timeControl.enabled) return;
        syncClock();
        renderClocks();
      }, 100);
    }

    renderClocks();
  }

  function syncClock() {
    if (!P.timeControl.enabled || !P.clockSide || P.gameOver) return;

    const current = now();
    const elapsed = Math.max(0, current - P.clockStartedAt);
    P.clockStartedAt = current;
    P.clocks[P.clockSide] -= elapsed;

    if (P.clocks[P.clockSide] <= 0) {
      P.clocks[P.clockSide] = 0;
      const flagger = P.clockSide;
      P.clockSide = null;
      renderClocks();

      const winner = Core.other(flagger);
      endGame(Core.winnerResult(winner), 'Time forfeit');
    }
  }

  function pauseClock() {
    syncClock();
    P.clockSide = null;
    renderClocks();
  }

  function animationMs() {
    if (!P.active) return 0;
    if (P.settings.animation === 'off') return 0;
    if (P.settings.animation === 'fast') return 90;
    if (P.settings.animation === 'slow') return 320;
    return 175;
  }

  function cellForIndex(index) {
    const file = index & 7;
    const rank = index >> 3;
    const row = S.flipped ? rank : 7 - rank;
    const col = S.flipped ? 7 - file : file;
    return boardEl.children[row * 8 + col] || null;
  }

  function captureAnimation(index) {
    const duration = animationMs();
    if (!duration || !P.active) return null;

    const cell = cellForIndex(index);
    const piece = cell && cell.querySelector('.pc');
    if (!piece) return null;

    const boardRect = boardEl.getBoundingClientRect();
    const rect = cell.getBoundingClientRect();

    return {
      duration,
      html: piece.innerHTML,
      left: rect.left - boardRect.left,
      top: rect.top - boardRect.top,
      width: rect.width,
      height: rect.height
    };
  }

  function animateTo(snapshot, destinationIndex) {
    if (!snapshot || !P.active) return Promise.resolve();

    const destination = cellForIndex(destinationIndex);
    if (!destination) return Promise.resolve();

    const boardRect = boardEl.getBoundingClientRect();
    const destRect = destination.getBoundingClientRect();
    const destPiece = destination.querySelector('.pc');

    const overlay = document.createElement('div');
    overlay.className = 'ct-moving-piece';
    overlay.innerHTML = snapshot.html;
    overlay.style.left = snapshot.left + 'px';
    overlay.style.top = snapshot.top + 'px';
    overlay.style.width = snapshot.width + 'px';
    overlay.style.height = snapshot.height + 'px';
    overlay.style.transition = 'transform ' + snapshot.duration + 'ms ease-out';

    if (destPiece) destPiece.style.visibility = 'hidden';
    boardEl.appendChild(overlay);

    const dx = destRect.left - boardRect.left - snapshot.left;
    const dy = destRect.top - boardRect.top - snapshot.top;

    return new Promise(resolve => {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          overlay.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        });
      });

      setTimeout(function () {
        overlay.remove();
        if (destPiece && destPiece.isConnected) destPiece.style.visibility = '';
        resolve();
      }, snapshot.duration + 25);
    });
  }

  function applyBoardPreferenceClasses() {
    if (!boardEl) return;
    boardEl.classList.toggle('ct-hide-coordinates', !P.settings.coordinates);
    boardEl.classList.toggle('ct-hide-legal', !P.settings.legalDots);
    boardEl.classList.toggle('ct-hide-last', !P.settings.lastMove);
    boardEl.classList.toggle('ct-drag-enabled', !!P.settings.drag && P.active);
  }

  function canHumanMove() {
    return (
      P.active &&
      P.phase === 'playing' &&
      !P.gameOver &&
      !P.thinking &&
      P.eng &&
      P.eng.turn() === P.playerColor
    );
  }

  function renderPlayBoard() {
    if (!P.eng) return;

    S.active = false;
    S.solved = P.gameOver;
    S.selected = S.selected == null ? null : S.selected;
    S.targets = Array.isArray(S.targets) ? S.targets : [];

    const selectable = canHumanMove();
    drawBoard(P.eng, {
      selectable,
      last: P.settings.lastMove ? P.lastMove : null
    });

    applyBoardPreferenceClasses();
    installDragHandlers(selectable);
    renderControls();
    renderClocks();
  }

  function installDragHandlers(selectable) {
    if (!selectable || !P.settings.drag) return;

    for (let index = 0; index < 64; index += 1) {
      const cell = cellForIndex(index);
      if (!cell) continue;

      const piece = P.eng.get(index);
      if (piece && piece.c === P.playerColor) {
        cell.draggable = true;
        cell.addEventListener('dragstart', function (event) {
          if (!canHumanMove()) {
            event.preventDefault();
            return;
          }

          S.selected = index;
          S.targets = P.eng.legal().filter(m => m.from === index);
          P.suppressClickUntil = Date.now() + 150;
          try { event.dataTransfer.setData('text/plain', String(index)); } catch (_) {}
          renderPlayBoard();
        });
      }

      cell.addEventListener('dragover', function (event) {
        if (S.selected !== null) event.preventDefault();
      });

      cell.addEventListener('drop', function (event) {
        event.preventDefault();
        P.suppressClickUntil = Date.now() + 150;
        attemptHumanDestination(index);
      });
    }
  }

  function playSquare(index) {
    if (Date.now() < P.suppressClickUntil) return;
    if (!canHumanMove()) return;

    const piece = P.eng.get(index);

    if (S.selected !== null) {
      const candidates = S.targets.filter(m => m.to === index);
      if (candidates.length) {
        chooseMoveCandidate(candidates);
        return;
      }

      if (piece && piece.c === P.playerColor) {
        S.selected = index;
        S.targets = P.eng.legal().filter(m => m.from === index);
        renderPlayBoard();
        return;
      }

      S.selected = null;
      S.targets = [];
      renderPlayBoard();
      return;
    }

    if (piece && piece.c === P.playerColor) {
      S.selected = index;
      S.targets = P.eng.legal().filter(m => m.from === index);
      renderPlayBoard();
    }
  }

  function attemptHumanDestination(index) {
    if (!canHumanMove() || S.selected === null) return;
    const candidates = S.targets.filter(m => m.to === index);
    if (candidates.length) chooseMoveCandidate(candidates);
  }

  function chooseMoveCandidate(candidates) {
    if (!candidates.length) return;

    const promotions = candidates.filter(m => !!m.promo);
    if (promotions.length <= 1) {
      commitMove(candidates[0], 'user');
      return;
    }

    if (P.settings.autoQueen) {
      const queen = promotions.find(m => m.promo === 'q') || promotions[0];
      commitMove(queen, 'user');
      return;
    }

    showPromotion(promotions);
  }

  function showPromotion(moves) {
    P.pendingPromotion = moves.slice();
    ui.promoPieces.innerHTML = '';

    const color = P.playerColor;
    const order = ['q', 'r', 'b', 'n'];

    for (const type of order) {
      const move = moves.find(m => m.promo === type);
      if (!move) continue;

      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', 'Promote to ' + type);
      button.innerHTML = PIECES[(color === 'w' ? 'w' : 'b') + type.toUpperCase()];
      button.addEventListener('click', function () {
        hidePromotion();
        commitMove(move, 'user');
      });
      ui.promoPieces.appendChild(button);
    }

    ui.promo.classList.remove('hidden');
  }

  function hidePromotion() {
    if (!ui) return;
    ui.promo.classList.add('hidden');
    P.pendingPromotion = null;
  }

  function sanForMove(engine, move) {
    const piece = engine.get(move.from);
    if (!piece) return engine.uci(move);

    const legal = engine.legal();
    const capture = !!engine.get(move.to) || !!move.ep;
    let san = '';

    if (move.castle === 'K') {
      san = 'O-O';
    } else if (move.castle === 'Q') {
      san = 'O-O-O';
    } else if (piece.t === 'p') {
      if (capture) san += 'abcdefgh'[move.from & 7] + 'x';
      san += Core.squareName(move.to);
      if (move.promo) san += '=' + move.promo.toUpperCase();
    } else {
      const letter = {
        n: 'N',
        b: 'B',
        r: 'R',
        q: 'Q',
        k: 'K'
      }[piece.t] || '';

      san += letter;

      const rivals = legal.filter(other =>
        other.from !== move.from &&
        other.to === move.to &&
        engine.get(other.from) &&
        engine.get(other.from).t === piece.t
      );

      if (rivals.length) {
        const file = move.from & 7;
        const rank = move.from >> 3;
        const sameFile = rivals.some(other => (other.from & 7) === file);
        const sameRank = rivals.some(other => (other.from >> 3) === rank);

        if (!sameFile) san += 'abcdefgh'[file];
        else if (!sameRank) san += String(rank + 1);
        else san += 'abcdefgh'[file] + String(rank + 1);
      }

      if (capture) san += 'x';
      san += Core.squareName(move.to);
    }

    const rec = engine.make(move);
    if (engine.isMate()) san += '#';
    else if (engine.inCheck()) san += '+';
    engine.unmake(rec);

    return san;
  }

  function positionFen() {
    const raw = P.eng.toFEN().trim().split(/\s+/);
    const fullmove = Math.floor(P.history.length / 2) + 1;
    raw[4] = String(P.halfmoveClock);
    raw[5] = String(fullmove);
    return raw.join(' ');
  }

  function addPositionKey() {
    const key = Core.positionKey(P.eng.toFEN());
    P.positionKeys.push(key);
    P.repetitions.set(key, (P.repetitions.get(key) || 0) + 1);
    return key;
  }

  function removePositionKey(key) {
    const count = P.repetitions.get(key) || 0;
    if (count <= 1) P.repetitions.delete(key);
    else P.repetitions.set(key, count - 1);
    P.positionKeys.pop();
  }

  async function commitMove(move, actor) {
    if (P.gameOver || P.phase !== 'playing') return;

    const color = P.eng.turn();
    if (actor === 'user' && color !== P.playerColor) return;
    if (actor === 'computer' && color !== P.computerColor) return;

    syncClock();
    if (P.gameOver) return;

    const movedPiece = P.eng.get(move.from);
    const isCapture = !!P.eng.get(move.to) || !!move.ep;
    const san = sanForMove(P.eng, move);
    const uci = P.eng.uci(move);
    const visual = captureAnimation(move.from);

    const entry = {
      actor,
      color,
      san,
      uci,
      rec: null,
      clocksBefore: { w: P.clocks.w, b: P.clocks.b },
      halfmoveBefore: P.halfmoveClock,
      keyAfter: null
    };

    entry.rec = P.eng.make(move);

    if (movedPiece && movedPiece.t === 'p' || isCapture) P.halfmoveClock = 0;
    else P.halfmoveClock += 1;

    entry.keyAfter = addPositionKey();
    P.history.push(entry);

    if (actor === 'user') P.userMoveCount += 1;

    if (P.timeControl.enabled) {
      P.clocks[color] += P.timeControl.incrementMs;
    }

    P.lastMove = { from: move.from, to: move.to };
    P.clockSide = null;
    S.selected = null;
    S.targets = [];

    renderMoveList();
    renderPlayBoard();

    await animateTo(visual, move.to);

    playMoveSound(isCapture ? 'capture' : 'move');

    const ended = checkAutomaticGameEnd();
    if (ended || P.gameOver) return;

    startClock(P.eng.turn());

    if (P.eng.turn() === P.computerColor) {
      setStatus('Stockfish is thinking…', 'neutral');
      requestComputerMove();
    } else {
      setStatus(P.eng.inCheck() ? 'Your move — you are in check.' : 'Your move.', 'neutral');
    }

    renderControls();
  }

  function checkAutomaticGameEnd() {
    if (P.eng.isMate()) {
      const winner = Core.other(P.eng.turn());
      endGame(Core.winnerResult(winner), 'Checkmate');
      return true;
    }

    if (P.eng.isStale()) {
      endGame('1/2-1/2', 'Stalemate');
      return true;
    }

    if (P.halfmoveClock >= 100) {
      endGame('1/2-1/2', '50-move rule');
      return true;
    }

    const currentKey = Core.positionKey(P.eng.toFEN());
    if ((P.repetitions.get(currentKey) || 0) >= 3) {
      endGame('1/2-1/2', 'Threefold repetition');
      return true;
    }

    if (insufficientMaterial(P.eng)) {
      endGame('1/2-1/2', 'Insufficient material');
      return true;
    }

    return false;
  }

  function insufficientMaterial(engine) {
    const pieces = [];
    const board = engine.fenBoard();

    for (let i = 0; i < 64; i += 1) {
      const piece = board[i];
      if (!piece || piece.t === 'k') continue;
      if (piece.t === 'p' || piece.t === 'r' || piece.t === 'q') return false;
      pieces.push({ piece, square: i });
    }

    if (pieces.length === 0) return true;
    if (pieces.length === 1 && (pieces[0].piece.t === 'b' || pieces[0].piece.t === 'n')) {
      return true;
    }

    if (
      pieces.length === 2 &&
      pieces.every(x => x.piece.t === 'b') &&
      pieces[0].piece.c !== pieces[1].piece.c
    ) {
      const c1 = ((pieces[0].square & 7) + (pieces[0].square >> 3)) & 1;
      const c2 = ((pieces[1].square & 7) + (pieces[1].square >> 3)) & 1;
      return c1 === c2;
    }

    return false;
  }

  async function requestComputerMove() {
    if (
      P.gameOver ||
      P.phase !== 'playing' ||
      P.eng.turn() !== P.computerColor ||
      P.thinking
    ) return;

    P.thinking = true;
    const token = ++P.searchToken;
    renderControls();
    ui.thinking.textContent = 'Stockfish is thinking…';

    const options = { multiPv: 1 };

    if (P.timeControl.enabled) {
      syncClock();
      if (P.gameOver) return;

      options.wtime = Math.max(1, Math.floor(P.clocks.w));
      options.btime = Math.max(1, Math.floor(P.clocks.b));
      options.winc = Math.floor(P.timeControl.incrementMs);
      options.binc = Math.floor(P.timeControl.incrementMs);
    } else {
      options.movetime = P.settings.strength === 'full' ? 1200 : 800;
    }

    try {
      const result = await global.ChessEngine.analyzeFen(positionFen(), options);

      if (token !== P.searchToken || P.gameOver || P.phase !== 'playing') return;

      syncClock();
      if (P.gameOver) return;

      const move = P.eng.findLegalUci(result.bestmove || '');
      if (!move) throw new Error('Stockfish returned an illegal or unavailable move.');

      P.thinking = false;
      ui.thinking.textContent = '';
      renderControls();

      await commitMove(move, 'computer');
    } catch (error) {
      if (token !== P.searchToken) return;

      P.thinking = false;
      ui.thinking.textContent = '';
      renderControls();

      const cancelled =
        error &&
        (error.name === 'CancelledError' ||
         /cancel|stopp/i.test(String(error.message || error)));

      if (cancelled) return;

      pauseClock();
      setStatus('Stockfish error: ' + (error.message || String(error)), 'bad');
    }
  }

  function cancelEngineSearch() {
    P.searchToken += 1;

    if (P.thinking) {
      try { global.ChessEngine.stop(); } catch (_) {}
    }

    P.thinking = false;
    if (ui) ui.thinking.textContent = '';
  }

  function undoOne() {
    const entry = P.history.pop();
    if (!entry) return null;

    P.eng.unmake(entry.rec);
    P.clocks = {
      w: entry.clocksBefore.w,
      b: entry.clocksBefore.b
    };
    P.halfmoveClock = entry.halfmoveBefore;
    removePositionKey(entry.keyAfter);

    if (entry.actor === 'user') {
      P.userMoveCount = Math.max(0, P.userMoveCount - 1);
    }

    const previous = P.history[P.history.length - 1];
    P.lastMove = previous
      ? {
          from: parseUci(previous.uci).from,
          to: parseUci(previous.uci).to
        }
      : null;

    return entry;
  }

  function takeBack() {
    if (P.settings.mode !== 'training' || P.userMoveCount <= 0) return;

    cancelEngineSearch();
    pauseClock();
    hidePromotion();

    let removedUser = false;

    while (P.history.length && !removedUser) {
      const entry = undoOne();
      if (entry && entry.actor === 'user') removedUser = true;
    }

    if (!removedUser) return;

    P.gameOver = false;
    P.result = '*';
    P.termination = 'Unfinished';
    S.solved = false;
    S.selected = null;
    S.targets = [];

    ui.after.classList.add('hidden');
    renderMoveList();
    renderPlayBoard();

    if (P.eng.turn() === P.playerColor) {
      startClock(P.playerColor);
      setStatus('Takeback complete. Your move.', 'neutral');
    } else {
      startClock(P.computerColor);
      setStatus('Takeback complete. Stockfish is thinking…', 'neutral');
      requestComputerMove();
    }

    renderControls();
  }

  async function offerDraw() {
    if (
      P.gameOver ||
      P.phase !== 'playing' ||
      P.thinking ||
      P.eng.turn() !== P.playerColor
    ) return;

    pauseClock();
    ui.draw.disabled = true;
    setStatus('Stockfish is considering your draw offer…', 'neutral');

    const token = ++P.searchToken;

    try {
      const result = await global.ChessEngine.analyzeFen(positionFen(), {
        depth: 10,
        multiPv: 1
      });

      if (token !== P.searchToken || P.gameOver) return;

      const first = result.lines && result.lines[0];
      const score = first && first.score;
      const cp =
        score && global.TacticsStockfish && global.TacticsStockfish.scoreToCp
          ? global.TacticsStockfish.scoreToCp(score)
          : null;

      // The score is from the side-to-move perspective. Stockfish accepts a
      // practical draw only when its quick search regards the position as
      // essentially equal. This is intentionally conservative.
      if (Number.isFinite(cp) && Math.abs(cp) <= 35) {
        endGame('1/2-1/2', 'Draw agreed');
        return;
      }

      setStatus('Stockfish declines the draw. Your move.', 'neutral');
      startClock(P.playerColor);
    } catch (error) {
      const cancelled = error && error.name === 'CancelledError';
      if (!cancelled) {
        setStatus('Draw offer could not be evaluated. Your move.', 'neutral');
        startClock(P.playerColor);
      }
    } finally {
      renderControls();
    }
  }

  function resign() {
    if (P.gameOver || P.phase !== 'playing') return;
    const winner = P.computerColor;
    endGame(Core.winnerResult(winner), 'Resignation');
  }

  function endGame(result, termination) {
    if (P.gameOver) return;

    cancelEngineSearch();
    pauseClock();

    P.gameOver = true;
    P.result = result;
    P.termination = termination;
    S.solved = true;
    S.selected = null;
    S.targets = [];

    ui.after.classList.remove('hidden');
    ui.thinking.textContent = '';

    let message = termination + ' · ' + result;

    if (termination === 'Checkmate') {
      const playerWon =
        (result === '1-0' && P.playerColor === 'w') ||
        (result === '0-1' && P.playerColor === 'b');

      message = playerWon
        ? 'Checkmate — you win. ' + result
        : 'Checkmate — Stockfish wins. ' + result;
    } else if (termination === 'Time forfeit') {
      const playerWon =
        (result === '1-0' && P.playerColor === 'w') ||
        (result === '0-1' && P.playerColor === 'b');

      message = playerWon
        ? 'Stockfish flagged — you win. ' + result
        : 'Your clock expired. ' + result;
    }

    setStatus(message, result === '1/2-1/2' ? 'neutral' : 'good');
    playMoveSound('end');
    renderMoveList();
    renderPlayBoard();
    renderControls();
  }

  function parseUci(uci) {
    return {
      from: (uci.charCodeAt(1) - 49) * 8 + (uci.charCodeAt(0) - 97),
      to: (uci.charCodeAt(3) - 49) * 8 + (uci.charCodeAt(2) - 97),
      promo: uci[4] || null
    };
  }

  function renderMoveList() {
    if (!ui) return;

    ui.moves.innerHTML = '';

    if (!P.history.length) {
      ui.moves.textContent = 'No moves yet.';
      return;
    }

    for (let i = 0; i < P.history.length; i += 2) {
      const row = document.createElement('div');
      row.className = 'move-pair';

      const no = document.createElement('span');
      no.className = 'move-no';
      no.textContent = (i / 2 + 1) + '.';

      const white = document.createElement('span');
      white.className = 'move-san';
      white.textContent = P.history[i] ? P.history[i].san : '';

      const black = document.createElement('span');
      black.className = 'move-san';
      black.textContent = P.history[i + 1] ? P.history[i + 1].san : '';

      row.appendChild(no);
      row.appendChild(white);
      row.appendChild(black);
      ui.moves.appendChild(row);
    }

    ui.moves.scrollTop = ui.moves.scrollHeight;
  }

  function renderControls() {
    if (!ui) return;

    ui.takeback.disabled =
      P.settings.mode !== 'training' ||
      P.userMoveCount <= 0 ||
      P.phase !== 'playing';

    ui.draw.disabled =
      P.gameOver ||
      P.thinking ||
      P.phase !== 'playing' ||
      !P.eng ||
      P.eng.turn() !== P.playerColor;

    ui.resign.disabled = P.gameOver || P.phase !== 'playing';
    ui.export.disabled = !P.history.length;

    ui.thinking.textContent = P.thinking ? 'Stockfish is thinking…' : '';
  }

  function setStatus(text, kind) {
    if (!ui) return;
    ui.status.textContent = text;
    ui.status.className = 'feedback ' + (kind || 'neutral');
    P.status = text;
  }

  function pgnText() {
    const you = 'You';
    const sf = 'Stockfish 18 (' + strengthLabel(P.settings.strength) + ')';

    return Core.pgn(
      {
        event: 'Play vs Stockfish',
        site: global.location ? global.location.href : 'Chess Tactics Trainer',
        date: Core.dateForPgn(P.startedAt || new Date()),
        white: P.playerColor === 'w' ? you : sf,
        black: P.playerColor === 'b' ? you : sf,
        timeControl: P.timeControl.pgn,
        mode: P.settings.mode === 'training' ? 'Training' : 'Tournament'
      },
      P.history,
      P.result,
      P.termination
    );
  }

  function exportPgn() {
    if (!P.history.length) return;

    const text = pgnText();
    const blob = new Blob([text], { type: 'application/x-chess-pgn;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');

    link.href = url;
    link.download = 'stockfish-game-' + stamp + '.pgn';
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function ensureAudio() {
    if (!P.settings.sounds || P.audio) return;

    const AudioContext = global.AudioContext || global.webkitAudioContext;
    if (!AudioContext) return;

    try {
      P.audio = new AudioContext();
      if (P.audio.state === 'suspended') P.audio.resume().catch(function () {});
    } catch (_) {
      P.audio = null;
    }
  }

  function playMoveSound(kind) {
    if (!P.settings.sounds) return;
    ensureAudio();
    if (!P.audio) return;

    try {
      const oscillator = P.audio.createOscillator();
      const gain = P.audio.createGain();
      const current = P.audio.currentTime;

      oscillator.type = 'sine';
      oscillator.frequency.value =
        kind === 'capture' ? 260 :
        kind === 'end' ? 520 :
        360;

      gain.gain.setValueAtTime(0.035, current);
      gain.gain.exponentialRampToValueAtTime(0.001, current + 0.07);

      oscillator.connect(gain);
      gain.connect(P.audio.destination);
      oscillator.start(current);
      oscillator.stop(current + 0.08);
    } catch (_) {}
  }

  function apiStatus() {
    return {
      build: BUILD_ID,
      phase: P.phase,
      active: P.active,
      gameOver: P.gameOver,
      thinking: P.thinking,
      playerColor: P.playerColor,
      result: P.result,
      termination: P.termination,
      moveCount: P.history.length,
      pgn: P.history.length ? pgnText() : ''
    };
  }

  createUi();

  global.PlayVsStockfish = {
    build: BUILD_ID,
    core: Core,
    status: apiStatus,
    start: function () { return startGame(false); },
    stop: returnToSettings,
    exportPgn: pgnText
  };

  console.info('[Tactics Trainer] Loaded ' + BUILD_ID);
}(typeof globalThis !== 'undefined' ? globalThis : this));
