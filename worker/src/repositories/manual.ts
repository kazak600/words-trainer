export type TopicOptionRow = {
  id: number;
  slug: string;
  title: string;
  titleUk: string;
};

export async function listTopicOptions(
  db: D1Database,
  lang: string,
): Promise<TopicOptionRow[]> {
  const { results } = await db
    .prepare(
      'SELECT id, slug, title, title_uk AS titleUk FROM topics WHERE lang = ? ORDER BY id',
    )
    .bind(lang)
    .all<TopicOptionRow>();
  return results;
}

export async function topicExists(
  db: D1Database,
  lang: string,
  topicId: number,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS ok FROM topics WHERE id = ? AND lang = ?')
    .bind(topicId, lang)
    .first();
  return row !== null;
}

// SQLite folds case for ASCII only, so the caller passes the spellings to compare.
export async function wordExistsAs(
  db: D1Database,
  p: { lang: string; pos: string; lemmas: string[] },
): Promise<boolean> {
  const marks = p.lemmas.map(() => '?').join(', ');
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM words WHERE lang = ? AND pos = ? AND lemma IN (${marks}) LIMIT 1`,
    )
    .bind(p.lang, p.pos, ...p.lemmas)
    .first();
  return row !== null;
}

export function insertManualWordStatement(
  db: D1Database,
  w: {
    lang: string;
    lemma: string;
    pos: string;
    topicId: number;
    level: string;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO words (lang, lemma, pos, topic_id, level, source)
       VALUES (?, ?, ?, ?, ?, 'manual')`,
    )
    .bind(w.lang, w.lemma, w.pos, w.topicId, w.level);
}

export function insertManualTranslationStatement(
  db: D1Database,
  w: { lang: string; lemma: string; pos: string },
  targetLang: string,
  text: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO translations (word_id, target_lang, text, review_status)
       SELECT id, ?, ?, 'approved' FROM words WHERE lang = ? AND lemma = ? AND pos = ?`,
    )
    .bind(targetLang, text, w.lang, w.lemma, w.pos);
}

export type SentenceInput = {
  textWithGap: string;
  answer: string;
  hint: string;
};

export type WordRef =
  { wordId: number } | { lang: string; lemma: string; pos: string };

export function insertManualSentenceStatement(
  db: D1Database,
  ref: WordRef,
  targetLang: string,
  s: SentenceInput,
): D1PreparedStatement {
  const columns = `word_id, text_with_gap, answer, hint_target_lang, hint, review_status, source`;
  const values = [s.textWithGap, s.answer, targetLang, s.hint];
  if ('wordId' in ref) {
    return db
      .prepare(
        `INSERT INTO sentences (${columns})
         SELECT id, ?, ?, ?, ?, 'approved', 'manual' FROM words WHERE id = ?`,
      )
      .bind(...values, ref.wordId);
  }
  return db
    .prepare(
      `INSERT INTO sentences (${columns})
       SELECT id, ?, ?, ?, ?, 'approved', 'manual' FROM words
       WHERE lang = ? AND lemma = ? AND pos = ?`,
    )
    .bind(...values, ref.lang, ref.lemma, ref.pos);
}

export function findWordId(
  db: D1Database,
  w: { lang: string; lemma: string; pos: string },
): Promise<{ id: number } | null> {
  return db
    .prepare('SELECT id FROM words WHERE lang = ? AND lemma = ? AND pos = ?')
    .bind(w.lang, w.lemma, w.pos)
    .first<{ id: number }>();
}
