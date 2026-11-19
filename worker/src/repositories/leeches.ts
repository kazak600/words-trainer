import type { CardKind } from './cards';

export type LeechRow = {
  cardId: number;
  wordId: number;
  kind: CardKind;
  lapses: number;
  lemma: string;
  pos: string;
  translation: string;
  textWithGap: string | null;
  hint: string | null;
  mnemonic: string | null;
  similarWord: string | null;
};

export async function listLeeches(
  db: D1Database,
  p: { userId: number; deckId: number; targetLang: string },
): Promise<LeechRow[]> {
  const { results } = await db
    .prepare(
      `SELECT c.id AS cardId, c.word_id AS wordId, c.kind, c.lapses, w.lemma, w.pos,
              tr.text AS translation, s.text_with_gap AS textWithGap, s.hint,
              n.mnemonic, n.similar_word AS similarWord
       FROM cards c
       JOIN words w ON w.id = c.word_id
       JOIN translations tr ON tr.word_id = w.id AND tr.target_lang = ?1
         AND tr.review_status IN ('approved', 'edited')
       LEFT JOIN sentences s ON s.id = c.sentence_id
       LEFT JOIN word_notes n ON n.word_id = w.id AND n.user_id = ?2
       WHERE c.user_id = ?2 AND c.deck_id = ?3 AND c.leech = 1
       ORDER BY c.lapses DESC, c.id`,
    )
    .bind(p.targetLang, p.userId, p.deckId)
    .all<LeechRow>();
  return results;
}

export type Notes = { mnemonic: string; similarWord: string };

export async function findNotes(
  db: D1Database,
  userId: number,
  wordId: number,
): Promise<Notes> {
  const row = await db
    .prepare(
      'SELECT mnemonic, similar_word AS similarWord FROM word_notes WHERE user_id = ? AND word_id = ?',
    )
    .bind(userId, wordId)
    .first<Notes>();
  return row ?? { mnemonic: '', similarWord: '' };
}

export function upsertNotes(
  db: D1Database,
  userId: number,
  wordId: number,
  notes: Notes,
): Promise<D1Result> {
  return db
    .prepare(
      `INSERT INTO word_notes (user_id, word_id, mnemonic, similar_word) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, word_id) DO UPDATE SET
         mnemonic = excluded.mnemonic, similar_word = excluded.similar_word`,
    )
    .bind(userId, wordId, notes.mnemonic, notes.similarWord)
    .run();
}

export async function wordExistsInLang(
  db: D1Database,
  wordId: number,
  lang: string,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS ok FROM words WHERE id = ? AND lang = ?')
    .bind(wordId, lang)
    .first();
  return row !== null;
}

export async function unsuspendLeech(
  db: D1Database,
  p: { userId: number; deckId: number; cardId: number },
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE cards SET suspended = 0, leech = 0
       WHERE id = ? AND user_id = ? AND deck_id = ? AND leech = 1`,
    )
    .bind(p.cardId, p.userId, p.deckId)
    .run();
  return result.meta.changes > 0;
}
