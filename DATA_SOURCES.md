# Data sources

## Lichess cloud library

The deployment workflow streams the official Lichess puzzle database from:

- https://database.lichess.org/#puzzles
- Download file: `lichess_db_puzzle.csv.zst`

Lichess publishes these database exports under CC0. The generated site excludes
`mateIn1` records because Lichess documents an exception allowing multiple
mating answers in those puzzles. For the remaining records, Lichess documents
all player moves in the solution as "only moves."

The deployed app stores only the puzzle position, move line, rating,
popularity, themes, play count, and source-game URL needed by the trainer.

## Historical built-in library

The app also contains 522 built-in positions, including historical games and
multi-move combinations. These work even before the cloud puzzle manifest is
available.

## Optional historical expansion

The interface still accepts app-format JSONL packs created from historical PGN
collections. No Lumbra or ChessBase files are bundled in this repository.
