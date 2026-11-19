# Stages 20–21: Fuzzy Checker, Review Queue and Daily Cap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Typed answers are graded as `exact | typo | wrong` and mapped to FSRS grades; the Worker serves one review queue of due cards and runs topic sessions of new words under a daily cap of 15, all on the `cards` table; `progress` and the old scheduler are removed.

**Architecture:** Stage 20 changes the pure `lib/checker` and adds a pure `lib/grading` (verdict → grade). Stage 21 moves repositories and the study service from `progress` to `cards` (using `lib/fsrs` from stage 19), then drops `progress` in a new migration that first re-runs the conversion block of `0006_cards.sql`. Routes keep the layering: routes parse HTTP, services hold logic, repositories hold SQL.

**Tech Stack:** TypeScript, Hono, Cloudflare D1, Vitest (`getPlatformProxy` test D1 via `test/helpers/d1.ts`), `ts-fsrs` (already installed).

**Spec:** `stages.md` stages 20 and 21; `development_plan.md` sections 4 and 6.

## Global Constraints

- Grades: `again | hard | good | easy` = 1–4 in `review_log.grade`. Target retention 0.9 (already in `lib/fsrs.ts`).
- Checker: case-insensitive, trimmed. A match after stripping diacritics is always `typo`. Otherwise Levenshtein distance 1 is `typo` for words of 4–8 letters, 2 for words longer than 8. Words shorter than 4 letters have no edit tolerance (only the diacritic rule). The per-language rules table stays; the English case stays in the tests.
- Auto-grade: `exact` → Good, `typo` → Hard, `wrong` → Again. After an `exact` answer the user may raise it to Easy.
- Daily cap: 15 new words per deck per day, counted from each word's first `review_log` row, in the user's local day. Topic session size is 10.
- A new word starts as a recognition card. Its production card is created after the first recognition review that is not Again. A word answered wrong returns once at the end of the same session. Resume stays.
- Cloze cards, leech suspension and the frontend are NOT in this plan (stages 22–24). The web app calls the old API shape and will not work against the new endpoints until stage 22; `/api/streak` is untouched.
- Times are Unix seconds. Code, identifiers and docs in English. Comments only for non-obvious business logic.
- Finished changes stay uncommitted until the user asks for a commit; the commit steps give the message to use then.

## Review Focus

- An empty or whitespace-only typed answer is `wrong` (never `typo`), and a 3-letter word with one wrong letter is `wrong`.
- Length boundaries: 4 and 8 letters tolerate 1 edit, 9 letters tolerates 2, and the length is measured on the expected word.
- The daily cap uses the user's local day: reviews at 23:30 and 00:10 local fall on different days, also with a negative `tzOffset`; a word reviewed yesterday and again today counts only yesterday.
- The production card is created once: a second recognition review must not reset an existing production card.
- Raising to Easy is rejected after a `typo` or `wrong`, after the next card was already answered, and when done twice.

---

## File Structure

- Modify `worker/src/lib/checker.ts`: `checkAnswer` returns `{ verdict, diff }`.
- Create `worker/src/lib/grading.ts`: `gradeFromVerdict`, `GRADE_VALUES`.
- Modify `worker/src/repositories/cards.ts`: add queue, new-word, cap, count and production-card queries.
- Delete from `worker/src/repositories/study.ts`: progress and distractor queries; keep session-state and review-log statements (review log gains `kind`, `grade`).
- Modify `worker/src/repositories/topics.ts`: counts from `cards`.
- Rewrite `worker/src/services/study.ts`; create `worker/src/services/review.ts` (queue summary); modify `worker/src/routes/study.ts`.
- Create `worker/migrations/0007_drop_progress.sql`.
- Delete `worker/src/lib/scheduler.ts`, `worker/test/scheduler.test.ts`.
- Tests: rewrite `test/checker.test.ts`, `test/study.test.ts`; create `test/grading.test.ts`, `test/review.test.ts`; update `test/words.test.ts`, `test/schema.test.ts`, `test/cards-migration.test.ts`.
- Modify `stages.md` (note that the web app is rebuilt in stage 22).

---

### Task 1: Fuzzy checker (stage 20)

**Files:**
- Modify: `worker/src/lib/checker.ts`
- Test: `worker/test/checker.test.ts`

