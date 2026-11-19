# Stages 24–25: Leech Workshop and Quick Add Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cards that keep failing are suspended as leeches and fixed in a workshop (mnemonic, similar word, a stronger sentence, return to queue); a new word can be added from the phone in a few seconds.

**Architecture:** One migration adds `word_notes` and `words.source`. The worker marks a card as a leech inside the existing answer flow, and exposes a leech list, notes upsert, unsuspend, "add sentence" and "add word" endpoints through the usual routes → services → repositories layers. The web app gets a Leech Workshop page (under Stats) and a real Add page. The Python loader is changed so it never overwrites hand-added sentences.

**Tech Stack:** TypeScript, Hono, D1, Vitest; React 19, React Router 7, Testing Library; Python `unittest` for the loader.

**Spec:** `stages.md` stages 24 and 25; `development_plan.md` sections 4, 6, 7.

## Global Constraints

- Leech threshold is 5 lapses on one card (`LEECH_LAPSES` in `lib/fsrs.ts`). A card becomes a leech on the review whose lapse takes it to 5 or more (its lapse count went up), and is then `leech = 1, suspended = 1`: it leaves the queue and the due count.
- Returning a card to the queue sets `suspended = 0, leech = 0` and keeps its schedule; the next lapse after that makes it a leech again.
- A mnemonic is stored per user and word (`word_notes`). "A similar word it is confused with" is free text (my call). A stronger sentence is a manual sentence (`sentences.source = 'manual'`, approved) with a `___` gap, an answer and a Ukrainian translation.
- Quick add writes directly to D1: `translations.review_status = 'approved'` and `words.source = 'manual'` (default for dataset words is `'dataset'`). No AI calls. Duplicate = same (deck language, lemma, pos) → 409. Level default A2. The new word is a normal new word: it shows in its topic and in sessions, and counts toward the daily cap through its first review.
- All endpoints take the deck slug; decks stay separate flows; every query is scoped to the logged-in user where the data is personal.
- Typed answers are limited to 100 characters (existing rule), so a sentence answer and a lemma are limited to 100 characters too.
- Style as in stages 22–23 (tokens in `web/src/styles.css`); inputs 16px; phone-first.
- Code, identifiers and docs in English. Comments only for non-obvious business logic. Finished changes stay uncommitted until the user asks.

## Review Focus

- A card becomes a leech only when a lapse takes it to 5 or more, not on a first review, a pass, or every later review; a returned card does not re-suspend on a pass but does on its next lapse.
- A suspended leech is absent from the review queue, the due count and review sessions; leeches and notes of another user are never visible or editable.
- Quick add rejects an empty lemma or translation, an unknown level or part of speech, a topic of another language, a lemma or answer over 100 characters, and a sentence without exactly one `___`; a failure leaves no word without its translation (atomic).
- Duplicate detection ignores surrounding spaces and letter case (`" Maize "` duplicates `maize`).
- A hand-added sentence survives a re-run of the dataset loader, and the loader still updates generated ones.

---

## File Structure

Worker:
- Create `worker/migrations/0009_notes_and_word_source.sql`.
- Create `worker/src/repositories/leeches.ts` (list, unsuspend, notes), `worker/src/repositories/manual.ts` (insert word, sentence, topic options, duplicate lookup).
- Create `worker/src/services/leeches.ts`, `worker/src/services/manual.ts`, `worker/src/routes/leeches.ts`, `worker/src/routes/manual.ts`; modify `worker/src/app.ts`.
- Modify `worker/src/services/study.ts` (leech marking), `worker/src/services/review.ts` and `worker/src/repositories/cards.ts` (leech count).
- Tests: `worker/test/leeches.test.ts`, `worker/test/manual.test.ts`; extend `schema.test.ts`, `study.test.ts`, `review.test.ts`.

Data: modify `data/pipeline/load_words.py`, `data/pipeline/tests/test_load_words.py`.

Web (`web/src`):
- Modify `api/study.ts` (leeches in `ReviewSummary`); create `api/leeches.ts`, `api/manual.ts`.
- Create `pages/LeechPage.tsx`, `pages/StatsPage.tsx`, `pages/AddPage.tsx`; modify `App.tsx`, `pages/HomePage.tsx`; delete the Add/Stats `ComingSoonPage` uses for Add (Stats becomes `StatsPage` with the workshop link and "Coming soon" for the charts).
- Tests: `pages/leeches.test.tsx`, `pages/add.test.tsx`; update `App.test.tsx`, `pages/home.test.tsx`.

