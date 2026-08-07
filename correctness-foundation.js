/* Chess Tactics Trainer — Build 1 correctness foundation
 *
 * Loaded after the existing application by scripts/apply_correctness_foundation.py.
 * It deliberately does not replace the current board, database, or million-puzzle
 * loader. It changes only answer acceptance for mating puzzles and the wording
 * used to describe puzzle correctness.
 */
(function () {
  'use strict';

  const BUILD_ID = 'correctness-foundation-1';

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

  function levelSummary(p) {
    const moves = p.solverMoves || Math.ceil((p.line || []).length / 2);
    const policy = acceptancePolicyForPuzzle(p);
    return (p.rating ? 'Rating ' + p.rating + ' · ' : '') +
      moves + ' solver move' + (moves === 1 ? '' : 's') +
      ' · ' + policy.label;
  }

  // Remember the actual puzzle object. The original app stores the line but
  // not the puzzle metadata in S.
  const previousStartPuzzle = startPuzzle;
  startPuzzle = function (p, ui) {
    previousStartPuzzle(p, ui);
    S.puzzle = p;
    S.acceptancePolicy = acceptancePolicyForPuzzle(p);
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
        S.eng.make(rm);
        S.step++;
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
    drawBoard(S.eng, { selectable: false, last: { from: mv.from, to: mv.to } });
    setFb(S.fbEl, message || 'Legal move — but it does not meet the objective. Taking it back…', 'bad');

    if (breakStreak !== false && S.streakBreak) S.streakBreak();

    shellEl.classList.remove('wrong');
    void shellEl.offsetWidth;
    shellEl.classList.add('wrong');

    setTimeout(function () {
      S.eng.unmake(rec);
      S.busy = false;
      renderSolve();
      setFb(S.fbEl, 'Try again.', 'neutral');
    }, 700);
  }

  // Core Build 1 change.
  attempt = function (mv) {
    if (S.busy) return;

    const exp = toIdx(S.line[S.step]);
    const match = sameMove(mv, exp);

    if (match) {
      S.eng.make(mv);
      S.step++;
      S.selected = null;
      S.targets = [];
      scheduleDefenseReply('Good — keep going.');
      return;
    }

    const policy = S.acceptancePolicy || acceptancePolicyForPuzzle(S.puzzle);
    const rec = S.eng.make(mv);

    // Universal rule for a mating objective: if the move checkmates now,
    // the user has achieved the objective. Never reject mate merely because
    // a database stored a different mating move.
    if (S.eng.isMate()) {
      S.selected = null;
      S.targets = [];
      S.step = S.line.length;
      finishSolved();
      renderSolve();
      return;
    }

    if (policy.kind !== 'forcedMate') {
      rejectMove(rec, mv, 'Legal move — but not the stored answer here. Taking it back…', true);
      return;
    }

    const playedSolverMoves = Math.floor(S.step / 2);
    const remainingAfterThisMove = policy.mateIn - playedSolverMoves - 1;

    // If the objective was Mate in N and this move has not mated while no
    // attacker moves remain, it cannot satisfy that objective.
    if (remainingAfterThisMove <= 0) {
      rejectMove(rec, mv, 'This move does not complete the required mate. Taking it back…', true);
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
        const prefix = S.line.slice(0, S.step);
        S.line = prefix.concat([S.eng.uci(mv)], verified.line);
        S.step++;
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
        'That move allows a defense that escapes the required mate. Taking it back…',
        true
      );
    }, 20);
  };

  window.TacticsCorrectness = {
    build: BUILD_ID,
    mateTargetForPuzzle,
    acceptancePolicyForPuzzle,
    verifyForcedMateFromPosition
  };

  console.info('[Tactics Trainer] Loaded ' + BUILD_ID);
})();
