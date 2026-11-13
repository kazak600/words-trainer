"""Fill grammar for words that Wiktionary could not describe, using the Tēzaurs
morphology service (inflect_general_lvs).

Reads and rewrites data/csv/words_lv_enriched.csv. Safe to run again: rows that
already have grammar are skipped, and API answers are cached in data/.cache.
Run after enrich_wiktionary.py, which recreates the file from scratch.
"""

import csv
import json
import subprocess
import time
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENRICHED = ROOT / "data" / "csv" / "words_lv_enriched.csv"
CACHE_FILE = ROOT / "data" / ".cache" / "tezaurs_inflect.json"
API = "https://morpho-api.tezaurs.lv/inflect_general_lvs/en/"
MORPHOTAGGER = "https://morpho-api.tezaurs.lv/morphotagger/"

API_POS = {"noun": "Noun", "propn": "Noun", "verb": "Verb", "adj": "Adjective"}
GENDER = {"Masculine": "m", "Feminine": "f"}
SLOTS = {("Singular", "1"): 0, ("Singular", "2"): 1, ("Plural", "1"): 3, ("Plural", "2"): 4}
TENSES = {"Present": "present", "Past": "past", "Future": "future"}


def needs_grammar(row: dict) -> bool:
    if row["pos"] not in API_POS or " " in row["lemma"]:
        return False
    if not row["grammar_json"]:
        return True
    return row["pos"] == "verb" and "verb-forms-incomplete" in row["flags"].split(";")


def pick_analysis(analyses: list[list[dict]], pos: str) -> tuple[list[dict], bool]:
    matching = [a for a in analyses if a and a[0].get("Part of speech") == API_POS[pos]]
    return (matching[0], len(matching) > 1) if matching else ([], False)


def parse_noun(forms: list[dict]) -> tuple[dict, dict]:
    grammar: dict = {}
    gender = GENDER.get(forms[0].get("Gender", ""))
    if gender:
        grammar["gender"] = gender
    declension = forms[0].get("Declension", "")
    if declension.isdigit():
        grammar["declension"] = int(declension)
    by_number: dict[str, dict[str, str]] = {"singular": {}, "plural": {}}
    for form in forms:
        number = form.get("Number", "").lower()
        case = form.get("Case", "").lower()
        if number in by_number and case:
            by_number[number].setdefault(case, form["Wordform"])
    return grammar, {n: c for n, c in by_number.items() if c}


def parse_verb(forms: list[dict], lemma: str) -> tuple[dict, dict, bool]:
    conjugation = forms[0].get("Conjugation", "")
    grammar: dict = {}
    if conjugation.isdigit():
        grammar["conjugation"] = int(conjugation)
    grammar["reflexive"] = lemma.endswith("ties")

    slots: dict[str, list[list[str]]] = {t: [[] for _ in range(5)] for t in TENSES.values()}
    for form in forms:
        if (form.get("Mood") != "Indicative" or form.get("Voice") != "Active"
                or form.get("Negation") != "No" or form.get("Tense") not in TENSES):
            continue
        person = form.get("Person")
        index = 2 if person == "3" else SLOTS.get((form.get("Number"), person))
        if index is None:
            continue
        values = slots[TENSES[form["Tense"]]][index]
        if form["Wordform"] not in values:
            values.append(form["Wordform"])
    result = {"infinitive": lemma}
    for tense, cells in slots.items():
        result[tense] = [" / ".join(values) for values in cells]
    complete = all(v for tense in slots for v in result[tense])
    return grammar, result, complete


def parse_adjective(forms: list[dict]) -> dict:
    grammar: dict = {}
    for form in forms:
        if form.get("Number") != "Singular" or form.get("Case") != "Nominative":
            continue
        gender, definiteness, degree = form.get("Gender"), form.get("Definiteness"), form.get("Degree")
        word = form["Wordform"]
        if definiteness == "Indefinite" and degree == "Positive":
            grammar.setdefault("masculine" if gender == "Masculine" else "feminine", word)
        if gender == "Masculine" and definiteness == "Definite" and degree == "Positive":
            grammar.setdefault("definite", word)
        if gender == "Masculine" and degree == "Comparative" and definiteness == "Indefinite":
            grammar.setdefault("comparative", word)
        if gender == "Masculine" and degree == "Superlative":
            grammar.setdefault("superlative", word)
    return grammar


