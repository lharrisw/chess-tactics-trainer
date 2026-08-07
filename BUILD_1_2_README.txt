CHESS TACTICS TRAINER — BUILD 1.2
REVEALED-MOVE REPLAY + PROGRESSIVE HINTS
=========================================

This update preserves Builds 1 and 1.1 and adds two UX features.

1. BACK / FORWARD MOVE REPLAY — NO SOLUTION LEAK
-------------------------------------------------
Every puzzle now gets:
    ‹ Back
    Forward ›

These buttons can navigate ONLY through moves that have already appeared on
the board.

Examples:
- On a Lichess cloud puzzle, after the opponent's setup move is shown:
      Back    -> position before that opponent move
      Forward -> position after that opponent move
- After you make a correct move and the computer replies, those moves become
  available for replay too.
- If only three moves have been shown, Forward cannot go to move four.
- The hidden continuation in S.line is NEVER copied into the replay timeline.
- While you are looking at an earlier revealed position, the board is
  read-only and Hint / Show solution are disabled.
- Return Forward to the live position to continue solving.
- After a solved/revealed puzzle, you can use the same buttons to review only
  the moves that actually became visible.

This is deliberately different from a solution viewer.

2. PROGRESSIVE HINTS PER SOLVER MOVE
------------------------------------
The old hint selected the correct piece using the normal board-selection UI,
which also showed all of that piece's legal destinations. This was especially
noisy for queens.

Build 1.2 changes Hint to:

First press:
    - highlights ONLY the correct source piece
    - does not display all legal move dots
    - feedback says "Hint 1/2"
    - button changes to "More hint"

Second press:
    - keeps the source piece highlighted
    - also highlights the correct destination square
    - feedback says "Hint 2/2"
    - button changes to "Hint shown"

When the computer makes its defensive reply and it is your turn again, the
hint level resets to zero for the new solver move.

The streak is broken only when the first hint is requested; asking for the
second level does not break it a second time.

3. PRESERVED FEATURES
---------------------
- opponent's setup move is visibly played before Lichess puzzles
- wrong-move explanation stays indefinitely
- wrong move stays on board until Try again
- alternate immediate mates are accepted
- alternate forced Mate-in-N routes are verified and accepted when proven
- one-million cloud library + 522 built-ins are unchanged in count

FILES TO REPLACE
----------------
  js/correctness-foundation.js
  .github/workflows/validate.yml

OPTIONAL DOCUMENTATION
----------------------
  BUILD_1_2_README.txt

No change to:
  index.html
  scripts/build_pages.py
  scripts/apply_correctness_foundation.py
  .github/workflows/deploy-pages.yml
  puzzle data files

DEPLOY
------
1. Upload the two replacement files to their existing folders.
2. Commit directly to main.
3. Wait for Validate trainer source to turn green.
4. Run Build and deploy million-puzzle trainer using:
       puzzle_count    1000000
       chunk_size      10000
       min_popularity  0
       min_plays       20
5. Wait for build + deploy to turn green.
6. Hard refresh with Command + Shift + R.

TEST
----
A. Start a cloud puzzle.
   - opponent move should still play visibly
   - Back should return to the pre-move position
   - Forward should return to the tactical position
   - Forward should NOT reveal your answer

B. Press Hint once.
   - only the source piece should be highlighted
   - no cloud of all possible queen/rook/bishop destinations

C. Press More hint.
   - correct destination square should also be highlighted

D. Make the correct move and wait for the computer reply.
   - Hint should reset for your next move
   - Back / Forward should now be able to replay the moves already seen

E. Deliberately make a wrong move.
   - message and wrong move should still persist
   - Try again should still be required
