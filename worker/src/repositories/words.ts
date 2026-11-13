export type WordSentenceRow = {
  id: number;
  lemma: string;
  pos: string;
  level: string;
  grammar_json: string | null;
  forms_json: string | null;
  translation: string;
  sentence_id: number | null;
  text_with_gap: string | null;
  answer: string | null;
  hint: string | null;
};

// One row per (word, sentence); a word without sentences yields one row with null sentence columns.
export async function listWordRowsByTopic(
  db: D1Database,
  topicId: number,
  targetLang: string,
): Promise<WordSentenceRow[]> {
  const { results } = await db
    .prepare(
      `SELECT w.id, w.lemma, w.pos, w.level, w.grammar_json, w.forms_json, tr.text AS translation,
              s.id AS sentence_id, s.text_with_gap, s.answer, s.hint
       FROM words w
       JOIN translations tr ON tr.word_id = w.id AND tr.target_lang = ?1
       LEFT JOIN sentences s ON s.word_id = w.id AND s.hint_target_lang = ?1
         AND s.review_status IN ('approved', 'edited')
       WHERE w.topic_id = ?2 AND tr.review_status IN ('approved', 'edited')
       ORDER BY CASE w.level WHEN 'A1' THEN 1 WHEN 'A2' THEN 2 WHEN 'B1' THEN 3 ELSE 4 END, w.id, s.id`,
    )
    .bind(targetLang, topicId)
    .all<WordSentenceRow>();
  return results;
}
