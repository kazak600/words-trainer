# Development Stages

Companion to `development_plan.md`. The plan says what the app is; this file says in what order to build it.

Decisions that shape the stages (from the answered open questions):

- **One session = up to 10 new words from one topic.** The number of sessions per day is unlimited, but new words are capped at 15 per day per deck (stage 21). Due reviews come from all topics in one Review queue.
- **A topic is a theme, not a textbook unit.** One topic merges units from different levels (for example shopping: A1 unit 7 and A2 unit 6), so a topic holds words of several levels. Every word keeps the level it was generated for. This fits the schema: `topics` have no level, and `words` carry both a topic and a level. Topics can also be extra ones that are not in the textbook (numbers, animals, professions, function words, common verbs and adjectives).
- **Review of translations**: a CSV round-trip inside the repo; the user reviews manually.
- **Writing checker is fuzzy** (stage 20): exact, typo (pass, but never lengthens the interval) or wrong. A missing diacritic counts as a typo and still shows the diff. This replaces the earlier strict rule.
- **Scheduling is FSRS** with one card per word and direction (stage 19). The flip → choice → write ladder and multiple choice are removed. Streaks are removed.
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

**Learning mechanics v2 (stages 19–25)** is built after stage 14, before stages 15 and 16: 19 → 20 → 21 → 22 → 23 → 24 → 25. It supersedes the scheduler and checker rules of stage 9, the session rules of stage 10, the multiple-choice card of stage 14, the streak of stage 13, and the gap-sentence mode of stage 16.

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

## Stage 14. Multiple choice and writing [DONE]

**Goal:** the three stages of a word are all playable.

Tasks:

- Multiple-choice card: Ukrainian shown, 4 Latvian options, immediate right/wrong feedback.
- Writing card: Ukrainian shown, a text field with autocorrect, autocapitalize and spellcheck turned off, and a hint about the long-press for *ā, š* (or the Latvian keyboard).
- Feedback on a wrong answer: the correct word with the letter differences highlighted, including a missing mark.
- A word is marked learned in the UI when it has been typed correctly.

**Done when:** a word moves from flip to multiple choice to writing in real sessions, and a typo without a diacritic is shown as an error with the diff.

## Stage 15. Stats and resume polish

**Goal:** the user can see progress.

Tasks:

- Stats page: words by state (new / learning / review / learned), learned count per level and per topic, a calendar of study days, reviews per day. No streak.
- Stats endpoints built from `review_log` and `cards`, per deck.
- Resume edge cases: a session older than a day is offered as "continue or start over".

**Done when:** the stats match a hand count from a test database.

## Stage 16. Gap sentences and grammar panels

**Goal:** sentences with a gap, and grammar next to each word.

Tasks:

- Gap-sentence mode is replaced by the cloze cards of stage 23.
- Grammar panel rendered from `grammar_json` and `forms_json` by a per-language component: nouns (gender, plural, key cases), verbs (*es / tu / viņš*) only if the stage 4 coverage report shows enough data, otherwise verbs are skipped and this is written down.

**Done when:** the grammar panel shows for nouns, and for verbs if covered.

## Stage 17. Finish the dataset (data track, ongoing)

**Goal:** all A2 and A1 words reviewed and loaded, then B1.

Tasks:

- The user reviews the remaining A2 units, then A1; load each approved unit with the stage 6 script.
- Run stages 3–6 for the B1 units.
- Remove or fix words the user flags while studying.

**Done when:** every A2 and A1 unit is approved and loaded; B1 follows unit by unit.

## Stage 18. English → Ukrainian deck

**Goal:** a second deck, `en-uk`, with no schema change. It is a separate study flow: its own topics, queue, daily cap and stats, never mixed with `lv-uk`.

Tasks:

- English language adapter for the pipeline (kaikki English dump), English topics, an `en-uk` deck row.
- Add the second deck to the language list in Settings, and remember the chosen deck on the device; check the checker table (English rules) and the grammar panel for English.

**Done when:** the user can switch decks and study English words with the same session flow.

---

## Learning mechanics v2 (stages 19–25)

Goal: make every review force retrieval, and schedule it from a model of the user's own forgetting. Personal app: no streaks, leaderboards or hearts.

## Stage 19. FSRS cards and scheduler

**Goal:** one FSRS memory state per word and direction replaces `progress` and the stage ladder.

Tasks:

