CHESS TACTICS TRAINER — BUILD 1.1: PUZZLE UX
================================================

This is a small follow-up to Build 1.

WHAT IT FIXES
-------------
1. SHOW THE OPPONENT'S FIRST/SETUP MOVE
   Lichess puzzle records contain the position before the opponent's move.
   The existing app applied that move silently. Build 1.1 preserves it and
   visibly shows:
       - the position before the move,
       - the opponent's setup move,
       - the from/to squares highlighted,
       - then enables the board for your move.

   The opponent's last move remains highlighted until you interact with the
   board.

   This applies to the million-puzzle Lichess cloud library and to newly
   imported Lichess CSV puzzles.

2. WRONG-MOVE FEEDBACK NO LONGER DISAPPEARS
   A proven wrong move now remains on the board.
   The complete red error message remains visible indefinitely.
   A full-width "Try again" button appears.
   Nothing is taken back until YOU press Try again.

   After pressing Try again:
       - the move is undone,
       - the board becomes interactive again,
       - the prompt says "Try again — find the best move."

3. BUILD 1 MULTIPLE-MATE BEHAVIOR IS PRESERVED
   Immediate alternate mates remain accepted.
   Alternate forced Mate-in-N routes remain verified and accepted when proven.

FILES TO UPLOAD
---------------
REPLACE:
  js/correctness-foundation.js
  .github/workflows/validate.yml

No other files are needed.
Do NOT rerun the million-puzzle data build just to change puzzle data: the
million puzzle chunks already contain the raw Lichess FEN and move list needed
to display the setup move. However, the normal deployment workflow still needs
to be run so GitHub Pages publishes the updated JavaScript.

AFTER UPLOAD
------------
1. Wait for "Validate trainer source" to turn green.
2. Run "Build and deploy million-puzzle trainer" using the same defaults:
       puzzle_count   1000000
       chunk_size     10000
       min_popularity 0
       min_plays      20
3. Wait for build + deploy to turn green.
4. Hard refresh the live page with Command + Shift + R.
5. Test:
   - start a cloud puzzle: opponent move should be shown first;
   - make a known wrong legal move: it should remain visible;
   - read the error as long as desired;
   - press Try again: only then should the move be undone.
