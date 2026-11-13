"""List frequent Latvian lemmas that data/csv/words_lv.csv does not cover.

Takes the top forms of the FrequencyWords list, lemmatises them with the
Tēzaurs morphotagger, sums frequencies per lemma, and writes the lemmas
missing from the word list to data/csv/frequency_gaps.csv.
"""

import csv
import json
import re
import subprocess
import time
import urllib.parse
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / ".cache"
FREQUENCY_URL = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/lv/lv_50k.txt"
FREQUENCY_FILE = CACHE / "lv_50k.txt"
LEMMA_CACHE = CACHE / "lemmas.json"
WORDS = ROOT / "data" / "csv" / "words_lv.csv"
OUTPUT = ROOT / "data" / "csv" / "frequency_gaps.csv"

TOP_FORMS = 4000
BATCH = 40
TOP_GAPS = 500
WORD = re.compile(r"^[a-zāčēģīķļņšūž]+$")
SKIP_TAG_PREFIXES = ("np", "x", "y", "z", "i")


def get(url: str) -> str:
    # curl uses the system certificate store; python.org builds on macOS have none
    result = subprocess.run(
        ["curl", "-sS", "--fail", "-m", "30", url],
        capture_output=True, text=True, encoding="utf-8", check=True,
    )
    return result.stdout


def fetch_frequency() -> list[tuple[str, int]]:
    if not FREQUENCY_FILE.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        FREQUENCY_FILE.write_text(get(FREQUENCY_URL), encoding="utf-8")
    forms = []
    for line in FREQUENCY_FILE.read_text(encoding="utf-8").splitlines()[:TOP_FORMS]:
        form, _, count = line.rpartition(" ")
        if WORD.match(form):
            forms.append((form, int(count)))
    return forms


def lemmatise(forms: list[str]) -> dict[str, tuple[str, str]]:
    cache: dict[str, tuple[str, str]] = {}
    if LEMMA_CACHE.exists():
        cache = {k: tuple(v) for k, v in json.loads(LEMMA_CACHE.read_text()).items()}
    todo = [f for f in forms if f not in cache]
    for start in range(0, len(todo), BATCH):
        batch = todo[start : start + BATCH]
        url = "https://morpho-api.tezaurs.lv/morphotagger/" + urllib.parse.quote(" ".join(batch))
        text = get(url)
        for line in text.splitlines():
            parts = line.split("\t")
            if len(parts) == 3:
                cache[parts[0]] = (parts[2], parts[1])
        LEMMA_CACHE.write_text(json.dumps(cache, ensure_ascii=False))
        time.sleep(0.3)
    return cache


def main() -> None:
    frequency = fetch_frequency()
    lemmas = lemmatise([form for form, _ in frequency])

    totals: dict[str, int] = defaultdict(int)
    tags: dict[str, str] = {}
    examples: dict[str, list[str]] = defaultdict(list)
    for form, count in frequency:
        lemma, tag = lemmas.get(form, (None, ""))
        if not lemma or tag.startswith(SKIP_TAG_PREFIXES) or not WORD.match(lemma):
            continue
        totals[lemma] += count
        tags.setdefault(lemma, tag)
        if len(examples[lemma]) < 3:
            examples[lemma].append(form)

    with WORDS.open(encoding="utf-8", newline="") as f:
        known = {row["lemma"].lower() for row in csv.DictReader(f)}

    gaps = [(l, c) for l, c in sorted(totals.items(), key=lambda x: -x[1]) if l not in known]
    with OUTPUT.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(["lemma", "tag", "frequency", "forms"])
        for lemma, count in gaps[:TOP_GAPS]:
            writer.writerow([lemma, tags[lemma], count, " ".join(examples[lemma])])

    covered = sum(1 for l in totals if l in known)
    print(f"{len(totals)} lemmas from the top {TOP_FORMS} forms, {covered} already in the list, {len(gaps)} missing")
    print(f"wrote the top {min(TOP_GAPS, len(gaps))} gaps to {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