def _curl(url: str) -> str:
    # curl uses the system certificate store; python.org builds on macOS have none
    result = subprocess.run(
        ["curl", "-sS", "--fail", "-m", "30", url],
        capture_output=True, text=True, encoding="utf-8", check=True,
    )
    time.sleep(0.2)
    return result.stdout


def _cached(key: str, cache: dict, load):
    if key not in cache:
        cache[key] = load()
        CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    return cache[key]


def fetch_forms(word: str, guess: bool, cache: dict) -> list[list[dict]]:
    url = f"{API}{urllib.parse.quote(word)}?guess={'true' if guess else 'false'}"
    return _cached(f"{word}|{guess}", cache, lambda: json.loads(_curl(url)))


def fetch_base(word: str, cache: dict) -> str:
    """Base form of an inflected word, from the Tēzaurs morphotagger."""
    def load() -> str:
        text = _curl(MORPHOTAGGER + urllib.parse.quote(word))
        parts = text.strip().split("\t")
        return parts[2] if len(parts) == 3 else ""
    return _cached(f"base|{word}", cache, load)


def _dump(value: dict | None) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")) if value else ""


def _parse(pos: str, forms: list[dict], lemma: str) -> tuple[dict, dict | None, bool]:
    if pos in ("noun", "propn"):
        grammar, table = parse_noun(forms)
        return grammar, table or None, True
    if pos == "verb":
        return parse_verb(forms, lemma)
    return parse_adjective(forms), None, True


def fill_row(row: dict, get_forms, get_base) -> str:
    """Fill grammar of one row. Returns filled, form-of, guessed, kept or missing.

    get_forms(word, guess) and get_base(word) are the (cached) service calls.
    """
    pos, lemma = row["pos"], row["lemma"]
    attempts = [(lemma, False, "filled")]
    base = get_base(lemma)
    if base and base != lemma:
        attempts.append((base, False, "form-of"))
    attempts.append((lemma, True, "guessed"))

    for word, guess, outcome in attempts:
        forms, ambiguous = pick_analysis(get_forms(word, guess), pos)
        if not forms:
            continue
        grammar, table, complete = _parse(pos, forms, word)
        if not grammar and not table:
            continue
        if pos in ("noun", "propn") and "gender" not in grammar:
            continue
        existing = json.loads(row["grammar_json"]) if row["grammar_json"] else {}
        if pos == "verb" and existing and not complete:
            return "kept"

        flags = [f for f in row["flags"].split(";") if f]
        if pos == "verb":
            flags = [f for f in flags if f != "verb-forms-incomplete"]
            if not complete:
                flags.append("verb-forms-incomplete")
        if outcome == "form-of":
            flags.append(f"form-of:{word}")
        if outcome == "guessed":
            flags.append("grammar-guessed")
        if ambiguous:
            flags.append("grammar-ambiguous")

        row["grammar_json"] = _dump({**grammar, **existing})
        row["forms_json"] = _dump(table)
        row["grammar_source"] = "wiktionary+tezaurs" if existing else "tezaurs"
        row["flags"] = ";".join(flags)
        return outcome
    return "missing"


def main() -> None:
    with ENRICHED.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        columns = reader.fieldnames
        rows = list(reader)

    cache = json.loads(CACHE_FILE.read_text(encoding="utf-8")) if CACHE_FILE.exists() else {}
    outcomes: dict[str, list[str]] = {k: [] for k in ("filled", "form-of", "guessed", "kept", "missing")}
    for row in rows:
        if needs_grammar(row):
            outcome = fill_row(
                row,
                lambda word, guess: fetch_forms(word, guess, cache),
                lambda word: fetch_base(word, cache),
            )
            outcomes[outcome].append(f"{row['lemma']} ({row['pos']})")

    with ENRICHED.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    print({k: len(v) for k, v in outcomes.items()})
    print("form-of (grammar taken from the base word):", ", ".join(outcomes["form-of"]) or "none")
    print("guessed (not in the Tēzaurs lexicon):", ", ".join(outcomes["guessed"]) or "none")
    print("missing:", ", ".join(outcomes["missing"]) or "none")
    verbs = [r for r in rows if r["pos"] == "verb"]
    complete = sum(1 for r in verbs if r["forms_json"] and "verb-forms-incomplete" not in r["flags"])
    print(f"verbs with all 15 forms: {complete}/{len(verbs)}")
    for pos in ("noun", "propn", "adj"):
        group = [r for r in rows if r["pos"] == pos]
        print(f"{pos} with grammar: {sum(1 for r in group if r['grammar_json'])}/{len(group)}")


if __name__ == "__main__":
    main()
