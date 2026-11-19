# Stages 22–23: Frontend for the New Mechanics and Cloze Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The web app uses the stage 20–21 API (recognition and typed cards, review queue, daily cap, Easy raise, tab bar, deck switch in Settings), and words are also tested in sentences with cloze cards.

**Architecture:** Stage 23 is worker-only and goes first, so the UI is built once against the final card shapes: a `sentences.source` column, cloze cards created when a production answer passes, and cloze served through the same review and session code as production. Stage 22 then replaces the web API layer, adds a `DeckProvider` (current deck, remembered on the device), a tab-bar shell, and rebuilds Home, Review, Settings and the session screen. The streak is removed on both sides.

**Tech Stack:** TypeScript, Hono, D1, Vitest; React 19, React Router 7, Testing Library (jsdom).

**Spec:** `stages.md` stages 22 and 23; `development_plan.md` sections 6 and 7 (visual reference: `Speak iOS 5/7/22/23.png`, a loose guide).

## Global Constraints

- Card kinds: `recognition` (lv → uk, tap to reveal, four grade buttons Again / Hard / Good / Easy), `production` (typed), `cloze` (typed, in a sentence). No multiple choice anywhere.
- A cloze card is created for each visible sentence of a word after the word's production card passes (grade not Again). The Ukrainian sentence translation is the hint; the answer is the form in the sentence; the stage 20 checker grades it. `sentences.source` is `generated` or `manual`, default `generated`.
- Diacritic quick-bar: `ā č ē ģ ī ķ ļ ņ š ū ž` above the keyboard on typed cards. A typo is shown in yellow with the diff as "Pass with typo".
- Bottom tab bar: Home, Review, Add, Stats, Settings (not shown during a session or on the login page). Settings holds the deck (language) list and logout. Add and Stats are placeholder pages until stages 25 and 15.
- Decks are separate flows: every page and API call uses the current deck from context (default `lv-uk`, remembered in `localStorage`); no page hard-codes a deck slug; nothing from another deck is mixed in.
- Home shows a Review button with the due count and "new today: n / 15". No streak anywhere (worker `computeStreak`, `/api/streak`, `lib/streak.ts` name, web badge).
- The `tzOffset` (minutes east of UTC, `-new Date().getTimezoneOffset()`) is sent when starting a session and reading the review summary.
- Style: royal-blue accent on a near-white page with a faint blue tint, white rounded cards with soft shadow, full-width blue pill buttons at the bottom, light grey pill inputs, a bottom tab bar with the active tab in blue. Mascot, flame and upsell cards are not taken.
- Inputs are 16px minimum (no Safari zoom); `localStorage` access is wrapped in try/catch.
- The Wiktionary footer in `Layout.tsx` was removed by the user's uncommitted edit; leave `Layout.tsx`'s footer as it is.
- Code, identifiers and docs in English. Comments only for non-obvious business logic. Finished changes stay uncommitted until the user asks.

## Review Focus

- A word with no visible sentence gets no cloze card; a pending sentence never becomes a card; a failed production answer (Again) creates none; passing twice creates no duplicates.
- A cloze answer is checked against the sentence's inflected form, not the lemma, and the card view never contains the answer.
- Quick-bar buttons insert at the cursor, keep the input focused, and never submit the form.
- A stored deck slug that no longer exists, or unavailable `localStorage`, falls back to the first deck without crashing.
- A 409 `daily_cap_reached` or `nothing_to_study` on start shows a readable message; the session summary's "Another session" starts the same kind (topic or review) as the one just finished.

---

## File Structure

Worker:
- Create `worker/migrations/0008_sentence_source.sql`.
- Modify `worker/src/repositories/cards.ts` (cloze due, sentence lookups), create `worker/src/repositories/sentences.ts`, modify `worker/src/services/study.ts`, `worker/src/repositories/study.ts`.
- Rename `worker/src/lib/streak.ts` → `worker/src/lib/day.ts` (keeps `localDay`, `localDayWindow`, `parseTzOffset`; drops `computeStreak`); delete `routes/streak.ts`, `services/streak.ts`, `repositories/streak.ts`; modify `app.ts`; rename `test/streak.test.ts` → `test/day.test.ts` (day helpers only); delete the streak API tests.

