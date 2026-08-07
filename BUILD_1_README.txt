CHESS TACTICS TRAINER — BUILD 1: CORRECTNESS FOUNDATION
=======================================================

Scope
-----
This update is intentionally narrow. It does NOT yet add:
- play against Stockfish,
- clocks,
- animation settings,
- AI game review,
- opening/endgame curriculum,
- board-vision games.

Those come in later builds.

Build 1 changes only puzzle correctness infrastructure:

1. Lichess mate-in-one puzzles are included again.
2. Any legal immediate checkmate is accepted, even if the stored database
   line uses a different mating move.
3. For Mate-in-N puzzles, an unexpected legal move is checked by the
   browser's chess engine. If every legal defense still permits a forced mate
   within the stated move limit, the alternate line is accepted.
4. After an alternate mate is accepted, the app chooses a defensive
   continuation that prolongs mate and lets the user continue solving.
5. If alternate-mate verification hits its browser node cap, the user's streak
   is NOT broken because the app did not prove the move wrong.
6. Ordinary non-mating puzzles still use the source-provided solution line
   in this build. Stockfish-equivalence checking comes in a later build.
7. GitHub Actions now contains a mate-in-one regression build so future
   changes cannot silently re-exclude mate-in-one puzzles.

Why this is an addon instead of replacing index.html
----------------------------------------------------
Your current index.html is large because it contains the built-in 522-puzzle
library. To make a browser-only GitHub update safer, this build leaves that
file untouched in the repository.

During GitHub Actions deployment:
- scripts/build_pages.py builds the normal static site;
- --include-mate-in-one restores Lichess mate-in-one records;
- scripts/apply_correctness_foundation.py copies
  js/correctness-foundation.js into the generated site and injects it after the
  existing app;
- the deployed GitHub Pages site therefore gets the new behavior without
  requiring you to replace the 200+ KB index.html manually.

Files in this update
--------------------
REPLACE:
  .github/workflows/deploy-pages.yml
  .github/workflows/validate.yml

ADD:
  js/correctness-foundation.js
  scripts/apply_correctness_foundation.py
  tests/fixtures/lichess_matein1_sample.csv

Nothing else should be deleted or replaced.

Expected live puzzle count
--------------------------
Still 1,000,522 total:
  1,000,000 cloud Lichess puzzles
  + 522 built-ins

The one-million cloud set will be rebuilt with mate-in-one records eligible,
so its composition changes but its total count does not.

After uploading
---------------
1. Wait for "Validate trainer source" to turn green.
2. Manually run "Build and deploy million-puzzle trainer".
3. Keep the same 1,000,000 / 10,000 / 0 / 20 defaults.
4. Wait for both build and deploy jobs to turn green.
5. Hard refresh the GitHub Pages site.

A successful deployment verifies:
- exactly the requested cloud puzzle count,
- mate-in-one is NOT excluded,
- the correctness addon exists in the site,
- the addon was injected into index.html,
- the new objective-aware UI wording is present.