**Interfaces:**
- Produces: `type Verdict = 'exact' | 'typo' | 'wrong'`; `checkAnswer(typedText: string, expectedText: string, lang: string): { verdict: Verdict; diff: DiffItem[] }`. `CheckResult.correct` is removed. `DiffItem` is unchanged.

- [ ] **Step 1: Rewrite `checker.test.ts`.** A table `[typed, expected, lang, verdict]` covering: `maize/maize` exact; `maize/maizē` typo; `seit/šeit` typo; `loti/ļoti` typo; `  maize  /maize` exact; `Maize/maize` exact; `MAIZĒ/maizē` exact; `labā  diena/labā diena` exact; `maiz/maize` typo (distance 1, 5 letters); `maizee/maize` typo; `maizeee/maize` wrong; `''/maize` wrong; `'   '/maize` wrong; `ir/is` wrong (3 letters, no tolerance); `maja/mala` typo (4 letters, 1 edit); `skolotājs/skolotajs` typo (diacritic); `pārdevējs/pardevejs` typo (several diacritics); `pārdevējs/pārdevējz` typo (9 letters, 1 edit); `pārdevējs/pārdavējz` typo (9 letters, 2 edits); `pārdevējs/pārdavēgz` wrong (3 edits); 8-letter word with 2 edits wrong; `house/house` and `HOUSE/house` exact and `café/cafe` exact for `en`. Keep the tests that a decomposed `ā` equals the single character and that the diff has `diacritic`, `missing` and `extra` items (adapt to `.diff`). Test that an unknown language throws.
- [ ] **Step 2: Run** `cd worker && npx vitest run test/checker.test.ts`. Expected: FAIL (no `verdict`).
- [ ] **Step 3: Implement in `checker.ts`.** Compute `exact` as today's `correct` (folded equality). Otherwise `typo` if the case-folded strings are equal after `stripMarks`, else if plain Levenshtein distance between the folded, trimmed strings (diacritics kept) is within the tolerance for the expected word's letter count (spread length), `typo`; else `wrong`. Tolerance: length ≤ 3 → 0, 4–8 → 1, ≥ 9 → 2. Extract the tolerance as constants in the rules area. An empty typed string is always `wrong`. The diff code is unchanged.
- [ ] **Step 4: Keep the old study service compiling.** In `services/study.ts` `judge()` replace `checked.correct` with `checked.verdict === 'exact'`. Run `npx vitest run test/checker.test.ts` (PASS) then `npm test` in `worker/` (all pass; old study tests stay green because a typo is still "not correct" there).
- [ ] **Step 5: Commit** — `feat: fuzzy checker with exact, typo and wrong verdicts (stage 20)`

### Task 2: Auto-grade (stage 20)

**Files:**
- Create: `worker/src/lib/grading.ts`
- Test: `worker/test/grading.test.ts`

**Interfaces:**
- Consumes: `Verdict` from `lib/checker`, `Grade` from `lib/fsrs`.
- Produces: `gradeFromVerdict(verdict: Verdict): Grade` (exact → `good`, typo → `hard`, wrong → `again`); `GRADE_VALUES: Record<Grade, 1 | 2 | 3 | 4>`.

