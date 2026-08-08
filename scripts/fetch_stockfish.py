#!/usr/bin/env python3
"""Fetch the pinned Stockfish 18 full single-threaded browser distribution.

The large binary is deliberately NOT committed to the repository. GitHub
Actions downloads it during deployment, caches it, and publishes the exact
corresponding source archive and GPL license alongside the binary.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import urllib.request
from pathlib import Path

REPOSITORY = "nmrugg/stockfish.js"
TAG = "v18.0.0"
UPSTREAM_COMMIT = "cb3d4ee"
ASSETS = ("stockfish-18-single.js", "stockfish-18-single.wasm")
USER_AGENT = "lharrisw-chess-tactics-trainer-build-2.0"


def request(url: str, *, github_api: bool = False) -> urllib.request.Request:
    headers = {"User-Agent": USER_AGENT}

    if github_api:
        headers["Accept"] = "application/vnd.github+json"
        headers["X-GitHub-Api-Version"] = "2022-11-28"

        token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
        if token:
            headers["Authorization"] = f"Bearer {token}"

    return urllib.request.Request(url, headers=headers)


def download(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".part")

    print(f"Downloading {destination.name}", file=sys.stderr)

    with urllib.request.urlopen(request(url), timeout=300) as response, temporary.open("wb") as output:
        shutil.copyfileobj(response, output, length=1024 * 1024)

    temporary.replace(destination)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def valid_existing(output: Path) -> bool:
    js = output / ASSETS[0]
    wasm = output / ASSETS[1]
    source = output / "source" / f"stockfish.js-{TAG}-source.zip"
    copying = output / "Copying.txt"
    source_notice = output / "SOURCE.txt"

    if not (
        js.is_file()
        and js.stat().st_size > 10_000
        and wasm.is_file()
        and wasm.stat().st_size > 50_000_000
        and source.is_file()
        and source.stat().st_size > 100_000
        and copying.is_file()
        and copying.stat().st_size > 10_000
        and source_notice.is_file()
    ):
        return False

    notice = source_notice.read_text(encoding="utf-8", errors="replace")
    return TAG in notice and UPSTREAM_COMMIT in notice


def fetch(output: Path, force: bool = False) -> None:
    if not force and valid_existing(output):
        print("Pinned Stockfish 18 assets are already present.", file=sys.stderr)
        return

    output.mkdir(parents=True, exist_ok=True)

    api_url = f"https://api.github.com/repos/{REPOSITORY}/releases/tags/{TAG}"
    with urllib.request.urlopen(request(api_url, github_api=True), timeout=120) as response:
        release = json.load(response)

    if release.get("tag_name") != TAG:
        raise SystemExit(f"Unexpected Stockfish.js release tag: {release.get('tag_name')!r}")
    if release.get("draft") or release.get("prerelease"):
        raise SystemExit("Pinned Stockfish.js release unexpectedly became draft/prerelease.")

    body = str(release.get("body") or "")
    if UPSTREAM_COMMIT not in body:
        raise SystemExit(
            f"Pinned release no longer documents official Stockfish upstream {UPSTREAM_COMMIT}."
        )

    assets = {
        asset["name"]: asset["browser_download_url"]
        for asset in release.get("assets", [])
        if asset.get("name") and asset.get("browser_download_url")
    }

    missing = [name for name in ASSETS if name not in assets]
    if missing:
        raise SystemExit(
            "Pinned Stockfish.js release is missing expected assets: " + ", ".join(missing)
        )

    for name in ASSETS:
        download(assets[name], output / name)

    raw_root = f"https://raw.githubusercontent.com/{REPOSITORY}/{TAG}"
    download(f"{raw_root}/Copying.txt", output / "Copying.txt")
    download(f"{raw_root}/AUTHORS", output / "AUTHORS")

    source_name = f"stockfish.js-{TAG}-source.zip"
    download(
        f"https://github.com/{REPOSITORY}/archive/refs/tags/{TAG}.zip",
        output / "source" / source_name,
    )

    notice = f"""Stockfish.js browser engine distribution

Release: {REPOSITORY} {TAG}
Upstream official Stockfish 18 commit: {UPSTREAM_COMMIT}
Browser files: {", ".join(ASSETS)}
Flavor: full single-threaded WebAssembly
License: GNU General Public License version 3
Corresponding source: source/{source_name}

The engine runs locally in the visitor's browser. The Chess Tactics Trainer
interface is an independent project and is not part of the Stockfish project.
"""
    (output / "SOURCE.txt").write_text(notice, encoding="utf-8")

    if not valid_existing(output):
        raise SystemExit("Downloaded Stockfish assets failed validation.")

    checksums = {
        path.relative_to(output).as_posix(): sha256(path)
        for path in sorted(output.rglob("*"))
        if path.is_file()
    }
    (output / "SHA256SUMS.json").write_text(
        json.dumps(checksums, indent=2) + "\n",
        encoding="utf-8",
    )

    release_record = {
        "repository": REPOSITORY,
        "tag": TAG,
        "upstreamOfficialStockfishCommit": UPSTREAM_COMMIT,
        "releaseHtmlUrl": release.get("html_url"),
        "publishedAt": release.get("published_at"),
        "assets": list(ASSETS),
    }
    (output / "RELEASE.json").write_text(
        json.dumps(release_record, indent=2) + "\n",
        encoding="utf-8",
    )

    total_mb = sum((output / name).stat().st_size for name in ASSETS) / 1024 / 1024
    print(f"Fetched pinned Stockfish 18 browser engine: {total_mb:.1f} MiB.", file=sys.stderr)


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--output", type=Path, default=Path("_engine"))
    p.add_argument("--force", action="store_true")
    return p


if __name__ == "__main__":
    args = parser().parse_args()
    fetch(args.output.resolve(), args.force)
