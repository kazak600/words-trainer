import { LEARNED_STABILITY_DAYS } from '../lib/fsrs';

export type TopicLevelCountRow = {
  id: number;
  slug: string;
  title: string;
  title_uk: string;
  level: string;
  word_count: number;
  learned_count: number;
  learning_count: number;
};

export type TopicRow = {
  id: number;
  slug: string;
  title: string;
  title_uk: string;
};

export async function listTopicLevelCounts(
  db: D1Database,
  p: { userId: number; deckId: number; sourceLang: string; targetLang: string },
): Promise<TopicLevelCountRow[]> {
  const { results } = await db
    .prepare(
      `SELECT t.id, t.slug, t.title, t.title_uk, w.level, COUNT(*) AS word_count,
              COALESCE(SUM(prod.id IS NOT NULL), 0) AS learned_count,
              COALESCE(SUM(rec.id IS NOT NULL AND prod.id IS NULL), 0) AS learning_count
       FROM topics t
       JOIN words w ON w.topic_id = t.id
       JOIN translations tr ON tr.word_id = w.id AND tr.target_lang = ?3
       LEFT JOIN cards rec ON rec.word_id = w.id AND rec.user_id = ?1 AND rec.deck_id = ?2
         AND rec.kind = 'recognition' AND rec.sentence_id IS NULL
       LEFT JOIN cards prod ON prod.word_id = w.id AND prod.user_id = ?1 AND prod.deck_id = ?2
         AND prod.kind = 'production' AND prod.sentence_id IS NULL
         AND prod.state = 2 AND prod.stability >= ${LEARNED_STABILITY_DAYS}
       WHERE t.lang = ?4 AND tr.review_status IN ('approved', 'edited')
       GROUP BY t.id, w.level
       ORDER BY t.id, w.level`,
    )
    .bind(p.userId, p.deckId, p.targetLang, p.sourceLang)
    .all<TopicLevelCountRow>();
  return results;
}

export function findTopic(
  db: D1Database,
  lang: string,
  id: number,
): Promise<TopicRow | null> {
  return db
    .prepare(
      'SELECT id, slug, title, title_uk FROM topics WHERE id = ? AND lang = ?',
    )
    .bind(id, lang)
    .first<TopicRow>();
}
