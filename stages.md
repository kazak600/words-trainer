# Development Stages

Companion to `development_plan.md`. The plan says what the app is; this file lists what is still to build. Finished stages (1–16, the code of 18 and 19–25: skeleton, schema, dataset pipeline, auth, study sessions, FSRS cards, fuzzy checker, review queue and daily cap, cloze cards, leech workshop, quick add, stats and resume polish, grammar panels, the web app) are removed from this file; the code and `git log` are their record.

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

17 (finish the dataset, ongoing) and the data part of 18 (English deck). Not a stage but still open: apply migrations 0006–0010 to the remote database and deploy the new Worker and web app (they run only locally so far).

---

## Stage 17. Finish the dataset (data track, ongoing)

**Goal:** all A2 and A1 words reviewed and loaded, then B1.

Tasks:

- The user reviews the remaining A2 units: `data/csv/review_<topic>.csv` for animals, clothes-and-colors, common-adjectives, common-verbs, countries-and-languages, free-time-and-hobbies, function-words, professions and travel (already exported, status `pending`). Set `status` to `approved`, run `review.py import`, then `load_words.py --local` (see the README). Then the A1 units (`review.py export --level A1`).
- B1 needs the textbook unit word lists in `data/wordlists/<topic>__B1.txt` (none exist yet); then run merge, enrichment, translations, review and load as for A2.
- Remove or fix words the user flags while studying.

**Done when:** every A2 and A1 unit is approved and loaded; B1 follows unit by unit.

## Stage 18. English → Ukrainian deck (data part open)

Built: the pipeline takes `--lang en`; `data/en/` holds 13 A1 topics with 300 words, Ukrainian translations and gap sentences (all `pending`); migration `0010_seed_english.sql` adds the English topics and the `en-uk` deck; the web app follows the deck's language (text language attribute, no Latvian quick-bar for English). English has no grammar panel.

Remaining:

- The user reviews `data/en/csv/review_<topic>.csv`, imports and loads it (see the README). Until words are approved and loaded, the English deck has no words to study.
- More English units (A2, further topics) follow the same flow: add rows to `data/en/topic_map.csv`, word lists and translations, new topics need a new hand-written migration that inserts only those topics (0010 is already applied and is not edited).

**Done when:** the user can switch decks and study English words with the same session flow (true once the English words are loaded).