---

### Task 1: Migration `0009`

**Files:** Create `worker/migrations/0009_notes_and_word_source.sql`; Modify `worker/test/schema.test.ts`

**Interfaces:** Produces `word_notes(user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE, word_id INTEGER NOT NULL REFERENCES words ON DELETE CASCADE, mnemonic TEXT NOT NULL DEFAULT '', similar_word TEXT NOT NULL DEFAULT '', PRIMARY KEY (user_id, word_id))`; `words.source TEXT NOT NULL DEFAULT 'dataset' CHECK (source IN ('dataset','manual'))`.

- [ ] **Step 1: Failing tests** in `schema.test.ts`: `word_notes` is in the table list; a note row can be inserted once per (user, word) and a second insert for the same pair throws; deleting the word or the user deletes the note; a word has `source = 'dataset'` by default, accepts `'manual'`, rejects `'other'` with `/CHECK/`.
- [ ] **Step 2: Run** `cd worker && npx vitest run test/schema.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4: Run** the same command. Expected: PASS.

### Task 2: Mark leeches in the answer flow (stage 24)

**Files:** Modify `worker/src/services/study.ts`, `worker/src/repositories/cards.ts`, `worker/src/services/review.ts`; Test `worker/test/study.test.ts`, `worker/test/review.test.ts`, `worker/test/cards.test.ts`

**Interfaces:**
- `answerCard`: after computing `updated`, if `updated.lapses > (stored?.card.lapses ?? 0) && isLeech(updated)` then the upserted flags are `{ suspended: true, leech: true }`, otherwise the stored flags are kept. `AnswerView` gains `leech: boolean` (true on the review that made it a leech).
- `repositories/cards.ts`: `countLeeches(db, p: { userId; deckId; targetLang }): Promise<number>` — cards with `leech = 1` whose word has a visible translation.
- `ReviewSummary` gains `leeches: number`.

- [ ] **Step 1: Failing tests.** `study.test.ts`: a review-state production card with `lapses: 4` answered wrong gets `lapses 5`, `leech 1`, `suspended 1`, the answer reports `leech: true`, and the card is then absent from `GET /review` and from a new review session; the same card with `lapses: 3` answered wrong (→ 4) is not flagged; a card with `lapses: 6` already unsuspended with `leech 0` answered correctly is not flagged again; the same card answered wrong (→ 7) is flagged again; a first review (no stored card) answered `again` is not flagged. `review.test.ts`: `leeches` counts only the current user's leech cards. `cards.test.ts`: `countLeeches` ignores cards without a visible translation.
- [ ] **Step 2: Run** `npx vitest run test/study.test.ts test/review.test.ts test/cards.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit` in `worker/`. Expected: PASS.

### Task 3: Leech Workshop API (stage 24)

**Files:** Create `worker/src/repositories/leeches.ts`, `worker/src/services/leeches.ts`, `worker/src/routes/leeches.ts`; Modify `worker/src/app.ts`; Test `worker/test/leeches.test.ts`

**Interfaces:**
- `GET /api/decks/:deck/leeches` → `LeechItem[]` where `LeechItem = { cardId: number; wordId: number; kind: 'recognition'|'production'|'cloze'; lapses: number; lemma: string; pos: string; translation: string; textWithGap: string | null; hint: string | null; mnemonic: string; similarWord: string }` (`textWithGap`/`hint` set for cloze cards), ordered by `lapses DESC, id`, only the current user's cards with `leech = 1`, words with a visible translation.
- `PUT /api/decks/:deck/words/:wordId/notes` body `{ mnemonic?: string, similarWord?: string }` (each ≤ 500 characters, omitted fields keep their value) → `{ mnemonic, similarWord }`. 404 `word_not_found` when the word is not in the deck's language; 400 `invalid_notes` otherwise bad.
- `POST /api/decks/:deck/cards/:cardId/unsuspend` → `{ cardId }`, clears `suspended` and `leech`; 404 `card_not_found` for a card of another user, deck or a missing id; a card that is not a leech is also 404.
- Error shape `{ error: code }`, status map in the route file, like `routes/study.ts`.

- [ ] **Step 1: Failing tests** in `leeches.test.ts`: list returns the two leech cards of the user with lemma, translation, notes (empty strings when none), cloze item carries `textWithGap` and `hint`, ordering by lapses; another user's leech and a non-leech are absent; notes PUT creates then updates, keeps an omitted field, rejects 501 characters, 404 for a word of another language; unsuspend clears both flags and the card is due again in `GET /review`; unsuspend of another user's card, a missing card and a non-leech card is 404; all three endpoints return 401 without a login and 404 for an unknown deck.
- [ ] **Step 2: Run** `npx vitest run test/leeches.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** repository (SQL only), service (validation, error codes), routes, and mount in `app.ts`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.

