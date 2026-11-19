# Stage 19: FSRS Cards and Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `cards` table, a pure FSRS scheduler (`ts-fsrs`) with four grades, and a migration of existing `progress` rows into cards, without breaking the running app.

**Architecture:** `cards` and the new scheduler are added next to the old `progress` table and `lib/scheduler.ts`. The study service, topic counts and web app keep using `progress` until stage 21 switches them to `cards` and drops `progress`. The new scheduler is a separate pure module (`lib/fsrs.ts`) with no I/O; a small repository module maps card rows to and from it.

**Tech Stack:** TypeScript, Cloudflare D1 (SQLite), Vitest, `ts-fsrs` ^5.4.2 (5.x because it supports the Node 22 used here; 6.x requires Node 24 and marks most types deprecated).

**Spec:** `stages.md` (stage 19 and "Learning mechanics v2") and `development_plan.md` section 4 and section 6.

## Global Constraints

- Grades are `again | hard | good | easy` (FSRS ratings 1–4). Target retention 0.9. Fuzz off.
- Card `kind` is `recognition | production | cloze`. Unique on (user, deck, word, kind, sentence).
- **Learned** = the production card is in review state with stability of at least 21 days.
- Leech threshold = 5 lapses on one card.
- Times are Unix seconds (integers), like the rest of the schema.
- Code, identifiers and docs in English. Comments only for non-obvious business logic.
- Finished changes stay uncommitted until the user asks for a commit. The commit steps below are the commit message to use when the user asks.
- `progress`, `lib/scheduler.ts`, `lib/checker.ts` and the study service are not changed in this stage, except the extra `review_log` columns, which must not break the current inserts.

## Review Focus

- A migration run on a database with no `progress` rows creates no cards and does not fail.
- A `progress` row whose word was deleted is gone with it (cascade), and the migration leaves no orphan cards.
- A word at stage 1 with `reps = 0` (never answered correctly) still gets a recognition card, due when its progress was due.
- Reviewing a card far past its due date (a missed month) still returns a finite, later due date and a stability above zero.
- `again` on a `new` card enters learning with a short due time (minutes), not days.
- Running the migration SQL twice changes nothing (idempotent conversion).

---

## File Structure

- Create `worker/migrations/0006_cards.sql`: `cards` table, index, `review_log` columns, conversion of `progress`.
- Create `worker/src/lib/fsrs.ts`: pure scheduler wrapper: types `Grade`, `CardState`, `MemoryCard`, functions `newCard`, `review`, `isLearned`, `isLeech`.
- Create `worker/src/repositories/cards.ts`: `findCard`, `upsertCardStatement`, row ↔ `MemoryCard` mapping.
- Create `worker/test/fsrs.test.ts`, `worker/test/cards.test.ts`, `worker/test/cards-migration.test.ts`.
- Modify `worker/package.json` (dependency), `worker/test/schema.test.ts` (table list, cascade).
- Modify `stages.md` (stage 19 text: `progress` is dropped in stage 21, not here).

---

### Task 1: `cards` table and `review_log` columns

**Files:**
- Create: `worker/migrations/0006_cards.sql`
- Modify: `worker/test/schema.test.ts`

**Interfaces:**
- Produces: table `cards(id INTEGER PK, user_id, deck_id, word_id, kind TEXT, sentence_id INTEGER NULL, state INTEGER, due_at INTEGER, stability REAL, difficulty REAL, scheduled_days REAL, learning_steps INTEGER, reps INTEGER, lapses INTEGER, last_review_at INTEGER NULL, suspended INTEGER, leech INTEGER)`; `review_log.kind TEXT NULL`, `review_log.grade INTEGER NULL`.