- [ ] **Step 1: Write the failing test** `grading.test.ts`: the three verdict mappings; `GRADE_VALUES` equals `{again:1, hard:2, good:3, easy:4}`; a typo review through `review()` from `lib/fsrs` on a review-state card gives a shorter `scheduledDays` than a good review of the same card (typo does not promote).
- [ ] **Step 2: Run** `npx vitest run test/grading.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `grading.ts`** as specified.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** — `feat: map checker verdicts to FSRS grades (stage 20)`

### Task 3: Card queries for the queue, new words and the cap

**Files:**
- Modify: `worker/src/repositories/cards.ts`
- Test: `worker/test/cards.test.ts`

**Interfaces:**
- Consumes: `StoredCard`, `CardKey` from the same file; `seedWord` from `test/helpers/d1.ts`.
- Produces (all in `repositories/cards.ts`):
  - `type DueCardRow = { cardId: number; wordId: number; kind: CardKind; sentenceId: number | null }`
  - `findDueCards(db, p: { userId; deckId; targetLang; now; limit; topicId?: number }): Promise<DueCardRow[]>` — unsuspended cards with `due_at <= now` whose word has an approved/edited translation; ordered by `due_at, id`.
  - `countDueCards(db, p: { userId; deckId; targetLang; now }): Promise<number>`
  - `findNewWordIds(db, p: { userId; deckId; topicId; targetLang; limit }): Promise<number[]>` — visible words of the topic with no card of the user in the deck, ordered A1, A2, B1 then id (the same `LEVEL_ORDER` as today).
  - `countNewWordsBetween(db, p: { userId; deckId; from: number; to: number }): Promise<number>` — words whose earliest `review_log.created_at` for the user and deck is in `[from, to)`.
  - `insertCardIfMissingStatement(db, key: CardKey, card: MemoryCard): D1PreparedStatement` — `INSERT … ON CONFLICT DO NOTHING`.

- [ ] **Step 1: Write the failing tests** in `cards.test.ts` (seed words and cards by direct SQL): due cards come oldest first and exclude suspended, future and pending-translation cards; `topicId` filter narrows to one topic; `countDueCards` matches; `findNewWordIds` skips words that already have any card and orders by level; `countNewWordsBetween` counts a word once when it has two logs, excludes a word whose first log is before `from`, and includes one at `from` but not at `to`; `insertCardIfMissingStatement` run twice leaves one row and does not overwrite an existing card's `reps`.
- [ ] **Step 2: Run** `npx vitest run test/cards.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the five functions.** Visibility join as in `repositories/study.ts` (`translations` with `review_status IN ('approved','edited')`). The cap query groups `review_log` by `word_id` with `MIN(created_at)` and filters in an outer query.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** — `feat: card queries for review queue, new words and daily cap (stage 21)`

### Task 4: Study service on cards, review queue endpoint

**Files:**
- Rewrite: `worker/src/services/study.ts`
- Create: `worker/src/services/review.ts`
- Modify: `worker/src/routes/study.ts`, `worker/src/repositories/study.ts` (log statement gets `kind`, `grade`; remove the progress and distractor functions), `worker/src/services/words.ts` only if types change
- Test: rewrite `worker/test/study.test.ts`; create `worker/test/review.test.ts`

**Interfaces:**
- Consumes: Task 1–3 functions; `review`, `newCard`, `isLearned`, `MemoryCard`, `Grade` from `lib/fsrs`; `localDay` from `lib/streak`; `listWordsByIds`; session-state statements.
- Produces (HTTP, all under `/api`, deck by slug):
  - `GET /decks/:deck/review` → `{ due: number; newToday: number; newCap: 15; cards: { cardId, wordId, kind }[] }` (cards limited to 100). `tzOffset` query as in `/streak` (integer minutes, `|x| ≤ 840`, default 0), else 400.
  - `POST /decks/:deck/sessions` with `{ topicId, tzOffset? }` → topic session of up to `min(10, 15 − newToday)` new words, status 201; or `{ review: true }` → session of up to 20 due cards (all topics, oldest first). Errors: `nothing_to_study` 409 (no new words, or no due cards), new `daily_cap_reached` 409 (cap used up while the topic still has new words), `topic_not_found` 404, `deck_not_found` 404, 400 for a body with neither `topicId` nor `review`.
  - `POST /sessions/:id/answer` body `{ cardIndex, grade? , typed? }` → `AnswerView = { grade: Grade; verdict?: Verdict; correct: boolean; expected: string; diff?: DiffItem[]; learned: boolean; canRaise: boolean; finished: boolean; next: CardView | null; summary?: { cards; correct; wrong } }`. `grade` (one of the four) is required for `recognition` cards; `typed` (string) for `production` cards; otherwise `bad_answer` 400. `correct` = grade is not `again`. `canRaise` is true only for a typed `exact` answer.
  - `CardView = { index; kind: 'recognition' | 'production'; retry; wordId; pos; translation; lemma?; grammar? }` — `lemma` and `grammar` only for recognition (the production card must not leak the answer).
  - `GET /decks/:deck/sessions/current` unchanged in shape (`SessionView` with the new `CardView`).