### Task 4: Quick add API (stage 25)

**Files:** Create `worker/src/repositories/manual.ts`, `worker/src/services/manual.ts`, `worker/src/routes/manual.ts`; Modify `worker/src/app.ts`; Test `worker/test/manual.test.ts`

**Interfaces:**
- `GET /api/decks/:deck/topic-options` → `{ id: number; slug: string; title: string; titleUk: string }[]` — all topics of the deck's source language (including empty ones), ordered by id.
- `POST /api/decks/:deck/words` body `{ lemma: string; translation: string; pos: string; topicId: number; level?: 'A1'|'A2'|'B1'|'B2'; sentence?: { textWithGap: string; answer: string; hint: string } }` → 201 `{ wordId: number }`. Trims `lemma`, `translation`, sentence fields; `level` defaults to `A2`; `pos` must be one of `noun verb adj adv num pron phrase propn prep conj part interj`. Inserts the word (`source 'manual'`), its approved `uk` translation (`target_lang` of the deck) and, when given, an approved manual sentence in one `db.batch`. Errors: 400 `invalid_word` (empty or over-long field, bad level or pos, sentence without exactly one `___`, empty sentence answer or hint), 404 `topic_not_found` (topic missing or of another language), 409 `duplicate_word` (same lang, lemma compared case-insensitively after trimming, and pos), 404 `deck_not_found`.
- `POST /api/decks/:deck/words/:wordId/sentences` body `{ textWithGap; answer; hint }` → 201 `{ sentenceId: number }`, same sentence validation, 404 `word_not_found` for a word of another language; the sentence is manual and approved.
- `repositories/manual.ts` exports `insertManualSentenceStatement(db, wordId, targetLang, s)` used by both services.

