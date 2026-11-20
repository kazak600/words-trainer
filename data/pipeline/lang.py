"""Per-language paths and settings for the dataset pipeline.

Latvian keeps its original files; every other language lives under data/<code>/.
Languages without an enrichment step (no Wiktionary dump or grammar source) get an enriched file
written by merge_wordlists.py with the enrichment columns empty.
"""

import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

ENRICHED_COLUMNS = [
    "lemma", "pos", "topic_slug", "level", "status", "english", "english_note",
    "other_senses", "grammar_json", "forms_json", "grammar_source", "flags",
]


@dataclass(frozen=True)
class Lang:
    code: str
    title_column: str
    topic_map: Path
    wordlists: Path
    translations_dir: Path
    csv_dir: Path
    words_csv: Path
    enriched_csv: Path
    translations_csv: Path
    sentences_csv: Path
    seed_target: Path
    enriched_by_pipeline: bool
    deck: tuple[str, str, str, str] | None = None  # (slug, source, target, title) seeded with the topics


_LV_CSV = ROOT / "data" / "csv"
_EN = ROOT / "data" / "en"
_MIGRATIONS = ROOT / "worker" / "migrations"

LANGUAGES = {
    "lv": Lang(
        code="lv",
        title_column="title_lv",
        topic_map=ROOT / "data" / "topic_map.csv",
        wordlists=ROOT / "data" / "wordlists",
        translations_dir=ROOT / "data" / "translations",
        csv_dir=_LV_CSV,
        words_csv=_LV_CSV / "words_lv.csv",
        enriched_csv=_LV_CSV / "words_lv_enriched.csv",
        translations_csv=_LV_CSV / "translations_uk.csv",
        sentences_csv=_LV_CSV / "sentences_lv.csv",
        seed_target=_MIGRATIONS / "0003_seed_topics.sql",
        enriched_by_pipeline=True,
    ),
    "en": Lang(
        code="en",
        title_column="title_en",
        topic_map=_EN / "topic_map.csv",
        wordlists=_EN / "wordlists",
        translations_dir=_EN / "translations",
        csv_dir=_EN / "csv",
        words_csv=_EN / "csv" / "words_en.csv",
        enriched_csv=_EN / "csv" / "words_en_enriched.csv",
        translations_csv=_EN / "csv" / "translations_uk.csv",
        sentences_csv=_EN / "csv" / "sentences_en.csv",
        seed_target=_MIGRATIONS / "0010_seed_english.sql",
        enriched_by_pipeline=False,
        deck=("en-uk", "en", "uk", "English → Ukrainian"),
    ),
}


def get_lang(code: str) -> Lang:
    if code not in LANGUAGES:
        sys.exit(f"unknown language '{code}'; choose one of: {', '.join(LANGUAGES)}")
    return LANGUAGES[code]
