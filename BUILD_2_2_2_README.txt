CHESS TACTICS TRAINER — BUILD 2.2.2
RESULT-POSITION ANALYSIS FIX
===================================

WHAT THE LIVE TEST PROVED
-------------------------
The normal "finding best move" Stockfish search returns successfully.

The review hangs specifically when it reaches:

  checking played move

That stage used UCI "searchmoves" to force Stockfish to analyze only the move
that was actually played.

Build 2.2.2 removes that code path entirely from post-game analysis and Retry.

NEW METHOD
----------
For each move:

1. Analyze the PRE-MOVE position normally with full Stockfish.
   This gives:
     - best move
     - second-best move
     - best score
     - best PV

2. If the player did not choose Stockfish's first move:
     - make the actual played move on the trainer's chess engine
     - obtain the RESULTING FEN
     - analyze that resulting position normally with Stockfish
     - reverse the score because the resulting position has the opponent to
       move, while the review needs the score from the original mover's
       perspective

Example:

  Before White's move:
    best Stockfish result = +1.20 for White

  White plays a weaker move.

  Resulting position, Black to move:
    Stockfish says +0.70 for Black

  Converted back to White's perspective:
    played-move result = -0.70

Now +1.20 and -0.70 are directly comparable from White's perspective.

MATE SCORES
-----------
Mate scores are reversed the same way:

  child M3 for the opponent -> played result -M3 for the mover

Score bound flags are also reversed.

WHY THIS IS MORE ROBUST
-----------------------
Both searches are now ordinary Stockfish position analyses.

The review no longer depends on the restricted "go searchmoves ..." path that
is hanging in the deployed browser engine.

RETRY THIS POSITION
-------------------
Retry used the same restricted-search mechanism and would likely have hit the
same problem.

Build 2.2.2 now:
  - makes your retry move
  - analyzes the resulting position normally
  - reverses the evaluation to your perspective
  - compares it with the previously computed best result

So alternative good moves can still be accepted without string matching.

STILL INCLUDED
--------------
- Build 2.2 post-game review
- Build 2.2.1 bounded time profiles
- watchdogs
- explicit progress stages
- best + second-best MultiPV
- move classifications
- critical positions
- board navigation
- Retry this position
- Turn into puzzle
- personal mistake notebook integration
- full-strength Stockfish review
- playing-strength restoration

FILES TO REPLACE
----------------
  js/postgame-analysis.js
  tests/test-postgame-analysis.js
  .github/workflows/validate.yml
  .github/workflows/deploy-pages.yml

NO OTHER FILES CHANGE.

FIRST TEST
----------
After deployment:

1. Finish/resign a game.
2. Analyze:
     Black only
     Quick
3. Watch the status.

You should see:
     finding best move

and, when your move differs:
     evaluating resulting position after <move>

You should NEVER see:
     checking played move

because that failing restricted-search path has been removed.

Then test Both sides / Normal.

If a single move ever exceeds its watchdog, the review should stop with a
specific error rather than remain hung.
