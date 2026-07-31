#!/usr/bin/env python3
"""Build a GitHub Pages site containing a lazily loaded Lichess puzzle library.

The generated site keeps the app itself small and writes the selected puzzles as
compressed JSON chunks under ``_site/puzzles``. The browser downloads only the
chunks it needs and caches them in IndexedDB.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import shutil
import sys
import urllib.request
from collections import Counter
from contextlib import ExitStack, contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO, Iterator, TextIO


DEFAULT_SOURCE = "https://database.lichess.org/lichess_db_puzzle.csv.zst"
SCHEMA_VERSION = 1


@contextmanager
def open_binary_source(source: str) -> Iterator[BinaryIO]:
    if source.startswith(("http://", "https://")):
        request = urllib.request.Request(
            source,
            headers={
                "User-Agent": "Latimer-Chess-Tactics-Trainer/1.0 (+GitHub Pages build)",
                "Accept-Encoding": "identity",
            },
        )
        with urllib.request.urlopen(request, timeout=120) as response:
            yield response  # type: ignore[misc]
    else:
        with Path(source).open("rb") as handle:
            yield handle


@contextmanager
def open_text_source(source: str) -> Iterator[TextIO]:
    with ExitStack() as stack:
        raw = stack.enter_context(open_binary_source(source))
        if source.lower().endswith(".zst"):
            try:
                import zstandard as zstd
            except ImportError as exc:
                raise SystemExit("Missing dependency: zstandard. Run: python -m pip install zstandard") from exc
            reader = stack.enter_context(zstd.ZstdDecompressor().stream_reader(raw))
            text = io.TextIOWrapper(reader, encoding="utf-8", newline="")
            stack.callback(text.detach)
            yield text
        else:
            text = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
            stack.callback(text.detach)
            yield text


def level_from_rating(rating: int) -> str:
    if rating <= 1200:
        return "Beginner"
    if rating <= 1900:
        return "Intermediate"
    return "Advanced"


def validate_and_prepare(row: dict[str, str], args: argparse.Namespace) -> list[object] | None:
    puzzle_id = (row.get("PuzzleId") or "").strip()
    raw_fen = (row.get("FEN") or "").strip()
    raw_moves = (row.get("Moves") or "").strip()
    if not puzzle_id or not raw_fen or not raw_moves:
        return None

    try:
        rating = int(row.get("Rating") or 1500)
        popularity = int(row.get("Popularity") or 0)
        plays = int(row.get("NbPlays") or 0)
    except ValueError:
        return None

    if not (args.min_rating <= rating <= args.max_rating):
        return None
    if popularity < args.min_popularity or plays < args.min_plays:
        return None

    themes = (row.get("Themes") or "tactic").split()
    # Lichess explicitly permits more than one winning move in mate-in-one
    # puzzles. Excluding them enforces the user's unique-first-move rule.
    if not args.include_mate_in_one and "mateIn1" in themes:
        return None

    all_moves = raw_moves.split()
    if len(all_moves) < 2:
        return None
    if any(len(move) not in (4, 5) for move in all_moves):
        return None
    solver_moves = (len(all_moves) - 1 + 1) // 2
    if not (args.min_solver_moves <= solver_moves <= args.max_solver_moves):
        return None

    # Compact schema per puzzle:
    # [id, Lichess pre-setup FEN, setup+solution UCI line, rating, popularity,
    #  themes, source game URL, number of plays]. The browser applies the
    #  setup move and validates the complete line with the app's chess engine.
    return [
        puzzle_id,
        raw_fen,
        " ".join(all_moves),
        rating,
        popularity,
        " ".join(themes),
        (row.get("GameUrl") or "").strip(),
        plays,
    ]


def gzip_json_bytes(payload: object) -> bytes:
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    out = io.BytesIO()
    with gzip.GzipFile(fileobj=out, mode="wb", compresslevel=7, mtime=0) as gz:
        gz.write(raw)
    return out.getvalue()


def write_chunk(
    output_dir: Path,
    chunk_index: int,
    records: list[list[object]],
) -> dict[str, object]:
    filename = f"chunk-{chunk_index:04d}.json.gz"
    payload = {"v": SCHEMA_VERSION, "p": records}
    compressed = gzip_json_bytes(payload)
    path = output_dir / filename
    path.write_bytes(compressed)
    return {
        "file": filename,
        "count": len(records),
        "bytes": len(compressed),
        "sha256": hashlib.sha256(compressed).hexdigest(),
    }


def build(args: argparse.Namespace) -> None:
    project_root = Path(args.project_root).resolve()
    source_index = project_root / "index.html"
    if not source_index.exists():
        raise SystemExit(f"Missing app file: {source_index}")

    site_dir = Path(args.site_dir).resolve()
    if site_dir.exists():
        shutil.rmtree(site_dir)
    puzzle_dir = site_dir / "puzzles"
    puzzle_dir.mkdir(parents=True)
    shutil.copy2(source_index, site_dir / "index.html")
    shutil.copy2(source_index, site_dir / "404.html")
    (site_dir / ".nojekyll").write_text("", encoding="utf-8")

    counters = {
        "solverMoves": Counter(),
        "levels": Counter(),
        "themes": Counter(),
    }
    chunks: list[dict[str, object]] = []
    buffer: list[list[object]] = []
    accepted = scanned = rejected = 0

    print(f"Streaming puzzles from {args.source}", file=sys.stderr)
    with open_text_source(args.source) as source:
        reader = csv.DictReader(source)
        required = {
            "PuzzleId",
            "FEN",
            "Moves",
            "Rating",
            "Popularity",
            "NbPlays",
            "Themes",
            "GameUrl",
        }
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            raise SystemExit(
                "Source does not match the official Lichess puzzle CSV schema. "
                f"Found: {reader.fieldnames}"
            )

        for row in reader:
            scanned += 1
            if accepted >= args.limit:
                break
            record = validate_and_prepare(row, args)
            if record is None:
                rejected += 1
                continue

            rating = int(record[3])
            themes = str(record[5]).split()
            solver_moves = len(str(record[2]).split()) // 2
            counters["solverMoves"][str(solver_moves)] += 1
            counters["levels"][level_from_rating(rating)] += 1
            counters["themes"].update(themes)

            buffer.append(record)
            accepted += 1
            if len(buffer) >= args.chunk_size:
                chunks.append(write_chunk(puzzle_dir, len(chunks), buffer))
                buffer = []
            if accepted % 50_000 == 0:
                print(
                    f"accepted {accepted:,} | scanned {scanned:,} | rejected {rejected:,}",
                    file=sys.stderr,
                )

    if buffer:
        chunks.append(write_chunk(puzzle_dir, len(chunks), buffer))

    if accepted < args.limit:
        raise SystemExit(
            f"Only {accepted:,} puzzles passed the filters; requested {args.limit:,}. "
            "Lower --min-popularity/--min-plays or widen the rating/length range."
        )

    manifest = {
        "schema": SCHEMA_VERSION,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "count": accepted,
        "chunkSize": args.chunk_size,
        "chunks": chunks,
        "source": {
            "name": "Lichess Puzzle Database",
            "url": "https://database.lichess.org/#puzzles",
            "download": args.source,
            "license": "CC0",
        },
        "quality": {
            "uniqueFirstMove": not args.include_mate_in_one,
            "mateInOneExcluded": not args.include_mate_in_one,
            "minPopularity": args.min_popularity,
            "minPlays": args.min_plays,
            "minRating": args.min_rating,
            "maxRating": args.max_rating,
            "minSolverMoves": args.min_solver_moves,
            "maxSolverMoves": args.max_solver_moves,
        },
        "stats": {
            "solverMoves": dict(sorted(counters["solverMoves"].items(), key=lambda kv: int(kv[0]))),
            "levels": dict(counters["levels"]),
            "themes": dict(counters["themes"].most_common()),
        },
    }
    manifest_path = puzzle_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    total_bytes = sum(int(c["bytes"]) for c in chunks)
    print(
        f"Built {accepted:,} puzzles in {len(chunks)} chunks; "
        f"compressed puzzle data {total_bytes / 1024 / 1024:.1f} MiB.",
        file=sys.stderr,
    )
    if total_bytes >= 900 * 1024 * 1024:
        raise SystemExit("Generated puzzle data is too close to GitHub Pages' 1 GB site limit.")


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source", default=DEFAULT_SOURCE, help="Official CSV.ZST URL or local CSV/CSV.ZST")
    p.add_argument("--project-root", default=Path(__file__).resolve().parents[1])
    p.add_argument("--site-dir", default="_site")
    p.add_argument("--limit", type=int, default=1_000_000)
    p.add_argument("--chunk-size", type=int, default=10_000)
    p.add_argument("--min-rating", type=int, default=600)
    p.add_argument("--max-rating", type=int, default=3200)
    p.add_argument("--min-popularity", type=int, default=0)
    p.add_argument("--min-plays", type=int, default=20)
    p.add_argument("--min-solver-moves", type=int, default=1)
    p.add_argument("--max-solver-moves", type=int, default=6)
    p.add_argument("--include-mate-in-one", action="store_true")
    return p


if __name__ == "__main__":
    build(parser().parse_args())
