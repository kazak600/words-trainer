"""Validate data/translations/<topic>.txt and merge them into the CSV files that
go to review (data/csv/translations_uk.csv, data/csv/sentences_lv.csv).

Line format (one word per line, '#' starts a comment):

    lemma | pos | ukrainian | sentence with ___ | answer | ukrainian translation of the sentence

The gap ___ stands for the answer, which is the form of the word used in the sentence.
"""

import argparse
import csv
import re
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # python -I drops the script dir

from lang import get_lang

GAP = "___"
CYRILLIC = re.compile(r"[а-яіїєґА-ЯІЇЄҐ]")
RUSSIAN_ONLY = re.compile(r"[ыэъёЫЭЪЁ]")


@dataclass
class Entry:
    lemma: str
    pos: str
    ukrainian: str
    sentence: str
    answer: str
    hint: str
    source: str


def parse_line(line: str, source: str) -> Entry:
    parts = [p.strip() for p in line.split(" | ")]
    if len(parts) != 6:
        raise ValueError(f"expected 6 fields, got {len(parts)}")
    return Entry(*parts, source=source)


def check_entry(entry: Entry) -> list[str]:
    errors = []
    if not entry.lemma or not entry.pos:
        errors.append("empty lemma or pos")
    if not entry.ukrainian:
        errors.append("empty ukrainian translation")
    elif not CYRILLIC.search(entry.ukrainian) or RUSSIAN_ONLY.search(entry.ukrainian):
        errors.append("ukrainian translation is not Ukrainian")
    if entry.sentence.count(GAP) != 1:
        errors.append("sentence needs exactly one ___")
    if not entry.answer:
        errors.append("empty answer")
    if CYRILLIC.search(entry.sentence) or CYRILLIC.search(entry.answer):
        errors.append("cyrillic in the sentence")
    if not CYRILLIC.search(entry.hint) or RUSSIAN_ONLY.search(entry.hint):
        errors.append("sentence translation is not Ukrainian")
    return errors


def load_entries(source_dir: Path) -> tuple[list[Entry], list[str]]:
    entries: list[Entry] = []
    errors: list[str] = []
    for path in sorted(source_dir.glob("*.txt")):
        for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            where = f"{path.name}:{number}"
            try:
                entry = parse_line(line, path.stem)
            except ValueError as exc:
                errors.append(f"{where}: {exc}")
                continue
            problems = check_entry(entry)
            errors.extend(f"{where} ({entry.lemma}): {p}" for p in problems)
            if not problems:
                entries.append(entry)
    return entries, errors


def find_duplicates(entries: list[Entry]) -> list[str]:
    errors = []
    seen_words: dict[tuple[str, str], str] = {}
    seen_sentences: dict[str, str] = {}
    for e in entries:
        key = (e.lemma, e.pos)
        if key in seen_words:
            errors.append(f"duplicate word {e.lemma} ({e.pos}) in {seen_words[key]} and {e.source}")
        seen_words[key] = e.source
        filled = e.sentence.replace(GAP, e.answer)
        if filled in seen_sentences:
            errors.append(f"duplicate sentence for {e.lemma} and {seen_sentences[filled]}: {filled}")
        seen_sentences[filled] = e.lemma
    return errors


def coverage(entries: list[Entry], words: list[dict]) -> tuple[list[dict], list[Entry]]:
    have = {(e.lemma, e.pos) for e in entries}
    wanted = {(w["lemma"], w["pos"]) for w in words}
    missing = [w for w in words if (w["lemma"], w["pos"]) not in have]
    unknown = [e for e in entries if (e.lemma, e.pos) not in wanted]
    return missing, unknown


def write_csv(path: Path, header: list[str], rows: list[list[str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(header)
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--lang", default="lv")
    lang = get_lang(parser.parse_args().lang)
    with lang.enriched_csv.open(encoding="utf-8", newline="") as f:
        words = list(csv.DictReader(f))
    entries, errors = load_entries(lang.translations_dir)
    errors += find_duplicates(entries)
    missing, unknown = coverage(entries, words)

    order = {(w["lemma"], w["pos"]): i for i, w in enumerate(words)}
    entries = sorted((e for e in entries if (e.lemma, e.pos) in order), key=lambda e: order[(e.lemma, e.pos)])
    write_csv(
        lang.translations_csv,
        ["lemma", "pos", "ukrainian", "review_status"],
        [[e.lemma, e.pos, e.ukrainian, "pending"] for e in entries],
    )
    write_csv(
        lang.sentences_csv,
        ["lemma", "pos", "text_with_gap", "answer", "hint_uk", "review_status"],
        [[e.lemma, e.pos, e.sentence, e.answer, e.hint, "pending"] for e in entries],
    )

    print(f"{len(entries)} of {len(words)} words translated, {len(missing)} missing, {len(errors)} errors")
    for error in errors:
        print("ERROR", error)
    for entry in unknown:
        print("UNKNOWN WORD", entry.lemma, entry.pos, entry.source)
    by_topic: dict[str, int] = {}
    for w in missing:
        by_topic[w["topic_slug"]] = by_topic.get(w["topic_slug"], 0) + 1
    if missing:
        print("missing by topic:", by_topic)


if __name__ == "__main__":
    main()
