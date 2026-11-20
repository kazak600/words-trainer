# Development Stages

Companion to `development_plan.md`. The plan says what the app is; this file lists what is still to build. Finished stages (1–16 and 19–25: skeleton, schema, dataset pipeline, auth, study sessions, FSRS cards, fuzzy checker, review queue and daily cap, cloze cards, leech workshop, quick add, stats and resume polish, grammar panels, the web app) are removed from this file; the code and `git log` are their record.

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

17 (finish the dataset, ongoing), 18 (English deck, not scheduled). Not a stage but still open: apply migrations 0006–0009 to the remote database and deploy the new Worker and web app (they run only locally so far).

---

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
