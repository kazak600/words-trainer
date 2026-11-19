import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import {
  applyMigration,
  createDbAtMigration,
  migrationSql,
} from './helpers/db';

const BEFORE = '0005_progress_learned.sql';
const CARDS = '0006_cards.sql';
const DROP = '0007_drop_progress.sql';

type CardRow = {
  user_id: number;
  word_id: number;
  kind: string;
  state: number;
  due_at: number;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  last_review_at: number | null;
  suspended: number;
  leech: number;
};

let db: DatabaseSync;
let userId: number;
let lemmaCount = 0;

type ProgressSeed = {
  userId?: number;
  stage?: number;
  ease?: number;
  intervalDays?: number;
  dueAt?: number;
  reps?: number;
  lapses?: number;
  lastReviewedAt?: number | null;
};

function addUser(name: string): number {
  return Number(
    db
      .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
      .run(name, 'hash').lastInsertRowid,
  );
}

function addProgress(p: ProgressSeed = {}): number {
  const wordId = Number(
    db
      .prepare(
        "INSERT INTO words (lang, lemma, pos, topic_id, level) VALUES ('lv', ?, 'noun', 1, 'A1')",
      )
      .run(`vards${++lemmaCount}`).lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO progress
       (user_id, deck_id, word_id, stage, ease, interval_days, due_at, reps, lapses, last_reviewed_at)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    p.userId ?? userId,
    wordId,
    p.stage ?? 1,
    p.ease ?? 2.5,
    p.intervalDays ?? 0,
    p.dueAt ?? 1000,
    p.reps ?? 0,
    p.lapses ?? 0,
    p.lastReviewedAt ?? null,
  );
  return wordId;
}

function rerunConversion(): void {
  const marker = '-- convert progress';
  const sql = migrationSql(CARDS);
  expect(sql).toContain(marker);
  db.exec(sql.slice(sql.indexOf(marker)));
}

const tableExists = (name: string): boolean =>
  db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) !== undefined;

const cardsOf = (wordId: number): CardRow[] =>
  db
    .prepare('SELECT * FROM cards WHERE word_id = ? ORDER BY kind')
    .all(wordId) as CardRow[];

const countCards = (): number =>
  (db.prepare('SELECT COUNT(*) AS n FROM cards').get() as { n: number }).n;

beforeEach(() => {
  lemmaCount = 0;
  db = createDbAtMigration(BEFORE);
  userId = addUser('anton');
});

describe('progress to cards conversion', () => {
  it('creates no cards and does not fail when progress is empty', () => {
    expect(() => applyMigration(db, CARDS)).not.toThrow();

    expect(countCards()).toBe(0);
  });

  it('gives a stage 1 word with no correct answer one learning recognition card', () => {
    const wordId = addProgress({ stage: 1, reps: 0, dueAt: 1234 });

    applyMigration(db, CARDS);

    expect(cardsOf(wordId)).toEqual([
      expect.objectContaining({
        kind: 'recognition',
        state: 1,
        due_at: 1234,
        reps: 0,
        stability: 0.5,
        suspended: 0,
        leech: 0,
      }),
    ]);
  });

  it('gives a stage 3 word a recognition and a production review card', () => {
    const wordId = addProgress({
      stage: 3,
      intervalDays: 12,
      reps: 4,
      lapses: 1,
      dueAt: 5000,
      lastReviewedAt: 4000,
    });

    applyMigration(db, CARDS);

    const cards = cardsOf(wordId);
    expect(cards.map((c) => c.kind)).toEqual(['production', 'recognition']);
    for (const card of cards) {
      expect(card).toMatchObject({
        state: 2,
        scheduled_days: 12,
        stability: 12,
        reps: 4,
        lapses: 1,
        due_at: 5000,
        last_review_at: 4000,
      });
    }
  });

  it('gives a stage 2 word both cards', () => {
    const wordId = addProgress({ stage: 2, reps: 1, intervalDays: 1 });

    applyMigration(db, CARDS);

    expect(cardsOf(wordId)).toHaveLength(2);
  });

  it('maps ease to difficulty and clamps it to 1..10', () => {
    const low = addProgress({ stage: 2, ease: 1.3, reps: 1 });
    const normal = addProgress({ stage: 2, ease: 2.5, reps: 1 });
    const high = addProgress({ stage: 2, ease: 9, reps: 1 });

    applyMigration(db, CARDS);

    expect(cardsOf(low)[0]!.difficulty).toBe(10);
    expect(cardsOf(normal)[0]!.difficulty).toBeCloseTo(6);
    expect(cardsOf(high)[0]!.difficulty).toBe(1);
  });

  it('keeps each user progress on that user cards', () => {
    const other = addUser('guest');
    const mine = addProgress();
    const theirs = addProgress({ userId: other });

    applyMigration(db, CARDS);

    expect(cardsOf(mine)[0]!.user_id).toBe(userId);
    expect(cardsOf(theirs)[0]!.user_id).toBe(other);
  });

  it('keeps progress rows in place', () => {
    addProgress();

    applyMigration(db, CARDS);

    const row = db.prepare('SELECT COUNT(*) AS n FROM progress').get() as {
      n: number;
    };
    expect(row.n).toBe(1);
  });

  it('refreshes existing cards when the conversion runs again after progress changed', () => {
    const wordId = addProgress({
      stage: 2,
      reps: 1,
      intervalDays: 1,
      dueAt: 1000,
    });
    applyMigration(db, CARDS);

    db.prepare(
      'UPDATE progress SET stage = 3, reps = 5, interval_days = 20, due_at = 9000 WHERE word_id = ?',
    ).run(wordId);
    const lateWord = addProgress({ stage: 1 });
    rerunConversion();

    expect(cardsOf(wordId)).toEqual([
      expect.objectContaining({
        kind: 'production',
        reps: 5,
        due_at: 9000,
        stability: 20,
      }),
      expect.objectContaining({
        kind: 'recognition',
        reps: 5,
        due_at: 9000,
        stability: 20,
      }),
    ]);
    expect(cardsOf(lateWord)).toHaveLength(1);
  });

  it('skips progress rows whose word no longer exists instead of failing', () => {
    db.exec('PRAGMA foreign_keys = OFF');
    addProgress();
    db.prepare(
      'INSERT INTO progress (user_id, deck_id, word_id, due_at) VALUES (?, 1, 99999, 0)',
    ).run(userId);
    db.exec('PRAGMA foreign_keys = ON');

    expect(() => applyMigration(db, CARDS)).not.toThrow();
    expect(countCards()).toBe(1);
  });

  it('is idempotent: running the conversion again adds no cards', () => {
    addProgress({ stage: 3, reps: 2, intervalDays: 3 });
    addProgress({ stage: 1 });
    applyMigration(db, CARDS);
    const before = countCards();

    rerunConversion();

    expect(countCards()).toBe(before);
  });
});

