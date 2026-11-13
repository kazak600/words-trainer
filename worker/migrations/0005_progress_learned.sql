-- A word is learned once it was typed correctly at the writing stage; stage alone cannot tell.
ALTER TABLE progress ADD COLUMN learned INTEGER NOT NULL DEFAULT 0 CHECK (learned IN (0, 1));
