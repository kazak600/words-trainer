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

export type StoredCard = CardKey &
  CardFlags & { id: number; card: MemoryCard };

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
