import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from build_translations import Entry, check_entry, coverage, find_duplicates, parse_line  # noqa: E402

GOOD = "māja | noun | будинок | Mana ___ ir liela. | māja | Мій будинок великий."


def entry(**kw):
    fields = dict(lemma="māja", pos="noun", ukrainian="будинок", sentence="Mana ___ ir liela.",
                  answer="māja", hint="Мій будинок великий.", source="home")
    return Entry(**{**fields, **kw})


class ParseTest(unittest.TestCase):
    def test_parses_six_fields(self):
        parsed = parse_line(GOOD, "home")

        self.assertEqual((parsed.lemma, parsed.answer, parsed.source), ("māja", "māja", "home"))

    def test_rejects_wrong_field_count(self):
        with self.assertRaises(ValueError):
            parse_line("māja | noun | будинок", "home")


class CheckEntryTest(unittest.TestCase):
    def test_good_entry_has_no_errors(self):
        self.assertEqual(check_entry(entry()), [])

    def test_sentence_needs_exactly_one_gap(self):
        self.assertTrue(check_entry(entry(sentence="Mana māja ir liela.")))
        self.assertTrue(check_entry(entry(sentence="Mana ___ ir ___.")))

    def test_translation_must_be_ukrainian_not_russian(self):
        self.assertTrue(check_entry(entry(ukrainian="house")))
        self.assertTrue(check_entry(entry(ukrainian="дом, объект")))
        self.assertTrue(check_entry(entry(hint="Мой дом большой, это ёмко.")))

    def test_latvian_sentence_must_not_contain_cyrillic(self):
        self.assertTrue(check_entry(entry(sentence="Мана ___ ir liela.")))

    def test_answer_is_required(self):
        self.assertTrue(check_entry(entry(answer="")))


class DuplicateTest(unittest.TestCase):
    def test_same_word_twice(self):
        errors = find_duplicates([entry(), entry(sentence="Tā ___ ir jauna.", source="city")])

        self.assertEqual(len(errors), 1)
        self.assertIn("duplicate word", errors[0])

    def test_same_filled_sentence_for_two_words(self):
        errors = find_duplicates([entry(), entry(lemma="nams", sentence="Mana ___ ir liela.")])

        self.assertTrue(any("duplicate sentence" in e for e in errors))


class CoverageTest(unittest.TestCase):
    def test_missing_and_unknown(self):
        words = [{"lemma": "māja", "pos": "noun"}, {"lemma": "logs", "pos": "noun"}]

        missing, unknown = coverage([entry(), entry(lemma="durvis")], words)

        self.assertEqual([w["lemma"] for w in missing], ["logs"])
        self.assertEqual([e.lemma for e in unknown], ["durvis"])


if __name__ == "__main__":
    unittest.main()
