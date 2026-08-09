BUILD 2.2.5 — VALIDATOR FIX
==============================

ROOT CAUSE
----------
The current Build 2.2.5 JavaScript is valid.

The validator still required the obsolete literal UI text:

  Full-strength Stockfish 18

Build 2.2.5 intentionally replaced that older heading with the guided-review
interface. The old exact-string assertion therefore caused Validate trainer
source to fail.

FIX
---
The validator now checks current architecture/UI markers instead of old display
copy, including:

  single-pass-state-analysis-2.2.3
  single-pass-cached-game-states-v3
  bounded-movetime-multipv2-only-with-watchdog
  guided-review-panel-2.2.5
  selected-move-first-compact-list-key-navigation
  Next key move
  analysis-key-moves
  How the review rates moves

It still checks Retry, Turn into puzzle, classification logic, personal-puzzle
storage, full-strength engine switching, and the absence of the old searchMoves
paths.

REPLACE ONLY
------------
  .github/workflows/validate.yml

Do not replace postgame-analysis.js again.

VERIFICATION
------------
The exact Build 2.2 GitHub Actions validation shell step was executed locally
against the current 2.2.5 review source and passed.
