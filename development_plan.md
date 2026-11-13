# Latvian Words Trainer: Development Plan

Status: draft for review. Nothing is built yet. Items marked **(my call)** are my proposals and have not been agreed. Items marked **(open)** need an answer.

## 1. Goal

A personal web app for one user (single account) to learn vocabulary.

- **Now: Latvian → Ukrainian** words. Near goal: pass the **A2 exam**. Later goal: grow to **B1–B2**.
- **Later (not now): English → Ukrainian** words, in the same app. Not built in v1, but the database schema and the app structure must allow it without a rewrite (section 4).
- Today the user learns from books, Google Translate and lessons, and tracks nothing. The app becomes the single word list and the record of what is known.
- Used on **iPhone in Safari**, in **short sessions of 10–15 minutes**.

### Non-goals

- No AI calls from the app. AI is used only offline, once, to build the dataset.
- No audio.
- No sign-up, password reset, or multi-user features. The user is created directly in the database.
- No manual word entry in the UI. All words come from the dataset script.
- English words, English topics and a language switcher in the UI are **not** part of v1. Only the schema and code structure are prepared.

## 2. Stack

| Part | Choice |
|---|---|
| Backend | TypeScript on Cloudflare Workers |
| Frontend | React, served from the same Worker as static assets (Cloudflare now steers new projects to this instead of Pages; Pages also works) **(my call)** |
| Database | Cloudflare D1 (SQLite) |
| Worker router | Hono **(my call)** |
| Frontend build | Vite **(my call)** |
| Dataset scripts | Python, run locally **(my call)** |

The app is designed phone-first and can be added to the iPhone home screen (PWA manifest, no offline mode in v1).

## 3. Dataset pipeline (offline, runs on the user's machine)

The dataset is the biggest part of the project. There is no ready Latvian–Ukrainian dictionary and no free source that tags Latvian words by CEFR level, so we build both.

### Topics (`topics.md`)

The topics are the units of the user's textbook, grouped by level:

- **A1**: 12 units (*Prieks iepazīties!* … *Mācības un darbs*)
- **A2**: 8 units (*Es, mana ģimene un draugi* … *Ceļojums*)
- **B1**: 10 units (*Nekad nav par vēlu* … *Brīnumainā un noslēpumainā Latvija*)

Notes:

- The word list follows these units, not an official exam word list (none was found).
- A topic in the app is a theme that merges units from different levels (for example shopping: A1 unit 7 and A2 unit 6). Units are mapped to topics in `data/topic_map.csv`, one row per (topic, level), and each word keeps the level it was generated for. The textbook topics are not complete, so the map also has extra topics (numbers, animals, professions, function words, common verbs and adjectives).
- In `topics.md` the first two A1 units are both numbered "2". I treat them as units 1 and 2 by order and leave the file unchanged.
- **Scope of the first dataset: A2 and A1 units**, since the A2 exam covers A1 vocabulary too. B1 is added later. **(my call)**
- A2 units come first, because the user is already near A2. **(my call)**

### Sources checked

- **FreeDictionaryAPI.com** (English Wiktionary data, CC BY-SA 4.0, no key, 1,000 requests/hour per IP). Tested with *maize*: it returns the English meaning, gender and declension, all case forms, and example phrases. Bulk dump with the same data: kaikki.org/dictionary/Latvian.
- **Tēzaurs API**: rejected. It needs a key requested by email, and its definitions are in Latvian, with no English.
- **FrequencyWords (lv)**: a frequency list from subtitles. It contains inflected forms (*man*, *tev*, *mani*), not base forms, so it is only a cross-check.

### Steps