describe('dropping progress', () => {
  it('picks up reviews made on progress after the cards migration, then drops the table', () => {
    const wordId = addProgress({
      stage: 2,
      reps: 1,
      intervalDays: 1,
      dueAt: 1000,
      lastReviewedAt: 500,
    });
    applyMigration(db, CARDS);
    db.prepare(
      'UPDATE progress SET stage = 3, reps = 5, interval_days = 20, due_at = 9000, last_reviewed_at = 800 WHERE word_id = ?',
    ).run(wordId);
    const lateWord = addProgress({ stage: 1 });

    applyMigration(db, DROP);

    expect(cardsOf(wordId)).toEqual([
      expect.objectContaining({
        kind: 'production',
        reps: 5,
        due_at: 9000,
        stability: 20,
      }),
      expect.objectContaining({
        kind: 'recognition',
        reps: 5,
        due_at: 9000,
        stability: 20,
      }),
    ]);
    expect(cardsOf(lateWord)).toHaveLength(1);
    expect(tableExists('progress')).toBe(false);
  });

  it('keeps a card that was reviewed after its progress row (new code ran before the migration)', () => {
    const wordId = addProgress({
      stage: 2,
      reps: 1,
      intervalDays: 1,
      dueAt: 1000,
      lastReviewedAt: 500,
    });
    applyMigration(db, CARDS);
    db.prepare(
      'UPDATE cards SET reps = 9, due_at = 77777, last_review_at = 900 WHERE word_id = ?',
    ).run(wordId);

    applyMigration(db, DROP);

    for (const card of cardsOf(wordId))
      expect(card).toMatchObject({
        reps: 9,
        due_at: 77777,
        last_review_at: 900,
      });
  });

  it('succeeds on a database with no progress rows', () => {
    applyMigration(db, CARDS);

    expect(() => applyMigration(db, DROP)).not.toThrow();
    expect(tableExists('progress')).toBe(false);
    expect(countCards()).toBe(0);
  });

  it('does not touch review history or saved sessions', () => {
    applyMigration(db, CARDS);
    const wordId = addProgress();
    db.prepare(
      "INSERT INTO review_log (user_id, deck_id, word_id, mode, correct) VALUES (?, 1, ?, 'flip', 1)",
    ).run(userId, wordId);

    applyMigration(db, DROP);

    const row = db.prepare('SELECT COUNT(*) AS n FROM review_log').get() as {
      n: number;
    };
    expect(row.n).toBe(1);
  });
});
