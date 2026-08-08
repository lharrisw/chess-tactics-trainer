#!/usr/bin/env python3
"""Install Build 2.0 Stockfish assets into an already-generated static site."""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

SCRIPT_TAGS = (
    '<script src="js/stockfish-controller.js"></script>',
    '<script src="js/stockfish-engine-layer.js"></script>',
)

ENGINE_REQUIRED = (
    "stockfish-18-single.js",
    "stockfish-18-single.wasm",
    "Copying.txt",
    "SOURCE.txt",
)


def patch_html(path: Path) -> None:
    text = path.read_text(encoding="utf-8")

    missing = [tag for tag in SCRIPT_TAGS if tag not in text]
    if not missing:
        return

    if "</body>" not in text:
        raise SystemExit(f"Could not find </body> in {path}")

    block = "\n".join("  " + tag for tag in SCRIPT_TAGS if tag not in text)
    text = text.replace("</body>", block + "\n</body>", 1)
    path.write_text(text, encoding="utf-8")


def copy_tree_replace(source: Path, destination: Path) -> None:
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(source, destination)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site-dir", default="_site")
    parser.add_argument("--engine-dir", default="_engine")
    parser.add_argument(
        "--project-root",
        default=Path(__file__).resolve().parents[1],
    )
    args = parser.parse_args()

    project_root = Path(args.project_root).resolve()
    site_dir = Path(args.site_dir).resolve()
    engine_dir = Path(args.engine_dir).resolve()

    if not site_dir.is_dir():
        raise SystemExit(f"Generated site directory does not exist: {site_dir}")

    for name in ENGINE_REQUIRED:
        path = engine_dir / name
        if not path.is_file():
            raise SystemExit(f"Missing Stockfish engine asset: {path}")

    source_archive = engine_dir / "source" / "stockfish.js-v18.0.0-source.zip"
    if not source_archive.is_file():
        raise SystemExit(f"Missing corresponding Stockfish source archive: {source_archive}")

    js_source = project_root / "js"
    for name in ("stockfish-controller.js", "stockfish-engine-layer.js"):
        path = js_source / name
        if not path.is_file():
            raise SystemExit(f"Missing Build 2.0 JavaScript: {path}")

    site_js = site_dir / "js"
    site_js.mkdir(parents=True, exist_ok=True)

    for name in ("stockfish-controller.js", "stockfish-engine-layer.js"):
        shutil.copy2(js_source / name, site_js / name)

    copy_tree_replace(engine_dir, site_dir / "engine")

    for name in ("index.html", "404.html"):
        path = site_dir / name
        if not path.is_file():
            raise SystemExit(f"Missing generated page: {path}")
        patch_html(path)

    print(f"Applied Stockfish Build 2.0 engine layer to {site_dir}")


if __name__ == "__main__":
    main()