- [ ] **Step 1: Write the failing tests** in `worker/test/schema.test.ts`: add `'cards'` to the expected table list; add a test `rejects a duplicate card for the same word, kind and sentence` (two inserts of the same (user, deck, word, 'recognition', NULL sentence) must throw, including when `sentence_id` is NULL); add a test `rejects an unknown kind`; extend the cascade test so `cards` is also empty after the word is deleted; add a test that `review_log` accepts `kind` and `grade` and rejects `grade = 5`.
- [ ] **Step 2: Run** `cd worker && npx vitest run test/schema.test.ts`. Expected: FAIL (`cards` missing).
- [ ] **Step 3: Write `0006_cards.sql`.** `state` is the FSRS state (0 new, 1 learning, 2 review, 3 relearning) with a CHECK. `kind` has a CHECK. `UNIQUE` cannot cover a NULL `sentence_id`, so use a unique index on `(user_id, deck_id, word_id, kind, COALESCE(sentence_id, 0))`. Foreign keys: user and word `ON DELETE CASCADE`, deck plain, `sentence_id` references `sentences(id) ON DELETE CASCADE`. Index `idx_cards_due ON cards(user_id, deck_id, due_at)`. `suspended` and `leech` are 0/1 with CHECKs. `ALTER TABLE review_log ADD COLUMN kind TEXT CHECK (kind IN ('recognition','production','cloze'))` and `ADD COLUMN grade INTEGER CHECK (grade BETWEEN 1 AND 4)`. Do not touch the existing `mode` column or its CHECK.
- [ ] **Step 4: Run** `npx vitest run test/schema.test.ts`. Expected: PASS. Then run `npm test` in `worker/`; expected: all existing suites still pass.
- [ ] **Step 5: Commit** — `feat: add cards table for FSRS state (stage 19)`

---

### Task 2: Pure FSRS scheduler

**Files:**
- Create: `worker/src/lib/fsrs.ts`
- Test: `worker/test/fsrs.test.ts`
- Modify: `worker/package.json` (run `npm install ts-fsrs@^5.4.2 -w worker`)

**Interfaces:**
- Produces:
  - `type Grade = 'again' | 'hard' | 'good' | 'easy'`
  - `type CardState = 0 | 1 | 2 | 3`
  - `type MemoryCard = { state: CardState; dueAt: number; stability: number; difficulty: number; scheduledDays: number; learningSteps: number; reps: number; lapses: number; lastReviewAt: number | null }`
  - `newCard(now: number): MemoryCard` (state 0, due `now`, zeros, `lastReviewAt` null)
  - `review(card: MemoryCard, grade: Grade, now: number): MemoryCard`
  - `isLearned(production: MemoryCard | null): boolean`
  - `isLeech(card: MemoryCard): boolean`
  - constants `LEARNED_STABILITY_DAYS = 21`, `LEECH_LAPSES = 5`, `REQUEST_RETENTION = 0.9`.

- [ ] **Step 1: Install** `ts-fsrs` and check `npm ls ts-fsrs` shows 5.4.x.
- [ ] **Step 2: Write the failing tests** in `fsrs.test.ts`, with `NOW = 1_800_000_000` and `DAY = 86_400`:
  - `newCard` returns state 0, `dueAt === NOW`, `reps === 0`, `lastReviewAt === null`.
  - `review(newCard, 'good')` has `reps === 1`, `stability > 0`, `lastReviewAt === NOW`, `dueAt > NOW`.
  - `review(newCard, 'again')` has state 1 (learning) and `dueAt - NOW` below one hour.
  - Interval order for a card reviewed on the same day: `dueAt` for `easy` > `good` > `hard` (use a card that has already had one `good` review, reviewed again a day later).
  - A lapse: take a review-state card (`state === 2`), call `again`; result has state 3, `lapses` one higher, `stability` lower than before.
  - Late review: a review-state card due `NOW`, reviewed at `NOW + 60 * DAY` with `good`; `dueAt > NOW + 60 * DAY`, `Number.isFinite(stability)`.
  - `isLearned`: `null` → false; review state with stability 20.9 → false; review state with stability 21 → true; learning state with stability 30 → false.
  - `isLeech`: lapses 4 → false, 5 → true.
  - Determinism: the same card, grade and time give an identical result on two calls (fuzz is off).
