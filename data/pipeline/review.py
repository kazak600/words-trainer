"""Review round-trip: export words to data/csv/review_<topic>.csv, import the edited files back.

    python3 -I data/pipeline/review.py export [--topic SLUG ...] [--level A2]
    python3 -I data/pipeline/review.py import [FILE ...]

Columns lemma, pos, level and english are context only. The user edits ukrainian, sentence,
answer, sentence_uk and sets status to approved. Any changed cell makes the status `edited`.
"""

import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # python -I drops the script dir

from build_translations import Entry, check_entry

ROOT = Path(__file__).resolve().parents[2]
CSV_DIR = ROOT / "data" / "csv"
ENRICHED = CSV_DIR / "words_lv_enriched.csv"
TRANSLATIONS = CSV_DIR / "translations_uk.csv"
SENTENCES = CSV_DIR / "sentences_lv.csv"

REVIEW_COLUMNS = ["lemma", "pos", "level", "english", "ukrainian", "sentence", "answer", "sentence_uk", "status"]
STATUSES = {"pending", "approved", "edited"}
TRANSLATION_COLUMNS = ["lemma", "pos", "ukrainian", "review_status"]
SENTENCE_COLUMNS = ["lemma", "pos", "text_with_gap", "answer", "hint_uk", "review_status"]


def export_rows(words, translations, sentences, topic=None, level=None):
    rows = []
    for w in words:
        if topic and w["topic_slug"] != topic or level and w["level"] != level:
            continue
        key = (w["lemma"], w["pos"])
        if key not in translations or key not in sentences:
            continue
        t, s = translations[key], sentences[key]
        rows.append({
            "lemma": w["lemma"], "pos": w["pos"], "level": w["level"], "english": w["english"],
            "ukrainian": t["ukrainian"], "sentence": s["text_with_gap"], "answer": s["answer"],
            "sentence_uk": s["hint_uk"], "status": t["review_status"],
        })
    return rows


def apply_review(review_rows, translations, sentences):
    """Apply reviewed rows in place. Returns errors; when there are any, nothing is changed."""
    updates = []
    errors = []
    for number, row in enumerate(review_rows, 2):
        key = (row["lemma"], row["pos"])
        where = f"row {number} ({row['lemma']} {row['pos']})"
        if key not in translations or key not in sentences:
            errors.append(f"{where}: unknown word")
            continue
        if row["status"] not in STATUSES:
            errors.append(f"{where}: unknown status '{row['status']}'")
            continue
        entry = Entry(row["lemma"], row["pos"], row["ukrainian"].strip(), row["sentence"].strip(),
                      row["answer"].strip(), row["sentence_uk"].strip(), "review")
        problems = check_entry(entry)
        if problems:
            errors.extend(f"{where}: {p}" for p in problems)
            continue
        t, s = translations[key], sentences[key]
        changed = (entry.ukrainian, entry.sentence, entry.answer, entry.hint) != (
            t["ukrainian"], s["text_with_gap"], s["answer"], s["hint_uk"])
        status = "edited" if changed else row["status"]
        updates.append((key, entry, status))
    if errors:
        return errors
    for key, entry, status in updates:
        translations[key].update(ukrainian=entry.ukrainian, review_status=status)
        sentences[key].update(text_with_gap=entry.sentence, answer=entry.answer,
                              hint_uk=entry.hint, review_status=status)
    return []


def read_csv(path):
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def write_csv(path, columns, rows):
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, columns, lineterminator="\n", extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def load_stores():
    translations = {(r["lemma"], r["pos"]): r for r in read_csv(TRANSLATIONS)}
    sentences = {(r["lemma"], r["pos"]): r for r in read_csv(SENTENCES)}
    return translations, sentences


def run_export(topics, level):
    words = read_csv(ENRICHED)
    translations, sentences = load_stores()
    for slug in topics or sorted({w["topic_slug"] for w in words}):
        rows = export_rows(words, translations, sentences, topic=slug, level=level)
        if not rows:
            continue
        path = CSV_DIR / f"review_{slug}.csv"
        write_csv(path, REVIEW_COLUMNS, rows)
        print(f"wrote {len(rows)} rows to {path.relative_to(ROOT)}")


def run_import(files):
    translations, sentences = load_stores()
    all_errors = []
    for path in files:
        errors = apply_review(read_csv(path), translations, sentences)
        all_errors += [f"{path.name}: {e}" for e in errors]
    if all_errors:
        print("\n".join(all_errors))
        print(f"{len(all_errors)} errors, nothing imported")
        sys.exit(1)
    write_csv(TRANSLATIONS, TRANSLATION_COLUMNS, translations.values())
    write_csv(SENTENCES, SENTENCE_COLUMNS, sentences.values())
    counts = {}
    for t in translations.values():
        counts[t["review_status"]] = counts.get(t["review_status"], 0) + 1
    print("imported", len(files), "files; statuses:", counts)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    export = sub.add_parser("export")
    export.add_argument("--topic", action="append")
    export.add_argument("--level")
    imp = sub.add_parser("import")
    imp.add_argument("files", nargs="*", type=Path)
    args = parser.parse_args()
    if args.command == "export":
        run_export(args.topic, args.level)
    else:
        run_import(args.files or sorted(CSV_DIR.glob("review_*.csv")))


if __name__ == "__main__":
    main()
