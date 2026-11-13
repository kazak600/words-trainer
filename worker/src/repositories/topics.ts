export type TopicLevelCountRow = {
  id: number;
  slug: string;
  title: string;
  title_uk: string;
  level: string;
  word_count: number;
};

export type TopicRow = { id: number; slug: string; title: string; title_uk: string };

export async function listTopicLevelCounts(
  db: D1Database,
  sourceLang: string,
  targetLang: string,
): Promise<TopicLevelCountRow[]> {
  const { results } = await db
    .prepare(
      `SELECT t.id, t.slug, t.title, t.title_uk, w.level, COUNT(*) AS word_count
       FROM topics t
       JOIN words w ON w.topic_id = t.id
       JOIN translations tr ON tr.word_id = w.id AND tr.target_lang = ?
       WHERE t.lang = ? AND tr.review_status IN ('approved', 'edited')
       GROUP BY t.id, w.level
       ORDER BY t.id, w.level`,
    )
    .bind(targetLang, sourceLang)
    .all<TopicLevelCountRow>();
  return results;
}

export function findTopic(db: D1Database, lang: string, id: number): Promise<TopicRow | null> {
  return db
    .prepare('SELECT id, slug, title, title_uk FROM topics WHERE id = ? AND lang = ?')
    .bind(id, lang)
    .first<TopicRow>();
}
