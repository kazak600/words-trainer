# Development Stages

Companion to `development_plan.md`. The plan says what the app is; this file says in what order to build it.

Decisions that shape the stages (from the answered open questions):

- **One session = 10 words from one topic.** The number of sessions per day is unlimited, so there is no daily new-word cap.
- **A topic is a theme, not a textbook unit.** One topic merges units from different levels (for example shopping: A1 unit 7 and A2 unit 6), so a topic holds words of several levels. Every word keeps the level it was generated for. This fits the schema: `topics` have no level, and `words` carry both a topic and a level. Topics can also be extra ones that are not in the textbook (numbers, animals, professions, function words, common verbs and adjectives).
- **Review of translations**: a CSV round-trip inside the repo; the user reviews manually.
- **Writing checker is strict** about all diacritics.
- English → Ukrainian is later, but the schema and code are language-neutral from the start.

Rules for every stage:

- A stage is done only when its "Done when" line is true and its tests pass.
- Finished changes stay uncommitted until the user asks for a commit.
- Code, identifiers and docs in English. Comments only for non-obvious business logic.

## Tracks and order

Two tracks can run in parallel after stage 2:

- **Data track:** stages 3 → 4 → 5 → 6. Produces the first approved words.
- **App track:** stages 7 → 8 → 9 → 10 → 11 → 12 → 13.

Stage 13 is the first version usable every day. Stages 14–17 improve it. Stage 18 is not scheduled.

---

## Stage 1. Project structure

**Goal:** an empty but runnable skeleton with the layout, tooling and scripts in place.

Layout:

```
latvian_app/
  topics.md  development_plan.md  stages.md
  worker/               Cloudflare Worker, TypeScript, Hono
    src/routes/         HTTP only: parse request, call a service, return JSON
    src/services/       business logic, no SQL
    src/repositories/   SQL only, takes the D1 binding
    src/lib/            pure helpers (scheduler, checker, crypto)
    migrations/         D1 SQL migrations
    test/
    wrangler.jsonc      D1 binding, static assets from ../web/dist
  web/                  React + Vite, phone-first
  data/                 offline dataset pipeline (Python)
    pipeline/           one module per step, language adapters
    csv/                files that are reviewed and loaded
  package.json          npm workspaces for worker and web
```

Tasks:

- Create the folders, `package.json` workspaces, `tsconfig`s, Vitest in `worker/`, ESLint and Prettier.
- Worker with one `GET /api/health` route; Vite app with one placeholder page.
- `wrangler.jsonc` with a local D1 binding and the assets directory.
- Root scripts: `dev` (worker + web), `test`, `build`, `db:migrate:local`.
- `.gitignore`, a short `README.md` with the commands.

**Done when:** `npm run dev` serves the placeholder page and `/api/health` locally, and `npm test` runs (with one trivial test).

## Stage 2. Database schema and migrations

**Goal:** the full language-neutral schema from plan section 4 exists locally, with the deck and topics seeded.

Tasks:

- Migration `0001`: `users`, `sessions`, `decks`, `topics`, `words`, `translations`, `sentences`, `progress`, `review_log`, `session_state`, with foreign keys and the indexes the queries will need (`progress(user_id, deck_id, due_at)`, `words(topic_id, level)`, `translations(word_id, target_lang)`).
- `topics(id, lang, slug, title, title_uk)` are themes with no level. `words` keep `topic_id` and `level` (the level the word was generated for). The textbook units behind each topic stay only in the map file.
- **Topic map** in `data/topic_map.csv`: one row per (topic, level) cell, with the source unit titles as a hint and an `origin` of `textbook` or `extra`. A first draft exists (25 topics, 45 cells); the user confirms or edits it before the seed is written.
- Seed migration: the `lv-uk` deck.
- Script that reads `topic_map.csv` and generates the `topics` seed SQL.

**Done when:** `npm run db:migrate:local` creates all tables and seeds the deck and the topics from the map, and a test confirms the topic count and that every map row points to a seeded topic.

## Stage 3. Word lists per unit (data track)

**Goal:** a base-form word list for every A2 and A1 cell of the topic map.

Tasks:

