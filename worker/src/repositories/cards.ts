import type { CardState, MemoryCard } from '../lib/fsrs';

export type CardKind = 'recognition' | 'production' | 'cloze';

export type CardKey = {
  userId: number;
  deckId: number;
  wordId: number;
  kind: CardKind;
  sentenceId: number | null;
};

export type CardFlags = { suspended: boolean; leech: boolean };

export type StoredCard = CardKey & CardFlags & { id: number; card: MemoryCard };

type CardRow = {
  id: number;
  user_id: number;
  deck_id: number;
  word_id: number;
  kind: CardKind;
  sentence_id: number | null;
  state: number;
  due_at: number;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  last_review_at: number | null;
  suspended: number;
  leech: number;
};

function toStoredCard(row: CardRow): StoredCard {
  return {
    id: row.id,
    userId: row.user_id,
    deckId: row.deck_id,
    wordId: row.word_id,
    kind: row.kind,
    sentenceId: row.sentence_id,
    suspended: row.suspended === 1,
    leech: row.leech === 1,
    card: {
      state: row.state as CardState,
      dueAt: row.due_at,
      stability: row.stability,
      difficulty: row.difficulty,
      scheduledDays: row.scheduled_days,
      learningSteps: row.learning_steps,
      reps: row.reps,
      lapses: row.lapses,
      lastReviewAt: row.last_review_at,
    },
  };
}

export async function findCard(
  db: D1Database,
  key: CardKey,
): Promise<StoredCard | null> {
  const row = await db
    .prepare(
      `SELECT * FROM cards
       WHERE user_id = ? AND deck_id = ? AND word_id = ? AND kind = ?
         AND sentence_id IS ?`,
    )
    .bind(key.userId, key.deckId, key.wordId, key.kind, key.sentenceId)
    .first<CardRow>();
  return row ? toStoredCard(row) : null;
}

export function upsertCardStatement(
  db: D1Database,
  key: CardKey,
  card: MemoryCard,
  flags: CardFlags,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO cards
         (user_id, deck_id, word_id, kind, sentence_id, state, due_at, stability, difficulty,
          scheduled_days, learning_steps, reps, lapses, last_review_at, suspended, leech)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, deck_id, word_id, kind, COALESCE(sentence_id, 0)) DO UPDATE SET
         state = excluded.state, due_at = excluded.due_at, stability = excluded.stability,
         difficulty = excluded.difficulty, scheduled_days = excluded.scheduled_days,
         learning_steps = excluded.learning_steps, reps = excluded.reps,
         lapses = excluded.lapses, last_review_at = excluded.last_review_at,
         suspended = excluded.suspended, leech = excluded.leech`,
    )
    .bind(
      key.userId,
      key.deckId,
      key.wordId,
      key.kind,
      key.sentenceId,
      card.state,
      card.dueAt,
      card.stability,
      card.difficulty,
      card.scheduledDays,
      card.learningSteps,
      card.reps,
      card.lapses,
      card.lastReviewAt,
      flags.suspended ? 1 : 0,
      flags.leech ? 1 : 0,
    );
}

const VISIBLE = `tr.review_status IN ('approved', 'edited')`;
const LEVEL_ORDER = `CASE w.level WHEN 'A1' THEN 1 WHEN 'A2' THEN 2 WHEN 'B1' THEN 3 ELSE 4 END`;

export type DueCardRow = {
  cardId: number;
  wordId: number;
  kind: CardKind;
  sentenceId: number | null;
};

type DueScope = {
  userId: number;
  deckId: number;
  targetLang: string;
  now: number;
  topicId?: number;
};

const DUE_FROM = `FROM cards c
  JOIN words w ON w.id = c.word_id
  JOIN translations tr ON tr.word_id = w.id AND tr.target_lang = ?
  WHERE c.user_id = ? AND c.deck_id = ? AND c.suspended = 0 AND c.due_at <= ?
    AND c.kind IN ('recognition', 'production')
    AND ${VISIBLE} AND (? IS NULL OR w.topic_id = ?)`;

export async function findDueCards(
  db: D1Database,
  p: DueScope & { limit: number },
): Promise<DueCardRow[]> {
  const topic = p.topicId ?? null;
  const { results } = await db
    .prepare(
      `SELECT c.id AS cardId, c.word_id AS wordId, c.kind, c.sentence_id AS sentenceId
       ${DUE_FROM}
       ORDER BY c.due_at, c.id
       LIMIT ?`,
    )
    .bind(p.targetLang, p.userId, p.deckId, p.now, topic, topic, p.limit)
    .all<DueCardRow>();
  return results;
}

export async function countDueCards(
  db: D1Database,
  p: DueScope,
): Promise<number> {
  const topic = p.topicId ?? null;
  const row = await db
    .prepare(`SELECT COUNT(*) AS n ${DUE_FROM}`)
    .bind(p.targetLang, p.userId, p.deckId, p.now, topic, topic)
    .first<{ n: number }>();
  return row!.n;
}

export async function findNewWordIds(
  db: D1Database,
  p: {
    userId: number;
    deckId: number;
    topicId: number;
    targetLang: string;
    limit: number;
  },
): Promise<number[]> {
  const { results } = await db
    .prepare(
      `SELECT w.id
       FROM words w
       JOIN translations tr ON tr.word_id = w.id AND tr.target_lang = ?
       WHERE w.topic_id = ? AND ${VISIBLE}
         AND NOT EXISTS (
           SELECT 1 FROM cards c WHERE c.user_id = ? AND c.deck_id = ? AND c.word_id = w.id)
       ORDER BY ${LEVEL_ORDER}, w.id
       LIMIT ?`,
    )
    .bind(p.targetLang, p.topicId, p.userId, p.deckId, p.limit)
    .all<{ id: number }>();
  return results.map((r) => r.id);
}

// A word is "new today" when its very first review ever falls inside the window.
export async function countNewWordsBetween(
  db: D1Database,
  p: { userId: number; deckId: number; from: number; to: number },
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT MIN(created_at) AS first_at FROM review_log
         WHERE user_id = ? AND deck_id = ? GROUP BY word_id)
       WHERE first_at >= ? AND first_at < ?`,
    )
    .bind(p.userId, p.deckId, p.from, p.to)
    .first<{ n: number }>();
  return row!.n;
}

export function insertCardIfMissingStatement(
  db: D1Database,
  key: CardKey,
  card: MemoryCard,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO cards
         (user_id, deck_id, word_id, kind, sentence_id, state, due_at, stability, difficulty,
          scheduled_days, learning_steps, reps, lapses, last_review_at, suspended, leech)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
       ON CONFLICT (user_id, deck_id, word_id, kind, COALESCE(sentence_id, 0)) DO NOTHING`,
    )
    .bind(
      key.userId,
      key.deckId,
      key.wordId,
      key.kind,
      key.sentenceId,
      card.state,
      card.dueAt,
      card.stability,
      card.difficulty,
      card.scheduledDays,
      card.learningSteps,
      card.reps,
      card.lapses,
      card.lastReviewAt,
    );
}
