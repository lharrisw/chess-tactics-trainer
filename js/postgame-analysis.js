/* Chess Tactics Trainer — Build 2.2
 * Full-Stockfish post-game analysis.
 *
 * Stockfish determines objective chess facts. This module:
 *   - analyzes completed games only;
 *   - temporarily uses full engine strength for review;
 *   - analyzes each required game STATE exactly once;
 *   - derives move quality from the pre-move state and the next game state,
 *     converting the latter back to the original mover's perspective;
 *   - keeps MultiPV=2 for the entire review so the browser engine never
 *     toggles 2 -> 1 mid-review;
 *   - labels moves from estimated win-chance loss with published thresholds;
 *   - never calls an LLM or external chess-analysis service.
 */
(function (global) {
  'use strict';

  const BUILD_ID = 'postgame-analysis-2.2';
  const ANALYSIS_HOTFIX_ID = 'single-pass-state-analysis-2.2.3';
  // Compatibility markers retained for the existing Build 2.2 workflow:
  // result-position-analysis-2.2.2
  // normal-child-search-with-score-inversion
  // evaluating resulting position

  const PERSONAL_THEME = 'Personal mistake';

  // Browser Stockfish is intentionally given a wall-clock budget rather than
  // an unbounded "reach this depth no matter how long it takes" instruction.
  // This makes full-game review predictable on ordinary GitHub Pages.
  const ANALYSIS_PROFILES = {
    10: { name: 'Quick',     movetime: 200,  watchdog: 6000 },
    12: { name: 'Normal',    movetime: 500,  watchdog: 8000 },
    14: { name: 'Deep',      movetime: 1000, watchdog: 12000 },
    16: { name: 'Very deep', movetime: 2000, watchdog: 20000 },
    18: { name: 'Maximum',   movetime: 4000, watchdog: 35000 }
  };
  const FALLBACK_NOTEBOOK_KEY = 'chess-tactics-personal-mistakes-v1';

  const Core = {
    BUILD_ID,

    clamp(value, min, max) {
      const n = Number(value);
      if (!Number.isFinite(n)) return min;
      return Math.max(min, Math.min(max, n));
    },

    scoreToCp(score) {
      if (!score) return null;
      if (score.type === 'cp') return Number(score.value) || 0;
      if (score.type === 'mate') {
        const mate = Number(score.value) || 0;
        if (mate > 0) return 100000 - Math.min(999, mate) * 100;
        if (mate < 0) return -100000 - Math.max(-999, mate) * 100;
        return 0;
      }
      return null;
    },

    invertScore(score) {
      if (!score || (score.type !== 'cp' && score.type !== 'mate')) return null;

      return {
        type: score.type,
        value: -(Number(score.value) || 0),
        // Bounds reverse when the point of view reverses.
        lowerbound: !!score.upperbound,
        upperbound: !!score.lowerbound
      };
    },

    winChance(cp) {
      if (!Number.isFinite(cp)) return null;
      // A deliberately simple, published trainer heuristic. This is not a
      // proprietary site formula and is shown to the user as an estimate.
      const bounded = Core.clamp(cp, -4000, 4000);
      return 100 / (1 + Math.exp(-bounded / 250));
    },

    formatScore(score) {
      if (!score) return '—';
      if (score.type === 'mate') {
        const value = Number(score.value) || 0;
        if (value > 0) return 'M' + value;
        if (value < 0) return '-M' + Math.abs(value);
        return 'M';
      }
      const pawns = (Number(score.value) || 0) / 100;
      return (pawns >= 0 ? '+' : '') + pawns.toFixed(2);
    },

    moveLabel(ply, san) {
      const move = Math.floor(Number(ply) / 2) + 1;
      return Number(ply) % 2 === 0
        ? move + '. ' + san
        : move + '... ' + san;
    },

    requiredStateIndices(totalPlies, selectedPlies) {
      const total = Math.max(0, Math.floor(Number(totalPlies) || 0));
      const set = new Set();

      for (const raw of Array.isArray(selectedPlies) ? selectedPlies : []) {
        const ply = Math.floor(Number(raw));
        if (!Number.isFinite(ply) || ply < 0 || ply >= total) continue;
        set.add(ply);
        set.add(ply + 1);
      }

      return Array.from(set).sort((a, b) => a - b);
    },

    hash(text) {
      let h = 2166136261;
      const s = String(text || '');
      for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return (h >>> 0).toString(36);
    },

    classify(input) {
      const data = input || {};
      const bestCp = Core.scoreToCp(data.bestScore);
      const playedCp = Core.scoreToCp(data.playedScore);
      const sameMove =
        !!data.bestMove &&
        !!data.playedMove &&
        String(data.bestMove) === String(data.playedMove);

      const bestWin = Core.winChance(bestCp);
      const playedWin = Core.winChance(playedCp);
      const lossPp =
        Number.isFinite(bestWin) && Number.isFinite(playedWin)
          ? Math.max(0, bestWin - playedWin)
          : 0;

      const bestMate =
        data.bestScore &&
        data.bestScore.type === 'mate' &&
        Number(data.bestScore.value) > 0;

      const playedMate =
        data.playedScore &&
        data.playedScore.type === 'mate' &&
        Number(data.playedScore.value) > 0;

      let label = 'Good';
      let severity = 0;
      let slug = 'good';

      if (sameMove || lossPp < 1) {
        label = 'Best';
        severity = 0;
        slug = 'best';
      } else if (bestMate && !playedMate) {
        label = 'Missed mate';
        severity = 4;
        slug = 'missed-mate';
      } else if (
        Number.isFinite(bestCp) &&
        Number.isFinite(playedCp) &&
        bestCp >= 250 &&
        playedCp < 80 &&
        lossPp >= 12
      ) {
        label = 'Missed win';
        severity = 4;
        slug = 'missed-win';
      } else if (lossPp >= 25) {
        label = 'Blunder';
        severity = 4;
        slug = 'blunder';
      } else if (lossPp >= 12) {
        label = 'Mistake';
        severity = 3;
        slug = 'mistake';
      } else if (lossPp >= 5) {
        label = 'Inaccuracy';
        severity = 2;
        slug = 'inaccuracy';
      } else {
        label = 'Good';
        severity = 0;
        slug = 'good';
      }

      return {
        label,
        slug,
        severity,
        bestCp,
        playedCp,
        bestWin,
        playedWin,
        lossPp
      };
    },

    summarize(results) {
      const rows = Array.isArray(results) ? results : [];
      const counts = {};
      for (const row of rows) {
        const key = row.classification ? row.classification.label : 'Unknown';
        counts[key] = (counts[key] || 0) + 1;
      }

      const worst = rows
        .filter(row => row.classification)
        .slice()
        .sort(
          (a, b) =>
            (b.classification.lossPp || 0) -
            (a.classification.lossPp || 0)
        )[0] || null;

      const critical = rows.filter(row => !!row.critical).length;

      return {
        total: rows.length,
        counts,
        worst,
        critical
      };
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Core;
  }

  if (typeof document === 'undefined') return;

  if (
    !global.PlayVsStockfish ||
    typeof global.PlayVsStockfish.snapshot !== 'function' ||
    !global.ChessEngine ||
    typeof Engine !== 'function' ||
    typeof drawBoard !== 'function'
  ) {
    console.error('[Tactics Trainer] Build 2.2 prerequisites are missing.');
    return;
  }

  const A = {
    open: false,
    running: false,
    token: 0,
    snapshot: null,
    positions: [],
    results: [],
    selectedResult: null,
    retry: null,
    previousStrength: null,
    side: 'both',
    depth: 12,
    keyOnly: false
  };

  let ui = null;
  const previousOnSquare = onSquare;
  const previousActivateTab = activateTab;

  onSquare = function (index) {
    if (A.open) {
      if (A.retry) retrySquare(index);
      return;
    }
    previousOnSquare(index);
  };

  activateTab = function (name) {
    if (name !== 'play' && A.open) {
      if (A.running) cancelAnalysis();
      closeAnalysis(false);
    }
    return previousActivateTab(name);
  };

  function injectStyle() {
    if (document.getElementById('ct-analysis-2-2-style')) return;

    const style = document.createElement('style');
    style.id = 'ct-analysis-2-2-style';
    style.textContent = `
      /*
       * Build 2.2.5 — Guided Review UI
       *
       * Inspired by the interaction pattern of mainstream chess review tools:
       * board stays visible; one move gets the focus; the full move list stays
       * compact; engine detail is secondary rather than the entire interface.
       */

      #play-analysis{
        display:flex;
        flex-direction:column;
        gap:12px;
        min-height:0;
      }

      #play-analysis.hidden{display:none!important;}

      /*
       * Explicitly hide the finished-game controls while review is open.
       * Using the Play pane as the state owner is more robust than relying on
       * a direct-child selector on #play-game.
       */
      #pane-play.ct-guided-review-open #play-game > .play-summary,
      #pane-play.ct-guided-review-open #play-status,
      #pane-play.ct-guided-review-open #play-thinking,
      #pane-play.ct-guided-review-open #play-moves,
      #pane-play.ct-guided-review-open #play-game > .btns,
      #pane-play.ct-guided-review-open #play-after-buttons{
        display:none !important;
      }

      #pane-play.ct-guided-review-open #play-analysis{
        display:flex !important;
        max-height:calc(100vh - 108px);
        overflow:hidden;
      }

      .analysis-heading{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
        flex:0 0 auto;
      }

      .analysis-heading strong{
        display:block;
        font-size:1rem;
      }

      .analysis-heading .note{
        margin:3px 0 0;
        line-height:1.35;
      }

      #analysis-setup{
        display:flex;
        flex-direction:column;
        gap:10px;
        flex:0 0 auto;
      }

      #play-analysis.has-results:not(.show-setup) #analysis-setup{
        display:none;
      }

      #analysis-review-meta{
        display:none;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        padding:8px 10px;
        border:1px solid var(--line);
        border-radius:8px;
        background:#2b2a27;
        font-size:.74rem;
        color:var(--muted);
        flex:0 0 auto;
      }

      #play-analysis.has-results #analysis-review-meta{
        display:flex;
      }

      #analysis-review-meta button{
        border:0;
        background:transparent;
        color:var(--text);
        font:inherit;
        font-weight:800;
        cursor:pointer;
        padding:3px 0;
      }

      #play-analysis .analysis-controls{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:10px;
      }

      #play-analysis .analysis-field{
        display:flex;
        flex-direction:column;
        gap:5px;
      }

      #play-analysis .analysis-field label{
        color:var(--muted);
        font-size:.72rem;
        font-weight:700;
      }

      #play-analysis select{
        background:var(--panel2);
        color:var(--text);
        border:1px solid var(--line);
        border-radius:7px;
        padding:10px 11px;
        font:inherit;
      }

      #analysis-progress-shell{
        height:7px;
        border-radius:999px;
        background:#242320;
        overflow:hidden;
      }

      #analysis-progress{
        width:0;
        height:100%;
        background:var(--green);
        transition:width .15s linear;
      }

      /*
       * Compact summary strip. The selected move is the real center of review.
       */
      #analysis-summary{
        border:1px solid var(--line);
        border-radius:9px;
        padding:9px 11px;
        background:#2b2a27;
        flex:0 0 auto;
      }

      #analysis-summary.hidden{display:none!important;}

      #analysis-summary .summary-big{
        font-size:.82rem;
        font-weight:850;
      }

      #analysis-summary .summary-small{
        color:var(--muted);
        font-size:.70rem;
        margin-top:3px;
        line-height:1.35;
      }

      /*
       * Selected-move card — the Chess.com-style guided-review center.
       */
      #analysis-viewer{
        border:1px solid var(--line);
        border-radius:10px;
        background:var(--panel2);
        padding:12px;
        display:flex;
        flex-direction:column;
        gap:9px;
        flex:0 0 auto;
      }

      #analysis-viewer.hidden{display:none!important;}

      #analysis-viewer-title{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
      }

      .analysis-selected-move{
        font-size:1.02rem;
        font-weight:900;
      }

      .analysis-feedback-line{
        font-size:.82rem;
        line-height:1.45;
      }

      .analysis-eval-grid{
        display:grid;
        grid-template-columns:repeat(3,1fr);
        gap:7px;
      }

      .analysis-eval-box{
        border:1px solid var(--line);
        border-radius:7px;
        background:#292825;
        padding:7px 8px;
        min-width:0;
      }

      .analysis-eval-label{
        display:block;
        color:var(--muted);
        font-size:.62rem;
        text-transform:uppercase;
        letter-spacing:.04em;
        margin-bottom:2px;
      }

      .analysis-eval-value{
        display:block;
        font-size:.78rem;
        font-weight:850;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      #analysis-viewer-pv{
        color:var(--muted);
        font-size:.72rem;
        line-height:1.45;
      }

      .analysis-line-label{
        color:var(--text);
        font-weight:800;
      }

      #analysis-retry-status{
        font-size:.74rem;
        line-height:1.45;
      }

      .analysis-nav{
        display:grid;
        grid-template-columns:46px 1fr 46px;
        gap:8px;
      }

      .analysis-nav .act{
        min-height:38px;
      }

      /*
       * Move-list toolbar + compact rows. Each move is now one small clickable
       * line rather than a full engine card.
       */
      #analysis-list-head{
        display:none;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        flex:0 0 auto;
        padding-top:1px;
      }

      #play-analysis.has-results #analysis-list-head{
        display:flex;
      }

      .analysis-list-title{
        font-size:.78rem;
        font-weight:850;
      }

      .analysis-segmented{
        display:flex;
        padding:2px;
        border:1px solid var(--line);
        background:#292825;
        border-radius:8px;
      }

      .analysis-segmented button{
        border:0;
        background:transparent;
        color:var(--muted);
        border-radius:6px;
        padding:5px 8px;
        font:inherit;
        font-size:.68rem;
        font-weight:800;
        cursor:pointer;
      }

      .analysis-segmented button.active{
        background:#45433f;
        color:var(--text);
      }

      #analysis-results{
        display:flex;
        flex-direction:column;
        gap:4px;
        overflow-y:auto;
        min-height:0;
        flex:1 1 auto;
        padding-right:3px;
        overscroll-behavior:contain;
        scrollbar-width:thin;
      }

      .analysis-row{
        width:100%;
        display:grid;
        grid-template-columns:minmax(78px,.9fr) minmax(74px,.8fr) auto;
        align-items:center;
        gap:8px;
        text-align:left;
        border:1px solid transparent;
        border-radius:7px;
        background:transparent;
        color:var(--text);
        padding:7px 8px;
        cursor:pointer;
        font:inherit;
      }

      .analysis-row:hover{
        background:#34332f;
      }

      .analysis-row.selected{
        background:#3a3934;
        border-color:var(--green);
      }

      .analysis-row.critical{
        border-left:3px solid #d59b34;
      }

      .analysis-row.ct-filtered-out{
        display:none;
      }

      .analysis-move{
        font-weight:850;
        font-size:.76rem;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .analysis-row-best{
        color:var(--muted);
        font-size:.68rem;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .analysis-chip{
        justify-self:end;
        font-size:.60rem;
        font-weight:900;
        text-transform:uppercase;
        letter-spacing:.04em;
        padding:4px 6px;
        border-radius:999px;
        background:#3a3935;
        color:#ddd;
        white-space:nowrap;
      }

      .analysis-chip.best{background:#315b34;color:#dff4df;}
      .analysis-chip.good{background:#3b4d3d;color:#e1eee2;}
      .analysis-chip.inaccuracy{background:#6c5a2a;color:#fff0bd;}
      .analysis-chip.mistake{background:#704328;color:#ffe1cb;}
      .analysis-chip.blunder,
      .analysis-chip.missed-win,
      .analysis-chip.missed-mate{background:#742f2f;color:#ffd7d7;}

      #analysis-method{
        flex:0 0 auto;
        border-top:1px solid var(--line);
        padding-top:7px;
        color:var(--muted);
        font-size:.70rem;
      }

      #analysis-method summary{
        cursor:pointer;
        color:var(--muted);
        font-weight:750;
      }

      #analysis-method .analysis-method-body{
        margin-top:7px;
        line-height:1.5;
      }

      @media(max-width:620px){
        #play-analysis .analysis-controls{
          grid-template-columns:1fr;
        }

        #pane-play.ct-guided-review-open #play-analysis{
          max-height:none;
          overflow:visible;
        }

        #analysis-results{
          max-height:360px;
          flex:none;
        }

        .analysis-eval-grid{
          grid-template-columns:1fr;
        }

        .analysis-row{
          grid-template-columns:minmax(82px,1fr) minmax(74px,1fr) auto;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function createUi() {
    injectStyle();

    const after = document.getElementById('play-after-buttons');
    const game = document.getElementById('play-game');
    if (!after || !game) return;

    const analyze = document.createElement('button');
    analyze.type = 'button';
    analyze.className = 'act primary';
    analyze.id = 'play-analyze';
    analyze.textContent = 'Analyze game';
    after.insertBefore(analyze, after.firstChild);

    const panel = document.createElement('div');
    panel.id = 'play-analysis';
    panel.className = 'hidden';
    panel.innerHTML = `
      <div class="analysis-heading">
        <div>
          <strong>Game review</strong>
          <div class="note">Stockfish 18 · guided post-game review</div>
        </div>
        <button class="act" id="analysis-close" type="button">Close</button>
      </div>

      <div id="analysis-setup">
        <div class="analysis-controls">
          <div class="analysis-field">
            <label for="analysis-side">Review</label>
            <select id="analysis-side">
              <option value="both">Both sides</option>
              <option value="white">White only</option>
              <option value="black">Black only</option>
            </select>
          </div>
          <div class="analysis-field">
            <label for="analysis-depth">Engine time</label>
            <select id="analysis-depth">
              <option value="10">Quick · ~0.2 s</option>
              <option value="12" selected>Normal · ~0.5 s</option>
              <option value="14">Deep · ~1 s</option>
              <option value="16">Very deep · ~2 s</option>
              <option value="18">Maximum · ~4 s</option>
            </select>
          </div>
        </div>

        <div class="btns">
          <button class="act primary" id="analysis-run" type="button">Run analysis</button>
          <button class="act" id="analysis-cancel" type="button" disabled>Cancel</button>
        </div>

        <div class="feedback neutral" id="analysis-status">
          Choose what to review, then run Stockfish.
        </div>

        <div id="analysis-progress-shell" aria-label="Analysis progress">
          <div id="analysis-progress"></div>
        </div>
      </div>

      <div id="analysis-review-meta">
        <span id="analysis-review-meta-text"></span>
        <button id="analysis-reanalyze" type="button">Analysis settings</button>
      </div>

      <div id="analysis-summary" class="hidden"></div>

      <div id="analysis-viewer" class="hidden">
        <div id="analysis-viewer-title"></div>
        <div id="analysis-viewer-details"></div>
        <div id="analysis-viewer-pv"></div>

        <div class="analysis-nav">
          <button class="act" id="analysis-prev" type="button" title="Previous reviewed move">‹</button>
          <button class="act" id="analysis-next-critical" type="button">Next key move</button>
          <button class="act" id="analysis-next" type="button" title="Next reviewed move">›</button>
        </div>

        <div class="btns">
          <button class="act primary" id="analysis-retry" type="button">Retry this position</button>
          <button class="act" id="analysis-save" type="button">Turn into puzzle</button>
        </div>

        <button class="act" id="analysis-final" type="button">Show final position</button>

        <div id="analysis-retry-status"></div>
      </div>

      <div id="analysis-list-head">
        <span class="analysis-list-title">Moves</span>
        <div class="analysis-segmented" aria-label="Move filter">
          <button id="analysis-all-moves" type="button" class="active">All</button>
          <button id="analysis-key-moves" type="button">Key moves</button>
        </div>
      </div>

      <div id="analysis-results"></div>

      <details id="analysis-method">
        <summary>How the review rates moves</summary>
        <div class="analysis-method-body">
          Ratings are trainer-defined, not Chess.com labels. The engine analyzes
          each required game position once at MultiPV 2. A played move is scored
          from the next game position, with that score reversed to the original
          mover's perspective. Estimated win-chance loss: under 5 points = Good,
          5–12 = Inaccuracy, 12–25 = Mistake, 25+ = Blunder. Forced-mate and
          clearly-winning-position losses can be labeled Missed mate or Missed win.
        </div>
      </details>
    `;

    game.appendChild(panel);

    ui = {
      analyze,
      panel,
      close: panel.querySelector('#analysis-close'),
      side: panel.querySelector('#analysis-side'),
      depth: panel.querySelector('#analysis-depth'),
      run: panel.querySelector('#analysis-run'),
      cancel: panel.querySelector('#analysis-cancel'),
      status: panel.querySelector('#analysis-status'),
      progress: panel.querySelector('#analysis-progress'),
      summary: panel.querySelector('#analysis-summary'),
      results: panel.querySelector('#analysis-results'),
      viewer: panel.querySelector('#analysis-viewer'),
      viewerTitle: panel.querySelector('#analysis-viewer-title'),
      viewerDetails: panel.querySelector('#analysis-viewer-details'),
      viewerPv: panel.querySelector('#analysis-viewer-pv'),
      prev: panel.querySelector('#analysis-prev'),
      next: panel.querySelector('#analysis-next'),
      final: panel.querySelector('#analysis-final'),
      retry: panel.querySelector('#analysis-retry'),
      save: panel.querySelector('#analysis-save'),
      retryStatus: panel.querySelector('#analysis-retry-status'),
      setup: panel.querySelector('#analysis-setup'),
      reviewMeta: panel.querySelector('#analysis-review-meta'),
      reviewMetaText: panel.querySelector('#analysis-review-meta-text'),
      reanalyze: panel.querySelector('#analysis-reanalyze'),
      nextCritical: panel.querySelector('#analysis-next-critical'),
      listHead: panel.querySelector('#analysis-list-head'),
      allMoves: panel.querySelector('#analysis-all-moves'),
      keyMoves: panel.querySelector('#analysis-key-moves')
    };

    analyze.addEventListener('click', openAnalysis);
    ui.close.addEventListener('click', function () { closeAnalysis(true); });
    ui.run.addEventListener('click', runAnalysis);
    ui.cancel.addEventListener('click', cancelAnalysis);
    ui.prev.addEventListener('click', function () { moveSelection(-1); });
    ui.next.addEventListener('click', function () { moveSelection(1); });
    ui.nextCritical.addEventListener('click', function () { moveCriticalSelection(1); });
    ui.final.addEventListener('click', showFinalPosition);
    ui.retry.addEventListener('click', beginRetry);
    ui.save.addEventListener('click', saveSelectedPuzzle);

    ui.reanalyze.addEventListener('click', function () {
      ui.panel.classList.toggle('show-setup');
      ui.reanalyze.textContent =
        ui.panel.classList.contains('show-setup')
          ? 'Hide settings'
          : 'Analysis settings';
    });

    ui.allMoves.addEventListener('click', function () {
      setMoveFilter(false);
    });

    ui.keyMoves.addEventListener('click', function () {
      setMoveFilter(true);
    });

    // Prevent game-state mutations from racing an active engine review.
    for (const id of ['play-takeback', 'play-rematch', 'play-new-settings']) {
      const button = document.getElementById(id);
      if (!button) continue;
      button.addEventListener(
        'click',
        function (event) {
          if (!A.running) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          setAnalysisStatus('Cancel the analysis before changing the game.', 'bad');
        },
        true
      );
    }

    // Normal post-game actions invalidate/close a finished review.
    for (const id of ['play-takeback', 'play-rematch', 'play-new-settings']) {
      const button = document.getElementById(id);
      if (!button) continue;
      button.addEventListener('click', function () {
        if (!A.running && A.open) closeAnalysis(false);
      });
    }

    ensurePersonalThemeOption();
  }

  function setAnalysisStatus(message, kind) {
    if (!ui) return;
    ui.status.textContent = message;
    ui.status.className = 'feedback ' + (kind || 'neutral');
  }

  function openAnalysis() {
    const snapshot = global.PlayVsStockfish.snapshot();

    if (!snapshot || !snapshot.gameOver || !snapshot.moves.length) {
      return;
    }

    A.open = true;
    A.snapshot = snapshot;
    A.positions = buildPositions(snapshot);
    A.results = [];
    A.selectedResult = null;
    A.retry = null;

    ui.panel.classList.remove('hidden');
    ui.summary.classList.add('hidden');
    ui.viewer.classList.add('hidden');
    ui.results.innerHTML = '';
    ui.progress.style.width = '0%';
    ui.retryStatus.textContent = '';

    ui.side.value = snapshot.playerColor === 'w' ? 'white' : 'black';
    ui.depth.value = '12';

    setAnalysisStatus(
      'Ready. Review your moves, the opposite color, or both sides.',
      'neutral'
    );

    A.keyOnly = false;
    ui.panel.classList.remove('has-results', 'show-setup');
    if (ui.allMoves) ui.allMoves.classList.add('active');
    if (ui.keyMoves) ui.keyMoves.classList.remove('active');

    const pane = document.getElementById('pane-play');
    if (pane) pane.classList.add('ct-guided-review-open');

    const game = document.getElementById('play-game');
    if (game) game.classList.remove('ct-analysis-workspace');

    showFinalPosition();
  }

  function closeAnalysis(restoreBoard) {
    if (!A.open) return;

    if (A.running) cancelAnalysis();
    endRetry();

    if (restoreBoard !== false) showFinalPosition();

    A.open = false;
    ui.panel.classList.add('hidden');

    const pane = document.getElementById('pane-play');
    if (pane) pane.classList.remove('ct-guided-review-open');

    const game = document.getElementById('play-game');
    if (game) game.classList.remove('ct-analysis-workspace');

    ui.panel.classList.remove('has-results', 'show-setup');
  }

  function buildPositions(snapshot) {
    const engine = Engine();
    engine.startpos();
    const positions = [];

    for (let i = 0; i < snapshot.moves.length; i += 1) {
      const moveInfo = snapshot.moves[i];
      const fen = engine.toFEN();
      const legal = engine.findLegalUci(String(moveInfo.uci));

      if (!legal) {
        throw new Error(
          'Could not reconstruct game at ' + Core.moveLabel(i, moveInfo.san)
        );
      }

      positions.push({
        ply: i,
        fen,
        move: moveInfo,
        previousUci: i > 0 ? snapshot.moves[i - 1].uci : null
      });

      engine.make(legal);
    }

    return positions;
  }

  function selectedPositions() {
    const side = ui.side.value;
    return A.positions.filter(position => {
      if (side === 'both') return true;
      if (side === 'white') return position.move.color === 'w';
      if (side === 'black') return position.move.color === 'b';
      return true;
    });
  }

  function scoreFromLine(line) {
    return line && line.score ? line.score : null;
  }

  function cpGap(bestLine, secondLine) {
    const a = Core.scoreToCp(scoreFromLine(bestLine));
    const b = Core.scoreToCp(scoreFromLine(secondLine));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.max(0, a - b);
  }

  function moveNumberPrefix(ply) {
    const n = Math.floor(ply / 2) + 1;
    return ply % 2 === 0 ? n + '.' : n + '...';
  }

  function uciParts(uci) {
    const raw = String(uci || '');
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(raw)) return null;

    return {
      from: (raw.charCodeAt(1) - 49) * 8 + (raw.charCodeAt(0) - 97),
      to: (raw.charCodeAt(3) - 49) * 8 + (raw.charCodeAt(2) - 97),
      promo: raw[4] || null
    };
  }

  function reviewSanForMove(engine, move) {
    const piece = engine.get(move.from);
    if (!piece) return engine.uci(move);

    const legal = engine.legal();
    const capture = !!engine.get(move.to) || !!move.ep;
    let san = '';

    if (move.castle === 'K') san = 'O-O';
    else if (move.castle === 'Q') san = 'O-O-O';
    else if (piece.t === 'p') {
      if (capture) san += 'abcdefgh'[move.from & 7] + 'x';
      san += Core.squareName ? Core.squareName(move.to) : squareName(move.to);
      if (move.promo) san += '=' + move.promo.toUpperCase();
    } else {
      const letter = { n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' }[piece.t] || '';
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
      san += 'abcdefgh'[move.to & 7] + ((move.to >> 3) + 1);
    }

    const rec = engine.make(move);
    if (engine.isMate()) san += '#';
    else if (engine.inCheck()) san += '+';
    engine.unmake(rec);

    return san;
  }

  function positionAfterUci(fen, uci) {
    const engine = Engine();
    engine.fromFEN(fen);

    const move = engine.findLegalUci(String(uci || ''));
    if (!move) {
      throw new Error('Could not reconstruct played move ' + String(uci || '—') + '.');
    }

    engine.make(move);
    return engine.toFEN();
  }

  function moverPerspectiveLine(childLine) {
    if (!childLine) return null;

    return Object.assign({}, childLine, {
      score: Core.invertScore(childLine.score)
    });
  }

  function uciToSan(fen, uci) {
    if (!uci) return '—';

    try {
      const engine = Engine();
      engine.fromFEN(fen);
      const move = engine.findLegalUci(String(uci));
      return move ? reviewSanForMove(engine, move) : String(uci);
    } catch (_) {
      return String(uci);
    }
  }

  function pvToSan(fen, pv, limit) {
    const sequence = Array.isArray(pv) ? pv.slice(0, limit || 8) : [];
    if (!sequence.length) return '—';

    try {
      const engine = Engine();
      engine.fromFEN(fen);
      const out = [];

      for (const uci of sequence) {
        const move = engine.findLegalUci(String(uci));
        if (!move) break;
        out.push(reviewSanForMove(engine, move));
        engine.make(move);
      }

      return out.length ? out.join(' ') : sequence.join(' ');
    } catch (_) {
      return sequence.join(' ');
    }
  }

  function analysisProfile() {
    return ANALYSIS_PROFILES[Number(ui.depth.value || 12)] || ANALYSIS_PROFILES[12];
  }

  function approximateReviewSeconds(stateCount, profile) {
    // Build 2.2.3 performs one normal Stockfish search per unique game state.
    return Math.max(1, Math.ceil((stateCount * profile.movetime) / 1000));
  }

  function humanDuration(seconds) {
    const s = Math.max(0, Math.round(Number(seconds) || 0));
    if (s < 60) return s + ' sec';
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ' min' + (r ? ' ' + r + ' sec' : '');
  }

  function setReviewProgress(completedUnits, totalUnits) {
    const total = Math.max(1, Number(totalUnits) || 1);
    const done = Math.max(0, Math.min(total, Number(completedUnits) || 0));
    ui.progress.style.width = Math.round((done / total) * 100) + '%';
  }

  function fenForStateIndex(index) {
    const i = Number(index);
    if (i >= 0 && i < A.positions.length) return A.positions[i].fen;
    if (i === A.positions.length && A.snapshot) return A.snapshot.finalFen;
    throw new Error('Invalid game-state index ' + String(index) + '.');
  }

  function terminalStateAnalysis(fen, stateIndex) {
    try {
      const engine = Engine();
      engine.fromFEN(fen);

      if (engine.legal().length === 0) {
        if (engine.inCheck()) {
          return {
            terminal: true,
            bestmove: null,
            lines: [{
              multipv: 1,
              depth: 0,
              score: {
                type: 'mate',
                value: -1,
                lowerbound: false,
                upperbound: false
              },
              pv: []
            }]
          };
        }

        return {
          terminal: true,
          bestmove: null,
          lines: [{
            multipv: 1,
            depth: 0,
            score: {
              type: 'cp',
              value: 0,
              lowerbound: false,
              upperbound: false
            },
            pv: []
          }]
        };
      }

      // Repetition / 50-move / agreed-draw endings are game-history facts that
      // are not always recoverable from a standalone FEN. If this is the final
      // game state and Play already recorded a draw termination, score it as
      // equal instead of asking Stockfish to reinterpret the finished game.
      if (
        stateIndex === A.positions.length &&
        A.snapshot &&
        A.snapshot.result === '1/2-1/2'
      ) {
        return {
          terminal: true,
          bestmove: null,
          lines: [{
            multipv: 1,
            depth: 0,
            score: {
              type: 'cp',
              value: 0,
              lowerbound: false,
              upperbound: false
            },
            pv: []
          }]
        };
      }
    } catch (_) {}

    return null;
  }

  async function analyzeBounded(fen, options, context) {
    const profile = context.profile;
    const started = performance.now();
    let watchdogTimer = null;
    let timedOut = false;

    const stageName = context.stage;
    const moveLabel = context.moveLabel;
    const moveIndex = context.moveIndex;
    const moveTotal = context.moveTotal;

    const searchOptions = Object.assign({}, options || {}, {
      movetime: profile.movetime,
      onInfo: function (info) {
        if (context.token !== A.token) return;

        const elapsed = Math.max(0, (performance.now() - started) / 1000);
        const depthText =
          info && info.depth ? ' · reached depth ' + info.depth : '';

        setAnalysisStatus(
          'Move ' + moveIndex + '/' + moveTotal +
          ' · ' + stageName +
          depthText +
          ' · ' + elapsed.toFixed(1) + 's',
          'neutral'
        );

        if (options && typeof options.onInfo === 'function') {
          try { options.onInfo(info); } catch (_) {}
        }
      }
    });

    const searchPromise = global.ChessEngine.analyzeFen(fen, searchOptions);

    const watchdogPromise = new Promise(function (_, reject) {
      watchdogTimer = setTimeout(function () {
        timedOut = true;
        try { global.ChessEngine.stop(); } catch (_) {}
        reject(
          new Error(
            'Stockfish exceeded the ' + profile.name.toLowerCase() +
            ' analysis watchdog on ' + moveLabel + '.'
          )
        );
      }, profile.watchdog);
    });

    try {
      return await Promise.race([searchPromise, watchdogPromise]);
    } finally {
      if (watchdogTimer) clearTimeout(watchdogTimer);

      // If the watchdog fired, do not leave a search silently running forever.
      if (timedOut) {
        try { global.ChessEngine.stop(); } catch (_) {}
      }
    }
  }

  async function runAnalysis() {
    if (A.running || !A.snapshot) return;

    const targets = selectedPositions();
    if (!targets.length) {
      setAnalysisStatus('There are no moves for the selected side.', 'bad');
      return;
    }

    const token = ++A.token;
    const profile = analysisProfile();
    const stateIndices = Core.requiredStateIndices(
      A.positions.length,
      targets.map(position => position.ply)
    );
    const stateAnalyses = new Map();
    let completedStates = 0;

    A.running = true;
    A.results = [];
    A.selectedResult = null;
    A.retry = null;
    A.side = ui.side.value;
    A.depth = Number(ui.depth.value || 12);

    ui.run.disabled = true;
    ui.cancel.disabled = false;
    ui.side.disabled = true;
    ui.depth.disabled = true;
    ui.summary.classList.add('hidden');
    ui.viewer.classList.add('hidden');
    ui.results.innerHTML = '';
    setReviewProgress(0, stateIndices.length);

    A.previousStrength = global.ChessEngine.getStrength();

    const estimate = approximateReviewSeconds(stateIndices.length, profile);

    try {
      setAnalysisStatus(
        'Preparing full Stockfish 18 · ' + profile.name +
        ' single-pass review · ' + stateIndices.length +
        ' game positions · about ' + humanDuration(estimate) +
        ' search budget…',
        'neutral'
      );

      await global.ChessEngine.init();
      await global.ChessEngine.setStrength({ mode: 'full' });

      /*
       * IMPORTANT:
       * Every review search uses MultiPV=2.
       *
       * Build 2.2.1/2.2.2 both succeeded on the first MultiPV=2 search and
       * failed in the immediately-following second-stage MultiPV=1 search.
       * The review therefore never toggles 2 -> 1 on the same worker.
       *
       * We analyze each required game STATE once. Move p is evaluated by:
       *   - best result from state p
       *   - actual result from state p+1, score-inverted back to the mover
       */
      for (let i = 0; i < stateIndices.length; i += 1) {
        if (token !== A.token) throw new Error('Analysis cancelled.');

        const stateIndex = stateIndices[i];
        const fen = fenForStateIndex(stateIndex);
        const terminal = terminalStateAnalysis(fen, stateIndex);

        if (terminal) {
          stateAnalyses.set(stateIndex, terminal);
          completedStates += 1;
          setReviewProgress(completedStates, stateIndices.length);

          setAnalysisStatus(
            'Position ' + completedStates + '/' + stateIndices.length +
            ' · terminal game state recognized locally.',
            'neutral'
          );
          continue;
        }

        const displayMove =
          stateIndex < A.positions.length
            ? Core.moveLabel(
                A.positions[stateIndex].ply,
                A.positions[stateIndex].move.san
              )
            : 'final position';

        setAnalysisStatus(
          'Position ' + (i + 1) + '/' + stateIndices.length +
          ' · analyzing before ' + displayMove +
          ' · ' + profile.name +
          ' (' + (profile.movetime / 1000).toFixed(1) + 's budget)…',
          'neutral'
        );

        const analysis = await analyzeBounded(
          fen,
          {
            multiPv: 2
          },
          {
            token,
            profile,
            stage: 'single-pass position analysis',
            moveLabel: displayMove,
            moveIndex: i + 1,
            moveTotal: stateIndices.length
          }
        );

        if (token !== A.token) throw new Error('Analysis cancelled.');

        stateAnalyses.set(stateIndex, analysis);
        completedStates += 1;
        setReviewProgress(completedStates, stateIndices.length);
      }

      if (token !== A.token) throw new Error('Analysis cancelled.');

      setAnalysisStatus(
        'Engine pass complete · building move review…',
        'neutral'
      );

      for (const position of targets) {
        const pre = stateAnalyses.get(position.ply);
        const post = stateAnalyses.get(position.ply + 1);

        if (!pre || !post) {
          throw new Error(
            'Missing cached analysis around ' +
            Core.moveLabel(position.ply, position.move.san) + '.'
          );
        }

        const bestLine = pre.lines && pre.lines[0] ? pre.lines[0] : null;
        const secondLine = pre.lines && pre.lines[1] ? pre.lines[1] : null;
        const postLine = post.lines && post.lines[0] ? post.lines[0] : null;
        const bestMove =
          pre.bestmove ||
          (bestLine && bestLine.pv && bestLine.pv[0]) ||
          null;

        // The next state has the opponent to move. Reverse that score so the
        // actual played move is measured from the original mover's perspective.
        const playedLine =
          bestMove === position.move.uci
            ? bestLine
            : moverPerspectiveLine(postLine);

        const classification = Core.classify({
          bestScore: scoreFromLine(bestLine),
          playedScore: scoreFromLine(playedLine),
          bestMove,
          playedMove: position.move.uci
        });

        const gapCp = cpGap(bestLine, secondLine);
        const onlyMoveLike =
          Number.isFinite(gapCp) && gapCp >= 150;

        const postFen = fenForStateIndex(position.ply + 1);

        const result = {
          ply: position.ply,
          color: position.move.color,
          actor: position.move.actor,
          fen: position.fen,
          previousUci: position.previousUci,
          san: position.move.san,
          uci: position.move.uci,
          bestMove,
          bestSan: uciToSan(position.fen, bestMove),
          secondMove:
            secondLine && secondLine.pv && secondLine.pv[0]
              ? secondLine.pv[0]
              : null,
          secondSan:
            secondLine && secondLine.pv && secondLine.pv[0]
              ? uciToSan(position.fen, secondLine.pv[0])
              : null,
          bestScore: scoreFromLine(bestLine),
          playedScore: scoreFromLine(playedLine),
          bestPvUci:
            bestLine && bestLine.pv ? bestLine.pv.slice(0, 10) : [],
          playedPvUci:
            bestMove === position.move.uci
              ? (
                  bestLine && bestLine.pv
                    ? bestLine.pv.slice(0, 10)
                    : [position.move.uci]
                )
              : [position.move.uci].concat(
                  postLine && postLine.pv ? postLine.pv.slice(0, 9) : []
                ),
          bestPvSan:
            bestLine && bestLine.pv
              ? pvToSan(position.fen, bestLine.pv, 8)
              : '—',
          playedPvSan:
            bestMove === position.move.uci
              ? (
                  bestLine && bestLine.pv
                    ? pvToSan(position.fen, bestLine.pv, 8)
                    : position.move.san
                )
              : (
                  position.move.san +
                  (
                    postLine && postLine.pv && postLine.pv.length
                      ? ' ' + pvToSan(postFen, postLine.pv, 7)
                      : ''
                  )
                ),
          bestSecondGapCp: gapCp,
          onlyMoveLike,
          classification,
          critical:
            classification.severity >= 2 ||
            onlyMoveLike ||
            (
              scoreFromLine(bestLine) &&
              scoreFromLine(bestLine).type === 'mate'
            )
        };

        A.results.push(result);
        renderResultRow(result);
      }

      setReviewProgress(stateIndices.length, stateIndices.length);
      renderSummary();

      setAnalysisStatus(
        'Analysis complete · full Stockfish 18 · ' +
        profile.name + ' single-pass review.',
        'good'
      );

      if (A.results.length) {
        const firstKey = A.results.find(row => row.critical);
        selectResult((firstKey || A.results[0]).ply);
      }
    } catch (error) {
      const cancelled =
        token !== A.token ||
        (error && error.name === 'CancelledError') ||
        /cancel/i.test(String(error && error.message));

      setAnalysisStatus(
        cancelled
          ? 'Analysis canceled.'
          : 'Analysis stopped safely: ' +
            (error.message || String(error)) +
            ' You can run it again at Quick speed.',
        cancelled ? 'neutral' : 'bad'
      );
    } finally {
      /*
       * Review deliberately leaves MultiPV at 2 while it is running.
       * Restore the user's playing strength, then destroy this review worker.
       * The next Play game starts a fresh Stockfish worker at its normal
       * MultiPV=1 default, avoiding a live 2 -> 1 transition altogether.
       */
      if (A.previousStrength) {
        try {
          await global.ChessEngine.setStrength(A.previousStrength);
        } catch (_) {}
      }

      try { global.ChessEngine.terminate(); } catch (_) {}

      if (token === A.token) {
        A.running = false;
        ui.run.disabled = false;
        ui.cancel.disabled = true;
        ui.side.disabled = false;
        ui.depth.disabled = false;
      }
    }
  }

  function cancelAnalysis() {
    if (!A.running) return;

    A.token += 1;
    A.running = false;

    try { global.ChessEngine.stop(); } catch (_) {}

    ui.run.disabled = false;
    ui.cancel.disabled = true;
    ui.side.disabled = false;
    ui.depth.disabled = false;
    setAnalysisStatus('Stopping analysis…', 'neutral');
  }

  function feedbackSentence(result) {
    const label =
      result && result.classification
        ? result.classification.label
        : 'Move';

    const played = result ? result.san : 'this move';
    const best = result && result.bestSan ? result.bestSan : 'another move';

    if (label === 'Best') {
      return 'You played ' + played + ' — Stockfish’s first choice.';
    }

    if (label === 'Good') {
      return 'Solid move. Stockfish slightly preferred ' + best + '.';
    }

    if (label === 'Inaccuracy') {
      return 'This gave up a small part of the position. ' + best + ' was better.';
    }

    if (label === 'Mistake') {
      return 'This noticeably worsened the position. ' + best + ' was stronger.';
    }

    if (label === 'Blunder') {
      return 'This sharply worsened the position. ' + best + ' was the key move.';
    }

    if (label === 'Missed win') {
      return 'This missed a winning opportunity. ' + best + ' kept the advantage.';
    }

    if (label === 'Missed mate') {
      return 'This missed a forced mate. ' + best + ' was the mating continuation.';
    }

    return 'You played ' + played + '. Stockfish preferred ' + best + '.';
  }

  function setMoveFilter(keyOnly) {
    A.keyOnly = !!keyOnly;

    if (ui.allMoves) ui.allMoves.classList.toggle('active', !A.keyOnly);
    if (ui.keyMoves) ui.keyMoves.classList.toggle('active', A.keyOnly);

    for (const row of ui.results.querySelectorAll('.analysis-row')) {
      const isCritical = row.dataset.critical === '1';
      row.classList.toggle(
        'ct-filtered-out',
        A.keyOnly && !isCritical
      );
    }
  }

  function moveCriticalSelection(direction) {
    if (!A.results.length) return;

    const critical = A.results.filter(row => row.critical);
    if (!critical.length) return;

    if (!A.selectedResult) {
      selectResult(critical[0].ply);
      return;
    }

    const currentIndex = A.results.indexOf(A.selectedResult);
    const step = Number(direction) >= 0 ? 1 : -1;

    if (step > 0) {
      const next = critical.find(row => A.results.indexOf(row) > currentIndex);
      if (next) selectResult(next.ply);
      else selectResult(critical[0].ply);
      return;
    }

    const prior = critical
      .slice()
      .reverse()
      .find(row => A.results.indexOf(row) < currentIndex);

    if (prior) selectResult(prior.ply);
    else selectResult(critical[critical.length - 1].ply);
  }

  function renderResultRow(result) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className =
      'analysis-row' + (result.critical ? ' critical' : '');
    row.dataset.ply = String(result.ply);
    row.dataset.critical = result.critical ? '1' : '0';

    const loss =
      result.classification && Number.isFinite(result.classification.lossPp)
        ? result.classification.lossPp.toFixed(1)
        : '0.0';

    row.innerHTML = `
      <span class="analysis-move">
        ${escapeHtml(Core.moveLabel(result.ply, result.san))}
      </span>
      <span class="analysis-row-best">
        ${result.classification.label === 'Best'
          ? 'top choice'
          : 'best ' + escapeHtml(result.bestSan || '—') + ' · −' + escapeHtml(loss) + ' pp'}
      </span>
      <span class="analysis-chip ${escapeHtml(result.classification.slug)}">
        ${escapeHtml(result.classification.label)}
      </span>
    `;

    row.addEventListener('click', function () {
      selectResult(result.ply);
    });

    ui.results.appendChild(row);

    if (A.keyOnly && !result.critical) {
      row.classList.add('ct-filtered-out');
    }
  }

  function renderSummary() {
    const summary = Core.summarize(A.results);
    const notable = [];

    for (const label of [
      'Missed mate',
      'Missed win',
      'Blunder',
      'Mistake',
      'Inaccuracy'
    ]) {
      if (summary.counts[label]) {
        notable.push(
          summary.counts[label] + ' ' + label.toLowerCase() +
          (summary.counts[label] === 1 ? '' : 's')
        );
      }
    }

    const worst = summary.worst;
    const worstText =
      worst && worst.classification
        ? Core.moveLabel(worst.ply, worst.san) +
          ' (' + worst.classification.label + ')'
        : 'none';

    ui.summary.innerHTML = `
      <div class="summary-big">
        ${summary.total} reviewed · ${summary.critical} key move${summary.critical === 1 ? '' : 's'}
      </div>
      <div class="summary-small">
        ${escapeHtml(notable.length ? notable.join(' · ') : 'No inaccuracies or worse by the current thresholds.')}
        · largest swing: ${escapeHtml(worstText)}
      </div>
    `;

    ui.summary.classList.remove('hidden');

    const sideLabel =
      A.side === 'white'
        ? 'White only'
        : A.side === 'black'
          ? 'Black only'
          : 'Both sides';

    const profile = analysisProfile();

    ui.reviewMetaText.textContent =
      sideLabel + ' · ' + profile.name + ' · full Stockfish 18';

    ui.panel.classList.add('has-results');
    ui.panel.classList.remove('show-setup');
    ui.reanalyze.textContent = 'Analysis settings';
  }

  function selectResult(ply) {
    const result = A.results.find(row => row.ply === Number(ply));
    if (!result) return;

    endRetry();
    A.selectedResult = result;

    for (const row of ui.results.querySelectorAll('.analysis-row')) {
      row.classList.toggle(
        'selected',
        Number(row.dataset.ply) === result.ply
      );
    }

    const engine = Engine();
    engine.fromFEN(result.fen);
    S.active = false;
    S.solved = true;
    S.selected = null;
    S.targets = [];

    const previous = uciParts(result.previousUci);
    drawBoard(engine, {
      selectable: false,
      last: previous ? { from: previous.from, to: previous.to } : null
    });

    const loss = result.classification.lossPp.toFixed(1);
    const gap =
      Number.isFinite(result.bestSecondGapCp)
        ? (result.bestSecondGapCp / 100).toFixed(2)
        : '—';

    ui.viewerTitle.innerHTML = `
      <span class="analysis-selected-move">
        ${escapeHtml(Core.moveLabel(result.ply, result.san))}
      </span>
      <span class="analysis-chip ${escapeHtml(result.classification.slug)}">
        ${escapeHtml(result.classification.label)}
      </span>
    `;

    ui.viewerDetails.innerHTML = `
      <div class="analysis-feedback-line">
        ${escapeHtml(feedbackSentence(result))}
      </div>

      <div class="analysis-eval-grid">
        <div class="analysis-eval-box">
          <span class="analysis-eval-label">Played</span>
          <span class="analysis-eval-value">
            ${escapeHtml(result.san)} · ${escapeHtml(Core.formatScore(result.playedScore))}
          </span>
        </div>
        <div class="analysis-eval-box">
          <span class="analysis-eval-label">Best</span>
          <span class="analysis-eval-value">
            ${escapeHtml(result.bestSan || '—')} · ${escapeHtml(Core.formatScore(result.bestScore))}
          </span>
        </div>
        <div class="analysis-eval-box">
          <span class="analysis-eval-label">Loss</span>
          <span class="analysis-eval-value">${escapeHtml(loss)} pp</span>
        </div>
      </div>

      ${result.onlyMoveLike
        ? '<div class="note"><strong>Key choice:</strong> Stockfish sees a large gap to the second-best move.</div>'
        : ''}
    `;

    ui.viewerPv.innerHTML = `
      <span class="analysis-line-label">Best line:</span>
      ${escapeHtml(result.bestPvSan)}
      <br>
      <span class="analysis-line-label">Second choice:</span>
      ${escapeHtml(result.secondSan || '—')}
      · gap ${escapeHtml(gap)}
    `;

    ui.retry.disabled = A.running;
    ui.save.disabled =
      A.running ||
      !result.bestMove ||
      !result.bestPvUci.length ||
      result.classification.severity < 2;

    ui.save.textContent =
      result.classification.severity >= 2
        ? 'Turn into puzzle'
        : 'Puzzle save for inaccuracies+';

    ui.retryStatus.textContent =
      'The board shows the position immediately before this move.';

    const index = A.results.indexOf(result);
    ui.prev.disabled = index <= 0;
    ui.next.disabled = index < 0 || index >= A.results.length - 1;
    ui.nextCritical.disabled = !A.results.some(row => row.critical);

    ui.viewer.classList.remove('hidden');

    const selectedRow = ui.results.querySelector(
      '.analysis-row[data-ply="' + String(result.ply) + '"]'
    );
    if (selectedRow && typeof selectedRow.scrollIntoView === 'function') {
      selectedRow.scrollIntoView({ block: 'nearest' });
    }
  }

  function moveSelection(delta) {
    if (!A.selectedResult) return;

    const index = A.results.indexOf(A.selectedResult);
    const target = index + Number(delta);

    if (target < 0 || target >= A.results.length) return;
    selectResult(A.results[target].ply);
  }

  function showFinalPosition() {
    endRetry();

    if (!A.snapshot || !A.snapshot.finalFen) return;

    const engine = Engine();
    engine.fromFEN(A.snapshot.finalFen);
    S.active = false;
    S.solved = true;
    S.selected = null;
    S.targets = [];

    const last =
      A.snapshot.moves.length
        ? uciParts(A.snapshot.moves[A.snapshot.moves.length - 1].uci)
        : null;

    drawBoard(engine, {
      selectable: false,
      last: last ? { from: last.from, to: last.to } : null
    });

    if (ui && !ui.viewer.classList.contains('hidden')) {
      ui.retryStatus.textContent =
        'Final game position shown. Select an analyzed move to inspect it again.';
    }
  }

  function beginRetry() {
    const result = A.selectedResult;
    if (!result || A.running) return;

    const engine = Engine();
    engine.fromFEN(result.fen);

    A.retry = {
      result,
      engine,
      selected: null,
      targets: [],
      evaluating: false,
      rec: null
    };

    S.active = false;
    S.solved = false;
    S.selected = null;
    S.targets = [];

    ui.retry.textContent = 'Retrying…';
    ui.retry.disabled = true;
    ui.save.disabled = true;
    ui.retryStatus.textContent =
      'Retry: find your move from this position. Click a piece, then a destination.';

    renderRetryBoard();
  }

  function endRetry() {
    if (!A.retry) return;
    A.retry = null;
    S.selected = null;
    S.targets = [];

    if (ui) {
      ui.retry.textContent = 'Retry this position';
      ui.retry.disabled = A.running;
      if (A.selectedResult) {
        ui.save.disabled =
          A.running || A.selectedResult.classification.severity < 2;
      }
    }
  }

  function renderRetryBoard(last) {
    if (!A.retry) return;

    S.selected = A.retry.selected;
    S.targets = A.retry.targets;

    drawBoard(A.retry.engine, {
      selectable: !A.retry.evaluating,
      last: last || null
    });
  }

  function retrySquare(index) {
    if (!A.retry || A.retry.evaluating) return;

    const retry = A.retry;
    const piece = retry.engine.get(index);
    const side = retry.engine.turn();

    if (retry.selected !== null) {
      const candidates = retry.targets.filter(move => move.to === index);

      if (candidates.length) {
        let move =
          candidates.find(candidate => candidate.promo === 'q') ||
          candidates[0];
        evaluateRetryMove(move);
        return;
      }

      if (piece && piece.c === side) {
        retry.selected = index;
        retry.targets = retry.engine.legal().filter(move => move.from === index);
        renderRetryBoard();
        return;
      }

      retry.selected = null;
      retry.targets = [];
      renderRetryBoard();
      return;
    }

    if (piece && piece.c === side) {
      retry.selected = index;
      retry.targets = retry.engine.legal().filter(move => move.from === index);
      renderRetryBoard();
    }
  }

  async function evaluateRetryMove(move) {
    if (!A.retry || A.retry.evaluating) return;

    const retry = A.retry;
    const result = retry.result;
    const uci = retry.engine.uci(move);

    retry.evaluating = true;
    retry.selected = null;
    retry.targets = [];

    retry.rec = retry.engine.make(move);
    renderRetryBoard({ from: move.from, to: move.to });

    ui.retryStatus.textContent = 'Checking your retry with full Stockfish…';

    const oldStrength = global.ChessEngine.getStrength();

    try {
      await global.ChessEngine.setStrength({ mode: 'full' });

      const searched =
        uci === result.bestMove
          ? null
          : await global.ChessEngine.analyzeFen(retry.engine.toFEN(), {
              movetime: analysisProfile().movetime,
              multiPv: 1
            });

      const playedScore =
        uci === result.bestMove
          ? result.bestScore
          : Core.invertScore(
              (
                searched &&
                searched.lines &&
                searched.lines[0] &&
                searched.lines[0].score
              ) || null
            );

      const judged = Core.classify({
        bestScore: result.bestScore,
        playedScore,
        bestMove: result.bestMove,
        playedMove: uci
      });

      if (judged.lossPp < 2) {
        ui.retryStatus.innerHTML =
          '<strong>Accepted.</strong> Your retry preserves the engine result' +
          (uci === result.bestMove
            ? ' and matches Stockfish’s first choice.'
            : ' closely enough to count as an equivalent practical choice.') +
          ' <div class="btns" style="margin-top:8px;">' +
          '<button class="act" id="analysis-retry-again" type="button">Retry again</button>' +
          '<button class="act" id="analysis-back-review" type="button">Back to review</button>' +
          '</div>';
      } else {
        ui.retryStatus.innerHTML =
          '<strong>' + escapeHtml(judged.label) + '.</strong> ' +
          'This retry loses about ' + judged.lossPp.toFixed(1) +
          ' estimated win-chance points versus ' +
          escapeHtml(result.bestSan) +
          '. <div class="btns" style="margin-top:8px;">' +
          '<button class="act" id="analysis-retry-again" type="button">Try again</button>' +
          '<button class="act" id="analysis-back-review" type="button">Back to review</button>' +
          '</div>';
      }

      const again = document.getElementById('analysis-retry-again');
      if (again) {
        again.addEventListener('click', function () {
          selectResult(result.ply);
          beginRetry();
        });
      }

      const back = document.getElementById('analysis-back-review');
      if (back) {
        back.addEventListener('click', function () {
          selectResult(result.ply);
        });
      }
    } catch (error) {
      ui.retryStatus.textContent =
        'Retry check failed: ' + (error.message || String(error));
    } finally {
      try { await global.ChessEngine.setStrength(oldStrength); } catch (_) {}
      if (A.retry) A.retry.evaluating = true; // lock board after judged move
    }
  }

  async function saveSelectedPuzzle() {
    const result = A.selectedResult;
    if (
      !result ||
      result.classification.severity < 2 ||
      !result.bestPvUci.length
    ) return;

    const line = result.bestPvUci.slice(0, 7);
    if (!validateReviewLine(result.fen, line)) {
      ui.retryStatus.textContent =
        'The engine line could not be validated as a local puzzle.';
      return;
    }

    const uid =
      'personal:' +
      Core.hash(
        result.fen + '|' +
        result.bestMove + '|' +
        (A.snapshot ? A.snapshot.pgn : '')
      );

    const puzzle = {
      uid,
      fen: result.fen,
      line,
      side: result.color,
      theme: PERSONAL_THEME,
      themes: ['personalMistake'],
      level: levelForSnapshot(A.snapshot),
      solverMoves: Math.ceil(line.length / 2),
      rating: 0,
      popularity: 0,
      source: 'Personal mistake notebook',
      sourceRef:
        'Game review · ' +
        Core.moveLabel(result.ply, result.san) +
        ' · played ' + result.san +
        ' · engine best ' + result.bestSan,
      gamePgn: A.snapshot ? A.snapshot.pgn : '',
      validated: true,
      uniqueBest: false,
      rand: Math.random()
    };

    try {
      if (
        typeof writePuzzleBatch === 'function' &&
        typeof refreshDBStats === 'function'
      ) {
        await writePuzzleBatch([puzzle]);
        await refreshDBStats();
        ensurePersonalThemeOption();

        ui.retryStatus.textContent =
          'Saved to your local puzzle database. In Puzzle library choose ' +
          'Source: Imported and Theme: Personal mistake.';
        ui.save.textContent = 'Saved ✓';
        ui.save.disabled = true;
        return;
      }

      saveFallbackPuzzle(puzzle);
      ui.retryStatus.textContent =
        'Saved to the local personal-mistake notebook.';
      ui.save.textContent = 'Saved ✓';
      ui.save.disabled = true;
    } catch (error) {
      ui.retryStatus.textContent =
        'Could not save puzzle: ' + (error.message || String(error));
    }
  }

  function validateReviewLine(fen, line) {
    try {
      const engine = Engine();
      engine.fromFEN(fen);

      for (const uci of line) {
        const move = engine.findLegalUci(String(uci));
        if (!move) return false;
        engine.make(move);
      }

      return line.length > 0;
    } catch (_) {
      return false;
    }
  }

  function saveFallbackPuzzle(puzzle) {
    let items = [];

    try {
      const parsed = JSON.parse(
        localStorage.getItem(FALLBACK_NOTEBOOK_KEY) || '[]'
      );
      if (Array.isArray(parsed)) items = parsed;
    } catch (_) {}

    const next = items.filter(item => item && item.uid !== puzzle.uid);
    next.push(puzzle);

    while (next.length > 250) next.shift();

    localStorage.setItem(FALLBACK_NOTEBOOK_KEY, JSON.stringify(next));
  }

  function levelForSnapshot(snapshot) {
    const raw =
      snapshot &&
      snapshot.settings &&
      String(snapshot.settings.strength || '');

    const match = raw.match(/^elo:(\d+)/);
    if (!match) return 'Advanced';

    const elo = Number(match[1]);
    if (elo <= 1200) return 'Beginner';
    if (elo <= 1900) return 'Intermediate';
    return 'Advanced';
  }

  function ensurePersonalThemeOption() {
    const select = document.getElementById('f-theme');
    if (!select) return;

    const existing = Array.from(select.options).some(
      option => option.value === PERSONAL_THEME
    );

    if (existing) return;

    const option = document.createElement('option');
    option.value = PERSONAL_THEME;
    option.textContent = PERSONAL_THEME;
    select.appendChild(option);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Core.squareName is intentionally made available to the browser-only SAN
  // formatter without changing the Node-test surface elsewhere.
  if (!Core.squareName) {
    Core.squareName = function (index) {
      return 'abcdefgh'[index & 7] + ((index >> 3) + 1);
    };
  }

  createUi();

  global.PostGameAnalysis = {
    build: BUILD_ID,
    hotfix: ANALYSIS_HOTFIX_ID,
    method: 'single-pass-cached-game-states-v3',
    scheduler: 'bounded-movetime-multipv2-only-with-watchdog',
    playedMoveEvaluation: 'next-state-score-inversion',
    workspaceLayout: 'guided-review-panel-2.2.5',
    reviewUx: 'selected-move-first-compact-list-key-navigation',
    labels: 'estimated-win-chance-loss',
    open: openAnalysis,
    close: function () { closeAnalysis(true); },
    cancel: cancelAnalysis,
    status: function () {
      return {
        open: A.open,
        running: A.running,
        depth: A.depth,
        side: A.side,
        resultCount: A.results.length,
        selectedPly: A.selectedResult ? A.selectedResult.ply : null
      };
    },
    core: Core
  };

  console.info('[Tactics Trainer] Loaded ' + BUILD_ID);
}(typeof globalThis !== 'undefined' ? globalThis : this));
