import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fill_grammar_tezaurs import (  # noqa: E402
    fill_row,
    needs_grammar,
    parse_adjective,
    parse_noun,
    parse_verb,
    pick_analysis,
)


def noun_form(number, case, word):
    return {
        "Part of speech": "Noun", "Gender": "Masculine", "Declension": "1",
        "Number": number, "Case": case, "Wordform": word,
    }


NOUN_FORMS = [
    noun_form("Singular", "Nominative", "dīvāns"),
    noun_form("Singular", "Genitive", "dīvāna"),
    noun_form("Plural", "Nominative", "dīvāni"),
    noun_form("Plural", "Genitive", "dīvānu"),
]


def verb_form(tense, number, person, word, mood="Indicative", negation="No"):
    return {
        "Part of speech": "Verb", "Conjugation": "1", "Mood": mood, "Tense": tense,
        "Number": number, "Person": person, "Voice": "Active", "Negation": negation,
        "Wordform": word,
    }


def full_verb_forms():
    forms = []
    for tense in ("Present", "Past", "Future"):
        slots = [("Singular", "1"), ("Singular", "2"), ("Not applicable", "3"),
                 ("Plural", "1"), ("Plural", "2")]
        for number, person in slots:
            forms.append(verb_form(tense, number, person, f"{tense[:2].lower()}{person}{number[0]}"))
    forms.append(verb_form("Present", "Singular", "1", "nemazgājos", negation="Yes"))
    forms.append(verb_form("Present", "Singular", "1", "mazgātos", mood="Conditional"))
    return forms


class NounTest(unittest.TestCase):
    def test_gender_declension_and_cases(self):
        grammar, forms = parse_noun(NOUN_FORMS)

        self.assertEqual(grammar, {"gender": "m", "declension": 1})
        self.assertEqual(
            forms,
            {
                "singular": {"nominative": "dīvāns", "genitive": "dīvāna"},
                "plural": {"nominative": "dīvāni", "genitive": "dīvānu"},
            },
        )


class VerbTest(unittest.TestCase):
    def test_slots_follow_es_tu_viņš_mēs_jūs(self):
        grammar, forms, complete = parse_verb(full_verb_forms(), "celties")

        self.assertEqual(grammar, {"conjugation": 1, "reflexive": True})
        self.assertEqual(forms["present"], ["pr1S", "pr2S", "pr3N", "pr1P", "pr2P"])
        self.assertEqual(forms["future"][2], "fu3N")
        self.assertEqual(forms["infinitive"], "celties")
        self.assertTrue(complete)

    def test_negated_and_non_indicative_forms_are_ignored(self):
        _, forms, _ = parse_verb(full_verb_forms(), "celties")

        self.assertNotIn("nemazgājos", forms["present"])
        self.assertNotIn("mazgātos", forms["present"])

    def test_missing_slot_makes_the_verb_incomplete(self):
        partial = [f for f in full_verb_forms() if f["Tense"] != "Future"]

        _, forms, complete = parse_verb(partial, "dzīvot")

        self.assertFalse(complete)
        self.assertEqual(forms["future"], ["", "", "", "", ""])

    def test_plain_verb_is_not_reflexive(self):
        grammar, _, _ = parse_verb(full_verb_forms(), "dzīvot")

        self.assertFalse(grammar["reflexive"])


class AdjectiveTest(unittest.TestCase):
    def test_base_forms(self):
        def adj(word, gender="Masculine", definiteness="Indefinite", degree="Positive"):
            return {
                "Part of speech": "Adjective", "Number": "Singular", "Case": "Nominative",
                "Gender": gender, "Definiteness": definiteness, "Degree": degree, "Wordform": word,
            }

        forms = [
            adj("mājīgs"), adj("mājīga", gender="Feminine"),
            adj("mājīgais", definiteness="Definite"),
            adj("mājīgāks", degree="Comparative"),
            adj("vismājīgākais", degree="Superlative", definiteness="Definite"),
        ]

        self.assertEqual(
            parse_adjective(forms),
            {"masculine": "mājīgs", "feminine": "mājīga", "definite": "mājīgais",
             "comparative": "mājīgāks", "superlative": "vismājīgākais"},
        )


