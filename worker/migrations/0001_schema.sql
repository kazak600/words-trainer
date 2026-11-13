-- Timestamps are unix seconds (UTC).

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE decks (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  source_lang TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  title TEXT NOT NULL
);

CREATE TABLE topics (
  id INTEGER PRIMARY KEY,
  lang TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  title_uk TEXT NOT NULL,
  UNIQUE (lang, slug)
);

CREATE TABLE words (
  id INTEGER PRIMARY KEY,
  lang TEXT NOT NULL,
  lemma TEXT NOT NULL,
  pos TEXT NOT NULL,
  topic_id INTEGER NOT NULL REFERENCES topics(id),
  level TEXT NOT NULL CHECK (level IN ('A1', 'A2', 'B1', 'B2')),
  grammar_json TEXT,
  forms_json TEXT,
  UNIQUE (lang, lemma, pos)
);
CREATE INDEX idx_words_topic_level ON words(topic_id, level);

CREATE TABLE translations (
  id INTEGER PRIMARY KEY,
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  target_lang TEXT NOT NULL,
  text TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'edited')),
  UNIQUE (word_id, target_lang)
);

CREATE TABLE sentences (
  id INTEGER PRIMARY KEY,
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  text_with_gap TEXT NOT NULL,
  answer TEXT NOT NULL,
  hint_target_lang TEXT NOT NULL,
  hint TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'edited'))
);
CREATE INDEX idx_sentences_word ON sentences(word_id);

-- stage: 1 flip card, 2 multiple choice, 3 writing
CREATE TABLE progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id INTEGER NOT NULL REFERENCES decks(id),
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL DEFAULT 1 CHECK (stage IN (1, 2, 3)),
  ease REAL NOT NULL DEFAULT 2.5,
  interval_days REAL NOT NULL DEFAULT 0,
  due_at INTEGER NOT NULL,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at INTEGER,
  PRIMARY KEY (user_id, deck_id, word_id)
);
CREATE INDEX idx_progress_due ON progress(user_id, deck_id, due_at);

CREATE TABLE review_log (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id INTEGER NOT NULL REFERENCES decks(id),
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('flip', 'choice', 'write', 'gap')),
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  typed_answer TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_review_log_user_deck_time ON review_log(user_id, deck_id, created_at);

CREATE TABLE session_state (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id INTEGER NOT NULL REFERENCES decks(id),
  payload_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, deck_id)
);
