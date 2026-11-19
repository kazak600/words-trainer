export function insertReviewLogStatement(
  db: D1Database,
  r: {
    userId: number;
    deckId: number;
    wordId: number;
    mode: 'flip' | 'write';
    kind: 'recognition' | 'production';
    grade: number;
    correct: boolean;
    typed: string | null;
    now: number;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO review_log (user_id, deck_id, word_id, mode, kind, grade, correct, typed_answer, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      r.userId,
      r.deckId,
      r.wordId,
      r.mode,
      r.kind,
      r.grade,
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

// The latest log row of the word is the answer being raised.
export function raiseLatestGradeStatement(
  db: D1Database,
  userId: number,
  deckId: number,
  wordId: number,
  kind: string,
  grade: number,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE review_log SET grade = ?
       WHERE id = (SELECT MAX(id) FROM review_log
                   WHERE user_id = ? AND deck_id = ? AND word_id = ? AND kind = ?)`,
    )
    .bind(grade, userId, deckId, wordId, kind);
}