- Migration: table `cards(id, user_id, deck_id, word_id, kind, sentence_id, state, due_at, stability, difficulty, scheduled_days, learning_steps, reps, lapses, last_review_at, suspended)`, unique on (user, deck, word, kind, sentence). `kind` is `recognition` (lv → uk, tap to reveal), `production` (uk → lv, typed) or `cloze`. Index on (user_id, deck_id, due_at). `review_log` gets `kind` and `grade` (1–4) columns.
- Convert existing `progress` rows into recognition and production cards (stage 1 → recognition only; stage 2–3 → both; interval kept as `scheduled_days`). `progress` and the old scheduler stay until stage 21 moves the study service, topic counts and web app to `cards`.
- `lib/scheduler` wraps `ts-fsrs` (pure, fuzz off in tests): grades **Again / Hard / Good / Easy**, target retention 0.9. **(my call)**
- **Learned** = the production card is in review state with stability of at least 21 days. **(my call)**
- Leech threshold: 5 lapses on one card. **(my call)**

**Done when:** Vitest suites cover first review, each grade, lapse, and the progress migration (checked on a copy of a real database).

## Stage 20. Fuzzy checker and auto-grade [DONE]

**Goal:** typing is forgiving about typos but never hides them.

Tasks:

- `lib/checker` returns `exact`, `typo` or `wrong`, plus the per-letter diff. Case-insensitive, trimmed. A match after stripping diacritics is always `typo`. Otherwise Levenshtein distance 1 is `typo` for words of 4–8 letters, 2 for longer ones. Per-language table stays; the English case stays in the tests. **(my call)**
- Auto-grade for typed cards: `exact` → Good, `typo` → Hard (passes, short interval, no promotion), `wrong` → Again. After an exact answer the user may raise it to Easy. **(my call)**

**Done when:** a table of cases passes (*maize / maizē*, *šeit / seit*, *ļoti / loti*, one wrong letter, a far miss, extra spaces, capitals, English).

## Stage 21. Review queue and daily cap [DONE]

**Goal:** the Worker serves one queue of due cards and introduces new words within the cap.

Tasks:

- `GET /api/decks/:deck/review`: due cards from all topics, oldest first, suspended cards excluded.
- Topic sessions introduce up to 10 new words, limited by the remaining daily cap of 15 (counted from first reviews in `review_log`, user's local day). **(my call)**
- A new word starts as a recognition card. Its production card is created after the first recognition review that is not Again. Later answered-wrong cards return once at the end of the session (kept from stage 10).
- Answer endpoint runs the checker for typed cards, maps the result to a grade, calls the scheduler, updates `cards`, appends to `review_log` and `session_state`. Resume stays.
- Multiple-choice code and distractor logic are removed.
- API shape: `GET /api/decks/:deck/review?tzOffset=` (due count, new today, cap, due list); `POST /api/decks/:deck/sessions` takes `{topicId, tzOffset?}` (new words only) or `{review: true}` (up to 20 due cards); `POST /api/sessions/:id/answer` takes `{cardIndex, grade}` for recognition or `{cardIndex, typed}` for production; `POST /api/sessions/:id/easy` with `{cardIndex}` raises that card's exact typed answer to Easy while it is still the latest answer. A new production card is first due a day after its recognition card is answered, and a review session holds back a word's second card when both are due. Apply migration 0007 before deploying this Worker (it keeps newer card reviews either way). The web app still calls the old shape and is rebuilt in stage 22.
- Move `findDueWords`, `findNewWordIds`, `listTopicLevelCounts` and the answer flow from `progress` to `cards`; delete `lib/scheduler.ts`, the `learned` handling and the `progress` table (new migration). That migration first re-runs the `-- convert progress` block of `0006_cards.sql` (it refreshes existing cards), so reviews done on `progress` after stage 19 are not lost. Learned counts may dip right after the switch: converted production cards start with stability equal to their old interval.

**Done when:** API tests cover the cap (reached, partly used, next day), a mixed review of due cards from two topics, a resume, and the production card appearing after a recognition pass.

## Stage 22. Frontend: cards and Home [DONE]

**Goal:** the UI matches the new mechanics.

Tasks:

- Recognition card: reveal, then four grade buttons. Production card: typed, with a diacritic quick-bar (*ā č ē ģ ī ķ ļ ņ š ū ž*) above the keyboard; a typo is shown in yellow with the diff as "Pass with typo".
- Bottom tab bar: Home, Review, Add, Stats, Settings. Settings holds the language switch and logout.
- Home: a Review button with the due count, topics with new-word counts, "new today: n / 15". Streak badge removed (and `lib/streak.ts`).
- Multiple-choice UI removed.
- **Decks are separate flows.** The whole app (Home, Review, Add, Stats, Leech Workshop) is scoped to one current deck, and nothing from another deck is mixed in: no shared queue, no shared counts, no shared daily cap. The current deck is app state (a context, default `lv-uk`), remembered on the device; no page or API call hard-codes a deck slug. The language is switched in the Settings tab (a list of decks, the current one selected); with one deck the list shows only Latvian. UI strings about the language come from the deck's metadata.
- Stats is a placeholder page (charts: stage 15) with the Leech Workshop link; Add became a real form in stage 25. The streak is gone from the worker (`/api/streak`, `computeStreak`; the day helpers moved to `lib/day.ts`) and from the web app. The deck choice is kept in `localStorage`.
- Visual style follows the reference screenshots `Speak iOS 5/7/22/23.png` in the repo root, as a loose guide (see `development_plan.md`, section 7). Elements can be adjusted.

**Done when:** on the iPhone, a review of due cards and a topic session with new words both work, and a missing-diacritic answer shows as a typo.

## Stage 23. Cloze cards [DONE]

**Goal:** words are also tested inside a sentence, which trains the right case and verb form.

Tasks:

- A cloze card is created for each word sentence (from `sentences`) after the word's production card first passes. The Ukrainian sentence translation is the hint; the answer is the form in the sentence, checked by the stage 20 checker.
- `sentences` gets `source` (`generated` or `manual`) in migration 0008, so real "+1" sentences can be added later (stage 25).
- A word's cloze cards are created (one per approved sentence, first due a day later) whenever its production answer passes; cloze cards share the review queue and the typed-card UI with production cards.

**Done when:** a cloze card is created and scheduled after a production pass, and a wrong ending is shown as a typo or an error with the diff.

## Stage 24. Leech detection and workshop [DONE]

**Goal:** words that do not stick are handled instead of clogging the queue.

Tasks:

- A card reaching 5 lapses is marked leech and suspended from the queue.
- Implementation notes: the leech is marked in the answer flow on the lapse that reaches 5 (`AnswerView.leech`); `GET /api/decks/:deck/leeches`, `PUT /api/decks/:deck/words/:wordId/notes` and `POST /api/decks/:deck/cards/:cardId/unsuspend` serve the workshop (page `/stats/leeches`, linked from Stats and from Home when `leeches > 0` in the review summary). "Confused with" is free text. Migration 0009 adds `word_notes` and `words.source`.
- Leech Workshop screen: list of leeches; for each, a personal mnemonic (stored per user and word), a stronger sentence, and a similar word it is confused with. A button returns the card to the queue.

**Done when:** a card with 5 lapses leaves the queue and appears in the workshop, and after the user adds a mnemonic and unsuspends it, it is due again.

## Stage 25. Quick add [DONE]

**Goal:** adding a word takes under 5 seconds.

Tasks:

- `POST /api/decks/:deck/words` and a form: Latvian, Ukrainian, part of speech, topic, level (default A2), optional sentence with its translation. It writes to D1 directly with `review_status = approved` and `words.source = manual` (migration). No AI calls from the app.
- Implementation notes: `GET /api/decks/:deck/topic-options`, `POST /api/decks/:deck/words` and `POST /api/decks/:deck/words/:wordId/sentences` (the workshop reuses it); the Add tab is the form. `load_words.py` leaves `source = 'manual'` sentences alone.
- Duplicate check on (deck, lemma, part of speech). The new word enters the new-word queue and counts toward the cap.

**Done when:** a word added from the phone shows in its topic and in a session, and a duplicate is rejected.

---

## Confirmed decision: topics and levels

A session is limited to one topic, and a topic can hold words of different levels. A topic is therefore a theme that merges textbook units across levels, not a single unit. The user also allowed extra topics beyond the textbook, since the textbook topics are not complete. This affects stage 2 (`topics` and the topic map), stage 3 (words are generated per (topic, level) cell; dedup keeps the lowest level), stages 7, 10 and 13 (ordering by level, level chips on Home).

Draft `data/topic_map.csv` is written (25 topics: 18 from the textbook, 7 extra). The user confirms or edits it before stage 2 seeds it.
