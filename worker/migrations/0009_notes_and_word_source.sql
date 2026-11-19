-- Personal memory hooks, mostly for leeches (stage 24).
CREATE TABLE word_notes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  mnemonic TEXT NOT NULL DEFAULT '',
  similar_word TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, word_id)
);

-- Words added from the app (quick add, stage 25) are marked manual.
ALTER TABLE words ADD COLUMN source TEXT NOT NULL DEFAULT 'dataset' CHECK (source IN ('dataset', 'manual'));