class PickAnalysisTest(unittest.TestCase):
    def test_takes_the_first_analysis_with_the_right_part_of_speech(self):
        verb = [verb_form("Present", "Singular", "1", "x")]

        forms, ambiguous = pick_analysis([verb, NOUN_FORMS], "noun")

        self.assertEqual(forms, NOUN_FORMS)
        self.assertFalse(ambiguous)

    def test_reports_several_matching_analyses(self):
        _, ambiguous = pick_analysis([NOUN_FORMS, NOUN_FORMS], "noun")

        self.assertTrue(ambiguous)

    def test_no_matching_analysis(self):
        self.assertEqual(pick_analysis([[]], "noun"), ([], False))


class NeedsGrammarTest(unittest.TestCase):
    def row(self, **kw):
        base = {"lemma": "dīvāns", "pos": "noun", "grammar_json": "", "flags": ""}
        return {**base, **kw}

    def test_empty_noun_grammar_needs_filling(self):
        self.assertTrue(needs_grammar(self.row()))

    def test_filled_noun_does_not(self):
        self.assertFalse(needs_grammar(self.row(grammar_json='{"gender":"m"}')))

    def test_incomplete_verb_needs_filling_even_with_grammar(self):
        row = self.row(pos="verb", grammar_json='{"conjugation":1}', flags="verb-forms-incomplete")

        self.assertTrue(needs_grammar(row))

    def test_phrases_and_other_parts_of_speech_are_skipped(self):
        self.assertFalse(needs_grammar(self.row(lemma="darba diena", pos="phrase")))
        self.assertFalse(needs_grammar(self.row(pos="adv")))
        self.assertFalse(needs_grammar(self.row(lemma="darba diena")))


class FillRowTest(unittest.TestCase):
    def row(self, lemma="dīvāns", pos="noun", **kw):
        base = {"lemma": lemma, "pos": pos, "grammar_json": "", "forms_json": "",
                "grammar_source": "", "flags": ""}
        return {**base, **kw}

    def test_lexicon_word_is_filled(self):
        row = self.row()

        outcome = fill_row(row, lambda w, g: [NOUN_FORMS] if not g else [], lambda w: "dīvāns")

        self.assertEqual(outcome, "filled")
        self.assertEqual(row["grammar_source"], "tezaurs")
        self.assertIn('"gender":"m"', row["grammar_json"])

    def test_inflected_lemma_uses_its_base_word(self):
        row = self.row(lemma="dīvāni")
        calls = []

        def get_forms(word, guess):
            calls.append((word, guess))
            return [NOUN_FORMS] if word == "dīvāns" and not guess else [[]]

        outcome = fill_row(row, get_forms, lambda w: "dīvāns")

        self.assertEqual(outcome, "form-of")
        self.assertIn("form-of:dīvāns", row["flags"])

    def test_guess_is_the_last_resort_and_is_flagged(self):
        row = self.row(lemma="jaunvārds")

        outcome = fill_row(row, lambda w, g: [NOUN_FORMS] if g else [[]], lambda w: "")

        self.assertEqual(outcome, "guessed")
        self.assertIn("grammar-guessed", row["flags"])

    def test_empty_analysis_is_not_accepted(self):
        useless = [{"Part of speech": "Noun", "Number": "Not applicable", "Gender": "Not applicable",
                    "Declension": "Not applicable", "Case": "Not applicable", "Wordform": "trauki"}]
        row = self.row(lemma="trauki")

        outcome = fill_row(row, lambda w, g: [useless], lambda w: "")

        self.assertEqual(outcome, "missing")
        self.assertEqual(row["grammar_json"], "")
        self.assertEqual(row["grammar_source"], "")

    def test_noun_without_gender_is_not_accepted(self):
        no_gender = [{**f, "Gender": "Not applicable"} for f in NOUN_FORMS]
        row = self.row(lemma="tikšanās")

        outcome = fill_row(row, lambda w, g: [no_gender], lambda w: "")

        self.assertEqual(outcome, "missing")
        self.assertEqual(row["forms_json"], "")

    def test_incomplete_verb_keeps_wiktionary_data_when_service_is_incomplete(self):
        partial = [f for f in full_verb_forms() if f["Tense"] != "Future"]
        row = self.row(lemma="dzīvot", pos="verb", grammar_json='{"conjugation":2}',
                       flags="verb-forms-incomplete")

        outcome = fill_row(row, lambda w, g: [partial], lambda w: "dzīvot")

        self.assertEqual(outcome, "kept")
        self.assertEqual(row["grammar_json"], '{"conjugation":2}')


if __name__ == "__main__":
    unittest.main()
