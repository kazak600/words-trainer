import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lang import ROOT, get_lang  # noqa: E402
from load_words import build_sql  # noqa: E402
from seed_topics import build_sql as seed_sql  # noqa: E402


class LangTest(unittest.TestCase):
    def test_latvian_keeps_the_existing_files(self):
        lv = get_lang("lv")
        self.assertEqual(lv.topic_map, ROOT / "data" / "topic_map.csv")
        self.assertEqual(lv.enriched_csv, ROOT / "data" / "csv" / "words_lv_enriched.csv")
        self.assertEqual(lv.translations_csv, ROOT / "data" / "csv" / "translations_uk.csv")
        self.assertEqual(lv.sentences_csv, ROOT / "data" / "csv" / "sentences_lv.csv")
        self.assertEqual(lv.title_column, "title_lv")
        self.assertTrue(lv.enriched_by_pipeline)

    def test_english_lives_under_data_en(self):
        en = get_lang("en")
        base = ROOT / "data" / "en"
        self.assertEqual(en.topic_map, base / "topic_map.csv")
        self.assertEqual(en.wordlists, base / "wordlists")
        self.assertEqual(en.translations_dir, base / "translations")
        self.assertEqual(en.csv_dir, base / "csv")
        self.assertEqual(en.title_column, "title_en")
        self.assertFalse(en.enriched_by_pipeline)
        self.assertEqual(en.deck, ("en-uk", "en", "uk", "English → Ukrainian"))

    def test_unknown_language_is_refused(self):
        with self.assertRaises(SystemExit):
            get_lang("xx")


class BuildSqlLanguageTest(unittest.TestCase):
    word = {"lemma": "bread", "pos": "noun", "topic_slug": "food-and-drink", "level": "A1",
            "grammar_json": "", "forms_json": ""}
    translation = {("bread", "noun"): {"ukrainian": "хліб", "review_status": "approved"}}
    sentence = {("bread", "noun"): {"text_with_gap": "I eat ___.", "answer": "bread",
                                    "hint_uk": "Я їм хліб.", "review_status": "approved"}}

    def test_english_rows_use_the_english_language_code(self):
        sql = build_sql([self.word], self.translation, self.sentence, lang="en")
        self.assertIn("INSERT INTO words (lang, lemma, pos, topic_id, level, grammar_json, forms_json) VALUES ('en', 'bread'", sql)
        self.assertIn("lang = 'en' AND slug = 'food-and-drink'", sql)
        self.assertNotIn("'lv'", sql)

    def test_latvian_stays_the_default(self):
        sql = build_sql([self.word], self.translation, self.sentence)
        self.assertIn("VALUES ('lv', 'bread'", sql)


class SeedTopicsTest(unittest.TestCase):
    rows = [
        {"topic_slug": "home", "title_en": "Home", "title_lv": "Māja", "title_uk": "Дім"},
        {"topic_slug": "home", "title_en": "Home", "title_lv": "Māja", "title_uk": "Дім"},
    ]

    def test_english_seed_has_topics_once_and_the_deck_row(self):
        sql, count = seed_sql(get_lang("en"), self.rows)
        self.assertEqual(count, 1)
        self.assertIn("('en', 'home', 'Home', 'Дім')", sql)
        self.assertIn("INSERT INTO decks (slug, source_lang, target_lang, title) VALUES ('en-uk', 'en', 'uk', 'English → Ukrainian');", sql)

    def test_latvian_seed_has_no_deck_row(self):
        sql, _ = seed_sql(get_lang("lv"), self.rows)
        self.assertIn("('lv', 'home', 'Māja', 'Дім')", sql)
        self.assertNotIn("decks", sql)


if __name__ == "__main__":
    unittest.main()
