-- Sentences are generated offline or added by hand (quick add, stage 25).
ALTER TABLE sentences ADD COLUMN source TEXT NOT NULL DEFAULT 'generated' CHECK (source IN ('generated', 'manual'));
