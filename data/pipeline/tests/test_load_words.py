import sqlite3
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from load_words import build_sql  # noqa: E402

MIGRATIONS = Path(__file__).resolve().parents[3] / "worker" / "migrations"

WORDS = [
    {"lemma": "māja", "pos": "noun", "topic_slug": "home", "level": "A2",
     "grammar_json": '{"gender":"f"}', "forms_json": ""},
    {"lemma": "ēst", "pos": "verb", "topic_slug": "food-and-drink", "level": "A1",
     "grammar_json": "", "forms_json": ""},
    {"lemma": "istaba", "pos": "noun", "topic_slug": "home", "level": "A2",
     "grammar_json": "", "forms_json": ""},
]


def stores(status_by_lemma):
    t = {(w["lemma"], w["pos"]): {"ukrainian": f"uk-{w['lemma']}", "review_status": status_by_lemma[w["lemma"]]}
         for w in WORDS}
    s = {(w["lemma"], w["pos"]): {"text_with_gap": f"Tas ir ___ {w['lemma']}.", "answer": w["lemma"],
                                  "hint_uk": "О'Рейлі", "review_status": status_by_lemma[w["lemma"]]}
         for w in WORDS}
    return t, s


def new_db():
    db = sqlite3.connect(":memory:")
    for path in sorted(MIGRATIONS.glob("*.sql")):
        db.executescript(path.read_text(encoding="utf-8"))
    return db


def snapshot(db):
    return {table: db.execute(f"SELECT * FROM {table} ORDER BY 1").fetchall()
            for table in ("words", "translations", "sentences")}


class LoadWordsTest(unittest.TestCase):
    def setUp(self):
        self.statuses = {"māja": "approved", "ēst": "edited", "istaba": "pending"}
        self.sql = build_sql(WORDS, *stores(self.statuses))

    def test_loads_only_approved_and_edited_words(self):
        db = new_db()
        db.executescript(self.sql)

        lemmas = [r[0] for r in db.execute("SELECT lemma FROM words ORDER BY lemma")]
        self.assertEqual(lemmas, ["māja", "ēst"])
        self.assertEqual(db.execute("SELECT count(*) FROM translations").fetchone()[0], 2)
        self.assertEqual(db.execute("SELECT count(*) FROM sentences").fetchone()[0], 2)

    def test_word_links_to_seeded_topic_with_level_and_grammar(self):
        db = new_db()
        db.executescript(self.sql)

        slug, level, grammar = db.execute(
            "SELECT t.slug, w.level, w.grammar_json FROM words w JOIN topics t ON t.id = w.topic_id "
            "WHERE w.lemma = 'māja'").fetchone()
        self.assertEqual((slug, level, grammar), ("home", "A2", '{"gender":"f"}'))

    def test_translation_and_sentence_keep_status_and_quotes(self):
        db = new_db()
        db.executescript(self.sql)

        self.assertEqual(db.execute("SELECT text, review_status FROM translations tr JOIN words w "
                                    "ON w.id = tr.word_id WHERE w.lemma = 'ēst'").fetchone(),
                         ("uk-ēst", "edited"))
        self.assertEqual(db.execute("SELECT hint FROM sentences").fetchone()[0], "О'Рейлі")

    def test_running_twice_changes_nothing(self):
        db = new_db()
        db.executescript(self.sql)
        first = snapshot(db)

        db.executescript(self.sql)

        self.assertEqual(snapshot(db), first)

    def test_rerun_after_edit_updates_in_place(self):
        db = new_db()
        db.executescript(self.sql)
        word_id = db.execute("SELECT id FROM words WHERE lemma = 'māja'").fetchone()[0]

        t, s = stores(self.statuses)
        t[("māja", "noun")] = {"ukrainian": "дім", "review_status": "edited"}
        db.executescript(build_sql(WORDS, t, s))

        self.assertEqual(db.execute("SELECT id FROM words WHERE lemma = 'māja'").fetchone()[0], word_id)
        self.assertEqual(db.execute("SELECT text FROM translations WHERE word_id = ?", (word_id,)).fetchone()[0],
                         "дім")
        self.assertEqual(db.execute("SELECT count(*) FROM sentences WHERE word_id = ?", (word_id,)).fetchone()[0], 1)

    def test_rerun_keeps_hand_added_sentences_and_updates_generated_ones(self):
        db = new_db()
        db.executescript(self.sql)
        word_id = db.execute("SELECT id FROM words WHERE lemma = 'māja'").fetchone()[0]
        db.execute("INSERT INTO sentences (word_id, text_with_gap, answer, hint_target_lang, hint, "
                   "review_status, source) VALUES (?, 'Mana ___', 'māja', 'uk', 'моя', 'approved', 'manual')",
                   (word_id,))

        t, s = stores(self.statuses)
        s[("māja", "noun")] = {"text_with_gap": "Jauna ___", "answer": "māja", "hint_uk": "нове",
                               "review_status": "approved"}
        db.executescript(build_sql(WORDS, t, s))

        rows = db.execute("SELECT source, text_with_gap FROM sentences WHERE word_id = ? ORDER BY id",
                          (word_id,)).fetchall()
        self.assertEqual(rows, [("generated", "Jauna ___"), ("manual", "Mana ___")])

    def test_word_with_only_a_manual_sentence_still_gets_its_generated_one(self):
        db = new_db()
        db.executescript(build_sql(WORDS, *stores({"māja": "pending", "ēst": "pending", "istaba": "pending"})))
        db.execute("INSERT INTO words (lang, lemma, pos, topic_id, level, source) "
                   "VALUES ('lv', 'māja', 'noun', (SELECT id FROM topics WHERE slug = 'home'), 'A2', 'manual')")
        word_id = db.execute("SELECT id FROM words WHERE lemma = 'māja'").fetchone()[0]
        db.execute("INSERT INTO sentences (word_id, text_with_gap, answer, hint_target_lang, hint, "
                   "review_status, source) VALUES (?, 'Mana ___', 'māja', 'uk', 'моя', 'approved', 'manual')",
                   (word_id,))

        db.executescript(self.sql)

        rows = db.execute("SELECT source FROM sentences WHERE word_id = ? ORDER BY source", (word_id,)).fetchall()
        self.assertEqual(rows, [("generated",), ("manual",)])


if __name__ == "__main__":
    unittest.main()
