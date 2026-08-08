CHESS TACTICS TRAINER — BUILD 2.1
PLAY VS STOCKFISH
=================================

Build 2.1 uses the already-tested Build 2.0 ChessEngine API. It does not embed
a second Stockfish copy or create a competing engine controller.

WHAT IT ADDS
------------
A new "Play" tab with a complete legal chess game against Stockfish 18.

GAME SETUP
----------
Your side:
  White
  Black
  Random

Game mode:
  Training
  Tournament

Training:
  Take back is available.

Tournament:
  Take back is disabled.
  There is no live evaluation bar, hint, or hidden engine continuation.

Strength:
  Elo-limited 1320 through 3190 presets
  Skill-level presets
  Full strength

Time controls:
  Untimed
  1+0
  1+1
  3+0
  3+2
  5+0
  5+5
  10+0
  10+5
  15+10
  30+20
  Custom minutes + increment

CLOCKS
------
- Real running White/Black clocks
- Wall-clock elapsed time is accounted for even if browser timer callbacks lag
- Increment is added after each completed move
- Stockfish receives UCI wtime/btime/winc/binc
- Flagging ends the game
- Animation time is not charged to either player

BOARD OPTIONS
-------------
Piece animation:
  Off
  Fast
  Normal
  Slow

Toggles:
  Coordinates
  Legal-move dots
  Last-move highlight
  Move sounds
  Auto-queen
  Drag pieces

Click-to-move always remains available.
When Auto-queen is off, promotion opens a Q/R/B/N chooser.

GAME RULES / ENDINGS
--------------------
- legal move generation from the existing chess engine
- check and checkmate
- stalemate
- threefold repetition
- 50-move rule
- conservative insufficient-material detection
- resignation
- time forfeit
- draw offer

DRAW OFFER
----------
The user can offer a draw on their turn. Stockfish performs a quick private
search and accepts only when the position is essentially equal by that search.
No evaluation is shown to the user.

TAKEBACK
--------
Training mode only.

If Stockfish already replied, Take back removes Stockfish's reply and the
user's preceding move, returning to the user's decision point.

If Stockfish is currently thinking after the user's move, Take back cancels
the search and removes the user's move.

The user's clocks and game-rule counters are restored to their pre-move state.

PGN
---
Export PGN is available after at least one move.

Headers include:
  White / Black
  Date
  Result
  TimeControl
  Mode
  Termination

The move list is SAN, including:
  captures
  castling
  promotion
  check
  checkmate
  disambiguation

ARCHITECTURE
------------
Build 2.1 calls:
  window.ChessEngine

from Build 2.0.

It does NOT contain or fetch another Stockfish binary.

The same engine foundation can therefore be reused later for:
  Build 2.2 post-game review
  objective puzzle equivalence
  opening sparring
  endgame sparring
  calculation/strategy analysis

FILES TO ADD
------------
  js/play-stockfish.js
  scripts/apply_play_stockfish.py
  tests/test-play-stockfish.js

FILES TO REPLACE
----------------
  .github/workflows/deploy-pages.yml
  .github/workflows/validate.yml

OPTIONAL
--------
  BUILD_2_1_README.txt

DO NOT REPLACE
--------------
  index.html
  js/correctness-foundation.js
  js/stockfish-controller.js
  js/stockfish-engine-layer.js
  scripts/build_pages.py
  scripts/apply_correctness_foundation.py
  scripts/fetch_stockfish.py
  scripts/apply_stockfish_engine.py

UPLOAD ORDER
------------
1. Add the three new code/test files to their exact folders.
2. Replace deploy-pages.yml and validate.yml.
3. Optionally add BUILD_2_1_README.txt to the repository root.
4. Commit to main.
5. Wait for Validate trainer source.

IF VALIDATION IS RED:
  Stop. Do not deploy.

IF VALIDATION IS GREEN:
  Run "Build and deploy million-puzzle trainer" with:
      puzzle_count    1000000
      chunk_size      10000
      min_popularity  0
      min_plays       20

LIVE TEST CHECKLIST
-------------------
A. Existing tactics
   - initial Lichess setup move still visible
   - immediate Back works
   - progressive hints work
   - wrong answer stays until Try again
   - alternate mates still accepted

B. Play tab / White
   - choose White, Training, Elo 1800, 3+2
   - Start game
   - your clock runs
   - make e4
   - Stockfish thinks and replies
   - Stockfish clock runs while thinking
   - move list records both moves

C. Takeback
   - after Stockfish replies, press Take back
   - both its reply and your prior move should disappear
   - you should again be at your decision point

D. Black
   - start a new game as Black
   - Stockfish must make White's first move automatically
   - board must be oriented with Black at the bottom

E. Tournament
   - start Tournament mode
   - Take back must be disabled

F. Time
   - test a short 1+0 game
   - clocks must count down
   - reaching zero must end by time forfeit

G. Board preferences
   - animation Off/Fast/Normal/Slow
   - coordinates toggle
   - legal-dot toggle
   - last-move toggle
   - sounds toggle
   - drag pieces toggle

H. Promotion
   - normal games may not reach promotion quickly; this can be exercised later
     from a dedicated test position if necessary
   - Auto-queen ON chooses queen
   - Auto-queen OFF has Q/R/B/N chooser

I. PGN
   - play several moves
   - Export PGN
   - file should include SAN moves and correct White/Black names

POST-GAME ANALYSIS
------------------
Not in Build 2.1.

That is intentionally Build 2.2, after complete-game play is proven stable.