- Session payload cards are `{ wordId, kind, retry }`; the multiple-choice code (`optionIds`, `ensureOptions`, `MODES`, `findDistractorIds`) is deleted.
- `review_log.mode` is NOT NULL with a CHECK, so store `flip` for recognition, `write` for production (no table rebuild); also store `kind` and `grade` (1–4).

- [ ] **Step 1: Write the failing tests.** Helper `seedCard(wordId, kind, {state, dueAt, stability, …})` replaces `seedProgress`. In `study.test.ts` cover:
  - topic session: 10 new words, level order A1 then A2, first card kind `recognition`, a production card view has no `lemma`; fewer than 10 words returns fewer; a topic whose words all have cards gives `nothing_to_study`; pending-translation words are excluded.
  - cap: with 15 first-reviews already logged today → `daily_cap_reached`; with 10 used → session of 5; first reviews logged yesterday (local day, check with `tzOffset` 0 and with `tzOffset: -300` and `540` at a timestamp that crosses local midnight) do not count; a word reviewed yesterday and today counts only yesterday.
  - review session (`{review:true}`): due cards from two topics, oldest due first, suspended excluded; no due cards → `nothing_to_study`.
  - answering a recognition card with `good`: a recognition `cards` row exists with FSRS state ≠ 0, a production card row is created with `due_at` equal to the recognition card's new `due_at`; with `again`: no production card, and the card returns once at the end (`retry: true`), but not a second time on a second miss.
  - a second recognition `good` does not change an existing production card (seed one with `reps: 5`, assert unchanged).
  - production card: `typed` exact → grade `good`, `canRaise: true`; `maize` for `maizē` → verdict `typo`, grade `hard`, `canRaise: false`, no retry; far miss → `wrong`, grade `again`, retry queued; `bad_answer` when `typed` is missing on a production card or `grade` is missing / `'medium'` on a recognition card.
  - `review_log` row has `kind`, `grade`, `mode`, `typed_answer`.
  - `learned` is true in the answer when the production card ends in review state with stability ≥ 21 (seed a card at stability 40 and answer `good`).
  - resume: `GET sessions/current` after a few answers returns the same card; a finished session deletes `session_state`; `stale_card` on a wrong `cardIndex`.
  - `review.test.ts`: `GET /review` counts and lists due cards across topics, reports `newToday` and `newCap: 15`, honours `tzOffset`, returns 400 for `tzOffset=abc`, 404 for an unknown deck, 401 without a cookie.
