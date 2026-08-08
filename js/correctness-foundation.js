/* Chess Tactics Trainer — Build 1.2.2 initial-replay timing fix + progressive hints + correctness foundation
 *
 * Loaded after the existing application by scripts/apply_correctness_foundation.py.
 * It deliberately does not replace the current board, database, or million-puzzle
 * loader. Build 1.2 preserves the Build 1/1.1 correctness and UX behavior,
 * adds replay controls that can navigate ONLY through moves already shown,
 * and adds progressive two-stage hints for each solver move.
 */
(function () {
  'use strict';

  const BUILD_ID = 'correctness-foundation-1.2.2';

  function mateTargetForPuzzle(p) {
    if (!p) return null;

    const themes = Array.isArray(p.themes) ? p.themes : [];
    for (const raw of themes) {
      const m = String(raw).match(/^mateIn(\d+)$/i);
      if (m) return Number(m[1]);
    }

    const theme = String(p.theme || '');
    const named = theme.match(/\bMate\s+in\s+(\d+)\b/i);
    if (named) return Number(named[1]);

    // Some packs tag a puzzle simply "mate". In that case the stored
    // solver-move length is the best available target.
    if (themes.some(t => String(t).toLowerCase() === 'mate') ||
        /\bmate\b/i.test(theme)) {
      const n = Number(p.solverMoves || Math.ceil((p.line || []).length / 2));
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    return null;
  }

  function acceptancePolicyForPuzzle(p) {
    const mateIn = mateTargetForPuzzle(p);
    if (mateIn) {
      return {
        kind: 'forcedMate',
        mateIn,
        label: 'mating alternatives accepted'
      };
    }
    if (p && p.uniqueBest) {
      return {
        kind: 'storedOnly',
        label: 'source marks an only move'
      };
    }
    return {
      kind: 'storedLine',
      label: 'verified solution line'
    };
  }

  function sameMove(a, b) {
    return !!a && !!b &&
      a.from === b.from &&
      a.to === b.to &&
      ((!a.promo && !b.promo) ||
       a.promo === (b.promo || null) ||
       (b.promo && !a.promo));
  }

  /*
   * Verify that the attacker can force mate from the CURRENT position
   * within attackerMovesLeft additional moves.
   *
   * This is intentionally objective-based:
   *   - attacker nodes are existential (some move must force mate);
   *   - defender nodes are universal (every legal defense must still lose).
   *
   * Returned line chooses the attacker's shortest mate and, among defenses,
   * a defense that prolongs mate. This supplies a sensible continuation after
   * the user chooses an alternate valid mating route.
   */
  function verifyForcedMateFromPosition(eng, attacker, attackerMovesLeft, options) {
    options = options || {};
    const maxNodes = Number(options.maxNodes || 350000);
    let nodes = 0;
    const memo = new Map();

    function key(left) {
      return eng.toFEN() + '|' + attacker + '|' + left;
    }

    function solve(left) {
      if (++nodes > maxNodes) return { status: 'unknown', line: [] };

      if (eng.isMate()) {
        // The side to move is checkmated. Success only when that side
        // is the defender.
        return eng.turn() !== attacker
          ? { status: 'yes', line: [] }
          : { status: 'no', line: [] };
      }

      if (eng.isStale()) return { status: 'no', line: [] };
      if (left <= 0) return { status: 'no', line: [] };

      const memoKey = key(left);
      const hit = memo.get(memoKey);
      if (hit) return { status: hit.status, line: hit.line.slice() };

      const moves = eng.legal();
      if (!moves.length) return { status: 'no', line: [] };

      if (eng.turn() === attacker) {
        let best = null;

        for (const m of moves) {
          const u = eng.uci(m);
          const rec = eng.make(m);
          const sub = solve(left - 1);
          eng.unmake(rec);

          if (sub.status === 'unknown') {
            // Keep searching. A definite mate found elsewhere is enough.
            continue;
          }
          if (sub.status !== 'yes') continue;

          const candidate = [u, ...sub.line];
          if (!best || candidate.length < best.length) best = candidate;
        }

        const out = best
          ? { status: 'yes', line: best }
          : (nodes > maxNodes
              ? { status: 'unknown', line: [] }
              : { status: 'no', line: [] });

        if (out.status !== 'unknown') memo.set(memoKey, { status: out.status, line: out.line.slice() });
        return out;
      }

      // Defender to move: EVERY defense must still be met by a forced mate.
      let longestDefense = [];
      for (const m of moves) {
        const u = eng.uci(m);
        const rec = eng.make(m);
        const sub = solve(left);
        eng.unmake(rec);

        if (sub.status === 'unknown') return { status: 'unknown', line: [] };
        if (sub.status !== 'yes') {
          memo.set(memoKey, { status: 'no', line: [] });
          return { status: 'no', line: [] };
        }

        const candidate = [u, ...sub.line];
        if (candidate.length > longestDefense.length) longestDefense = candidate;
      }

      const out = { status: 'yes', line: longestDefense };
      memo.set(memoKey, { status: out.status, line: out.line.slice() });
      return out;
    }

    const result = solve(attackerMovesLeft);
    result.nodes = nodes;
    return result;
  }


  /*
   * Lichess puzzle records start one ply BEFORE the tactical position.
   * The first UCI move is the opponent's setup/blunder move; the solver's
   * solution begins with the second UCI move.
   *
   * The base app correctly applies that setup move when normalizing a puzzle,
   * but it previously discarded the pre-move FEN and setup move. Preserve both
   * here so startPuzzle can actually SHOW the opponent's move.
   */
  if (typeof normalizeCloudRecord === 'function') {
    const previousNormalizeCloudRecord = normalizeCloudRecord;
    normalizeCloudRecord = function (r) {
      const p = previousNormalizeCloudRecord(r);
      if (p && Array.isArray(r)) {
        const all = String(r[2] || '').trim().split(/\s+/).filter(Boolean);
        if (r[1] && all[0]) {
          p.introFen = String(r[1]);
          p.introMove = all[0];
        }
      }
      return p;
    };
  }

  if (typeof normalizeLichess === 'function') {
    const previousNormalizeLichess = normalizeLichess;
    normalizeLichess = function (cols, h) {
      const p = previousNormalizeLichess(cols, h);
      if (p && cols && h) {
        const all = String(cols[h.Moves] || '').trim().split(/\s+/).filter(Boolean);
        if (cols[h.FEN] && all[0]) {
          p.introFen = String(cols[h.FEN]);
          p.introMove = all[0];
        }
      }
      return p;
    };
  }

  let introTimer = null;
  let tryAgainWrap = null;
  let pendingWrong = null;

  // index.html registers these handlers before this add-on is loaded.
  // Keep the exact original function objects so we can remove those listeners
  // after installing the Build 1.2.1 replacements.
  const originalHintClickHandler = doHint;
  const originalSolutionClickHandler = doSolution;

  // Build 1.2: a revealed-only move timeline. It NEVER contains future
  // solution moves. Back/Forward can therefore never leak the hidden answer.
  const Replay = {
    wrap: null,
    back: null,
    forward: null,
    note: null,
    baseFen: null,
    moves: [],
    view: 0
  };

  // Progressive hint state is per solver turn.
  let hintStage = 0;       // 0 = none, 1 = source piece, 2 = destination
  let hintStep = -1;

  function installUxStyle() {
    if (document.getElementById('ct-build-1-2-style')) return;
    const style = document.createElement('style');
    style.id = 'ct-build-1-2-style';
    style.textContent = `
      .sq.ct-hint-source::after{
        content:""; position:absolute; inset:5%; z-index:4; pointer-events:none;
        border:4px solid rgba(255,215,64,.92); border-radius:9px;
        box-shadow:0 0 0 2px rgba(20,20,20,.18);
      }
      .sq.ct-hint-target::after{
        content:""; position:absolute; inset:12%; z-index:4; pointer-events:none;
        border:5px solid rgba(129,182,76,.96); border-radius:50%;
        box-shadow:0 0 0 2px rgba(20,20,20,.18);
      }
      #ct-replay-wrap{ margin-top:-3px; }
      #ct-replay-note{ margin-top:-5px; text-align:center; }
    `;
    document.head.appendChild(style);
  }

  function boardCellForSquare(square) {
    if (!boardEl || square == null || square < 0 || square > 63) return null;
    const file = square % 8;
    const rank = Math.floor(square / 8);
    const row = S.flipped ? rank : 7 - rank;
    const col = S.flipped ? 7 - file : file;
    return boardEl.children[row * 8 + col] || null;
  }

  function clearHintVisuals() {
    if (!boardEl) return;
    boardEl.querySelectorAll('.ct-hint-source,.ct-hint-target').forEach(function (el) {
      el.classList.remove('ct-hint-source', 'ct-hint-target');
    });
  }

  function applyHintVisuals() {
    clearHintVisuals();
    if (hintStage <= 0 || hintStep !== S.step || S.busy || pendingWrong) return;
    if (!S.line || S.step >= S.line.length) return;

    const exp = toIdx(S.line[S.step]);
    const source = boardCellForSquare(exp.from);
    if (source) source.classList.add('ct-hint-source');

    if (hintStage >= 2) {
      const target = boardCellForSquare(exp.to);
      if (target) target.classList.add('ct-hint-target');
    }
  }

  function resetHintState() {
    hintStage = 0;
    hintStep = S.step;
    if (S.hintEl) {
      S.hintEl.textContent = 'Hint';
      S.hintEl.disabled = !!S.solved || !!S.busy || !!pendingWrong || Replay.view < Replay.moves.length;
    }
    clearHintVisuals();
  }

  function syncHintButton() {
    if (!S.hintEl) return;

    if (S.solved || S.busy || pendingWrong || Replay.view < Replay.moves.length) {
      S.hintEl.disabled = true;
      return;
    }

    if (hintStep !== S.step) {
      hintStage = 0;
      hintStep = S.step;
    }

    if (hintStage === 0) {
      S.hintEl.textContent = 'Hint';
      S.hintEl.disabled = false;
    } else if (hintStage === 1) {
      S.hintEl.textContent = 'More hint';
      S.hintEl.disabled = false;
    } else {
      S.hintEl.textContent = 'Hint shown';
      S.hintEl.disabled = true;
    }
  }

  function initReplay(p) {
    Replay.baseFen = p && p.introFen ? String(p.introFen) : String((p && p.fen) || '');
    Replay.moves = [];
    Replay.view = 0;
    updateReplayButtons();
  }

  function appendRevealedMove(uci) {
    if (!uci) return;
    Replay.moves.push(String(uci));
    Replay.view = Replay.moves.length;
    updateReplayButtons();
  }

  function replayEngineAt(view) {
    const e = Engine();
    e.fromFEN(Replay.baseFen);

    for (let i = 0; i < view; i++) {
      const m = e.findLegalUci(Replay.moves[i]);
      if (!m) throw new Error('Could not replay revealed move ' + Replay.moves[i]);
      e.make(m);
    }
    return e;
  }

  function updateReplayButtons() {
    if (!Replay.back || !Replay.forward) return;

    const blocked = !!S.busy || !!pendingWrong || !Replay.baseFen;
    Replay.back.disabled = blocked || Replay.view <= 0;
    Replay.forward.disabled = blocked || Replay.view >= Replay.moves.length;

    if (Replay.note) {
      if (!Replay.moves.length) {
        Replay.note.textContent = 'Replay becomes available after a move has been shown.';
      } else if (Replay.view < Replay.moves.length) {
        Replay.note.textContent =
          'Reviewing revealed moves only · position ' + Replay.view + '/' + Replay.moves.length;
      } else {
        Replay.note.textContent =
          'Back / Forward replays only moves already shown — never the hidden solution.';
      }
    }
  }

  function showReplayPosition() {
    if (!Replay.baseFen || Replay.view >= Replay.moves.length) {
      // Live position.
      baseRenderSolve();
      applyHintVisuals();
      syncHintButton();
      if (S.solEl) S.solEl.disabled = !!S.solved || !!S.busy || !!pendingWrong;
      updateReplayButtons();
      return;
    }

    try {
      const e = replayEngineAt(Replay.view);
      let last = null;
      if (Replay.view > 0) {
        const u = toIdx(Replay.moves[Replay.view - 1]);
        last = { from: u.from, to: u.to };
      }
      drawBoard(e, { selectable: false, last: last });
      clearHintVisuals();

      if (S.hintEl) S.hintEl.disabled = true;
      if (S.solEl) S.solEl.disabled = true;
      updateReplayButtons();
    } catch (_) {
      Replay.view = Replay.moves.length;
      baseRenderSolve();
      updateReplayButtons();
    }
  }

  function ensureReplayUI() {
    installUxStyle();

    if (Replay.wrap && Replay.wrap.isConnected) {
      updateReplayButtons();
      return;
    }

    const fb = S.fbEl;
    if (!fb || !fb.parentNode) return;

    const wrap = document.createElement('div');
    wrap.className = 'btns';
    wrap.id = 'ct-replay-wrap';

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'act';
    back.id = 'ct-replay-back';
    back.textContent = '‹ Back';

    const forward = document.createElement('button');
    forward.type = 'button';
    forward.className = 'act';
    forward.id = 'ct-replay-forward';
    forward.textContent = 'Forward ›';

    const note = document.createElement('div');
    note.className = 'note';
    note.id = 'ct-replay-note';

    back.addEventListener('click', function () {
      if (back.disabled) return;
      Replay.view = Math.max(0, Replay.view - 1);
      showReplayPosition();
    });

    forward.addEventListener('click', function () {
      if (forward.disabled) return;
      Replay.view = Math.min(Replay.moves.length, Replay.view + 1);
      showReplayPosition();
    });

    wrap.appendChild(back);
    wrap.appendChild(forward);

    fb.insertAdjacentElement('afterend', wrap);
    wrap.insertAdjacentElement('afterend', note);

    Replay.wrap = wrap;
    Replay.back = back;
    Replay.forward = forward;
    Replay.note = note;
    updateReplayButtons();
  }

  // Wrap the app's renderer so board flips and other redraws respect replay
  // mode and persistent progressive-hint markings.
  const baseRenderSolve = renderSolve;
  renderSolve = function () {
    if (Replay.baseFen && Replay.view < Replay.moves.length) {
      showReplayPosition();
      return;
    }
    baseRenderSolve();
    applyHintVisuals();
    syncHintButton();
    updateReplayButtons();
  };

  function removeTryAgainUI() {
    if (tryAgainWrap && tryAgainWrap.parentNode) {
      tryAgainWrap.parentNode.removeChild(tryAgainWrap);
    }
    tryAgainWrap = null;
  }

  function clearPendingWrong() {
    removeTryAgainUI();
    pendingWrong = null;
  }

  function showTryAgainButton(rec) {
    removeTryAgainUI();
    pendingWrong = rec;

    const wrap = document.createElement('div');
    wrap.className = 'btns';
    wrap.id = 'ct-try-again-wrap';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'act primary wide';
    button.id = 'ct-try-again';
    button.textContent = 'Try again';

    button.addEventListener('click', function () {
      if (!pendingWrong || !S.eng) return;

      const wrongRec = pendingWrong;
      pendingWrong = null;
      removeTryAgainUI();

      S.eng.unmake(wrongRec);
      S.busy = false;
      S.selected = null;
      S.targets = [];
      Replay.view = Replay.moves.length;
      renderSolve();
      setFb(S.fbEl, 'Try again — find the best move.', 'neutral');
      syncHintButton();
      updateReplayButtons();

      if (S.solEl) S.solEl.disabled = false;
    });

    wrap.appendChild(button);

    if (S.fbEl && S.fbEl.parentNode) {
      S.fbEl.insertAdjacentElement('afterend', wrap);
    }
    tryAgainWrap = wrap;
  }

  function levelSummary(p) {
    const moves = p.solverMoves || Math.ceil((p.line || []).length / 2);
    const policy = acceptancePolicyForPuzzle(p);
    return (p.rating ? 'Rating ' + p.rating + ' · ' : '') +
      moves + ' solver move' + (moves === 1 ? '' : 's') +
      ' · ' + policy.label;
  }

  // Remember the actual puzzle object. The original app stores the line but
  // not the puzzle metadata in S. For Lichess records, also show the opponent's
  // setup move before enabling the board for the solver.
  const previousStartPuzzle = startPuzzle;
  startPuzzle = function (p, ui) {
    if (introTimer) {
      clearTimeout(introTimer);
      introTimer = null;
    }
    clearPendingWrong();

    previousStartPuzzle(p, ui);

    S.puzzle = p;
    S.acceptancePolicy = acceptancePolicyForPuzzle(p);
    S.puzzleSerial = (S.puzzleSerial || 0) + 1;
    const serial = S.puzzleSerial;

    initReplay(p);
    resetHintState();
    ensureReplayUI();

    if (!p.introFen || !p.introMove) {
      Replay.view = Replay.moves.length;
      renderSolve();
      return;
    }

    try {
      const introEng = Engine();
      introEng.fromFEN(p.introFen);
      const setup = introEng.findLegalUci(String(p.introMove));
      if (!setup) return;

      // previousStartPuzzle has already oriented the board from the solver's
      // perspective. Keep that orientation while temporarily showing the
      // position before the opponent's move.
      S.eng = introEng;
      S.busy = true;
      S.selected = null;
      S.targets = [];

      if (S.hintEl) S.hintEl.disabled = true;
      if (S.solEl) S.solEl.disabled = true;

      drawBoard(S.eng, { selectable: false });
      setFb(S.fbEl, "Watch the opponent's move.", 'neutral');

      introTimer = setTimeout(function () {
        introTimer = null;

        // A fast Next/Prev/filter change may have loaded another puzzle while
        // the intro timer was running. Never let an old timer touch a new one.
        if (S.puzzleSerial !== serial || S.puzzle !== p) return;

        const liveSetup = S.eng.findLegalUci(String(p.introMove));
        if (!liveSetup) {
          S.busy = false;
          renderSolve();
          return;
        }

        const setupUci = S.eng.uci(liveSetup);
        S.eng.make(liveSetup);
        appendRevealedMove(setupUci);
        S.busy = false;
        resetHintState();

        // appendRevealedMove() ran while the intro animation was still busy,
        // so updateReplayButtons() correctly disabled Back at that moment.
        // Refresh once the intro has finished so the pre-move position is
        // immediately reviewable before the solver makes any move.
        updateReplayButtons();

        if (S.solEl) S.solEl.disabled = false;

        // Keep the opponent's move highlighted until the solver interacts
        // with the board. That makes the tactical trigger easy to inspect.
        drawBoard(S.eng, {
          selectable: true,
          last: { from: liveSetup.from, to: liveSetup.to }
        });
        setFb(S.fbEl, 'Your move — find the best continuation.', 'neutral');
      }, 650);
    } catch (_) {
      // If intro rendering ever fails, retain the already-working puzzle
      // position rather than preventing the user from solving.
      S.eng = Engine();
      S.eng.fromFEN(p.fen);
      S.busy = false;
      renderSolve();
    }
  };

  // Replace the text "unique best move" with wording that distinguishes an
  // objective mating task from a source-provided only-move line.
  const previousConfigureLibraryPuzzle = configureLibraryPuzzle;
  configureLibraryPuzzle = function (p, indexLabel) {
    previousConfigureLibraryPuzzle(p, indexLabel);
    const el = document.getElementById('l-lvl');
    if (el) el.textContent = levelSummary(p);
  };

  function scheduleDefenseReply(successMessage) {
    if (S.step >= S.line.length) {
      finishSolved();
      renderSolve();
      return;
    }

    renderSolve();
    setFb(S.fbEl, successMessage || 'Good — keep going.', 'good');
    S.busy = true;

    setTimeout(function () {
      const ru = toIdx(S.line[S.step]);
      const rm = S.eng.legal().find(function (m) {
        return m.from === ru.from &&
          m.to === ru.to &&
          ((!ru.promo && !m.promo) ||
           ru.promo === (m.promo || null) ||
           (m.promo && !ru.promo));
      });

      if (rm) {
        const replyUci = S.eng.uci(rm);
        S.eng.make(rm);
        S.step++;
        appendRevealedMove(replyUci);
        resetHintState();
      } else {
        // A generated alternate line should always remain legal. If a future
        // refactor breaks that invariant, fail safely instead of corrupting
        // the position.
        S.busy = false;
        setFb(S.fbEl, 'The alternate continuation could not be replayed. Restart this puzzle.', 'bad');
        renderSolve();
        return;
      }

      S.busy = false;
      if (S.step >= S.line.length) finishSolved();
      renderSolve();
    }, 430);
  }

  function rejectMove(rec, mv, message, breakStreak) {
    S.busy = true;
    S.selected = null;
    S.targets = [];

    // Leave the user's wrong move ON THE BOARD until they explicitly choose
    // Try again. This gives them time to inspect both the position and the
    // full feedback message.
    drawBoard(S.eng, { selectable: false, last: { from: mv.from, to: mv.to } });
    setFb(
      S.fbEl,
      message || 'That move does not meet the objective. Your move is left on the board so you can inspect the position.',
      'bad'
    );

    if (S.hintEl) S.hintEl.disabled = true;
    if (S.solEl) S.solEl.disabled = true;

    if (breakStreak !== false && S.streakBreak) S.streakBreak();

    shellEl.classList.remove('wrong');
    void shellEl.offsetWidth;
    shellEl.classList.add('wrong');

    showTryAgainButton(rec);
    updateReplayButtons();
  }

  // Core Build 1 change.
  attempt = function (mv) {
    if (S.busy) return;

    const exp = toIdx(S.line[S.step]);
    const match = sameMove(mv, exp);

    if (match) {
      clearPendingWrong();
      const playedUci = S.eng.uci(mv);
      S.eng.make(mv);
      appendRevealedMove(playedUci);
      S.step++;
      S.selected = null;
      S.targets = [];
      hintStage = 0;
      hintStep = -1;
      scheduleDefenseReply('Good — keep going.');
      return;
    }

    const policy = S.acceptancePolicy || acceptancePolicyForPuzzle(S.puzzle);
    const rec = S.eng.make(mv);

    // Universal rule for a mating objective: if the move checkmates now,
    // the user has achieved the objective. Never reject mate merely because
    // a database stored a different mating move.
    if (S.eng.isMate()) {
      clearPendingWrong();
      appendRevealedMove(S.eng.uci(mv));
      S.selected = null;
      S.targets = [];
      S.step = S.line.length;
      finishSolved();
      renderSolve();
      return;
    }

    if (policy.kind !== 'forcedMate') {
      rejectMove(rec, mv, 'That move is legal, but it does not match the verified solution for this puzzle. Your move is left on the board so you can inspect the position.', true);
      return;
    }

    const playedSolverMoves = Math.floor(S.step / 2);
    const remainingAfterThisMove = policy.mateIn - playedSolverMoves - 1;

    // If the objective was Mate in N and this move has not mated while no
    // attacker moves remain, it cannot satisfy that objective.
    if (remainingAfterThisMove <= 0) {
      rejectMove(rec, mv, 'This move does not complete the required mate. Your move is left on the board so you can inspect the position.', true);
      return;
    }

    S.busy = true;
    S.selected = null;
    S.targets = [];
    drawBoard(S.eng, { selectable: false, last: { from: mv.from, to: mv.to } });
    setFb(S.fbEl, 'Checking the alternate mating route…', 'neutral');

    setTimeout(function () {
      const attacker = S.eng.turn() === 'w' ? 'b' : 'w';
      const verified = verifyForcedMateFromPosition(
        S.eng,
        attacker,
        remainingAfterThisMove,
        { maxNodes: 350000 }
      );

      if (verified.status === 'yes') {
        const playedUci = S.eng.uci(mv);
        const prefix = S.line.slice(0, S.step);
        S.line = prefix.concat([playedUci], verified.line);
        appendRevealedMove(playedUci);
        S.step++;
        hintStage = 0;
        hintStep = -1;
        S.busy = false;
        scheduleDefenseReply('Alternative forced mate — accepted. Keep going.');
        return;
      }

      if (verified.status === 'unknown') {
        S.eng.unmake(rec);
        S.busy = false;
        renderSolve();
        // Do not break a streak when the browser search could not prove or
        // refute the user's move.
        setFb(
          S.fbEl,
          'This alternate line was too expensive to verify quickly. Your streak is unchanged; try another move or reveal the stored line.',
          'neutral'
        );
        return;
      }

      // Definite refutation: at least one legal defense escapes the required
      // forced mate.
      S.busy = false;
      rejectMove(
        rec,
        mv,
        'That move allows at least one defense that escapes the required mate. Your move is left on the board so you can inspect the position.',
        true
      );
    }, 20);
  };


  // Build 1.2: progressive hints. First press identifies only the source
  // piece. Second press identifies the destination square. We intentionally
  // do NOT select the source piece with the normal move UI, because that
  // would display every legal destination and make a queen hint noisy.
  doHint = function () {
    if (!S.active || S.solved || S.busy || pendingWrong) return;
    if (Replay.view < Replay.moves.length) return;
    if (!S.line || S.step >= S.line.length) return;

    if (hintStep !== S.step) {
      hintStage = 0;
      hintStep = S.step;
    }

    const exp = toIdx(S.line[S.step]);
    const pc = S.eng.get(exp.from);
    if (!pc) return;

    const names = {
      p: 'pawn',
      n: 'knight',
      b: 'bishop',
      r: 'rook',
      q: 'queen',
      k: 'king'
    };
    const pieceName = names[pc.t] || 'piece';

    if (hintStage === 0) {
      hintStage = 1;
      S.selected = null;
      S.targets = [];
      S.streakBreak && S.streakBreak();
      renderSolve();
      setFb(
        S.fbEl,
        'Hint 1/2: Move the highlighted ' + pieceName + '. Press More hint for the destination square.',
        'neutral'
      );
      syncHintButton();
      return;
    }

    if (hintStage === 1) {
      hintStage = 2;
      S.selected = null;
      S.targets = [];
      renderSolve();
      setFb(
        S.fbEl,
        'Hint 2/2: Move the highlighted ' + pieceName + ' to the highlighted destination square.',
        'neutral'
      );
      syncHintButton();
      return;
    }
  };

  // Keep the revealed-only timeline in sync when the user deliberately asks
  // to see the solution. Future moves enter Replay.moves only at the moment
  // they are actually animated on the board.
  doSolution = function () {
    if (!S.active || S.solved || S.busy || pendingWrong) return;
    if (Replay.view < Replay.moves.length) return;

    S.revealed = true;
    S.busy = true;
    S.streakBreak && S.streakBreak();
    clearHintVisuals();

    if (S.hintEl) S.hintEl.disabled = true;
    if (S.solEl) S.solEl.disabled = true;
    updateReplayButtons();

    (function play() {
      if (S.step >= S.line.length) {
        S.busy = false;
        finishSolved();
        Replay.view = Replay.moves.length;
        renderSolve();
        return;
      }

      const u = toIdx(S.line[S.step]);
      const m = S.eng.legal().find(function (x) {
        return x.from === u.from &&
          x.to === u.to &&
          ((!u.promo && !x.promo) ||
           u.promo === (x.promo || null) ||
           (x.promo && !u.promo));
      });

      if (!m) {
        S.busy = false;
        finishSolved();
        Replay.view = Replay.moves.length;
        renderSolve();
        return;
      }

      const shownUci = S.eng.uci(m);
      S.eng.make(m);
      S.step++;
      appendRevealedMove(shownUci);
      renderSolve();
      setTimeout(play, 470);
    })();

    setFb(S.fbEl, 'Solution:', 'neutral');
  };


  function installReplacementButtonHandlers() {
    const hintButtons = [
      document.getElementById('l-hint'),
      document.getElementById('gs-hint')
    ].filter(Boolean);

    const solutionButtons = [
      document.getElementById('l-sol'),
      document.getElementById('gs-sol')
    ].filter(Boolean);

    for (const button of hintButtons) {
      button.removeEventListener('click', originalHintClickHandler);
      button.addEventListener('click', doHint);
      button.dataset.ctHintHandler = BUILD_ID;
    }

    for (const button of solutionButtons) {
      button.removeEventListener('click', originalSolutionClickHandler);
      button.addEventListener('click', doSolution);
      button.dataset.ctSolutionHandler = BUILD_ID;
    }
  }

  installReplacementButtonHandlers();

  window.TacticsCorrectness = {
    build: BUILD_ID,
    mateTargetForPuzzle,
    acceptancePolicyForPuzzle,
    verifyForcedMateFromPosition,
    ux: {
      showsLichessSetupMove: true,
      persistentWrongMoveFeedback: true,
      explicitTryAgainButton: true,
      revealedOnlyMoveReplay: true,
      progressiveHintsPerMove: true,
      progressiveHintHandlersRebound: true,
      initialSetupReplayImmediatelyAvailable: true
    }
  };

  console.info('[Tactics Trainer] Loaded ' + BUILD_ID);
})();
