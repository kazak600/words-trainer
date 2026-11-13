"""Enrich data/csv/words_lv.csv with English meaning and grammar from the kaikki.org
Latvian Wiktionary dump (data/.cache/kaikki/latvian.jsonl).

Writes data/csv/words_lv_enriched.csv and prints a coverage report.
"""

import csv
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DUMP = ROOT / "data" / ".cache" / "kaikki" / "latvian.jsonl"
WORDS = ROOT / "data" / "csv" / "words_lv.csv"
OUTPUT = ROOT / "data" / "csv" / "words_lv_enriched.csv"

POS_MAP = {
    "noun": ["noun"],
    "propn": ["name", "noun"],
    "verb": ["verb"],
    "adj": ["adj"],
    "adv": ["adv"],
    "pron": ["pron"],
    "prep": ["prep"],
    "conj": ["conj"],
    "num": ["num"],
    "part": ["particle"],
    "interj": ["intj"],
    "phrase": ["phrase", "noun", "intj", "adv", "verb"],
}
RARE_TAGS = {"obsolete", "archaic", "rare", "dialectal", "poetic", "vulgar", "slang", "dated"}
CASES = ["nominative", "genitive", "dative", "accusative", "instrumental", "locative", "vocative"]
MULTI_SENSE_FROM = 3

COLUMNS = [
    "lemma", "pos", "topic_slug", "level", "status", "english", "english_note",
    "other_senses", "grammar_json", "forms_json", "grammar_source", "flags",
]


def short_gloss(gloss: str) -> str:
    index = gloss.find(" (")
    if index > 0:
        gloss = gloss[:index]
    return gloss.strip().rstrip(";,").strip()


def is_form_of(entry: dict) -> bool:
    senses = entry.get("senses") or []
    if not senses:
        return True
    return all(
        "form_of" in s or "alt_of" in s or "form-of" in (s.get("tags") or [])
        for s in senses
    )


def _senses(entry: dict) -> list[dict]:
    return [s for s in entry.get("senses", []) if s.get("glosses")]


def first_entry(entries: list[dict]) -> dict | None:
    return next((e for e in entries if not is_form_of(e)), None)


def pick_entry(entries: list[dict]) -> tuple[str, str, list[str], int]:
    entry = first_entry(entries)
    if entry is None:
        return "", "", [], 0
    senses = _senses(entry)
    if not senses:
        return "", "", [], 0
    preferred = next((s for s in senses if not RARE_TAGS & set(s.get("tags") or [])), senses[0])
    others = [short_gloss(s["glosses"][0]) for s in senses if s is not preferred]
    return short_gloss(preferred["glosses"][0]), preferred["glosses"][0], others, len(senses)


def _template(entry: dict, key: str, name: str) -> dict | None:
    return next((t for t in entry.get(key) or [] if t.get("name") == name), None)


def noun_grammar(entry: dict) -> dict:
    grammar: dict = {}
    template = _template(entry, "head_templates", "lv-noun")
    gender = (template or {}).get("args", {}).get("1")
    declension = (template or {}).get("args", {}).get("2")
    if not gender:
        head = _template(entry, "head_templates", "head")
        args = (head or {}).get("args", {})
        gender = args.get("g")
        declension = args.get("3")
    if gender:
        grammar["gender"] = gender
    match = re.match(r"(\d)", declension or "")
    if match:
        grammar["declension"] = int(match.group(1))
    return grammar


def noun_forms(entry: dict) -> dict | None:
    forms: dict[str, dict[str, str]] = {"singular": {}, "plural": {}}
    for item in entry.get("forms") or []:
        tags = set(item.get("tags") or [])
        if tags & {"table-tags", "inflection-template"}:
            continue
        number = "singular" if "singular" in tags else "plural" if "plural" in tags else None
        case = next((c for c in CASES if c in tags), None)
        if number and case:
            forms[number].setdefault(case, item["form"])
    forms = {n: c for n, c in forms.items() if c}
    return forms or None


def _clean_form(value: str | None) -> str:
    parts = [p.strip() for p in re.split(r"[,\n]", value or "") if p.strip()]
    parts = [p for p in parts if p != "-"]
    return " / ".join(parts)


def verb_data(entry: dict) -> tuple[dict, dict | None, bool]:
    head = _template(entry, "head_templates", "head")
    expansion = (head or {}).get("expansion", "")
    table = _template(entry, "inflection_templates", "lv-conj-table")
    grammar: dict = {}

    conjugation = None
    if table:
        match = re.match(r"(\d)", table.get("args", {}).get("type", ""))
        conjugation = int(match.group(1)) if match else None
    if conjugation is None:
        match = re.search(r"(\d)(?:st|nd|rd|th) conjugation", expansion)
        conjugation = int(match.group(1)) if match else None
    if conjugation is not None:
        grammar["conjugation"] = conjugation

    conj = _template(entry, "inflection_templates", "lv-conj")
    grammar["reflexive"] = "reflexive" in expansion or (conj or {}).get("args", {}).get("refl") == "yes"

    sense_tags = set((_senses(entry)[:1] or [{}])[0].get("tags") or [])
    for tag in ("intransitive", "transitive"):
        if tag in sense_tags:
            grammar["transitivity"] = tag
            break

    if not table:
        return grammar, None, False
    args = table.get("args", {})
    values = [_clean_form(args.get(str(i))) for i in range(1, 16)]
    forms = {
        "infinitive": entry["word"],
        "present": values[0:5],
        "past": values[5:10],
        "future": values[10:15],
    }
    return grammar, forms, all(values)


