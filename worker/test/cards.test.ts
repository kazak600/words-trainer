import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newCard, review } from '../src/lib/fsrs';
import {
  countDueCards,
  countLeeches,
  countNewWordsBetween,
  findCard,
  findDueCards,
  findNewWordIds,
  insertCardIfMissingStatement,
  upsertCardStatement,
  type CardKey,
} from '../src/repositories/cards';
import {
  createTestD1,
  seedCard,
  seedReviewLog,
  seedSentence,
  seedUser,
  seedWord,
  type TestD1,
} from './helpers/d1';

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
  (await t.db
    .prepare('SELECT COUNT(*) AS n FROM cards')
    .first<{ n: number }>())!.n;

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

describe('due cards', () => {
  const scope = () => ({
    userId,
    deckId: 1,
    targetLang: 'uk',
    now: NOW,
    limit: 50,
  });

  it('lists due cards oldest first and skips suspended, future and hidden ones', async () => {
    const b = await seedWord(t.db, { lemma: 'b', topic: 'home', level: 'A1' });
    const c = await seedWord(t.db, { lemma: 'c', topic: 'home', level: 'A1' });
    const d = await seedWord(t.db, { lemma: 'd', topic: 'home', level: 'A1' });
    const hidden = await seedWord(t.db, {
      lemma: 'h',
      topic: 'home',
      level: 'A1',
      status: 'pending',
    });
    await seedCard(t.db, { userId, wordId, dueAt: NOW - 10 });
    await seedCard(t.db, { userId, wordId: b, dueAt: NOW - 500 });
    await seedCard(t.db, { userId, wordId: c, dueAt: NOW + 60 });
    await seedCard(t.db, {
      userId,
      wordId: d,
      dueAt: NOW - 5,
      suspended: true,
    });
    await seedCard(t.db, { userId, wordId: hidden, dueAt: NOW - 5 });

    const rows = await findDueCards(t.db, scope());

    expect(rows.map((r) => r.wordId)).toEqual([b, wordId]);
    expect(rows[0]).toMatchObject({ kind: 'recognition', sentenceId: null });
    expect(await countDueCards(t.db, scope())).toBe(2);
  });

  it('lists cloze cards with their sentence id', async () => {
    const sentenceId = await seedSentence(t.db, wordId, {
      gap: 'a ___',
      answer: 'b',
      hint: 'h',
    });
    await seedCard(t.db, {
      userId,
      wordId,
      kind: 'cloze',
      sentenceId,
      dueAt: 1,
    });

    const rows = await findDueCards(t.db, scope());

    expect(rows).toMatchObject([{ kind: 'cloze', sentenceId }]);
    expect(await countDueCards(t.db, scope())).toBe(1);
  });

  it('counts a word once when several of its cards are due', async () => {
    await seedCard(t.db, { userId, wordId, kind: 'recognition', dueAt: 1 });
    await seedCard(t.db, { userId, wordId, kind: 'production', dueAt: 1 });

    expect(await countDueCards(t.db, scope())).toBe(1);
    expect(await findDueCards(t.db, scope())).toHaveLength(2);
  });

  it('does not serve a cloze card whose sentence is no longer approved', async () => {
    const sentenceId = await seedSentence(t.db, wordId, {
      gap: 'a ___',
      answer: 'b',
      hint: 'h',
      status: 'pending',
    });
    await seedCard(t.db, {
      userId,
      wordId,
      kind: 'cloze',
      sentenceId,
      dueAt: 1,
    });

    expect(await findDueCards(t.db, scope())).toEqual([]);
    expect(await countDueCards(t.db, scope())).toBe(0);
  });

  it('narrows to one topic', async () => {
    const home = await seedWord(t.db, {
      lemma: 'b',
      topic: 'home',
      level: 'A1',
    });
    await seedCard(t.db, { userId, wordId, dueAt: 1 });
    await seedCard(t.db, { userId, wordId: home, dueAt: 2 });

    const rows = await findDueCards(t.db, {
      ...scope(),
      topicId: (await t.db
        .prepare("SELECT id FROM topics WHERE slug = 'home'")
        .first<{ id: number }>())!.id,
    });

    expect(rows.map((r) => r.wordId)).toEqual([home]);
  });

  it("ignores another user's cards", async () => {
    const other = await seedUser(t.db, 'other', 'secret');
    await seedCard(t.db, { userId: other, wordId, dueAt: 1 });

    expect(await countDueCards(t.db, scope())).toBe(0);
  });
});

