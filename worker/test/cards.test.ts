import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newCard, review } from '../src/lib/fsrs';
import {
  findCard,
  upsertCardStatement,
  type CardKey,
} from '../src/repositories/cards';
import { createTestD1, seedUser, seedWord, type TestD1 } from './helpers/d1';

const NOW = 1_800_000_000;
const NO_FLAGS = { suspended: false, leech: false };

let t: TestD1;
let userId: number;
let wordId: number;

const key = (overrides: Partial<CardKey> = {}): CardKey => ({
  userId,
  deckId: 1,
  wordId,
  kind: 'recognition',
  sentenceId: null,
  ...overrides,
});

const countCards = async (): Promise<number> =>
  (await t.db.prepare('SELECT COUNT(*) AS n FROM cards').first<{ n: number }>())!
    .n;

beforeEach(async () => {
  t = await createTestD1();
  userId = await seedUser(t.db, 'anton', 'secret');
  wordId = await seedWord(t.db, {
    lemma: 'maize',
    topic: 'food-and-drink',
    level: 'A1',
  });
});

afterEach(async () => {
  await t.dispose();
});

describe('card repository', () => {
  it('returns null for a missing card', async () => {
    expect(await findCard(t.db, key())).toBeNull();
  });

  it('round-trips a card with its flags', async () => {
    const card = review(newCard(NOW), 'good', NOW);
    await upsertCardStatement(t.db, key(), card, NO_FLAGS).run();

    const stored = await findCard(t.db, key());

    expect(stored?.card).toEqual(card);
    expect(stored).toMatchObject({ ...key(), suspended: false, leech: false });
  });

  it('round-trips a new card with no last review', async () => {
    await upsertCardStatement(t.db, key(), newCard(NOW), NO_FLAGS).run();

    expect((await findCard(t.db, key()))?.card.lastReviewAt).toBeNull();
  });

  it('stores the suspended and leech flags', async () => {
    await upsertCardStatement(t.db, key(), newCard(NOW), {
      suspended: true,
      leech: true,
    }).run();

    expect(await findCard(t.db, key())).toMatchObject({
      suspended: true,
      leech: true,
    });
  });

  it('updates in place when upserting the same key twice', async () => {
    const first = review(newCard(NOW), 'good', NOW);
    const second = review(first, 'good', first.dueAt);
    await upsertCardStatement(t.db, key(), first, NO_FLAGS).run();
    await upsertCardStatement(t.db, key(), second, NO_FLAGS).run();

    expect(await countCards()).toBe(1);
    expect((await findCard(t.db, key()))?.card).toEqual(second);
  });

  it('keeps a cloze card apart from the recognition card of the same word', async () => {
    const sentenceId = (await t.db
      .prepare(
        `INSERT INTO sentences (word_id, text_with_gap, answer, hint_target_lang, hint)
         VALUES (?, 'Es ēdu ___', 'maizi', 'uk', 'Я їм хліб') RETURNING id`,
      )
      .bind(wordId)
      .first<{ id: number }>())!.id;
    const cloze = key({ kind: 'cloze', sentenceId });
    await upsertCardStatement(t.db, key(), newCard(NOW), NO_FLAGS).run();
    await upsertCardStatement(t.db, cloze, newCard(NOW), NO_FLAGS).run();

    expect(await countCards()).toBe(2);
    expect((await findCard(t.db, cloze))?.sentenceId).toBe(sentenceId);
    expect((await findCard(t.db, key()))?.sentenceId).toBeNull();
  });
});
