import type { Scheduled } from '../lib/scheduler';

const VISIBLE = `tr.review_status IN ('approved', 'edited')`;
const LEVEL_ORDER = `CASE w.level WHEN 'A1' THEN 1 WHEN 'A2' THEN 2 WHEN 'B1' THEN 3 ELSE 4 END`;

export type DueRow = { id: number; stage: number };

export async function findDueWords(
  db: D1Database,
  p: {
    userId: number;
    deckId: number;
    topicId: number;
    targetLang: string;
    now: number;
    limit: number;
  },
): Promise<DueRow[]> {
  const { results } = await db
    .prepare(
      `SELECT w.id, pr.stage
       FROM progress pr
       JOIN words w ON w.id = pr.word_id
       JOIN translations tr ON tr.word_id = w.id AND tr.target_lang = ?
       WHERE pr.user_id = ? AND pr.deck_id = ? AND w.topic_id = ? AND pr.due_at <= ? AND ${VISIBLE}
       ORDER BY pr.due_at, w.id
       LIMIT ?`,
    )
    .bind(p.targetLang, p.userId, p.deckId, p.topicId, p.now, p.limit)
    .all<DueRow>();
  return results;
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
           SELECT 1 FROM progress pr WHERE pr.user_id = ? AND pr.deck_id = ? AND pr.word_id = w.id)
       ORDER BY ${LEVEL_ORDER}, w.id
       LIMIT ?`,
    )
    .bind(p.targetLang, p.topicId, p.userId, p.deckId, p.limit)
    .all<{ id: number }>();
  return results.map((r) => r.id);
}

// Same topic first, then the rest of the deck with the same part of speech.
export async function findDistractorIds(
  db: D1Database,
  p: {
    lang: string;
    targetLang: string;
    pos: string;
    topicId: number;
    excludeWordId: number;
    limit: number;
  },
): Promise<number[]> {
  const { results } = await db
    .prepare(
      `SELECT w.id
       FROM words w
       JOIN translations tr ON tr.word_id = w.id AND tr.target_lang = ?
       WHERE w.lang = ? AND w.pos = ? AND w.id <> ? AND ${VISIBLE}
       ORDER BY (w.topic_id = ?) DESC, RANDOM()
       LIMIT ?`,
    )
    .bind(p.targetLang, p.lang, p.pos, p.excludeWordId, p.topicId, p.limit)
    .all<{ id: number }>();
  return results.map((r) => r.id);
}

export type ProgressRow = {
  stage: number;
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
  learned: number;
};

export function findProgress(
  db: D1Database,
  userId: number,
  deckId: number,
  wordId: number,
): Promise<ProgressRow | null> {
  return db
    .prepare(
      `SELECT stage, ease, interval_days, reps, lapses, learned
       FROM progress WHERE user_id = ? AND deck_id = ? AND word_id = ?`,
    )
    .bind(userId, deckId, wordId)
    .first<ProgressRow>();
}

export function upsertProgressStatement(
  db: D1Database,
  userId: number,
  deckId: number,
  wordId: number,
  s: Scheduled,
  now: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO progress
         (user_id, deck_id, word_id, stage, ease, interval_days, due_at, reps, lapses, learned, last_reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, deck_id, word_id) DO UPDATE SET
         stage = excluded.stage, ease = excluded.ease, interval_days = excluded.interval_days,
         due_at = excluded.due_at, reps = excluded.reps, lapses = excluded.lapses,
         learned = excluded.learned, last_reviewed_at = excluded.last_reviewed_at`,
    )
    .bind(
      userId,
      deckId,
      wordId,
      s.stage,
      s.ease,
      s.intervalDays,
      s.dueAt,
      s.reps,
      s.lapses,
      s.learned ? 1 : 0,
      now,
    );
}

export function insertReviewLogStatement(
  db: D1Database,
  r: {
    userId: number;
    deckId: number;
    wordId: number;
    mode: string;
    correct: boolean;
    typed: string | null;
    now: number;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO review_log (user_id, deck_id, word_id, mode, correct, typed_answer, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      r.userId,
      r.deckId,
      r.wordId,
      r.mode,
      r.correct ? 1 : 0,
      r.typed,
      r.now,
    );
}

export type SessionStateRow = { deck_id: number; payload_json: string };

export function findSessionByDeck(
  db: D1Database,
  userId: number,
  deckId: number,
): Promise<SessionStateRow | null> {
  return db
    .prepare(
      'SELECT deck_id, payload_json FROM session_state WHERE user_id = ? AND deck_id = ?',
    )
    .bind(userId, deckId)
    .first<SessionStateRow>();
}

export function findSessionById(
  db: D1Database,
  userId: number,
  sessionId: string,
): Promise<SessionStateRow | null> {
  return db
    .prepare(
      `SELECT deck_id, payload_json FROM session_state
       WHERE user_id = ? AND json_extract(payload_json, '$.id') = ?`,
    )
    .bind(userId, sessionId)
    .first<SessionStateRow>();
}

export function upsertSessionStatement(
  db: D1Database,
  userId: number,
  deckId: number,
  payloadJson: string,
  now: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO session_state (user_id, deck_id, payload_json, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, deck_id) DO UPDATE SET
         payload_json = excluded.payload_json, updated_at = excluded.updated_at`,
    )
    .bind(userId, deckId, payloadJson, now);
}

export function deleteSessionStatement(
  db: D1Database,
  userId: number,
  deckId: number,
): D1PreparedStatement {
  return db
    .prepare('DELETE FROM session_state WHERE user_id = ? AND deck_id = ?')
    .bind(userId, deckId);
}
