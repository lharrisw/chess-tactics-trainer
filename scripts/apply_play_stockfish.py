#!/usr/bin/env python3
"""Install Build 2.1 Play-vs-Stockfish into an already generated site."""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

SCRIPT_TAGS = (
    '<script src="js/play-stockfish.js"></script>',
    '<script src="js/app-layout.js"></script>',
)


def patch_html(path: Path) -> None:
    text = path.read_text(encoding="utf-8")

    if "</body>" not in text:
        raise SystemExit(f"Could not find </body> in {path}")

    # The page must already have Build 2.0. Play loads after the engine layer,
    # and the global layout module loads after Play so it is the final geometry
    # authority for all tabs.
    if 'js/stockfish-engine-layer.js' not in text:
        raise SystemExit(f"Build 2.0 Stockfish layer is not present in {path}")

    missing = [tag for tag in SCRIPT_TAGS if tag not in text]
    if not missing:
        return

    block = "\n".join("  " + tag for tag in missing)
    text = text.replace("</body>", block + "\n</body>", 1)
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
    sources = [
        project_root / "js" / "play-stockfish.js",
        project_root / "js" / "app-layout.js",
    ]

    if not site_dir.is_dir():
        raise SystemExit(f"Generated site directory does not exist: {site_dir}")

    for source in sources:
        if not source.is_file():
            raise SystemExit(f"Missing Build 2.1.2 JavaScript: {source}")

    site_js = site_dir / "js"
    site_js.mkdir(parents=True, exist_ok=True)

    for source in sources:
        shutil.copy2(source, site_js / source.name)

    for name in ("index.html", "404.html"):
        path = site_dir / name
        if not path.is_file():
            raise SystemExit(f"Missing generated page: {path}")
        patch_html(path)

    print(f"Applied Build 2.1.2 Play vs Stockfish + comfortable layout to {site_dir}")


if __name__ == "__main__":
    main()
