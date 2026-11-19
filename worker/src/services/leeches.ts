import { findDeckBySlug } from '../repositories/decks';
import {
  findNotes,
  listLeeches,
  unsuspendLeech,
  upsertNotes,
  wordExistsInLang,
  type LeechRow,
  type Notes,
} from '../repositories/leeches';

const MAX_NOTE_LENGTH = 500;

export type LeechErrorCode =
  'deck_not_found' | 'word_not_found' | 'card_not_found' | 'invalid_notes';

export class LeechError extends Error {
  constructor(readonly code: LeechErrorCode) {
    super(code);
  }
}

async function requireDeck(db: D1Database, slug: string) {
  const deck = await findDeckBySlug(db, slug);
  if (!deck) throw new LeechError('deck_not_found');
  return deck;
}

export type LeechItem = Omit<LeechRow, 'mnemonic' | 'similarWord'> & Notes;

export async function getLeeches(
  db: D1Database,
  userId: number,
  deckSlug: string,
): Promise<LeechItem[]> {
  const deck = await requireDeck(db, deckSlug);
  const rows = await listLeeches(db, {
    userId,
    deckId: deck.id,
    targetLang: deck.target_lang,
  });
  return rows.map((r) => ({
    ...r,
    mnemonic: r.mnemonic ?? '',
    similarWord: r.similarWord ?? '',
  }));
}

function validField(value: unknown): value is string | undefined {
  return (
    value === undefined ||
    (typeof value === 'string' && value.length <= MAX_NOTE_LENGTH)
  );
}

export async function saveNotes(
  db: D1Database,
  userId: number,
  deckSlug: string,
  wordId: number,
  input: { mnemonic?: unknown; similarWord?: unknown },
): Promise<Notes> {
  const deck = await requireDeck(db, deckSlug);
  if (!validField(input.mnemonic) || !validField(input.similarWord))
    throw new LeechError('invalid_notes');
  if (!(await wordExistsInLang(db, wordId, deck.source_lang)))
    throw new LeechError('word_not_found');

  const current = await findNotes(db, userId, wordId);
  const next: Notes = {
    mnemonic: input.mnemonic ?? current.mnemonic,
    similarWord: input.similarWord ?? current.similarWord,
  };
  await upsertNotes(db, userId, wordId, next);
  return next;
}

export async function returnToQueue(
  db: D1Database,
  userId: number,
  deckSlug: string,
  cardId: number,
): Promise<{ cardId: number }> {
  const deck = await requireDeck(db, deckSlug);
  if (!(await unsuspendLeech(db, { userId, deckId: deck.id, cardId })))
    throw new LeechError('card_not_found');
  return { cardId };
}
