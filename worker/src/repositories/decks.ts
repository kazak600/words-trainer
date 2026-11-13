export type DeckRow = {
  id: number;
  slug: string;
  source_lang: string;
  target_lang: string;
  title: string;
};

export async function listDecks(db: D1Database): Promise<DeckRow[]> {
  const { results } = await db
    .prepare('SELECT id, slug, source_lang, target_lang, title FROM decks ORDER BY id')
    .all<DeckRow>();
  return results;
}

export function findDeckBySlug(db: D1Database, slug: string): Promise<DeckRow | null> {
  return db
    .prepare('SELECT id, slug, source_lang, target_lang, title FROM decks WHERE slug = ?')
    .bind(slug)
    .first<DeckRow>();
}