describe('new words', () => {
  it('skips words that already have a card and orders by level', async () => {
    const a2 = await seedWord(t.db, {
      lemma: 'a2',
      topic: 'food-and-drink',
      level: 'A2',
    });
    const b1 = await seedWord(t.db, {
      lemma: 'b1',
      topic: 'food-and-drink',
      level: 'B1',
    });
    const a1b = await seedWord(t.db, {
      lemma: 'a1b',
      topic: 'food-and-drink',
      level: 'A1',
    });
    await seedCard(t.db, { userId, wordId });
    const topicId = (await t.db
      .prepare("SELECT id FROM topics WHERE slug = 'food-and-drink'")
      .first<{ id: number }>())!.id;

    const ids = await findNewWordIds(t.db, {
      userId,
      deckId: 1,
      topicId,
      targetLang: 'uk',
      limit: 10,
    });

    expect(ids).toEqual([a1b, a2, b1]);
  });
});

describe('new word order', () => {
  it('puts hand-added words before dataset words of the same topic', async () => {
    const topicId = (await t.db
      .prepare("SELECT id FROM topics WHERE slug = 'home'")
      .first<{ id: number }>())!.id;
    const dataset = await seedWord(t.db, {
      lemma: 'a1',
      topic: 'home',
      level: 'A1',
    });
    const manual = await seedWord(t.db, {
      lemma: 'm',
      topic: 'home',
      level: 'B1',
    });
    await t.db
      .prepare("UPDATE words SET source = 'manual' WHERE id = ?")
      .bind(manual)
      .run();

    const ids = await findNewWordIds(t.db, {
      userId,
      deckId: 1,
      topicId,
      targetLang: 'uk',
      limit: 10,
    });

    expect(ids).toEqual([manual, dataset]);
  });
});

describe('daily cap count', () => {
  it('counts a word once, by its first review, inside [from, to)', async () => {
    const b = await seedWord(t.db, { lemma: 'b', topic: 'home', level: 'A1' });
    const c = await seedWord(t.db, { lemma: 'c', topic: 'home', level: 'A1' });
    const d = await seedWord(t.db, { lemma: 'd', topic: 'home', level: 'A1' });
    await seedReviewLog(t.db, userId, wordId, 1000);
    await seedReviewLog(t.db, userId, wordId, 1500);
    await seedReviewLog(t.db, userId, b, 900);
    await seedReviewLog(t.db, userId, b, 1200);
    await seedReviewLog(t.db, userId, c, 1000);
    await seedReviewLog(t.db, userId, d, 2000);

    const n = await countNewWordsBetween(t.db, {
      userId,
      deckId: 1,
      from: 1000,
      to: 2000,
    });

    expect(n).toBe(2);
  });
});

describe('insertCardIfMissingStatement', () => {
  it('creates the card once and never overwrites an existing one', async () => {
    const existing = review(newCard(NOW), 'good', NOW);
    await upsertCardStatement(
      t.db,
      key({ kind: 'production' }),
      existing,
      NO_FLAGS,
    ).run();

    await insertCardIfMissingStatement(
      t.db,
      key({ kind: 'production' }),
      newCard(NOW + 5),
    ).run();
    await insertCardIfMissingStatement(
      t.db,
      key({ kind: 'recognition' }),
      newCard(NOW + 5),
    ).run();
    await insertCardIfMissingStatement(
      t.db,
      key({ kind: 'recognition' }),
      newCard(NOW + 99),
    ).run();

    expect((await findCard(t.db, key({ kind: 'production' })))!.card.reps).toBe(
      existing.reps,
    );
    const created = await findCard(t.db, key({ kind: 'recognition' }));
    expect(created!.card.dueAt).toBe(NOW + 5);
    expect(await countCards()).toBe(2);
  });
});

describe('leech count', () => {
  it('counts leech cards with a visible translation for the user', async () => {
    const hidden = await seedWord(t.db, {
      lemma: 'h',
      topic: 'home',
      level: 'A1',
      status: 'pending',
    });
    const other = await seedUser(t.db, 'other', 'pw');
    await seedCard(t.db, { userId, wordId, leech: true, suspended: true });
    await seedCard(t.db, {
      userId,
      wordId: hidden,
      leech: true,
      suspended: true,
    });
    await seedCard(t.db, {
      userId: other,
      wordId,
      leech: true,
      suspended: true,
    });

    expect(
      await countLeeches(t.db, { userId, deckId: 1, targetLang: 'uk' }),
    ).toBe(1);
  });
});