1. **AI generates the word list per topic and level** from `data/topic_map.csv`: about 40 base-form words per (topic, level) cell (about 1,500 for A1 + A2), with part of speech. The AI sees only the topic and the source unit titles, so the list matches the topic, not the textbook's own glossary. If the user later provides the real glossary, it can replace or extend the AI list. Duplicates across cells are dropped, keeping the lowest level (textbook topics win ties). **(my call)**
2. **Cross-check** against the frequency list so very common words are not missed (lemmatise the frequency list first).
3. **Enrich from Wiktionary** (kaikki dump preferred over the API): English meaning, part of speech, gender, declension, noun forms, verb forms where available.
4. **AI translation to Ukrainian**, offline. The prompt gets the Latvian word, the English meaning and the part of speech, not the English alone, to avoid errors like *tu*/*jūs* → "you" or *bank* (river/money). **(my call)**
5. **AI-generated gap sentences** in Latvian (one or two per word, level of the unit), because Wiktionary examples are often fragments.
6. **Review by the user.** Every translation row has a review status (`pending`, `approved`, `edited`). Only `approved` and `edited` words appear in the app. Review tool is **(open)**: a CSV/spreadsheet export and re-import is the simplest option.
7. **Load into D1** with a script that generates SQL (`wrangler d1 execute`). The script is idempotent.

Wiktionary data is CC BY-SA 4.0: show a short attribution line in the app footer.

Risk: Wiktionary's Latvian verb tables may be incomplete. Check coverage in step 3 before promising verb forms in the UI.

The pipeline is written per language: a small adapter for each source language (word list, enrichment, grammar fields), with shared steps for translation, sentences, review and load. English → Ukrainian later reuses the same steps with an English adapter (kaikki English dump).

## 4. Data model (D1)

The model is language-neutral. Language-specific things (gender, declension) live in JSON, and Ukrainian is just one translation language among others.

- `users(id, username, password_hash, created_at)`
- `sessions(token_hash, user_id, expires_at)`
- `decks(id, slug, source_lang, target_lang, title)`
  - v1 has one row: `lv-uk` (`source_lang='lv'`, `target_lang='uk'`).
  - Later: `en-uk`. A deck is what the user studies; everything below hangs off a deck or a word.
- `topics(id, lang, slug, title, title_uk)`: themes shown in the app; `lang` is the word language, so English gets its own topics later. A topic has no level.
- `words(id, lang, lemma, pos, topic_id, level, grammar_json, forms_json)`
  - `grammar_json` holds language-specific data, e.g. for Latvian `{"gender":"f","declension":5}`. No gender or declension columns.
  - `level` is the CEFR level the word was generated for (A1/A2/B1), so a topic holds words of several levels. The textbook units behind each topic live only in `data/topic_map.csv`.
- `translations(id, word_id, target_lang, text, review_status)`
  - A Latvian word has an `en` row (used as AI input, not shown by default) and a `uk` row (shown in the app). An English word later gets only a `uk` row.
- `sentences(id, word_id, text_with_gap, answer, hint_target_lang, hint)`
- `progress(user_id, deck_id, word_id, stage, ease, interval_days, due_at, reps, lapses, last_reviewed_at)`: progress is per deck.
- `review_log(id, user_id, deck_id, word_id, mode, correct, typed_answer, created_at)`, for the stats page
- `session_state(user_id, deck_id, payload_json, updated_at)`, so an interrupted session resumes where it stopped

### Keeping the app ready for English

Rules for the code, so adding English later is data plus a small UI change:

- Every API call that deals with words takes a `deck` (slug) parameter. In v1 the frontend always sends `lv-uk`.
- The writing checker takes the word's language and uses a per-language normalisation table (Latvian: strict diacritics; English: none). It never assumes Latvian.
- Grammar panels are rendered from `grammar_json` by a per-language component (Latvian: gender, plural, verb forms; English: nothing at first).
- UI strings about the language ("Latvian word") come from the deck's metadata, not hard-coded.
- Home screen: a deck switcher exists in the code but is hidden while there is only one deck.
- Stats, streak and daily new-word cap are per deck, with the streak shown across all decks. **(my call)**
- Multiple-choice distractors are taken only from the same deck, topic and part of speech.

## 5. Auth

- Login page only: username and password.
- Password hashed with PBKDF2 via Web Crypto (bcrypt does not suit Workers). **(my call)**
- A script prints the SQL to insert the user with a hashed password.
- Session: random token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie, stored in a `sessions` table with expiry (long, about 90 days, since it is a personal phone app). **(my call)**
- All `/api/*` routes except login require a session.

## 6. Study logic

### Spaced repetition

After each card the user gives a result. The app schedules the next review: known words return after days or weeks, missed words return soon. Start with an SM-2-style scheduler with simple buttons (**Again / Good / Easy**). FSRS is a possible later upgrade. **(my call)**

### Stages per word

1. **Flip card**: Latvian word, flip, Ukrainian translation, plus grammar (gender, plural, or verb forms).
2. **Multiple choice**: pick the correct Latvian word out of 4 (distractors from the same topic and part of speech).
3. **Writing**: Ukrainian shown, user types the Latvian word.

A word counts as **learned** once it has been typed correctly. A wrong answer moves the word back a stage. Gap sentences are an extra mode used on learned words.

### Writing checker

- Exact match is correct.
- The check is strict: every diacritic must be present and correct (*ā, ē, ī, ū*, and also *š, č, ž, ģ, ķ, ļ, ņ*). A missing or wrong mark is an error. The user's wording was about the long marks (garumzīmes); I apply the same rule to all diacritics.
- Wrong answers show which letters differ, including a missing mark.
- Comparison is case-insensitive and trims whitespace.

### Session shape

- A session is **10 words from one topic**: due reviews first, then new words ordered by level (A1, A2, B1) and then in dataset order. Sessions per day are unlimited; there is no daily cap.
- Progress is saved after every card, so closing Safari loses nothing.

## 7. Screens

1. **Login**
2. **Home = topics list**: per-topic new / learning / learned counts and level chips; tapping a topic starts a session; streak badge.
3. **Session**: one card at a time, large thumb-reachable buttons, a progress bar, an exit button that saves state.
4. **Stats**: words by stage, learned count, daily goal, streak, a calendar of study days.

## 8. Delivery phases

Each phase ends with something usable.

1. **Dataset (lv → uk).** Word list per unit, enrichment, translation, review tool, and a first batch of about 200 approved words from the first A2 units. This comes first because everything depends on it.
2. **Skeleton.** Worker + React + D1 deployed on Cloudflare, login working, one hardcoded user, the multi-language schema in place, dataset loaded.
3. **Flip cards + spaced repetition.** The core loop, usable daily from here.
4. **Writing mode + checker, multiple-choice stage.**
5. **Topics, stats, streak, session resume.**
6. **Gap sentences and grammar panels.**
7. **Full dataset review (A2, then A1)**, run in parallel with phases 3–6.
8. **B1 units** added to the dataset.
9. **English → Ukrainian deck** (not scheduled): English adapter for the pipeline, `en-uk` deck row, deck switcher visible, English topics.

## 9. Testing

- Unit tests (Vitest) for the scheduler and the writing checker, the two places with real logic. The checker tests include a non-Latvian language case, so the language-neutral design is verified.
- API tests for login and the session endpoints against a local D1 (Miniflare).
- Manual check on a real iPhone for layout and the keyboard (long-press for *ā, š*, or the Latvian keyboard).

## 10. Open questions

1. **Review tool** for the Ukrainian translations: CSV/spreadsheet round-trip in repo, I review manually.
2. **Daily new-word cap**: One session is 10 words. Sessions in a day are unlimited.
3. **Does the strict diacritic rule cover all marks** (including *š, č, ž…*) Yes, all are strict.
4. **A1 and A2 in the first dataset, A2 first**: One session is one topic, but words could be from different levels. Confirmed: a topic is a theme merging units across levels; each word keeps its own level.

Resolved: the word list is AI-generated by topic from `topics.md`; the writing checker is strict about diacritics; English → Ukrainian comes later and is covered in the schema.