Web (`web/src`):
- Rewrite `api/study.ts`; create `api/decks.ts`, `decks/DeckContext.tsx`.
- Create `shell/TabBar.tsx`, `shell/AppShell.tsx`; modify `App.tsx`; create `pages/ReviewPage.tsx`, `pages/SettingsPage.tsx`, `pages/ComingSoonPage.tsx`; rewrite `pages/HomePage.tsx`, `pages/SessionPage.tsx`.
- Create `session/RecognitionCard.tsx`, `session/TypedCard.tsx`, `session/QuickBar.tsx`; rewrite `session/Feedback.tsx`; keep `session/DiffWord.tsx`; delete `session/ChoiceCard.tsx`, `session/WriteCard.tsx`.
- Rewrite `styles.css`; rewrite `pages/cards.test.tsx`, `pages/study.test.tsx`; update `App.test.tsx`.

---

### Task 1: `sentences.source` column (stage 23)

**Files:** Create `worker/migrations/0008_sentence_source.sql`; Modify `worker/test/schema.test.ts`

**Interfaces:** Produces `sentences.source TEXT NOT NULL DEFAULT 'generated' CHECK (source IN ('generated','manual'))`.

- [ ] **Step 1: Failing tests** in `schema.test.ts`: an inserted sentence without `source` has `'generated'`; `'manual'` is accepted; `'other'` throws `/CHECK/`.
- [ ] **Step 2: Run** `cd worker && npx vitest run test/schema.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write the migration** (`ALTER TABLE sentences ADD COLUMN source …`).
- [ ] **Step 4: Run** the same command. Expected: PASS.

### Task 2: Cloze cards in the study flow (stage 23)

**Files:** Create `worker/src/repositories/sentences.ts`; Modify `worker/src/repositories/cards.ts`, `worker/src/repositories/study.ts`, `worker/src/services/study.ts`; Test `worker/test/study.test.ts`, `worker/test/cards.test.ts`, `worker/test/sentences.test.ts`

**Interfaces:**
- Produces `repositories/sentences.ts`: `type SentenceRow = { id: number; wordId: number; textWithGap: string; answer: string; hint: string }`; `listVisibleSentences(db, wordId: number, targetLang: string): Promise<SentenceRow[]>` (review status approved/edited, `hint_target_lang = targetLang`, ordered by id); `findSentence(db, id: number): Promise<SentenceRow | null>`.
- `findDueCards` / `countDueCards` now include `cloze` (remove the kind filter added in stage 21); `DueCardRow.sentenceId` is set for cloze.
- Session payload card: `{ wordId, kind: 'recognition'|'production'|'cloze', sentenceId: number | null, retry }`; a payload saved before this task (no `sentenceId` key) is treated as `null`.
- `CardView` gains `kind: 'cloze'`, `textWithGap?: string`, `hint?: string` (cloze only). A cloze view has `translation` (the word's), `textWithGap`, `hint`, no `lemma`.
- Answer: cloze takes `{cardIndex, typed}`; `expected` is the sentence `answer`; log `mode = 'gap'`, `kind = 'cloze'`; `canRaise` as for production; `learned` still reflects the word's production card.
- `lastExact` stores `kind` and `sentenceId`; `raiseToEasy` uses them (no hard-coded `'production'`), and `raiseLatestGradeStatement` matches the latest log row of that word and kind.
- Creation: when a **production** card is answered with a grade other than `again`, insert a `cloze` card per visible sentence with `insertCardIfMissingStatement`, `newCard(Math.max(updated.dueAt, now + 86400))`, keyed by the sentence id.
- Review-session dedupe by word stays (one card per word per session).

- [ ] **Step 1: Failing tests.**
  - `sentences.test.ts`: `listVisibleSentences` returns approved and edited sentences in id order, skips pending and those with another `hint_target_lang`; `findSentence` returns null for a missing id.
  - `study.test.ts` (cloze creation): production `good` on a word with two approved sentences and one pending creates exactly two cloze cards (`state 0`, `due_at ≥ now+86400−60`, correct `sentence_id`); production `typo` (Hard) also creates them; production `wrong` creates none; a word with no sentences creates none; answering production correctly twice leaves two cloze cards (no duplicates).
  - `study.test.ts` (cloze session): a due cloze card in a review session has view `{kind:'cloze', textWithGap, hint}` and no `lemma`; typed `'maizi'` for answer `maizi` → `exact`, `expected: 'maizi'`; typed `'maize'` → `wrong` or `typo` per the checker with a diff against `maizi`; the log row has `mode 'gap'`, `kind 'cloze'`; Easy raise works on a cloze exact answer (`cardIndex`) and updates that card, not the production card; a payload without `sentenceId` still resumes.
  - `cards.test.ts`: the "never lists cloze" test becomes "lists cloze cards with their `sentenceId`".
- [ ] **Step 2: Run** `npx vitest run test/sentences.test.ts test/study.test.ts test/cards.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as in the Interfaces block. `answerCard` loads the sentence for a cloze card (404-like `session_not_found` if it was deleted); `judge` takes the expected text as a parameter (`word.lemma` or `sentence.answer`).
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit` in `worker/`. Expected: PASS.

### Task 3: Remove the streak from the worker (stage 22)

**Files:** Rename `worker/src/lib/streak.ts` → `day.ts`; Delete `worker/src/routes/streak.ts`, `services/streak.ts`, `repositories/streak.ts`; Modify `worker/src/app.ts`, imports in `services/study.ts`, `routes/study.ts`; Rename `worker/test/streak.test.ts` → `day.test.ts`

**Interfaces:** `lib/day.ts` exports `localDay(timestamp, tzOffsetMinutes)`, `localDayWindow(timestamp, tzOffsetMinutes)`, `parseTzOffset(raw)` unchanged; `computeStreak` and `GET /api/streak` no longer exist.

- [ ] **Step 1: Tests first:** in `day.test.ts` keep the `localDay`, `localDayWindow`, `parseTzOffset` tests; add a test that `GET /api/streak` returns 404 (authenticated).
- [ ] **Step 2: Run** `npx vitest run test/day.test.ts`. Expected: FAIL (404 test, missing module).
- [ ] **Step 3: Do the rename and deletions**, fix imports and remove the route from `app.ts`.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, and `npm run lint` at the root. Expected: PASS.

### Task 4: Web API layer and deck context (stage 22)

**Files:** Rewrite `web/src/api/study.ts`; Create `web/src/api/decks.ts`, `web/src/decks/DeckContext.tsx`; Test `web/src/decks/DeckContext.test.tsx`, `web/src/api/study.test.ts`

**Interfaces:**
- `api/decks.ts`: `type Deck = { slug: string; sourceLang: string; targetLang: string; title: string }`; `fetchDecks(): Promise<Deck[]>`; `languageName(code: string): string` (`lv` Latvian, `uk` Ukrainian, `en` English, otherwise the code).
- `decks/DeckContext.tsx`: `DeckProvider` (loads decks after login, current slug from `localStorage['deck']`, falls back to the first deck when missing or unknown, `localStorage` errors ignored); `useDeck(): { decks: Deck[]; deck: Deck; setDeck(slug: string): void }`; renders nothing until decks are loaded.
- `api/study.ts` (every function takes `deck: string` first): types `Card = { index; kind: 'recognition'|'production'|'cloze'; retry; wordId; pos; translation; lemma?; grammar?; textWithGap?; hint? }`, `SessionView = { id; topicId: number | null; total; index; card }`, `Grade = 'again'|'hard'|'good'|'easy'`, `Verdict = 'exact'|'typo'|'wrong'`, `AnswerInput = { grade: Grade } | { typed: string }`, `AnswerView = { grade; verdict?; correct; expected; diff?; learned; canRaise; finished; next; summary? }`, `ReviewSummary = { due; newToday; newCap; cards }`; `fetchTopics(deck)`, `fetchReview(deck)`, `fetchCurrentSession(deck)`, `startTopicSession(deck, topicId)`, `startReviewSession(deck)`, `answerCard(sessionId, cardIndex, input)`, `raiseToEasy(sessionId, cardIndex)`. `fetchStreak` is removed.

- [ ] **Step 1: Failing tests.** `study.test.ts`: each function calls the right URL/body (`tzOffset` in the review URL and in session start bodies; `{ review: true }`; `/easy` with `{cardIndex}`), with TZ fixed to UTC by `vite.config.ts`. `DeckContext.test.tsx`: default is the first deck; a stored slug is used; an unknown stored slug falls back; `setDeck` stores it; a throwing `localStorage` does not crash.
- [ ] **Step 2: Run** `cd web && npx vitest run src/api src/decks`. Expected: FAIL.
- [ ] **Step 3: Implement** both modules.
- [ ] **Step 4: Run** the same command. Expected: PASS.

### Task 5: App shell, tab bar, Settings (stage 22)

**Files:** Create `web/src/shell/TabBar.tsx`, `web/src/shell/AppShell.tsx`, `web/src/pages/SettingsPage.tsx`, `web/src/pages/ComingSoonPage.tsx`; Modify `web/src/App.tsx`, `web/src/App.test.tsx`

**Interfaces:** Routes inside the auth guard: `/` Home, `/review` Review, `/add` Add, `/stats` Stats, `/settings` Settings, `/session` Session (no tab bar). `AppShell` wraps the guarded routes in `DeckProvider` and shows `TabBar` except on `/session`. Tab labels exactly `Home`, `Review`, `Add`, `Stats`, `Settings`, as links in a `nav` named "Main", the active one with `aria-current="page"`. Settings: a "Language" list of radio-style buttons from `useDeck().decks` (title text), the current one `aria-pressed="true"`, and a "Log out" button. Add and Stats render a heading and "Coming soon".

- [ ] **Step 1: Failing tests** (extend `App.test.tsx`): the tab bar shows five tabs on Home and the active tab is marked; it is absent on `/login` and `/session`; clicking Settings shows the deck list with Latvian → Ukrainian pressed and a working Log out; Add and Stats show "Coming soon".
- [ ] **Step 2: Run** `npx vitest run src/App.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: PASS.