- Python pipeline package in `data/pipeline/` with a language adapter interface (`lv` first).
- For each (topic, level) row of `topic_map.csv`, AI generates about 40 base-form words of that level with part of speech, guided by the source hint (unit titles for textbook rows, the stated scope for extra rows). The AI step runs outside the app. I generate them in Claude Code sessions, one cell at a time, so no API key is needed. **(my call)**
- Merge into `data/csv/words_lv.csv` with the topic and the level. A word generated in several cells is kept once, in the cell with the lowest level (A1 before A2 before B1); on a tie, textbook topics win over extra ones. The extra topics `function-words`, `common-verbs` and `common-adjectives` are generated last so they only collect what the other topics missed.
- Cross-check against the lemmatised FrequencyWords list and print the common words that no unit has; the user decides which to add.
- Order: A2 cells first, then A1. B1 cells are a later stage.

**Done when:** `words_lv.csv` has about 1,500 unique lemmas for A1 + A2, each with a topic, a level and a part of speech, and the cross-check report is produced.

## Stage 4. Wiktionary enrichment (data track)

**Goal:** each word has an English meaning, gender, declension and forms where Wiktionary has them.

Tasks:

- Download the kaikki.org Latvian dump into an ignored folder (not committed).
- Match each lemma and part of speech; take the English meaning, `grammar_json` (gender, declension), `forms_json` (case forms, verb forms).
- Handle words with several senses: take the first sense by default and mark multi-sense words for the review.
- Coverage report: how many words matched, and how many verbs have full forms. This decides whether verb forms are promised in the UI (stage 16).
- Unmatched words keep an empty English meaning and are flagged so stage 5 can still translate them.
- **Grammar fallback (`fill_grammar_tezaurs.py`):** for words Wiktionary cannot describe, and for verbs with incomplete forms, the free Tēzaurs morphology service supplies gender, declension, case forms and verb forms. Plural-only words (*brīvdienas*) take the grammar of their base word (`form-of:` flag); a guess for a word outside the Tēzaurs lexicon is flagged `grammar-guessed`. Results are cached in `data/.cache`, and the step is safe to run again.

**Done when:** the CSV has the new columns, the coverage report shows the match rate, and the grammar fallback has run.

## Stage 5. Ukrainian translations and gap sentences (data track)

**Goal:** every word has a draft Ukrainian translation and one or two gap sentences.

Tasks:

- AI translation to Ukrainian from the Latvian word, the English meaning and the part of speech, not from the English alone.
- AI gap sentences in Latvian at the unit's level, with the gap marker and the answer. The answer must be the word's form in the sentence, since Latvian changes endings.
- Validation script: no empty translations, the gap marker is present, the answer appears in the sentence, no duplicate sentences.
- All new rows get `review_status = pending`.
- Authoring format: one file per topic in `data/translations/`, one line per word: `lemma | pos | ukrainian | sentence with ___ | answer | ukrainian translation of the sentence`. One gap sentence per word. The Ukrainian translation shown with a gap sentence is what tells apart gap sentences that look alike.
- The English meaning from Wiktionary is only a hint: where it was wrong (for example *svārki* glossed as "coat", *tualete* as "dress") the Latvian word wins.

**Done when:** the CSV passes validation and no row lacks a translation.

## Stage 6. Review round-trip and load script (data track)

**Goal:** the user can review translations in a spreadsheet, and approved words reach the database.

Tasks:

- Export script: writes `data/csv/review_<unit>.csv` (Latvian, English, Ukrainian, sentences, status) so the user can review one unit at a time.
- Import script: reads the edited CSV, sets status `approved` or `edited` (any changed cell means `edited`), rejects unknown statuses.
- Load script: generates idempotent SQL (upsert by deck, lemma and part of speech) for approved and edited rows only, and runs it with `wrangler d1 execute` locally or remotely.
- First batch: about 200 words from the first A2 units, reviewed by the user.

**Done when:** after the user reviews the first batch, the load script puts those words in the local database, and running it twice changes nothing.

## Stage 7. Words service (app track)

**Goal:** the Worker can read decks, topics and words, through the repository → service → route layers.

Tasks:

