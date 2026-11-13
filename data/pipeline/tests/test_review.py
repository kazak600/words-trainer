import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from review import REVIEW_COLUMNS, apply_review, export_rows  # noqa: E402

WORDS = [
    {"lemma": "māja", "pos": "noun", "topic_slug": "home", "level": "A2", "english": "house"},
    {"lemma": "ēst", "pos": "verb", "topic_slug": "food-and-drink", "level": "A1", "english": "to eat"},
]


def stores():
    translations = {
        ("māja", "noun"): {"ukrainian": "будинок", "review_status": "pending"},
        ("ēst", "verb"): {"ukrainian": "їсти", "review_status": "pending"},
    }
    sentences = {
        ("māja", "noun"): {"text_with_gap": "Mana ___ ir liela.", "answer": "māja",
                           "hint_uk": "Мій будинок великий.", "review_status": "pending"},
        ("ēst", "verb"): {"text_with_gap": "Es gribu ___.", "answer": "ēst",
                          "hint_uk": "Я хочу їсти.", "review_status": "pending"},
    }
    return translations, sentences


def review_row(**kw):
    row = {"lemma": "māja", "pos": "noun", "level": "A2", "english": "house", "ukrainian": "будинок",
           "sentence": "Mana ___ ir liela.", "answer": "māja", "sentence_uk": "Мій будинок великий.",
           "status": "approved"}
    return {**row, **kw}


class ExportTest(unittest.TestCase):
    def test_exports_one_row_per_word_in_review_columns(self):
        t, s = stores()

        rows = export_rows(WORDS, t, s)

        self.assertEqual(len(rows), 2)
        self.assertEqual(list(rows[0]), REVIEW_COLUMNS)
        self.assertEqual(rows[0]["ukrainian"], "будинок")
        self.assertEqual(rows[0]["sentence"], "Mana ___ ir liela.")
        self.assertEqual(rows[0]["status"], "pending")

    def test_filters_by_topic_and_level(self):
        t, s = stores()

        self.assertEqual([r["lemma"] for r in export_rows(WORDS, t, s, topic="home")], ["māja"])
        self.assertEqual([r["lemma"] for r in export_rows(WORDS, t, s, level="A1")], ["ēst"])


class ApplyReviewTest(unittest.TestCase):
    def test_unchanged_row_gets_status_approved_on_both_stores(self):
        t, s = stores()

        errors = apply_review([review_row()], t, s)

        self.assertEqual(errors, [])
        self.assertEqual(t[("māja", "noun")]["review_status"], "approved")
        self.assertEqual(s[("māja", "noun")]["review_status"], "approved")

    def test_any_changed_cell_means_edited_and_is_stored(self):
        t, s = stores()

        apply_review([review_row(ukrainian="дім")], t, s)

        self.assertEqual(t[("māja", "noun")]["ukrainian"], "дім")
        self.assertEqual(t[("māja", "noun")]["review_status"], "edited")
        self.assertEqual(s[("māja", "noun")]["review_status"], "edited")

    def test_changed_sentence_cell_means_edited(self):
        t, s = stores()

        apply_review([review_row(answer="mājā", sentence="Es esmu ___.")], t, s)

        self.assertEqual(s[("māja", "noun")]["answer"], "mājā")
        self.assertEqual(t[("māja", "noun")]["review_status"], "edited")

    def test_stored_rows_keep_lemma_and_pos_for_writing_back(self):
        t, s = stores()
        t = {k: {"lemma": k[0], "pos": k[1], **v} for k, v in t.items()}
        s = {k: {"lemma": k[0], "pos": k[1], **v} for k, v in s.items()}

        apply_review([review_row(ukrainian="дім")], t, s)

        self.assertEqual((t[("māja", "noun")]["lemma"], t[("māja", "noun")]["pos"]), ("māja", "noun"))
        self.assertEqual((s[("māja", "noun")]["lemma"], s[("māja", "noun")]["pos"]), ("māja", "noun"))

    def test_pending_unchanged_stays_pending(self):
        t, s = stores()

        apply_review([review_row(status="pending")], t, s)

        self.assertEqual(t[("māja", "noun")]["review_status"], "pending")

    def test_unknown_status_is_rejected_and_nothing_changes(self):
        t, s = stores()

        errors = apply_review([review_row(status="ok"), review_row(lemma="ēst", pos="verb", ukrainian="їсти",
                               sentence="Es gribu ___.", answer="ēst", sentence_uk="Я хочу їсти.")], t, s)

        self.assertEqual(len(errors), 1)
        self.assertIn("ok", errors[0])
        self.assertEqual(t[("ēst", "verb")]["review_status"], "pending")

    def test_unknown_word_is_an_error(self):
        t, s = stores()

        errors = apply_review([review_row(lemma="nav")], t, s)

        self.assertEqual(len(errors), 1)

    def test_invalid_edit_is_an_error_and_not_stored(self):
        t, s = stores()

        errors = apply_review([review_row(sentence="Mana māja ir liela.")], t, s)

        self.assertEqual(len(errors), 1)
        self.assertEqual(s[("māja", "noun")]["text_with_gap"], "Mana ___ ir liela.")
        self.assertEqual(t[("māja", "noun")]["review_status"], "pending")


if __name__ == "__main__":
    unittest.main()
