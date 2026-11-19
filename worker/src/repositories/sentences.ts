export type SentenceRow = {
  id: number;
  wordId: number;
  textWithGap: string;
  answer: string;
  hint: string;
};

const COLUMNS = `id, word_id AS wordId, text_with_gap AS textWithGap, answer, hint`;

export async function listVisibleSentences(
  db: D1Database,
  wordId: number,
  targetLang: string,
): Promise<SentenceRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNS} FROM sentences
       WHERE word_id = ? AND hint_target_lang = ? AND review_status IN ('approved', 'edited')
       ORDER BY id`,
    )
    .bind(wordId, targetLang)
    .all<SentenceRow>();
  return results;
}

export function findSentence(
  db: D1Database,
  id: number,
): Promise<SentenceRow | null> {
  return db
    .prepare(`SELECT ${COLUMNS} FROM sentences WHERE id = ?`)
    .bind(id)
    .first<SentenceRow>();
}
