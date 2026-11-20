# Stages 17-18: Next review batch and the English → Ukrainian deck

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, TDD). Work on `main`, no branches, no commits until the user asks.

**Goal:** (17) hand the user the next A2 units to review; (18) a second deck `en-uk` that runs through the same pipeline, API and session flow as `lv-uk`, with its own topics.

**Architecture:** the pipeline takes `--lang` (default `lv`, existing files stay where they are); per-language paths live in one `data/pipeline/lang.py`. English data lives under `data/en/`. A generated migration seeds the `en` topics and the `en-uk` deck row. The web app stops assuming Latvian: `lang` attributes and the diacritic quick-bar follow the deck's source language.

**Spec:** `stages.md` stages 17-18, `development_plan.md`.

## Decisions (rulings)

- No English enrichment step (kaikki English dump not used): English entries carry only lemma, pos, topic, level; grammar columns stay empty, so no grammar panel for English (as planned). Ruling cost: no English meaning column in review files; the Ukrainian translation is the only context.
- English word lists are authored for this stage (A1 first, topics reuse the Latvian theme slugs with English titles). The user reviews them through the CSV round-trip like the Latvian ones; only approved or edited rows load.
- Stage 17's B1 pipeline run needs unit word lists from the textbook; none exist in the repo, so B1 is blocked on the user. The next A2 review files are exported for the user.

## Tasks

1. `lang.py` and `--lang` for `merge_wordlists.py`, `build_translations.py`, `review.py`, `load_words.py`, `seed_topics.py` (Python unit tests first: paths per language, SQL uses the language code, English load puts `lang='en'` and `topic` lookups under `en`).
2. English data: `data/en/topic_map.csv`, `data/en/wordlists/*.txt`, `data/en/translations/*.txt`; run merge and build; export review files.
3. Migration `0010_seed_english.sql` (generated: `en` topics + `en-uk` deck); worker tests: both decks listed, `en-uk` topics/words/sessions isolated from `lv-uk`, English checker through a session.
4. Web: `lang` attribute from the deck on all word text; quick-bar letters per language (none for English); tests with an English deck.
5. Stage 17: export the remaining A2 review files; update `README`, `stages.md`, `development_plan.md`.
6. Whole suites, lint, build; one opus review; fix pass.
