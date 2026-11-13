"""Generate idempotent SQL for approved and edited words and optionally run it with wrangler.

    python3 -I data/pipeline/load_words.py            # write data/.cache/load_words.sql only
    python3 -I data/pipeline/load_words.py --local    # also run against the local D1
    python3 -I data/pipeline/load_words.py --remote   # also run against the remote D1

Rows are upserted by (lang, lemma, pos); a sentence is updated in place, so a re-run changes nothing.
"""

import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # python -I drops the script dir

from review import ENRICHED, ROOT, load_stores, read_csv

LANG = "lv"
TARGET_LANG = "uk"
LOADABLE = ("approved", "edited")
OUTPUT = ROOT / "data" / ".cache" / "load_words.sql"
DATABASE = "latvian-words"


def quote(value):
    return "'" + value.replace("'", "''") + "'"


def nullable(value):
    return quote(value) if value else "NULL"


def build_sql(words, translations, sentences):
    word_id = "(SELECT id FROM words WHERE lang = {lang} AND lemma = {lemma} AND pos = {pos})"
    statements = []
    for w in words:
        key = (w["lemma"], w["pos"])
        t, s = translations.get(key), sentences.get(key)
        if not t or not s or t["review_status"] not in LOADABLE or s["review_status"] not in LOADABLE:
            continue
        ref = word_id.format(lang=quote(LANG), lemma=quote(w["lemma"]), pos=quote(w["pos"]))
        statements.append(
            "INSERT INTO words (lang, lemma, pos, topic_id, level, grammar_json, forms_json) VALUES "
            f"({quote(LANG)}, {quote(w['lemma'])}, {quote(w['pos'])}, "
            f"(SELECT id FROM topics WHERE lang = {quote(LANG)} AND slug = {quote(w['topic_slug'])}), "
            f"{quote(w['level'])}, {nullable(w['grammar_json'])}, {nullable(w['forms_json'])}) "
            "ON CONFLICT (lang, lemma, pos) DO UPDATE SET topic_id = excluded.topic_id, "
            "level = excluded.level, grammar_json = excluded.grammar_json, forms_json = excluded.forms_json;"
        )
        statements.append(
            "INSERT INTO translations (word_id, target_lang, text, review_status) VALUES "
            f"({ref}, {quote(TARGET_LANG)}, {quote(t['ukrainian'])}, {quote(t['review_status'])}) "
            "ON CONFLICT (word_id, target_lang) DO UPDATE SET text = excluded.text, "
            "review_status = excluded.review_status;"
        )
        values = (f"{quote(s['text_with_gap'])}, {quote(s['answer'])}, {quote(TARGET_LANG)}, "
                  f"{quote(s['hint_uk'])}, {quote(s['review_status'])}")
        statements.append(
            "INSERT INTO sentences (word_id, text_with_gap, answer, hint_target_lang, hint, review_status) "
            f"SELECT {ref}, {values} WHERE NOT EXISTS (SELECT 1 FROM sentences WHERE word_id = {ref});"
        )
        statements.append(
            f"UPDATE sentences SET text_with_gap = {quote(s['text_with_gap'])}, answer = {quote(s['answer'])}, "
            f"hint_target_lang = {quote(TARGET_LANG)}, hint = {quote(s['hint_uk'])}, "
            f"review_status = {quote(s['review_status'])} WHERE word_id = {ref};"
        )
    return "\n".join(statements) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    target = parser.add_mutually_exclusive_group()
    target.add_argument("--local", action="store_true")
    target.add_argument("--remote", action="store_true")
    args = parser.parse_args()

    translations, sentences = load_stores()
    sql = build_sql(read_csv(ENRICHED), translations, sentences)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(sql, encoding="utf-8")
    loaded = sql.count("INSERT INTO words")
    print(f"wrote {loaded} words to {OUTPUT.relative_to(ROOT)}")
    if not loaded:
        return
    if args.local or args.remote:
        flag = "--local" if args.local else "--remote"
        subprocess.run(
            ["npx", "wrangler", "d1", "execute", DATABASE, flag, f"--file={OUTPUT}"],
            cwd=ROOT / "worker", check=True,
        )


if __name__ == "__main__":
    main()
