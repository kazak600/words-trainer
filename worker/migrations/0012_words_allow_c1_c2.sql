-- Allow C1 and C2 levels. SQLite cannot change a CHECK in place, so words is rebuilt.
-- Every table that references words (directly or through sentences) is rebuilt as well:
-- dropping a referenced table with foreign keys on would cascade-delete the child rows,
-- including the user's cards and review log.
CREATE TABLE words_new (
  id INTEGER PRIMARY KEY,
  lang TEXT NOT NULL,
  lemma TEXT NOT NULL,
  pos TEXT NOT NULL,
  topic_id INTEGER NOT NULL REFERENCES topics(id),
  level TEXT NOT NULL CHECK (level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  grammar_json TEXT,
  forms_json TEXT,
  source TEXT NOT NULL DEFAULT 'dataset' CHECK (source IN ('dataset', 'manual')),
  UNIQUE (lang, lemma, pos)
);
INSERT INTO words_new (id, lang, lemma, pos, topic_id, level, grammar_json, forms_json, source)
  SELECT id, lang, lemma, pos, topic_id, level, grammar_json, forms_json, source FROM words;

CREATE TABLE translations_new (
  id INTEGER PRIMARY KEY,
  word_id INTEGER NOT NULL REFERENCES words_new(id) ON DELETE CASCADE,
  target_lang TEXT NOT NULL,
  text TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'edited')),
  UNIQUE (word_id, target_lang)
);
INSERT INTO translations_new (id, word_id, target_lang, text, review_status)
  SELECT id, word_id, target_lang, text, review_status FROM translations;

CREATE TABLE sentences_new (
  id INTEGER PRIMARY KEY,
  word_id INTEGER NOT NULL REFERENCES words_new(id) ON DELETE CASCADE,
  text_with_gap TEXT NOT NULL,
  answer TEXT NOT NULL,
  hint_target_lang TEXT NOT NULL,
  hint TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'edited')),
  source TEXT NOT NULL DEFAULT 'generated' CHECK (source IN ('generated', 'manual'))
);
INSERT INTO sentences_new (id, word_id, text_with_gap, answer, hint_target_lang, hint, review_status, source)
  SELECT id, word_id, text_with_gap, answer, hint_target_lang, hint, review_status, source FROM sentences;

CREATE TABLE cards_new (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id INTEGER NOT NULL REFERENCES decks(id),
  word_id INTEGER NOT NULL REFERENCES words_new(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('recognition', 'production', 'cloze')),
  sentence_id INTEGER REFERENCES sentences_new(id) ON DELETE CASCADE,
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
INSERT INTO cards_new (id, user_id, deck_id, word_id, kind, sentence_id, state, due_at, stability, difficulty,
  scheduled_days, learning_steps, reps, lapses, last_review_at, suspended, leech)
  SELECT id, user_id, deck_id, word_id, kind, sentence_id, state, due_at, stability, difficulty,
  scheduled_days, learning_steps, reps, lapses, last_review_at, suspended, leech FROM cards;

CREATE TABLE review_log_new (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id INTEGER NOT NULL REFERENCES decks(id),
  word_id INTEGER NOT NULL REFERENCES words_new(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('flip', 'choice', 'write', 'gap')),
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  typed_answer TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  kind TEXT CHECK (kind IN ('recognition', 'production', 'cloze')),
  grade INTEGER CHECK (grade BETWEEN 1 AND 4)
);
INSERT INTO review_log_new (id, user_id, deck_id, word_id, mode, correct, typed_answer, created_at, kind, grade)
  SELECT id, user_id, deck_id, word_id, mode, correct, typed_answer, created_at, kind, grade FROM review_log;

CREATE TABLE word_notes_new (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id INTEGER NOT NULL REFERENCES words_new(id) ON DELETE CASCADE,
  mnemonic TEXT NOT NULL DEFAULT '',
  similar_word TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, word_id)
);
INSERT INTO word_notes_new (user_id, word_id, mnemonic, similar_word)
  SELECT user_id, word_id, mnemonic, similar_word FROM word_notes;

-- Children of the old tables go first, then the parents.
DROP TABLE cards;
DROP TABLE review_log;
DROP TABLE word_notes;
DROP TABLE translations;
DROP TABLE sentences;
DROP TABLE words;

ALTER TABLE words_new RENAME TO words;
ALTER TABLE translations_new RENAME TO translations;
ALTER TABLE sentences_new RENAME TO sentences;
ALTER TABLE cards_new RENAME TO cards;
ALTER TABLE review_log_new RENAME TO review_log;
ALTER TABLE word_notes_new RENAME TO word_notes;

CREATE INDEX idx_words_topic_level ON words(topic_id, level);
CREATE INDEX idx_sentences_word ON sentences(word_id);
CREATE INDEX idx_review_log_user_deck_time ON review_log(user_id, deck_id, created_at);
CREATE UNIQUE INDEX idx_cards_identity
  ON cards(user_id, deck_id, word_id, kind, COALESCE(sentence_id, 0));
CREATE INDEX idx_cards_due ON cards(user_id, deck_id, due_at);