- [ ] **Step 1: Failing tests** in `manual.test.ts`: success returns 201 and the word appears in `GET /topics/:id/words` with its translation, source `manual`, and in a new topic session as a new word; level defaults to A2 and an explicit `B1` is kept; with a sentence both sentence and translation exist and the sentence has `source 'manual'`; duplicate (`" Maize "` after `maize`, same pos) is 409 while the same lemma with another pos is accepted; each invalid input in the Review Focus list returns its 400 or 404 and leaves no rows in `words`, `translations` or `sentences`; a lemma of 101 characters is 400; `topic-options` lists an empty topic; the sentence endpoint adds a second sentence to an existing word, and after the word's production answer passes the new sentence also gets a cloze card; both endpoints 401 without a login.
- [ ] **Step 2: Run** `npx vitest run test/manual.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The word insert and its translation must be atomic: use `db.batch` with the translation statement selecting the new word id by its unique (lang, lemma, pos) key.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.

### Task 5: Loader keeps hand-added sentences (data)

**Files:** Modify `data/pipeline/load_words.py`, `data/pipeline/tests/test_load_words.py`

**Interfaces:** The generated SQL's sentence insert and update statements apply only to rows with `source = 'generated'`: the `NOT EXISTS` check becomes `NOT EXISTS (SELECT 1 FROM sentences WHERE word_id = … AND source = 'generated')` and the `UPDATE` gets `AND source = 'generated'`.

- [ ] **Step 1: Failing test:** after loading, insert a manual sentence for a word, load again with a changed generated sentence: the manual row is unchanged, the generated row has the new text, and a word that only has a manual sentence still gets its generated one on load.
- [ ] **Step 2: Run** `python3 -I -m unittest discover -s data/pipeline/tests`. Expected: FAIL.
- [ ] **Step 3: Change the SQL builder.**
- [ ] **Step 4: Run** the same command. Expected: PASS.

### Task 6: Leech Workshop page and links (stage 24)

**Files:** Create `web/src/api/leeches.ts`, `web/src/pages/LeechPage.tsx`, `web/src/pages/StatsPage.tsx`, `web/src/pages/leeches.test.tsx`; Modify `web/src/api/study.ts`, `web/src/App.tsx`, `web/src/pages/HomePage.tsx`, `web/src/pages/home.test.tsx`, `web/src/App.test.tsx`

**Interfaces:**
- `api/leeches.ts`: `LeechItem` (as in Task 3), `fetchLeeches(deck)`, `saveNotes(deck, wordId, { mnemonic, similarWord })`, `addSentence(deck, wordId, { textWithGap, answer, hint })`, `unsuspend(deck, cardId)`.
- `ReviewSummary` gains `leeches: number`.
- Routes: `/stats` → `StatsPage` (heading "Stats", a link "Leech Workshop" with the leech count when it is above 0, and "Coming soon" for the charts); `/stats/leeches` → `LeechPage`. Home shows a link "Leech Workshop · n" to `/stats/leeches` only when `leeches > 0`.
- `LeechPage`: heading "Leech Workshop"; "No leeches. Nothing is stuck." when empty; per item: the lemma (for production and cloze cards the lemma is shown too, since the point is to study it), translation, "Failed n times", cloze sentence when present; fields "Mnemonic", "Confused with" and a "Stronger sentence" group ("Sentence with ___", "Missing word", "Translation") ; buttons "Save notes" (saves notes, and adds the sentence when all three sentence fields are filled, then clears them and shows "Saved") and "Return to queue" (saves unsaved notes first, then unsuspends and removes the item).

- [ ] **Step 1: Failing tests** (`leeches.test.tsx`): empty state; an item shows lemma, translation, count and existing notes; Save sends `PUT notes` with both fields; a filled sentence group also posts the sentence, a half-filled one shows "Fill all three sentence fields" and sends nothing; Return to queue posts `unsuspend` and removes the item; a failed save shows an alert and keeps the item. `home.test.tsx`: the link shows with a count and is absent at 0. `App.test.tsx`: the Stats tab shows the workshop link and the page is reachable.
- [ ] **Step 2: Run** `cd web && npx vitest run src/pages/leeches.test.tsx src/pages/home.test.tsx src/App.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npm run typecheck` in `web/`. Expected: PASS.

### Task 7: Add page (stage 25)

**Files:** Create `web/src/api/manual.ts`, `web/src/pages/AddPage.tsx`, `web/src/pages/add.test.tsx`; Modify `web/src/App.tsx`, `web/src/App.test.tsx` (the Add placeholder test)

**Interfaces:**
- `api/manual.ts`: `TopicOption`, `fetchTopicOptions(deck)`, `addWord(deck, input)` with the Task 4 body; `ApiError` codes surface to the page.
- `AddPage`: heading "Add"; fields "Latvian" (label from the deck's source language, via `languageName`), "Ukrainian", a part-of-speech select (default `noun`), a topic select (from topic options, remembered in `localStorage` key `add.topic`, falling back to the first), a level select (default A2); a "Sentence (optional)" `details` with "Sentence with ___", "Missing word" and "Translation" (all three or none); a primary "Add word" button, disabled until Latvian and Ukrainian are filled. On success: "Added {lemma}" status, the text fields cleared, focus back on the Latvian field, topic/pos/level kept. Errors: `duplicate_word` → "{lemma} is already in your deck."; `invalid_word` → "Check the fields and try again."; other → "Could not add the word. Try again." Half-filled sentence → "Fill all three sentence fields." and nothing is sent.

- [ ] **Step 1: Failing tests:** default selections; options come from the deck's topics; the stored topic is preselected and a changed topic is stored; success posts the right body (`level: 'A2'`, trimmed text, no `sentence` key without one) and clears and refocuses; a filled sentence is sent as `sentence`; half-filled sentence blocks the request; the three error messages; the button is disabled while fields are empty and while sending (one request on a double click); the Latvian label follows the current deck.
- [ ] **Step 2: Run** `npx vitest run src/pages/add.test.tsx src/App.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** and route `/add` to `AddPage`.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run build` in `web/`. Expected: PASS.

### Task 8: Docs and full check

- [ ] **Step 1:** mark stages 24 and 25 `[DONE]` in `stages.md`, note the free-text "confused with", the `leeches` count on the review summary, the new endpoints and migration `0009`; update the Stats/Add notes written in stage 22.
- [ ] **Step 2: Run** `npm test`, `npm run lint`, `npm run build` at the root and `python3 -I -m unittest discover -s data/pipeline/tests`. Expected: all PASS.