- [ ] **Step 3: Run** `npx vitest run test/fsrs.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 4: Implement `lib/fsrs.ts`.** Build one scheduler with `fsrs({ request_retention: 0.9, enable_fuzz: false })`. Convert `MemoryCard` to the library card with `new Date(seconds * 1000)` for `due` and `last_review`, map `again/hard/good/easy` to `Rating.Again/Hard/Good/Easy`, call `scheduler.next(card, new Date(now * 1000), rating)`, and convert `.card` back to seconds (round `dueAt` to an integer). Follow the installed ts-fsrs types for the exact card fields (some versions carry `elapsed_days`; it is derived and not stored).
- [ ] **Step 5: Run** `npx vitest run test/fsrs.test.ts`. Expected: PASS. Then `npm run typecheck` in `worker/`.
- [ ] **Step 6: Commit** — `feat: add pure FSRS scheduler wrapper (stage 19)`

---

### Task 3: Card repository

**Files:**
- Create: `worker/src/repositories/cards.ts`
- Test: `worker/test/cards.test.ts`

**Interfaces:**
- Consumes: `MemoryCard`, `newCard` from `lib/fsrs.ts`; `createTestD1`, `seedWord`, `seedUser` from `test/helpers/d1.ts`.
- Produces:
  - `type CardKind = 'recognition' | 'production' | 'cloze'`
  - `type CardKey = { userId: number; deckId: number; wordId: number; kind: CardKind; sentenceId: number | null }`
  - `type StoredCard = CardKey & { id: number; card: MemoryCard; suspended: boolean; leech: boolean }`
  - `findCard(db: D1Database, key: CardKey): Promise<StoredCard | null>`
  - `upsertCardStatement(db: D1Database, key: CardKey, card: MemoryCard, flags: { suspended: boolean; leech: boolean }): D1PreparedStatement`

- [ ] **Step 1: Write the failing tests** in `cards.test.ts` (D1 via `createTestD1`, one seeded user, word and deck 1):
  - `findCard` returns `null` for a missing card.
  - Insert through `upsertCardStatement(...).run()`, then `findCard` returns an equal `MemoryCard` (all fields round-trip, including `lastReviewAt: null`).
  - Upserting the same key twice updates in place: one row, new values.
  - A cloze card key with a `sentenceId` and a recognition card key with `sentenceId: null` for the same word are two different rows.
  - Upserting the same recognition key (null sentence) twice still gives one row (the NULL case of the unique index).
- [ ] **Step 2: Run** `npx vitest run test/cards.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use `INSERT ... ON CONFLICT` against the unique index expression `(user_id, deck_id, word_id, kind, COALESCE(sentence_id, 0))`. `findCard` matches `sentence_id IS ?` so that NULL compares correctly. Flags map to 0/1.
- [ ] **Step 4: Run** `npx vitest run test/cards.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat: add card repository (stage 19)`

---

### Task 4: Convert `progress` rows into cards

**Files:**
- Modify: `worker/migrations/0006_cards.sql` (append the conversion)
- Test: `worker/test/cards-migration.test.ts`

**Interfaces:**
- Consumes: the `cards` table from Task 1; `createMigratedDb` is not enough here because the data must exist before migration 0006, so the test applies migrations `0001`–`0005`, inserts `progress` rows, then runs `0006` (add a helper `createDbAtMigration(lastFile: string)` in `test/helpers/db.ts` that applies files up to and including `lastFile`, and a second helper or parameter to apply the remaining files).
- Produces: for each `progress` row, a recognition card, plus a production card when `stage >= 2`.

