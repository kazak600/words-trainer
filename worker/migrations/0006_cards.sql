-- FSRS memory state: one card per word and direction (and per sentence for cloze).
-- state follows ts-fsrs: 0 new, 1 learning, 2 review, 3 relearning.
CREATE TABLE cards (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id INTEGER NOT NULL REFERENCES decks(id),
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('recognition', 'production', 'cloze')),
  sentence_id INTEGER REFERENCES sentences(id) ON DELETE CASCADE,
  state INTEGER NOT NULL DEFAULT 0 CHECK (state IN (0, 1, 2, 3)),
  due_at INTEGER NOT NULL,
  stability REAL NOT NULL DEFAULT 0,
  difficulty REAL NOT NULL DEFAULT 0,
  scheduled_days REAL NOT NULL DEFAULT 0,
  learning_steps INTEGER NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  last_review_at INTEGER,
  suspended INTEGER NOT NULL DEFAULT 0 CHECK (suspended IN (0, 1)),
  leech INTEGER NOT NULL DEFAULT 0 CHECK (leech IN (0, 1))
);
-- A plain UNIQUE would let several NULL sentence_id rows through.
CREATE UNIQUE INDEX idx_cards_identity
  ON cards(user_id, deck_id, word_id, kind, COALESCE(sentence_id, 0));
CREATE INDEX idx_cards_due ON cards(user_id, deck_id, due_at);

ALTER TABLE review_log ADD COLUMN kind TEXT CHECK (kind IN ('recognition', 'production', 'cloze'));
ALTER TABLE review_log ADD COLUMN grade INTEGER CHECK (grade BETWEEN 1 AND 4);

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
  reps = excluded.reps, lapses = excluded.lapses, last_review_at = excluded.last_review_at;

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
  reps = excluded.reps, lapses = excluded.lapses, last_review_at = excluded.last_review_at;
