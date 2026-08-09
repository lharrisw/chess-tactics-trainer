CHESS TACTICS TRAINER — BUILD 2.2.3
SINGLE-PASS GAME-STATE ANALYSIS
=================================

WHY THIS IS DIFFERENT
---------------------
The previous two live tests told us something important:

- the FIRST review search works
- the immediately-following SECOND review search is where the process fails
- that remained true even after replacing searchmoves with a normal child-FEN
  search

The common factor was the engine option transition:

  first search:  MultiPV = 2
  second search: MultiPV = 1

Normal Play stays at MultiPV = 1 and works reliably.

NEW REVIEW ARCHITECTURE
-----------------------
Build 2.2.3 no longer does "best search + played-move search" for every move.

Instead:

1. Determine every GAME POSITION needed for the selected review.
2. Analyze each unique position exactly ONCE.
3. Every review search uses MultiPV = 2.
4. Store those results.
5. For move p:
     best result   = analysis of state p
     played result = analysis of state p+1, score-reversed back to the mover

So there is:
- no second-stage search per move
- no 2 -> 1 MultiPV transition during review
- no duplicate analysis of the same game state
- fewer total engine searches

For a 75-ply Both-sides review, this is about 76 position searches instead of
potentially ~150 searches.

FINAL / TERMINAL POSITIONS
--------------------------
Checkmate and stalemate positions are recognized locally instead of asking
Stockfish for a bestmove where no legal move exists.

A final draw recorded by Play is treated as equal when appropriate.

ENGINE RESET AFTER REVIEW
-------------------------
The review deliberately keeps MultiPV = 2 for its entire lifetime.

After the review:
1. the user's previous playing strength is restored
2. the review Stockfish worker is terminated

The next normal Play game therefore starts a fresh worker at Stockfish's normal
MultiPV = 1 default. We never force a live 2 -> 1 transition on the review
worker.

WHAT TO REPLACE
---------------
ONLY:

  js/postgame-analysis.js

The file deliberately preserves the literal compatibility markers required by
your current Build 2.2 validate/deploy workflows, so no workflow upload is
needed for this hotfix.

FIRST TEST
----------
After deployment, finish/resign a short game and use:

  Black only
  Quick

The status should now say things like:

  Position 1/37 · analyzing before 1... e5 ...
  Position 2/37 · single-pass position analysis · reached depth ...

There should be NO:
  checking played move
  evaluating resulting position after ...

because there is no second-stage move search anymore.

Then test:
  Both sides
  Normal

If this architecture completes, proceed to:
- click reviewed moves
- Retry this position
- Turn into puzzle