def adjective_grammar(entry: dict) -> dict:
    grammar: dict = {}
    for item in entry.get("forms") or []:
        tags = set(item.get("tags") or [])
        for single in ("definite", "comparative", "superlative", "adverb"):
            if tags == {single}:
                grammar.setdefault(single, item["form"])
        if {"indefinite", "nominative", "singular"} <= tags:
            if "masculine" in tags:
                grammar.setdefault("masculine", item["form"])
            if "feminine" in tags:
                grammar.setdefault("feminine", item["form"])
    return grammar


def _dump(value: dict | None) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")) if value else ""


def enrich(lemma: str, pos: str, exact: dict, by_word: dict) -> dict:
    row = {"status": "unmatched", "english": "", "english_note": "", "other_senses": "",
           "grammar_json": "", "forms_json": "", "grammar_source": "", "flags": ""}
    flags: list[str] = []

    entries: list[dict] = []
    matched_pos = None
    for kaikki_pos in POS_MAP[pos]:
        found = exact.get((lemma, kaikki_pos), [])
        if first_entry(found):
            entries, matched_pos = found, kaikki_pos
            break
    status = "matched"
    if not entries:
        for entry in by_word.get(lemma, []):
            if not is_form_of(entry):
                entries, matched_pos, status = [entry], entry["pos"], "other_pos"
                flags.append(f"pos-mismatch:{matched_pos}")
                break
    if not entries:
        for entry in by_word.get(lemma, []):
            if entry["pos"] not in POS_MAP[pos]:
                continue
            target = ((entry["senses"][0].get("form_of") or [{}])[0]).get("word")
            if target and first_entry(exact.get((target, entry["pos"]), [])):
                entries, matched_pos, status = exact[(target, entry["pos"])], entry["pos"], "form_of"
                flags.append(f"form-of:{target}")
                break
    if not entries:
        return row

    english, note, others, count = pick_entry(entries)
    entry = first_entry(entries)
    grammar: dict = {}
    forms = None
    if status == "other_pos":
        pass
    elif matched_pos in ("noun", "name"):
        grammar, forms = noun_grammar(entry), noun_forms(entry)
    elif matched_pos == "verb":
        grammar, forms, complete = verb_data(entry)
        if not complete:
            flags.append("verb-forms-incomplete")
    elif matched_pos == "adj":
        grammar = adjective_grammar(entry)

    if count >= MULTI_SENSE_FROM:
        flags.append("multi-sense")
    if len([e for e in entries if not is_form_of(e)]) > 1:
        flags.append("homographs")
    if not english:
        flags.append("no-gloss")

    row.update(
        status=status,
        english=english,
        english_note=note,
        other_senses=" | ".join(others[:3]),
        grammar_json=_dump(grammar),
        forms_json=_dump(forms),
        grammar_source="wiktionary" if grammar or forms else "",
        flags=";".join(flags),
    )
    return row


def _scan(wanted: set[str]):
    with DUMP.open(encoding="utf-8") as f:
        for line in f:
            entry = json.loads(line)
            if entry.get("word") in wanted and entry.get("lang_code") == "lv":
                yield entry


def load_index(lemmas: set[str]) -> tuple[dict, dict]:
    exact: dict[tuple[str, str], list[dict]] = {}
    by_word: dict[str, list[dict]] = {}
    targets: set[str] = set()
    for entry in _scan(lemmas):
        exact.setdefault((entry["word"], entry["pos"]), []).append(entry)
        by_word.setdefault(entry["word"], []).append(entry)
        for sense in entry.get("senses", []):
            for source in sense.get("form_of") or []:
                targets.add(source.get("word"))
    for entry in _scan(targets - lemmas):
        exact.setdefault((entry["word"], entry["pos"]), []).append(entry)
    return exact, by_word


def main() -> None:
    with WORDS.open(encoding="utf-8", newline="") as f:
        words = list(csv.DictReader(f))
    exact, by_word = load_index({w["lemma"] for w in words})

    rows = [{**w, **enrich(w["lemma"], w["pos"], exact, by_word)} for w in words]
    with OUTPUT.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    print(f"{len(rows)} words")
    print("status:", dict(Counter(r["status"] for r in rows)))
    for pos in sorted({r["pos"] for r in rows}):
        group = [r for r in rows if r["pos"] == pos]
        matched = sum(1 for r in group if r["status"] != "unmatched")
        print(f"  {pos}: {matched}/{len(group)} matched")
    flags = Counter(f.split(":")[0] for r in rows for f in r["flags"].split(";") if f)
    print("flags:", dict(flags))
    nouns = [r for r in rows if r["pos"] == "noun" and r["status"] != "unmatched"]
    print(f"nouns with gender and declension: {sum(1 for r in nouns if 'declension' in r['grammar_json'])}/{len(nouns)}")
    print(f"nouns with case forms: {sum(1 for r in nouns if r['forms_json'])}/{len(nouns)}")
    verbs = [r for r in rows if r["pos"] == "verb" and r["status"] != "unmatched"]
    incomplete = sum(1 for r in verbs if "verb-forms-incomplete" in r["flags"])
    print(f"verbs with all 15 forms: {len(verbs) - incomplete}/{len(verbs)}")
    print("unmatched:", ", ".join(f"{r['lemma']} ({r['pos']})" for r in rows if r["status"] == "unmatched"))


if __name__ == "__main__":
    main()
