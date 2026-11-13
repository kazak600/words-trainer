import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from merge_wordlists import Cell, merge, parse_wordlist  # noqa: E402


def cell(topic, level, origin, words, index, topic_index=0):
    return Cell(topic, level, origin, words, index, topic_index)


class ParseWordlistTest(unittest.TestCase):
    def test_parses_groups_comments_and_phrases(self):
        text = "# comment\n\nnoun: māja, vannasistaba\nphrase: uz redzēšanos,  labu nakti\n"

        self.assertEqual(
            parse_wordlist(text),
            [
                ("noun", "māja"),
                ("noun", "vannasistaba"),
                ("phrase", "uz redzēšanos"),
                ("phrase", "labu nakti"),
            ],
        )

    def test_rejects_unknown_part_of_speech(self):
        with self.assertRaises(ValueError):
            parse_wordlist("thing: māja")


class MergeTest(unittest.TestCase):
    def test_keeps_lowest_level_for_a_word_in_several_cells(self):
        a2 = cell("home", "A2", "textbook", [("noun", "māja")], 0)
        a1 = cell("family", "A1", "textbook", [("noun", "māja")], 1, 1)

        rows, _ = merge([a2, a1])

        self.assertEqual(
            [(r.lemma, r.topic, r.level) for r in rows], [("māja", "family", "A1")]
        )

    def test_textbook_beats_extra_on_equal_level(self):
        extra = cell("animals", "A1", "extra", [("noun", "ola")], 0)
        book = cell("food", "A1", "textbook", [("noun", "ola")], 1, 1)

        rows, _ = merge([extra, book])

        self.assertEqual(rows[0].topic, "food")

    def test_earlier_cell_wins_when_everything_else_is_equal(self):
        first = cell("home", "A1", "textbook", [("noun", "durvis")], 0)
        second = cell("city", "A1", "textbook", [("noun", "durvis")], 1, 1)

        rows, _ = merge([first, second])

        self.assertEqual(rows[0].topic, "home")

    def test_same_lemma_with_other_part_of_speech_is_kept(self):
        c = cell("time", "A1", "textbook", [("noun", "vakars"), ("adv", "vakars")], 0)

        rows, _ = merge([c])

        self.assertEqual(len(rows), 2)

    def test_orders_rows_by_topic_then_level_then_source_order(self):
        a2 = cell("home", "A2", "textbook", [("noun", "balkons")], 0)
        a1 = cell("home", "A1", "textbook", [("noun", "māja"), ("noun", "logs")], 1)
        other = cell("city", "A1", "textbook", [("noun", "iela")], 2, 1)

        rows, _ = merge([a2, a1, other])

        self.assertEqual(
            [r.lemma for r in rows], ["māja", "logs", "balkons", "iela"]
        )

    def test_counts_dropped_duplicates(self):
        c1 = cell("home", "A1", "textbook", [("noun", "māja"), ("noun", "māja")], 0)
        c2 = cell("city", "A1", "textbook", [("noun", "māja")], 1, 1)

        rows, stats = merge([c1, c2])

        self.assertEqual(len(rows), 1)
        self.assertEqual(stats["duplicates"], 2)


if __name__ == "__main__":
    unittest.main()
