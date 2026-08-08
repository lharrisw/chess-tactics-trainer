#!/usr/bin/env python3
"""Install Build 2.1 Play-vs-Stockfish into an already generated site."""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

SCRIPT_TAG = '<script src="js/play-stockfish.js"></script>'


def patch_html(path: Path) -> None:
    text = path.read_text(encoding="utf-8")

    if SCRIPT_TAG in text:
        return

    if "</body>" not in text:
        raise SystemExit(f"Could not find </body> in {path}")

    # The page must already have Build 2.0. We inject immediately before body
    # close, so Play loads after the engine controller/layer.
    if 'js/stockfish-engine-layer.js' not in text:
        raise SystemExit(f"Build 2.0 Stockfish layer is not present in {path}")

    text = text.replace("</body>", f"  {SCRIPT_TAG}\n</body>", 1)
    path.write_text(text, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site-dir", default="_site")
    parser.add_argument(
        "--project-root",
        default=Path(__file__).resolve().parents[1],
    )
    args = parser.parse_args()

    project_root = Path(args.project_root).resolve()
    site_dir = Path(args.site_dir).resolve()
    source = project_root / "js" / "play-stockfish.js"

    if not site_dir.is_dir():
        raise SystemExit(f"Generated site directory does not exist: {site_dir}")
    if not source.is_file():
        raise SystemExit(f"Missing Build 2.1 JavaScript: {source}")

    site_js = site_dir / "js"
    site_js.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, site_js / source.name)

    for name in ("index.html", "404.html"):
        path = site_dir / name
        if not path.is_file():
            raise SystemExit(f"Missing generated page: {path}")
        patch_html(path)

    print(f"Applied Build 2.1 Play vs Stockfish to {site_dir}")


if __name__ == "__main__":
    main()
