-- Stage 21: the study flow runs on cards, so progress is retired.
-- First refresh cards from progress, so reviews made on progress after 0006 are not lost
-- (same conversion as 0006, safe to repeat). A card already reviewed more recently than its progress row
-- (the new code ran before this migration) is left alone.
-- convert progress
-- Every progress row becomes a recognition card; stage 2 and 3 words also get a production card.
-- reps = 0 means no review is currently counted: learning state, otherwise review state.
-- Ease maps to FSRS difficulty (2.5 -> 6, 1.3 -> 10), clamped to 1..10.
-- Safe to run again (stage 21 does, to pick up reviews made after this migration): existing cards are
-- refreshed from progress. Rows whose word or user no longer exists are skipped.
INSERT INTO cards
  (user_id, deck_id, word_id, kind, state, due_at, stability, difficulty,
   scheduled_days, learning_steps, reps, lapses, last_review_at)
SELECT user_id, deck_id, word_id, 'recognition',
       CASE WHEN reps = 0 THEN 1 ELSE 2 END,
       due_at,
       CASE WHEN reps = 0 THEN 0.5 ELSE MAX(interval_days, 0.5) END,
       MIN(10, MAX(1, 11 - (ease - 1.3) / 1.2 * 5)),
       interval_days, 0, reps, lapses, last_reviewed_at
FROM progress
WHERE EXISTS (SELECT 1 FROM words w WHERE w.id = progress.word_id)
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = progress.user_id)
ON CONFLICT (user_id, deck_id, word_id, kind, COALESCE(sentence_id, 0)) DO UPDATE SET
  state = excluded.state, due_at = excluded.due_at, stability = excluded.stability,
  difficulty = excluded.difficulty, scheduled_days = excluded.scheduled_days,
  reps = excluded.reps, lapses = excluded.lapses, last_review_at = excluded.last_review_at
WHERE excluded.last_review_at > COALESCE(cards.last_review_at, -1);

INSERT INTO cards
  (user_id, deck_id, word_id, kind, state, due_at, stability, difficulty,
   scheduled_days, learning_steps, reps, lapses, last_review_at)
SELECT user_id, deck_id, word_id, 'production',
       CASE WHEN reps = 0 THEN 1 ELSE 2 END,
       due_at,
       CASE WHEN reps = 0 THEN 0.5 ELSE MAX(interval_days, 0.5) END,
       MIN(10, MAX(1, 11 - (ease - 1.3) / 1.2 * 5)),
       interval_days, 0, reps, lapses, last_reviewed_at
FROM progress
WHERE stage >= 2
  AND EXISTS (SELECT 1 FROM words w WHERE w.id = progress.word_id)
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = progress.user_id)
ON CONFLICT (user_id, deck_id, word_id, kind, COALESCE(sentence_id, 0)) DO UPDATE SET
  state = excluded.state, due_at = excluded.due_at, stability = excluded.stability,
  difficulty = excluded.difficulty, scheduled_days = excluded.scheduled_days,
  reps = excluded.reps, lapses = excluded.lapses, last_review_at = excluded.last_review_at
WHERE excluded.last_review_at > COALESCE(cards.last_review_at, -1);

DROP TABLE progress;
