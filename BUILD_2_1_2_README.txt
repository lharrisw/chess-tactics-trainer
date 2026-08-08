CHESS TACTICS TRAINER — BUILD 2.1.2
COMFORTABLE RESPONSIVE LAYOUT
================================

This supersedes the narrow tab-only Build 2.1.1 fix.

PROBLEM
-------
The original trainer was designed around a 340px side panel. That was fine
when the app had three small tabs and fewer controls, but the growing trainer
now has:

  Puzzle library
  From your game
  Play
  Database

plus Stockfish settings, clocks, game options, and future training modules.

The result was not merely overlapping tab text. The entire control panel felt
compressed.

WHAT 2.1.2 CHANGES
------------------
Desktop / laptop:
- side panel grows from 340px to 460px
- overall app workspace grows to 1180px
- gap between board and panel grows
- panel body padding increases
- vertical spacing between controls increases
- inputs/selects get more padding
- buttons get more height and separation
- puzzle goal/stat/database cards get more breathing room
- move lists get more room
- Play setup fields and checkboxes get more spacing

Tabs:
- natural text width
- never shrink into one another
- horizontal scrolling only when actually necessary

Medium windows:
- board and panel stack instead of being squeezed
- stacked panel may grow to 560px

Phones / narrow windows:
- filter controls become one column
- button groups become one column
- Play setup becomes one column
- Play option toggles become one column
- Stockfish diagnostic controls become one column
- generous but screen-appropriate padding remains

ARCHITECTURE
------------
Global geometry is now in:
  js/app-layout.js

rather than being buried inside Play-vs-Stockfish.

This is intentional: future Opening, Endgame, Review, Vision, Study, and
History modules can all inherit the same app-wide layout.

FILES TO ADD
------------
  js/app-layout.js

FILES TO REPLACE
----------------
  js/play-stockfish.js
  scripts/apply_play_stockfish.py
  tests/test-play-stockfish.js
  .github/workflows/validate.yml
  .github/workflows/deploy-pages.yml

OPTIONAL
--------
  BUILD_2_1_2_README.txt

DO NOT TOUCH
------------
  index.html
  js/correctness-foundation.js
  js/stockfish-controller.js
  js/stockfish-engine-layer.js
  puzzle data

DEPLOY
------
1. Add app-layout.js to js/.
2. Replace the five listed files.
3. Commit to main.
4. Wait for Validate trainer source to turn green.
5. Run the normal million-puzzle deployment with the same defaults.
6. Wait for build + deploy to turn green.
7. Hard refresh.

VISUAL CHECK
------------
Desktop:
- board and panel should remain side-by-side with noticeably more room
- four tab labels should be cleanly separated
- Play controls should no longer feel packed together

Narrow window:
- board/panel should stack
- controls should switch to a comfortable one-column layout
- no labels/buttons should collide or become unreasonably narrow
