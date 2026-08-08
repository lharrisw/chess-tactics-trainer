CHESS TACTICS TRAINER — BUILD 1.2.1
PROGRESSIVE HINT BUTTON BINDING FIX
===================================

WHY BUILD 1.2 LOOKED LIKE THE OLD HINT
--------------------------------------
index.html installs these listeners before correctness-foundation.js loads:

    l-hint -> original doHint
    gs-hint -> original doHint
    l-sol  -> original doSolution
    gs-sol -> original doSolution

Build 1.2 replaced the JavaScript variable named doHint, but a DOM event
listener retains the exact function object originally passed to
addEventListener. Changing the variable afterward does not modify that listener.

Therefore the new progressive doHint function existed in the deployed file,
but clicking Hint still called the old one-stage function.

WHAT 1.2.1 DOES
---------------
- captures the exact original doHint/doSolution function objects
- removes those old listeners from both Library and From-your-game buttons
- attaches the Build 1.2.1 progressive doHint
- attaches the Build 1.2.1 replay-aware doSolution
- preserves all Build 1, 1.1, and 1.2 behavior

EXPECTED HINT BEHAVIOR
----------------------
First click:
    Hint 1/2
    only source piece highlighted
    button -> More hint

Second click:
    Hint 2/2
    source + destination highlighted
    button -> Hint shown

After the computer replies:
    hint resets to Hint for the next solver move

FILES TO REPLACE
----------------
    js/correctness-foundation.js
    .github/workflows/validate.yml

Optional:
    BUILD_1_2_1_README.txt

DEPLOY
------
1. Replace the two files in GitHub.
2. Commit to main.
3. Wait for Validate trainer source to be green.
4. Run Build and deploy million-puzzle trainer with the same defaults.
5. Wait for build + deploy to be green.
6. Hard refresh the live site with Command + Shift + R.