- [ ] **Step 2: Run** `npx vitest run test/study.test.ts test/review.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `startSession` builds the card list as described and stores the payload; new words become recognition cards (the `cards` row is created on the first answer by upserting `newCard(now)` reviewed with the grade). `answerCard`: load the stored card (or `newCard`), compute grade (recognition: input; production: `gradeFromVerdict(checkAnswer(...).verdict)`), call `review`, and `db.batch` the card upsert (`upsertCardStatement`, keeping existing `suspended`/`leech` flags), the production-card insert when the card is a recognition card with a non-`again` grade (`insertCardIfMissingStatement` with `newCard` whose `dueAt` is the recognition card's new `dueAt`), the review-log insert, and the session-state write. The day-boundary helper for the cap: `dayStart = localDay(now, tz) * 86400 − tz * 60`, window `[dayStart, dayStart + 86400)`; put it as a small exported function `localDayWindow(now, tzOffsetMinutes)` in `lib/streak.ts` and unit-test it in `test/streak.test.ts`. `routes/study.ts` adds `daily_cap_reached: 409` to its status map and the review route (in `services/review.ts`).
- [ ] **Step 4: Run** the same command, then `npm test`. Expected: PASS (suites for topic counts still use `progress` until Task 5).
- [ ] **Step 5: Commit** — `feat: study sessions and review queue on FSRS cards with daily cap (stage 21)`

### Task 5: Topic counts from cards

**Files:**
- Modify: `worker/src/repositories/topics.ts`
- Test: `worker/test/words.test.ts`

**Interfaces:**
- Consumes: `LEARNED_STABILITY_DAYS` from `lib/fsrs`.
- Produces: `listTopicLevelCounts` keeps its signature and row type (`learned_count`, `learning_count`), now derived from `cards`: **learned** = the word's production card is in state 2 with `stability >= 21`; **learning** = the word has a recognition card and is not learned; **new** = the remainder (unchanged arithmetic in `services/words.ts`).

- [ ] **Step 1: Update the failing tests** in `words.test.ts`: replace `progress` seeding with cards. Cases: a word with only a recognition card counts as learning; recognition + production card at stability 25 in review state counts as learned; production at stability 10 counts as learning; a word with no cards counts as new; another user's cards are ignored; a suspended card still counts (it is not new).
- [ ] **Step 2: Run** `npx vitest run test/words.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** with two `LEFT JOIN cards` (alias `rec` on kind `recognition`, `prod` on kind `production`, both with `sentence_id IS NULL` and the user and deck), inserting the stability constant into the SQL.
- [ ] **Step 4: Run** `npx vitest run test/words.test.ts` then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat: topic counts from cards (stage 21)`

### Task 6: Drop `progress` and the old scheduler

**Files:**
- Create: `worker/migrations/0007_drop_progress.sql`
- Delete: `worker/src/lib/scheduler.ts`, `worker/test/scheduler.test.ts`
- Modify: `worker/test/schema.test.ts`, `worker/test/cards-migration.test.ts`, `stages.md`

**Interfaces:**
- Produces: migration `0007` that (1) repeats the `-- convert progress` block of `0006_cards.sql` verbatim, (2) `DROP TABLE progress`. `review_log`, `session_state` and `cards` are untouched.

- [ ] **Step 1: Update the tests first.** `schema.test.ts`: remove `progress` from the expected table list and any progress-specific cases. `cards-migration.test.ts`: it currently builds progress rows and runs the conversion; make it apply migrations only up to `0006`, insert progress rows, then run `0007` and assert (a) the conversion results it already asserts, (b) reviews made on `progress` after `0006` (changed `reps`/`interval_days` for an existing converted card) are reflected after `0007`, (c) `progress` no longer exists. Read the file first and follow its existing pattern for applying a subset of migrations.
- [ ] **Step 2: Run** `npx vitest run test/schema.test.ts test/cards-migration.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write `0007_drop_progress.sql`**, delete `lib/scheduler.ts` and its test, and run `grep -rn "scheduler'\|progress" worker/src worker/test` to confirm nothing else references them (the comment in `0006` is fine). Note in `stages.md` stage 21 that the web app is rebuilt in stage 22 and calls the new API only from then on.
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit` in `worker/`, and `npm run lint` at the root if configured. Expected: all PASS, no type errors.
- [ ] **Step 5: Commit** — `feat: drop progress table and old scheduler (stage 21)`

### Task 7: Easy raise after an exact answer

**Files:**
- Modify: `worker/src/services/study.ts`, `worker/src/routes/study.ts`, `worker/src/repositories/study.ts` (return the new `review_log` row id; add `updateReviewLogGradeStatement`)
- Test: `worker/test/study.test.ts`

**Interfaces:**
- Consumes: Task 4 payload and `answerCard`.
- Produces: `POST /sessions/:id/easy` (no body) → `{ grade: 'easy'; learned: boolean }`; error codes `not_raisable` 409 (new, added to `StudyErrorCode` and the route status map) and `session_not_found` 404. The session payload gains `lastExact?: { cardRowId; kind; before: MemoryCard; logId: number; index: number }`, set after an `exact` typed answer and cleared by any later answer.

- [ ] **Step 1: Write the failing tests:** after an exact production answer, `POST /sessions/:id/easy` updates the card to the Easy review of the state before the answer (compare with `review(before, 'easy')`), sets the log row's `grade` to 4, and returns `learned`; after a `typo` or `wrong` it returns 409 `not_raisable`; calling it twice returns 409; calling it after the next card was answered returns 409; it works after a resume (payload persisted).
- [ ] **Step 2: Run** `npx vitest run test/study.test.ts -t easy`. Expected: FAIL.
- [ ] **Step 3: Implement** the endpoint: recompute the card from `lastExact.before` with grade `easy`, upsert it (keeping flags), update the log grade, clear `lastExact`, write the payload. The answer step stores `lastExact` only for typed `exact` answers and the log id comes from the batch result's `meta.last_row_id` for the log statement.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat: raise an exact typed answer to Easy (stage 21)`
