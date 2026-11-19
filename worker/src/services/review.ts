import { countDueCards, findDueCards } from '../repositories/cards';
import { countNewToday, NEW_WORDS_PER_DAY, requireDeck } from './study';

const LIST_LIMIT = 100;

export type ReviewSummary = {
  due: number;
  newToday: number;
  newCap: number;
  cards: { cardId: number; wordId: number; kind: string }[];
};

export async function getReviewSummary(
  db: D1Database,
  userId: number,
  deckSlug: string,
  tzOffsetMinutes: number,
  now: number,
): Promise<ReviewSummary> {
  const deck = await requireDeck(db, deckSlug);
  const scope = {
    userId,
    deckId: deck.id,
    targetLang: deck.target_lang,
    now,
  };
  const [due, cards, newToday] = await Promise.all([
    countDueCards(db, scope),
    findDueCards(db, { ...scope, limit: LIST_LIMIT }),
    countNewToday(db, userId, deck.id, tzOffsetMinutes, now),
  ]);
  return {
    due,
    newToday,
    newCap: NEW_WORDS_PER_DAY,
    cards: cards.map(({ cardId, wordId, kind }) => ({ cardId, wordId, kind })),
  };
}
