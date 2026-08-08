CHESS TACTICS TRAINER — BUILD 2.1.4
PREMOVE SUPPORT
=================================

WHAT THIS ADDS
--------------
Play vs Stockfish now supports one queued premove while it is the computer's
turn.

BEHAVIOR
--------
- While Stockfish is thinking, your pieces remain interactable.
- Click-to-move premoves are supported.
- Drag-and-drop premoves are supported when Drag pieces is enabled.
- The queued source and destination squares receive a blue premove outline.
- One premove may be queued at a time; choosing another replaces it.
- Clicking the queued destination again cancels it.
- Right-clicking the board also cancels the queued premove.
- Promotion premoves honor Auto-queen. If Auto-queen is off, the Q/R/B/N
  chooser is used before the premove is queued.

AFTER STOCKFISH MOVES
---------------------
- The queued move is checked against the ACTUAL resulting position.
- If legal, it is played immediately before your clock begins to run.
- If Stockfish's move makes it illegal, the premove is automatically canceled
  and you receive a normal turn.
- A canceled premove never becomes an illegal move and never costs a move.

IMPORTANT
---------
This is a single-premove system, matching the simple behavior needed for fast
play. It does not queue a chain of multiple future premoves.

PRESERVED
---------
Build 2.1.3 post-game layout is NOT replaced by this package. Your current
js/app-layout.js stays exactly as it is, including:
- wider comfortable layout
- Piece-animation spacing
- improved post-game move list and buttons

FILES TO REPLACE
----------------
  js/play-stockfish.js
  tests/test-play-stockfish.js
  .github/workflows/validate.yml
  .github/workflows/deploy-pages.yml

OPTIONAL
--------
  BUILD_2_1_4_README.txt

DO NOT REPLACE
--------------
  js/app-layout.js
  index.html
  Stockfish controller/engine files
  tactics correctness files

DEPLOY
------
1. Replace the four required files.
2. Commit to main.
3. Wait for Validate trainer source to turn green.
4. Run the normal million-puzzle deployment.
5. Hard refresh.

TEST
----
1. Start a 3+0 or 3+2 game.
2. Make a move.
3. While Stockfish is thinking, queue your next move.
4. The two premove squares should show blue outlines.
5. If Stockfish's reply leaves the move legal, it should fire immediately.
6. Queue a capture premove, then let Stockfish move the target away. The
   premove should cancel and leave you free to move normally.
7. Queue a premove and right-click the board; it should cancel.
