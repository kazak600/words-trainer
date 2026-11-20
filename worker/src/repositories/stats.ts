import { LEARNED_STABILITY_DAYS } from '../lib/fsrs';

export type WordProgressRow = {
  level: string;
  topic_id: number;
  title: string;
  title_uk: string;
  learned: number;
  review: number;
  learning: number;
};

// One row per approved word of the deck; cards of other users and decks never join in.
export async function listWordProgress(
  db: D1Database,
  p: { userId: number; deckId: number; sourceLang: string; targetLang: string },
): Promise<WordProgressRow[]> {
  const { results } = await db
    .prepare(
      `SELECT w.level, t.id AS topic_id, t.title, t.title_uk,
              COALESCE(MAX(c.kind = 'production' AND c.sentence_id IS NULL
                           AND c.state = 2 AND c.stability >= ${LEARNED_STABILITY_DAYS}), 0) AS learned,
              COALESCE(MAX(c.state = 2), 0) AS review,
              COALESCE(MAX(c.state IN (1, 3)), 0) AS learning
       FROM words w
       JOIN topics t ON t.id = w.topic_id
       JOIN translations tr ON tr.word_id = w.id AND tr.target_lang = ?3
       LEFT JOIN cards c ON c.word_id = w.id AND c.user_id = ?1 AND c.deck_id = ?2
       WHERE t.lang = ?4 AND tr.review_status IN ('approved', 'edited')
       GROUP BY w.id
       ORDER BY t.id, w.level`,
    )
    .bind(p.userId, p.deckId, p.targetLang, p.sourceLang)
    .all<WordProgressRow>();
  return results;
}

export type ReviewDayRow = { day: string; reviews: number };

// Reviews per local day since `from` (Unix seconds); the offset shifts the UTC day boundary.
export async function listReviewDays(
  db: D1Database,
  p: { userId: number; deckId: number; from: number; tzOffsetMinutes: number },
): Promise<ReviewDayRow[]> {
  const { results } = await db
    .prepare(
      `SELECT date(created_at + ?4 * 60, 'unixepoch') AS day, COUNT(*) AS reviews
       FROM review_log
       WHERE user_id = ?1 AND deck_id = ?2 AND created_at >= ?3
       GROUP BY day
       ORDER BY day`,
    )
    .bind(p.userId, p.deckId, p.from, p.tzOffsetMinutes)
    .all<ReviewDayRow>();
  return results;
}
