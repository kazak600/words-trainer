# Development Stages

Companion to `development_plan.md`. The plan says what the app is; this file lists what is still to build. Finished stages (1–14 and 19–25: skeleton, schema, dataset pipeline, auth, study sessions, FSRS cards, fuzzy checker, review queue and daily cap, cloze cards, leech workshop, quick add, the web app) are removed from this file; the code and `git log` are their record.

Decisions that still shape the work:

- **A topic is a theme, not a textbook unit.** A topic holds words of several levels, and every word keeps the level it was generated for.
- **Review of translations** is a CSV round-trip inside the repo; the user reviews manually.
- **Scheduling is FSRS** with one card per word and direction; the writing checker is fuzzy (exact, typo, wrong); there are no streaks.
- **Decks are separate flows.** English → Ukrainian is later, but the schema and code are language-neutral.

Rules for every stage:

- A stage is done only when its "Done when" line is true and its tests pass.
- Finished changes stay uncommitted until the user asks for a commit.
- Code, identifiers and docs in English. Comments only for non-obvious business logic.

## Open stages

15 (stats and resume polish), 16 (grammar panels), 17 (finish the dataset, ongoing), 18 (English deck, not scheduled). Not a stage but still open: apply migrations 0006–0009 to the remote database and deploy the new Worker and web app (they run only locally so far).

---

## Stage 15. Stats and resume polish

**Goal:** the user can see progress.

Tasks:

- Stats page: words by state (new / learning / review / learned), learned count per level and per topic, a calendar of study days, reviews per day. No streak.
- Stats endpoints built from `review_log` and `cards`, per deck.
- Resume edge cases: a session older than a day is offered as "continue or start over".

**Done when:** the stats match a hand count from a test database.

## Stage 16. Grammar panels

**Goal:** grammar next to each word.

Tasks:

- Gap sentences are covered by the cloze cards (built); this stage is only the grammar panel.
- Grammar panel rendered from `grammar_json` and `forms_json` by a per-language component: nouns (gender, plural, key cases), verbs (*es / tu / viņš*) only if the Wiktionary coverage report (`data/pipeline/enrich_wiktionary.py`) shows enough data, otherwise verbs are skipped and this is written down.

**Done when:** the grammar panel shows for nouns, and for verbs if covered.

## Stage 17. Finish the dataset (data track, ongoing)

**Goal:** all A2 and A1 words reviewed and loaded, then B1.

Tasks:

- The user reviews the remaining A2 units, then A1; load each approved unit with `data/pipeline/load_words.py` (see the README).
- Run the dataset pipeline (word lists, enrichment, translations, review, load) for the B1 units.
- Remove or fix words the user flags while studying.

**Done when:** every A2 and A1 unit is approved and loaded; B1 follows unit by unit.

## Stage 18. English → Ukrainian deck

**Goal:** a second deck, `en-uk`, with no schema change. It is a separate study flow: its own topics, queue, daily cap and stats, never mixed with `lv-uk`.

Tasks:

- English language adapter for the pipeline (kaikki English dump), English topics, an `en-uk` deck row.
- Add the second deck to the language list in Settings, and remember the chosen deck on the device; check the checker table (English rules) and the grammar panel for English.

**Done when:** the user can switch decks and study English words with the same session flow.