Conversion rules (decide nothing else): `stage = 1` → recognition only; `stage 2 or 3` → recognition and production. `due_at`, `reps`, `lapses`, `last_reviewed_at` copy over. `scheduled_days = interval_days`. State: `reps = 0` → 1 (learning); `reps > 0` → 2 (review). `stability = MAX(interval_days, 0.5)` for review state and `0.5` for learning state. `difficulty = 11 - (ease - 1.3) / (2.5 - 1.3) * 5`, clamped to 1–10 (ease 2.5 → 6, ease 1.3 → 10, high ease → low difficulty); `learning_steps = 0`. `suspended = 0`, `leech = 0`.

- [ ] **Step 1: Write the failing tests:**
  - No `progress` rows → `SELECT COUNT(*) FROM cards` is 0 and the migration does not throw.
  - Stage 1 row with `reps = 0` → exactly one recognition card, state 1, due equal to the progress `due_at`.
  - Stage 3 row with `interval_days = 12`, `reps = 4`, `lapses = 1` → a recognition and a production card, both state 2, `scheduled_days = 12`, `stability = 12`, `lapses = 1`.
  - Stage 2 row with `ease = 1.3` → difficulty 10 on both cards (clamp holds).
  - A `progress` row for another user does not leak into the first user's cards (cards carry the right `user_id`).
  - Re-running the conversion statements alone on the migrated database (extract them from the file by a marker comment `-- convert progress` and execute again) leaves the card count unchanged (`INSERT OR IGNORE`).
  - Every converted card is reachable from `findCard`-style lookup: its `(user_id, deck_id, word_id, kind)` is unique.
- [ ] **Step 2: Run** `npx vitest run test/cards-migration.test.ts`. Expected: FAIL.
- [ ] **Step 3: Append the conversion to `0006_cards.sql`** under a `-- convert progress` comment: two `INSERT OR IGNORE INTO cards ... SELECT ... FROM progress` statements (recognition for all rows, production `WHERE stage >= 2`) implementing the rules above. Keep the `progress` table and its data untouched.
- [ ] **Step 4: Run** `npx vitest run test/cards-migration.test.ts` and then `npm test`. Expected: PASS everywhere.
- [ ] **Step 5: Commit** — `feat: convert progress rows into FSRS cards (stage 19)`

---

### Task 5: Docs and final check

**Files:**
- Modify: `stages.md` (stage 19 text), `README.md` (nothing about `cards` is needed; skip unless a command changed)

- [ ] **Step 1:** In `stages.md` stage 19, replace "then drop `progress`" with: "keep `progress` and the old scheduler until stage 21 moves the study service, topic counts and web app to `cards`; stage 21 drops `progress`." Add to stage 21's task list: "Move `findDueWords`, `findNewWordIds`, `listTopicLevelCounts` and the answer flow to `cards`; delete `lib/scheduler.ts`, the `progress` table (migration) and `learned` handling."
- [ ] **Step 2: Run** from the repo root: `npm test`, `npm run typecheck`, `npm run lint`. Expected: all pass.
- [ ] **Step 3: Apply** `npm run db:migrate:local` against the local database and check `npx wrangler d1 execute latvian-words --local --command "SELECT kind, COUNT(*) FROM cards GROUP BY kind"` matches the number of local `progress` rows (one recognition per row, one production per row with stage ≥ 2).
- [ ] **Step 4: Commit** — `docs: stage 19 keeps progress until stage 21`

---

## Self-review

- **Spec coverage:** cards table and review_log columns (Task 1); FSRS wrapper with four grades, retention 0.9, fuzz off, learned and leech rules (Task 2); card persistence (Task 3); progress conversion (Task 4); the only deviation from the stage text is that `progress` is dropped in stage 21 (Task 5 records it).
- **Types:** `MemoryCard` and `Grade` are defined in Task 2 and used unchanged in Task 3; `CardKind` matches the `kind` CHECK in Task 1.
- **Not in this stage:** auto-grading from the checker (stage 20), queue and cap (stage 21), UI (stage 22).
