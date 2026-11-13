import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from enrich_wiktionary import (  # noqa: E402
    adjective_grammar,
    enrich,
    is_form_of,
    noun_forms,
    noun_grammar,
    pick_entry,
    short_gloss,
    verb_data,
)

NOUN = {
    "word": "maize",
    "pos": "noun",
    "head_templates": [
        {"name": "head", "args": {"g": "f", "3": "5th declension"}},
        {"name": "lv-noun", "args": {"1": "f", "2": "5th"}},
    ],
    "senses": [
        {"glosses": ["bread (foodstuff, baked from wheat)"], "tags": ["feminine"]},
        {"glosses": ["bread dough"]},
        {"glosses": ["(figuratively) livelihood"], "tags": ["figuratively"]},
    ],
    "forms": [
        {"form": "no-table-tags", "tags": ["table-tags"]},
        {"form": "lv-decl-noun", "tags": ["inflection-template"]},
        {"form": "maize", "tags": ["nominative", "singular"]},
        {"form": "maizes", "tags": ["nominative", "plural"]},
        {"form": "maizes", "tags": ["genitive", "singular"]},
        {"form": "maižu", "tags": ["genitive", "plural"]},
    ],
}

VERB = {
    "word": "ēst",
    "pos": "verb",
    "head_templates": [{"name": "head", "expansion": "ēst (transitive, 1st conjugation)"}],
    "senses": [{"glosses": ["to eat (to take food into one's mouth)"], "tags": ["transitive"]}],
    "inflection_templates": [
        {
            "name": "lv-conj-table",
            "args": {
                "type": "1st",
                **dict(zip(map(str, range(1, 16)), [
                    "ēdu", "ēd", "ēd", "ēdam", "ēdat",
                    "ēdu", "ēdi", "ēda", "ēdām", "ēdāt",
                    "ēdīšu", "ēdīsi", "ēdīs", "ēdīsim", "ēdīsiet,\nēdīsit",
                ])),
            },
        }
    ],
}

ADJECTIVE = {
    "word": "labs",
    "pos": "adj",
    "senses": [{"glosses": ["good (of people)"]}],
    "forms": [
        {"form": "labais", "tags": ["definite"]},
        {"form": "labāks", "tags": ["comparative"]},
        {"form": "vislabākais", "tags": ["superlative"]},
        {"form": "labi", "tags": ["adverb"]},
        {"form": "labs", "tags": ["indefinite", "masculine", "nominative", "singular"]},
        {"form": "laba", "tags": ["feminine", "indefinite", "nominative", "singular"]},
    ],
}


class GlossTest(unittest.TestCase):
    def test_short_gloss_drops_the_explanation(self):
        self.assertEqual(short_gloss("to eat, to have (to consume a meal)"), "to eat, to have")

    def test_short_gloss_keeps_text_without_parentheses(self):
        self.assertEqual(short_gloss("I; first person pronoun"), "I; first person pronoun")

    def test_short_gloss_keeps_a_gloss_that_starts_with_a_parenthesis(self):
        self.assertEqual(short_gloss("(poetic) cereals"), "(poetic) cereals")


class EntryFilterTest(unittest.TestCase):
    def test_form_of_entries_are_detected(self):
        entry = {"word": "maizes", "pos": "noun", "senses": [{"glosses": ["x"], "form_of": [{"word": "maize"}]}]}

        self.assertTrue(is_form_of(entry))
        self.assertFalse(is_form_of(NOUN))

    def test_pick_entry_skips_rare_senses_for_the_default_gloss(self):
        entry = {
            "word": "x",
            "pos": "noun",
            "senses": [
                {"glosses": ["old meaning"], "tags": ["obsolete"]},
                {"glosses": ["current meaning"]},
            ],
        }

        english, _, others, count = pick_entry([entry])

        self.assertEqual(english, "current meaning")
        self.assertEqual(others, ["old meaning"])
        self.assertEqual(count, 2)


class GrammarTest(unittest.TestCase):
    def test_noun_gender_and_declension(self):
        self.assertEqual(noun_grammar(NOUN), {"gender": "f", "declension": 5})

    def test_noun_forms_by_number_and_case(self):
        self.assertEqual(
            noun_forms(NOUN),
            {
                "singular": {"nominative": "maize", "genitive": "maizes"},
                "plural": {"nominative": "maizes", "genitive": "maižu"},
            },
        )

    def test_verb_forms_and_completeness(self):
        grammar, forms, complete = verb_data(VERB)

        self.assertEqual(grammar, {"conjugation": 1, "reflexive": False, "transitivity": "transitive"})
        self.assertEqual(forms["present"], ["ēdu", "ēd", "ēd", "ēdam", "ēdat"])
        self.assertEqual(forms["future"][4], "ēdīsiet / ēdīsit")
        self.assertTrue(complete)

    def test_verb_with_a_missing_form_is_incomplete(self):
        broken = {**VERB, "inflection_templates": [{"name": "lv-conj-table", "args": {"type": "1st", "1": "ēdu"}}]}

        _, _, complete = verb_data(broken)

        self.assertFalse(complete)

    def test_adjective_forms(self):
        self.assertEqual(
            adjective_grammar(ADJECTIVE),
            {
                "masculine": "labs",
                "feminine": "laba",
                "definite": "labais",
                "comparative": "labāks",
                "superlative": "vislabākais",
                "adverb": "labi",
            },
        )


class EnrichTest(unittest.TestCase):
    def test_matched_noun(self):
        row = enrich("maize", "noun", {("maize", "noun"): [NOUN]}, {"maize": [NOUN]})

        self.assertEqual(row["status"], "matched")
        self.assertEqual(row["english"], "bread")
        self.assertIn("multi-sense", row["flags"])

    def test_other_part_of_speech_is_marked(self):
        row = enrich("ēst", "noun", {("ēst", "verb"): [VERB]}, {"ēst": [VERB]})

        self.assertEqual(row["status"], "other_pos")
        self.assertIn("pos-mismatch:verb", row["flags"])
        self.assertEqual(row["grammar_json"], "")

    def test_inflected_lemma_borrows_the_meaning_of_its_base_word(self):
        plural = {
            "word": "mati",
            "pos": "noun",
            "senses": [{"glosses": ["nominative plural of mats"], "form_of": [{"word": "mats"}]}],
        }
        base = {**NOUN, "word": "mats", "senses": [{"glosses": ["hair"]}]}
        exact = {("mati", "noun"): [plural], ("mats", "noun"): [base]}

        row = enrich("mati", "noun", exact, {"mati": [plural]})

        self.assertEqual(row["status"], "form_of")
        self.assertEqual(row["english"], "hair")
        self.assertIn("form-of:mats", row["flags"])

    def test_form_of_a_different_part_of_speech_stays_unmatched(self):
        participle = {
            "word": "nākamais",
            "pos": "verb",
            "senses": [{"glosses": ["participle of nākt"], "form_of": [{"word": "nākt"}]}],
        }
        base = {**VERB, "word": "nākt"}
        exact = {("nākamais", "verb"): [participle], ("nākt", "verb"): [base]}

        row = enrich("nākamais", "adj", exact, {"nākamais": [participle]})

        self.assertEqual(row["status"], "unmatched")

    def test_unmatched_word_has_empty_english(self):
        row = enrich("nezināms", "noun", {}, {})

        self.assertEqual(row["status"], "unmatched")
        self.assertEqual(row["english"], "")


if __name__ == "__main__":
    unittest.main()
