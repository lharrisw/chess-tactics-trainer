CHESS TACTICS TRAINER — BUILD 2.0
STOCKFISH 18 ENGINE FOUNDATION
================================

SCOPE
-----
Build 2.0 installs the reusable local Stockfish engine layer.

It DOES NOT yet add the actual Play vs Computer game screen, clocks, resign,
draw offers, rematches, or move animations. Those are Build 2.1.

WHAT BUILD 2.0 ADDS
-------------------
1. Pinned Stockfish 18 browser engine
   - nmrugg/stockfish.js release v18.0.0
   - upstream official Stockfish 18 commit cb3d4ee
   - full single-threaded WebAssembly build
   - no multithread/SharedArrayBuffer requirement
   - engine runs locally in the visitor's browser

2. Lazy engine loading
   - the large WASM file is NOT downloaded when the trainer page opens
   - it downloads only when Stockfish is actually started or a later feature
     asks for it
   - the GitHub Actions build caches the engine to avoid repeatedly fetching it

3. Reusable JavaScript engine API
   window.ChessEngine exposes:
       init()
       analyzeFen(fen, options)
       bestMove(fen, options)
       setStrength(...)
       getStrength()
       newGame()
       stop()
       terminate()
       selfTest()
       subscribe(...)
       getStatus()

4. Reusable UCI controller
   Supports:
       depth searches
       movetime searches
       node-limited searches
       normal chess-clock search arguments
       searchmoves
       MultiPV
       cancellation
       ucinewgame
       Hash
       full strength
       UCI_Elo limiting when available
       Skill Level when available
       parsed score / PV / depth / nodes / NPS data

   The time-control UCI support is installed now so Build 2.1 can use the same
   controller instead of replacing it.

5. Database-tab diagnostics card
   Open Database on the live site and you will see:
       Local Stockfish engine
       Start Stockfish 18
       Run self-test
       Stop engine
       Full strength / Elo-limited / Skill Level setting

   The self-test analyzes ONLY the normal starting position. It cannot reveal
   the current puzzle solution.

6. GPL/source compliance
   The deployed site publishes alongside Stockfish:
       Copying.txt
       AUTHORS
       SOURCE.txt
       exact v18.0.0 source archive
       SHA256SUMS.json
       RELEASE.json

7. Build 1.2.2 is preserved
   Build 2.0 does not replace correctness-foundation.js.
   Existing tactics behavior remains:
       visible setup move
       immediate pre-move Back replay
       revealed-only Back/Forward
       progressive hints
       persistent wrong answer + Try again
       objective-aware alternate mating solutions

FILES TO UPLOAD
---------------
ADD:
  js/stockfish-controller.js
  js/stockfish-engine-layer.js

  scripts/fetch_stockfish.py
  scripts/apply_stockfish_engine.py

  tests/test-stockfish-controller.js

  licenses/STOCKFISH-NOTICE.txt

REPLACE:
  .github/workflows/deploy-pages.yml
  .github/workflows/validate.yml

OPTIONAL DOCUMENTATION:
  BUILD_2_0_README.txt

DO NOT REPLACE
--------------
  index.html
  js/correctness-foundation.js
  scripts/apply_correctness_foundation.py
  scripts/build_pages.py
  puzzle data / manifests

WHY FULL SINGLE-THREADED
------------------------
The browser distribution offers a full multithreaded engine and a full
single-threaded engine. The multithreaded build needs browser isolation/CORS
headers that a normal GitHub Pages deployment does not provide. The full
single-threaded build runs without those special headers while keeping the
full-strength network.

FIRST LIVE ENGINE START
-----------------------
Expect the first launch to take longer because the browser must obtain a large
Stockfish WASM asset. The trainer itself still loads normally because the
engine is lazy.

UPLOAD / DEPLOY ORDER
---------------------
1. Upload all ADD files to their exact folders.
2. Replace the two workflow files.
3. Commit to main.
4. Wait for "Validate trainer source" to turn green.
5. Do NOT deploy if validation is red.
6. After green validation, manually run:
       Build and deploy million-puzzle trainer
7. Use:
       puzzle_count    1000000
       chunk_size      10000
       min_popularity  0
       min_plays       20
8. Wait for both build and deploy to turn green.
9. Hard refresh the live site.

LIVE TEST
---------
1. Confirm normal tactics still work.
2. Open Database.
3. Find "Local Stockfish engine".
4. Confirm status initially says Not loaded.
5. Click "Start Stockfish 18".
6. First launch may take time because the full engine is large.
7. Wait for status Ready.
8. Click "Run self-test".
9. PASS condition:
       feedback says Self-test passed
       it reports a legal UCI move such as e2e4, d2d4, etc.
       it reports a search depth
10. Change strength to Elo-limited and save a value.
11. Change back to Full strength.
12. Stop engine and verify status returns to Not loaded/stopped.

Only after this test passes should Build 2.1 add the actual playable computer
game module.