- Repositories: decks, topics, words (with translations and sentences).
- Services: list decks, list topics of a deck with per-topic word counts split by level, get the words of a topic (ordered A1, A2, B1, then in dataset order).
- Routes: `GET /api/decks`, `GET /api/decks/:deck/topics`, `GET /api/decks/:deck/topics/:topicId/words`. The `deck` parameter is required everywhere, even though v1 has one deck.
- Only words with an approved or edited Ukrainian translation are returned.
- Joins are done in SQL on indexed keys; no per-row query loops.

**Done when:** API tests against a local D1 (Miniflare) cover the three routes, including a word with a pending translation being hidden.

## Stage 8. Auth

**Goal:** login protects every `/api/*` route except login.

Tasks:

- PBKDF2 hashing with Web Crypto (`lib/crypto`), with a constant-time comparison.
- Script `create-user` that prints the SQL to insert a user with a hashed password, for local and remote D1.
- `POST /api/login`, `POST /api/logout`, `GET /api/me`. Session token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie, only its hash stored in `sessions`, expiry about 90 days.
- Auth middleware on `/api/*`; wrong credentials return one generic error; basic rate limit on login.

**Done when:** tests cover login success, wrong password, expired session, logout, and an unauthenticated call to a protected route returning 401.

## Stage 9. Scheduler and writing checker (pure logic)

**Goal:** the two places with real logic, built test-first, with no I/O.

Tasks:

- **Scheduler** (`lib/scheduler`): input is the current progress and a result (**Again / Good / Easy**); output is the new stage, ease, interval and due date. SM-2-style. **(my call)**
- **Stage rules:** flip → multiple choice → writing; a word is **learned** once typed correctly; a wrong answer moves the word back one stage.
- **Checker** (`lib/checker`): takes the typed text, the expected word and the language. Trim and case-insensitive. Strict: any missing or wrong diacritic is an error. Returns correct/incorrect plus a per-letter diff that also shows a missing mark. The per-language rules sit in one table, and the tests include a non-Latvian case (English), so the language-neutral design is checked.

**Done when:** Vitest suites pass for interval growth, lapses, stage moves, and a table of checker cases (*maize / maizē*, *šeit / seit*, *ļoti / loti*, extra spaces, capital letters, English).

## Stage 10. Study session service

**Goal:** the Worker builds a 10-word session for one topic, records answers, and resumes an interrupted session.

Tasks:

- `POST /api/decks/:deck/sessions` with a `topicId`: pick up to 10 words from that topic, due reviews first (oldest due first), then new words ordered by level (A1, then A2, then B1) and then in dataset order, so easier words come first. Fewer than 10 are returned if the topic has fewer. Unlimited sessions per day.
- Each word is shown at its current stage. A word answered wrong comes back once more at the end of the same session. **(my call)**
- `POST /api/sessions/:id/answer`: runs the checker for writing cards, runs the scheduler, updates `progress`, appends to `review_log`, and updates `session_state`, all per card.
- `GET /api/decks/:deck/sessions/current`: returns the unfinished session, so closing Safari loses nothing.
- Multiple-choice distractors come only from the same deck, topic and part of speech; if there are fewer than 3, fall back to the same deck and part of speech.

**Done when:** API tests cover a full session, a resume after a "closed browser", a topic with fewer than 10 words, and a session mixing due and new words.

## Stage 11. Frontend skeleton and login

**Goal:** the React app has routing, an API client, the login page and an auth guard, phone-first.

Tasks:

- React Router, a typed API client with cookie auth, a 401 handler that returns to login.
- Login page; layout with a safe-area padding for iPhone, large touch targets, a 16px minimum font in inputs (so Safari does not zoom).
- Web app manifest and icons so it can be added to the home screen. No offline mode.
- Attribution footer for Wiktionary (CC BY-SA 4.0).

**Done when:** logging in on a phone-sized browser reaches an empty Home page, and a reload keeps the session.

## Stage 12. First deploy

**Goal:** the skeleton runs on Cloudflare, so deployment problems show up early.

Tasks:

- Create the remote D1 database, set the binding IDs, run the migrations remotely.
- Deploy the Worker with the static assets; create the user on the remote database with `create-user`.
- Load the first approved batch to remote D1.
- Test on a real iPhone: login, the cookie surviving a restart of Safari, add to the home screen.

