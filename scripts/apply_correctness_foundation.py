#!/usr/bin/env python3
"""Apply Build 1's correctness layer to a generated GitHub Pages site.

The source index.html is intentionally left untouched. This keeps browser
updates small: the normal million-puzzle builder first copies the current app,
then this script adds the correctness addon to the generated _site artifact.
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

SCRIPT_TAG = '<script src="js/correctness-foundation.js"></script>'

OLD_NOTE = (
    "The GitHub Actions workflow builds exactly one million Lichess puzzles into "
    "compressed chunks. Mate-in-one records are excluded because Lichess permits "
    "more than one mating answer there. Other Lichess solution moves are documented "
    "as only moves."
)

NEW_NOTE = (
    "The GitHub Actions workflow builds exactly one million Lichess puzzles into "
    "compressed chunks. Mating puzzles are objective-aware: any legal immediate "
    "checkmate is accepted, and alternate forced mating routes are verified in the "
    "browser when practical."
)

OLD_STATUS = "compressed chunks · unique first move · one to six solver moves"
NEW_STATUS = "compressed chunks · objective-aware answers · one to six solver moves"


def patch_html(path: Path) -> None:
    text = path.read_text(encoding="utf-8")

    text = text.replace(OLD_NOTE, NEW_NOTE)
    text = text.replace(OLD_STATUS, NEW_STATUS)

    if SCRIPT_TAG not in text:
        if "</body>" not in text:
            raise SystemExit(f"Could not find </body> in {path}")
        text = text.replace("</body>", f"  {SCRIPT_TAG}\n</body>", 1)

    path.write_text(text, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site-dir", default="_site")
    parser.add_argument("--project-root", default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()

    project_root = Path(args.project_root).resolve()
    site_dir = Path(args.site_dir).resolve()
    addon = project_root / "js" / "correctness-foundation.js"

    if not site_dir.is_dir():
        raise SystemExit(f"Generated site directory does not exist: {site_dir}")
    if not addon.is_file():
        raise SystemExit(f"Missing correctness addon: {addon}")

    out_js = site_dir / "js"
    out_js.mkdir(parents=True, exist_ok=True)
    shutil.copy2(addon, out_js / addon.name)

    for name in ("index.html", "404.html"):
        path = site_dir / name
        if not path.is_file():
            raise SystemExit(f"Missing generated page: {path}")
        patch_html(path)

    print(f"Applied correctness foundation to {site_dir}")


if __name__ == "__main__":
    main()
