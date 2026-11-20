# Stages 15-16: Stats, Resume Polish and Grammar Panels

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, TDD). Work on `main`, no branches, no commits until the user asks.

**Goal:** the user sees progress per deck (words by state, learned per level and topic, study days, reviews per day), is offered "continue or start over" for a stale session, and sees a grammar panel (noun cases, verb forms) next to each word.

**Architecture:** one new read-only endpoint `GET /api/decks/:deck/stats` (route -> service -> repository, same layering as `review`). Resume age rides on `GET sessions/current` as `updatedAt`. Forms travel with the recognition card and the answer reply; a per-language `GrammarPanel` component renders them.

**Spec:** `stages.md` (stages 15 and 16), `development_plan.md`.

## Global Constraints

- No streaks anywhere. Per-deck data only. Local day via `tzOffset` (minutes east of UTC) and `lib/day.ts`.
- LEARNED = production card (no sentence) in state 2 with stability >= 21 (`LEARNED_STABILITY_DAYS`).
- Verbs are covered by the Wiktionary/Tezaurs data (317/319 have forms), so verbs get a panel.
- Finished changes stay uncommitted.

## Review Focus

- A word with only a suspended/leech card still counts in its real state.
- Reviews logged near local midnight land on the right local day (tzOffset east and west).
- Other users' cards and reviews never leak into stats.
- Words without forms (adjectives, adverbs) show no panel, no crash; plural "-" cells are skipped for singular-only nouns.
- Stale-session prompt must not appear for a fresh session; "start over" must not lose the topic choice silently.

## Task 1: Stats repository and service

**Files:** Create `worker/src/repositories/stats.ts`, `worker/src/services/stats.ts`; Test `worker/test/stats.test.ts`.

**Interfaces — produces:**
`getStats(db, userId, deckSlug, tzOffset, now): Promise<Stats>` with
`Stats = { states: {new, learning, review, learned}, levels: {level, total, learned}[], topics: {topicId, title, titleUk, total, learned}[], days: {day: 'YYYY-MM-DD', reviews}[] }`.

- Word state (per approved word in the deck's topics/translations): learned if its production card meets LEARNED; else review if any of its cards is state 2; else learning if any card is state 1 or 3; else new.
- `days`: review_log rows of the user+deck grouped by local day, last 90 local days, ascending, only days with reviews.

Steps: test first (hand-counted DB: 5 words across levels/topics, mixed cards, another user's cards, reviews across midnight with tzOffset 120 and -300), watch fail, implement, pass.

## Task 2: Stats endpoint

**Files:** Create `worker/src/routes/stats.ts`; Modify `worker/src/app.ts`; extend `worker/test/stats.test.ts`.

`GET /api/decks/:deck/stats?tzOffset=` -> 200 `Stats`; 401 without a cookie; 400 on bad tzOffset; 404 unknown deck.

## Task 3: Resume age

**Files:** Modify `worker/src/repositories/study.ts` (select `updated_at`), `worker/src/services/study.ts` (`SessionView.updatedAt`), `worker/test/study.test.ts`; Create `DELETE /api/decks/:deck/sessions/current` in `routes/study.ts` (start over = drop the session).

Test: `sessions/current` returns `updatedAt` equal to the stored value; DELETE removes the session (then GET 404); DELETE of another user's session is a no-op.

## Task 4: Forms in the study payload

**Files:** Modify `worker/src/services/study.ts` (`CardView.forms`, recognition cards, and `AnswerView.forms` for typed cards so the panel can show after the answer), `worker/src/repositories/words.ts` if forms column is not selected by `listWordsByIds`; `worker/test/helpers/d1.ts` (`forms` in `WordSeed`); tests in `study.test.ts`.

## Task 5: Stats page

**Files:** Create `web/src/api/stats.ts`; Rewrite `web/src/pages/StatsPage.tsx`; Test `web/src/pages/stats.test.tsx`; styles in `styles.css`.

Page: state bar (new / learning / review / learned), level rows, topic rows (learned/total), 12-week calendar grid of study days with a count per day, reviews-per-day for the last 14 days, Leech Workshop link kept.

## Task 6: Resume prompt

**Files:** Modify `web/src/api/study.ts` (`updatedAt`, `discardSession`), `web/src/pages/HomePage.tsx`, `web/src/pages/session.test.tsx` or `home.test.tsx`.

Session older than 24 h: Home shows "Your session is from {date}" with "Continue" and "Start over" (discard, then reload). Fresh session: today's single "Continue your session" link.

## Task 7: Grammar panel

**Files:** Create `web/src/grammar/GrammarPanel.tsx`, `web/src/grammar/lv.tsx` (noun case table, verb tense table), `web/src/grammar/panel.test.tsx`; Modify `RecognitionCard.tsx`, `Feedback.tsx` (show for typed cards), `api/study.ts` (`forms`), `styles.css`.

- Registry `panels[lang]` chosen from the deck's source language; unknown language or no forms -> nothing rendered.
- Noun: gender + declension line (existing `grammarLine`), then a case table singular/plural (skip plural column when all "-"). Verb: infinitive, present / past / future rows for es, tu, viņš, mēs, jūs.
- Collapsed `<details>` named "Forms" so the card stays short on a phone.

## Task 8: Docs

Update `stages.md` (remove stages 15-16, note verbs covered 317/319), `README` data notes if needed; whole suites + lint + build green.