### Task 6: Home and Review pages (stage 22)

**Files:** Rewrite `web/src/pages/HomePage.tsx`; Create `web/src/pages/ReviewPage.tsx`; Test `web/src/pages/home.test.tsx`

**Interfaces:** Home: heading "Topics"; a primary "Review" button with the due count (`Review · 12 due`; disabled when 0) that starts a review session and navigates to `/session`; text `New today: 3 / 15`; topics list (title, level chips, `n new · n learning · n learned`) where a tap starts a topic session; "Continue your session" link when a session exists; no streak, no logout button (moved to Settings). Review page: heading "Review", the due count, a primary "Start review" button (same start), the same continue link. Start errors: 409 `daily_cap_reached` → "Daily limit reached: 15 new words today."; 409 `nothing_to_study` → "Nothing to study right now."; other → "Could not start the session. Try again."

- [ ] **Step 1: Failing tests** (`home.test.tsx`): counts and "New today: 3 / 15" render; Review button starts `{review:true}` and lands on the session; disabled at 0 due; topic tap sends `{topicId, tzOffset}`; the three error messages; continue link appears when `sessions/current` succeeds; the request URLs use the stored deck slug, not a hard-coded one (set `localStorage.deck` to a second deck in one test).
- [ ] **Step 2: Run** `npx vitest run src/pages/home.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** both pages.
- [ ] **Step 4: Run** the same command. Expected: PASS.

### Task 7: Session screen: recognition, typed cards, feedback (stage 22 + 23)

**Files:** Create `web/src/session/RecognitionCard.tsx`, `TypedCard.tsx`, `QuickBar.tsx`; Rewrite `web/src/session/Feedback.tsx`, `web/src/pages/SessionPage.tsx`; Delete `web/src/session/ChoiceCard.tsx`, `WriteCard.tsx`; Rewrite `web/src/pages/cards.test.tsx`, `web/src/pages/study.test.tsx`

**Interfaces:**
- `QuickBar({ onInsert(char: string) })`: eleven buttons `ā č ē ģ ī ķ ļ ņ š ū ž`, `onMouseDown`/`onPointerDown` default prevented so the input keeps focus.
- `TypedCard({ card, locked, busy, onSubmit(typed) })`: production prompt = Ukrainian translation + "Type it in {Language}"; cloze prompt = `textWithGap` with the gap shown as a blank, the `hint` below, "Type the missing word"; an input (`lang`, autocorrect/capitalize/spellcheck off), the quick-bar inserting at the cursor, a "Check" button.
- `RecognitionCard`: the lemma, "Tap to reveal"; after reveal the translation, grammar line, and four buttons Again / Hard / Good / Easy (calls `onGrade(grade)`).
- `Feedback`: exact → "Correct" (green) with a "Mark as easy" button when `canRaise` (calls the raise API, then the button is replaced by "Marked as easy") and Continue; typo → yellow "Pass with typo" with the diff and what was typed; wrong → red "Not quite" with the diff. A `learned` badge as today.
- Session summary: "Another session" starts the same kind: topic session when `topicId` is set, otherwise a review session; start errors use the Task 6 messages.
- The deck comes from `useDeck()`; the language name in prompts from `languageName(deck.sourceLang)`.

- [ ] **Step 1: Failing tests** (rewrite the two test files with `mockApi`): recognition reveal then four grade buttons, each sends `{grade}`; Hard is a pass (no "Not quite"); production exact shows Correct and "Mark as easy" calls `POST /api/sessions/s1/easy` with `{cardIndex: 0}`; typo (`verdict: 'typo'`) shows "Pass with typo", the yellow diff and no "Mark as easy"; wrong shows "Not quite" and the diff; cloze renders the sentence with a blank and the hint, and the answer is never on screen before checking; quick-bar: clicking `š` inserts at the caret in the middle of the text, keeps focus, and does not submit; a missing-diacritic answer reply (`verdict 'typo'` with a `diacritic` diff item) shows the accent hint; `learned` badge; summary "Another session" for a topic session posts `{topicId}` and for a review session posts `{review:true}`; Exit keeps the session; no multiple-choice option buttons exist anywhere.
- [ ] **Step 2: Run** `npx vitest run src/pages src/session`. Expected: FAIL.
- [ ] **Step 3: Implement** the components and the new `SessionPage`.
- [ ] **Step 4: Run** `cd web && npm test && npm run typecheck`. Expected: PASS.

### Task 8: Visual style (stage 22)

**Files:** Rewrite `web/src/styles.css`

**Interfaces:** CSS tokens on `:root` with dark-mode values (accent royal blue `#2f5bea`-family, page `#f5f8ff`-family, white cards with a soft shadow, large radii), classes used by Tasks 5–7: tab bar (fixed bottom, safe-area padding, active tab blue), pill primary buttons fixed at the bottom of the session, grey pill inputs, `.feedback.typo` yellow, quick-bar row. Pages get bottom padding so the tab bar never covers content.

- [ ] **Step 1: Write the CSS** against the class names the components use; remove classes of deleted components (`.options`, choice states).
- [ ] **Step 2: Run** `cd web && npm run build`. Expected: build passes (typecheck + Vite).
- [ ] **Step 3: Visual check:** start `npm run dev` from the repo root, open the app in a phone-sized viewport with the user's local database (`npm run db:migrate:local` first), and check Home, a recognition card, a typed card with the quick-bar, feedback in all three states, Settings. Report what was checked; if the browser cannot be driven here, say so instead of claiming it.

### Task 9: Docs

**Files:** Modify `stages.md`, `development_plan.md` only where they now differ

- [ ] **Step 1:** mark stages 22 and 23 `[DONE]` in `stages.md`, note Add/Stats are placeholders until stages 25/15, note the streak removal and the `sentences.source` migration.
- [ ] **Step 2: Run** the whole suite once more: `npm test` and `npm run lint` at the root, `npm run build`. Expected: all PASS.