**Done when:** the user logs in on the iPhone against the deployed app and sees the topics from the real database.

## Stage 13. Home, topics and the flip-card session (first usable version)

**Goal:** the core loop works end to end: pick a topic, study 10 words as flip cards, and see them come back on schedule.

Tasks:

- **Home = topics list** (themes), each topic with counts of new / learning / learned words, small level chips (A1 / A2 / B1) for the levels it contains, and a streak badge. Tapping a topic starts a session. **(my call)**
- Session screen: one card at a time, flip animation, Again / Good / Easy as large bottom buttons, a progress bar, an exit button that keeps the session for resume.
- Grammar line under the translation when `grammar_json` has data (gender at this point).
- End-of-session summary and a button for another session.

**Done when:** the user does a full 10-word session on the iPhone, closes Safari in the middle of another one and resumes it, and sees reviewed words scheduled for later.

## Stage 14. Multiple choice and writing

**Goal:** the three stages of a word are all playable.

Tasks:

- Multiple-choice card: Ukrainian shown, 4 Latvian options, immediate right/wrong feedback.
- Writing card: Ukrainian shown, a text field with autocorrect, autocapitalize and spellcheck turned off, and a hint about the long-press for *ā, š* (or the Latvian keyboard).
- Feedback on a wrong answer: the correct word with the letter differences highlighted, including a missing mark.
- A word is marked learned in the UI when it has been typed correctly.

**Done when:** a word moves from flip to multiple choice to writing in real sessions, and a typo without a diacritic is shown as an error with the diff.

## Stage 15. Stats, streak and resume polish

**Goal:** the user can see progress.

Tasks:

- Stats page: words by stage, learned count per level and per topic, a calendar of study days, a streak (a day counts if at least one session was finished).
- Stats endpoints built from `review_log` and `progress`, per deck, with the streak across decks.
- Resume edge cases: a session older than a day is offered as "continue or start over".

**Done when:** the stats match a hand count from a test database, and the streak survives a day with two sessions and breaks after a missed day.

## Stage 16. Gap sentences and grammar panels

**Goal:** sentences with a gap, and grammar next to each word.

Tasks:

- Gap-sentence mode for learned words: Latvian sentence with a blank, Ukrainian hint, the user types the form; the checker is the same strict one.
- Grammar panel rendered from `grammar_json` and `forms_json` by a per-language component: nouns (gender, plural, key cases), verbs (*es / tu / viņš*) only if the stage 4 coverage report shows enough data, otherwise verbs are skipped and this is written down.

**Done when:** a learned word can be tested with a gap sentence, and the grammar panel shows for nouns, and for verbs if covered.

## Stage 17. Finish the dataset (data track, ongoing)

**Goal:** all A2 and A1 words reviewed and loaded, then B1.

Tasks:

- The user reviews the remaining A2 units, then A1; load each approved unit with the stage 6 script.
- Run stages 3–6 for the B1 units.
- Remove or fix words the user flags while studying.

**Done when:** every A2 and A1 unit is approved and loaded; B1 follows unit by unit.

## Stage 18. English → Ukrainian deck (later, not scheduled)

**Goal:** a second deck, `en-uk`, with no schema change.

Tasks:

- English language adapter for the pipeline (kaikki English dump), English topics, an `en-uk` deck row.
- Make the deck switcher visible; check the checker table (English rules) and the grammar panel for English.

**Done when:** the user can switch decks and study English words with the same session flow.

---

## Confirmed decision: topics and levels

A session is limited to one topic, and a topic can hold words of different levels. A topic is therefore a theme that merges textbook units across levels, not a single unit. The user also allowed extra topics beyond the textbook, since the textbook topics are not complete. This affects stage 2 (`topics` and the topic map), stage 3 (words are generated per (topic, level) cell; dedup keeps the lowest level), stages 7, 10 and 13 (ordering by level, level chips on Home).

Draft `data/topic_map.csv` is written (25 topics: 18 from the textbook, 7 extra). The user confirms or edits it before stage 2 seeds it.
