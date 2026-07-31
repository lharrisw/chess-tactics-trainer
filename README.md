# Chess Tactics Trainer for GitHub Pages

This repository publishes a static chess tactics trainer with:

- 522 built-in puzzles that work immediately;
- exactly 1,000,000 Lichess puzzles generated during deployment;
- single-move and multi-move solutions from one through six solver moves;
- automatic best-defense replies;
- source-game links after a puzzle is solved or revealed;
- lazy loading: approximately 100 compressed puzzle chunks, not one million
  individual files;
- IndexedDB caching and seen-puzzle tracking in each browser.

The million-puzzle data is not committed to the source repository. The manual
GitHub Actions deployment streams the official Lichess database, creates the
compressed files, verifies the count, and deploys the completed `_site`
artifact to GitHub Pages.

## Publish it

### 1. Create the repository

Create an empty GitHub repository. A public repository is the simplest choice
for GitHub Pages on GitHub Free. Do not initialize it with a README, license, or
`.gitignore`, since those files are already included here.

Suggested repository name:

```text
chess-tactics-trainer
```

### 2. Put these files in the repository

GitHub Desktop is the least error-prone method because the hidden `.github`
folder must be uploaded.

1. Clone the empty repository with GitHub Desktop.
2. Copy every item from this folder into the cloned repository folder,
   including `.github`.
3. In GitHub Desktop, commit the files with a message such as
   `Set up million-puzzle trainer`.
4. Push the commit to GitHub.

A terminal alternative is:

```bash
git init
git add .
git commit -m "Set up million-puzzle trainer"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/chess-tactics-trainer.git
git push -u origin main
```

### 3. Select GitHub Actions as the Pages source

In the GitHub repository:

1. Open **Settings**.
2. Open **Pages** under **Code and automation**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.

### 4. Run the full deployment

1. Open the repository's **Actions** tab.
2. Select **Build and deploy million-puzzle trainer**.
3. Select **Run workflow**.
4. Keep these defaults:
   - `puzzle_count`: `1000000`
   - `chunk_size`: `10000`
   - `min_popularity`: `0`
   - `min_plays`: `20`
5. Select **Run workflow**.
6. Monitor that workflow run until both the `build` and `deploy` jobs are green.

The workflow publishes the finished site without adding the generated puzzle
files to the Git history.

### 5. Open the website

The deployment page and **Settings → Pages** show the final address. For a
repository named `chess-tactics-trainer`, it normally has this form:

```text
https://YOUR-USERNAME.github.io/chess-tactics-trainer/
```

The top-right count should become **1,000,522 puzzles** after the manifest is
loaded.

## How the deployed trainer behaves

The page initially downloads only `manifest.json`. It then downloads one
compressed chunk when a cloud puzzle is requested. Each chunk contains 10,000
puzzles and is cached in IndexedDB. The app normally keeps twelve chunks cached,
so it does not download the entire database to the device.

Seen puzzle IDs are stored separately in IndexedDB. Use **Database → Reset seen
history** only when you intentionally want previously shown puzzles to become
eligible again.

The app excludes Lichess mate-in-one records because those may have more than
one mating answer. Lichess documents the remaining player moves in its puzzle
solutions as only moves.

## Updating the app later

After changing `index.html` or the build script:

1. Commit and push the change.
2. Confirm the lightweight **Validate trainer source** workflow is green.
3. Manually run **Build and deploy million-puzzle trainer** again.

The full deployment is manual so ordinary source commits do not repeatedly
re-download and rebuild one million puzzles.

## Local test

The built-in 522 puzzles work by opening `index.html` directly. The cloud
library requires an HTTP server and generated puzzle files. A small fixture can
be built locally without downloading Lichess:

```bash
python scripts/build_pages.py \
  --source tests/fixtures/lichess_sample.csv \
  --site-dir _site-test \
  --limit 3 \
  --chunk-size 2 \
  --min-popularity -100 \
  --min-plays 0

python -m http.server 8000 --directory _site-test
```

Then open `http://localhost:8000/`.

## Full local build

Install the one build dependency and run:

```bash
python -m pip install -r requirements.txt
python scripts/build_pages.py --site-dir _site --limit 1000000
python -m http.server 8000 --directory _site
```

## Storage and privacy

The GitHub Pages site itself is static. It does not require an account and does
not send solving history to a server. Puzzle history and downloaded chunks stay
in the browser's IndexedDB. Clearing site data removes them.

A normal GitHub Pages URL should be treated as publicly accessible even when
the trainer is intended only for personal use.
