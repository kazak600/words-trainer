"""Merge data/wordlists/<topic>__<level>.txt into data/csv/words_lv.csv.

A word generated in several (topic, level) cells is kept once: lowest level
first, then textbook topics before extra ones, then the earlier cell.
"""

import argparse
import csv
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # python -I drops the script dir

from lang import ENRICHED_COLUMNS, get_lang

LEVELS = {"A1": 0, "A2": 1, "B1": 2, "B2": 3}
POS = {
    "noun", "propn", "verb", "adj", "adv", "pron",
    "prep", "conj", "num", "part", "interj", "phrase",
}


@dataclass
class Cell:
    topic: str
    level: str
    origin: str
    words: list[tuple[str, str]]
    index: int
    topic_index: int


@dataclass
class Row:
    lemma: str
    pos: str
    topic: str
    level: str


def parse_wordlist(text: str) -> list[tuple[str, str]]:
    words: list[tuple[str, str]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        pos, _, rest = line.partition(":")
        pos = pos.strip()
        if pos not in POS:
            raise ValueError(f"unknown part of speech {pos!r} in line: {line}")
        words.extend((pos, w.strip()) for w in rest.split(",") if w.strip())
    return words


def load_cells(topic_map: Path, wordlists: Path) -> tuple[list[Cell], list[str]]:
    cells: list[Cell] = []
    missing: list[str] = []
    topic_index: dict[str, int] = {}
    with topic_map.open(encoding="utf-8", newline="") as f:
        for index, row in enumerate(csv.DictReader(f)):
            slug, level = row["topic_slug"], row["level"]
            topic_index.setdefault(slug, len(topic_index))
            path = wordlists / f"{slug}__{level}.txt"
            if not path.exists():
                missing.append(f"{slug} {level}")
                continue
            words = parse_wordlist(path.read_text(encoding="utf-8"))
            cells.append(
                Cell(slug, level, row["origin"], words, index, topic_index[slug])
            )
    return cells, missing


def merge(cells: list[Cell]) -> tuple[list[Row], dict[str, int]]:
    winners: dict[tuple[str, str], tuple[tuple, Cell, int]] = {}
    total = 0
    for cell in cells:
        seen: set[tuple[str, str]] = set()
        for order, (pos, lemma) in enumerate(cell.words):
            total += 1
            key = (lemma, pos)
            if key in seen:
                continue
            seen.add(key)
            rank = (LEVELS[cell.level], 0 if cell.origin == "textbook" else 1, cell.index)
            if key not in winners or rank < winners[key][0]:
                winners[key] = (rank, cell, order)

    ordered = sorted(
        winners.items(),
        key=lambda item: (
            item[1][1].topic_index,
            LEVELS[item[1][1].level],
            item[1][1].index,
            item[1][2],
        ),
    )
    rows = [
        Row(lemma, pos, cell.topic, cell.level)
        for (lemma, pos), (_, cell, _) in ordered
    ]
    return rows, {"generated": total, "duplicates": total - len(rows)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--lang", default="lv")
    lang = get_lang(parser.parse_args().lang)
    cells, missing = load_cells(lang.topic_map, lang.wordlists)
    rows, stats = merge(cells)

    lang.words_csv.parent.mkdir(parents=True, exist_ok=True)
    with lang.words_csv.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(["lemma", "pos", "topic_slug", "level"])
        writer.writerows((r.lemma, r.pos, r.topic, r.level) for r in rows)

    if not lang.enriched_by_pipeline:
        with lang.enriched_csv.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, ENRICHED_COLUMNS, lineterminator="\n")
            writer.writeheader()
            writer.writerows(
                {"lemma": r.lemma, "pos": r.pos, "topic_slug": r.topic, "level": r.level} for r in rows
            )
    print(f"{stats['generated']} generated, {stats['duplicates']} duplicates dropped, {len(rows)} words kept")
    print("by level:", dict(sorted(Counter(r.level for r in rows).items())))
    by_topic = Counter(r.topic for r in rows)
    for topic, count in by_topic.items():
        print(f"  {topic}: {count}")
    if missing:
        print(f"cells without a word list ({len(missing)}): {', '.join(missing)}")


if __name__ == "__main__":
    main()
