import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findSentence,
  listVisibleSentences,
} from '../src/repositories/sentences';
import {
  createTestD1,
  seedSentence,
  seedWord,
  type TestD1,
} from './helpers/d1';

let t: TestD1;
let wordId: number;

beforeEach(async () => {
  t = await createTestD1();
  wordId = await seedWord(t.db, { lemma: 'maize', topic: 'home', level: 'A1' });
});

afterEach(async () => {
  await t.dispose();
});

describe('sentence repository', () => {
  it('lists approved and edited sentences of the word in id order, skipping pending and other languages', async () => {
    const a = await seedSentence(t.db, wordId, {
      gap: 'a ___',
      answer: 'x',
      hint: 'h1',
    });
    await seedSentence(t.db, wordId, {
      gap: 'b ___',
      answer: 'x',
      hint: 'h2',
      status: 'pending',
    });
    const c = await seedSentence(t.db, wordId, {
      gap: 'c ___',
      answer: 'y',
      hint: 'h3',
      status: 'edited',
    });
    await seedSentence(t.db, wordId, {
      gap: 'd ___',
      answer: 'z',
      hint: 'h4',
      lang: 'en',
    });

    const rows = await listVisibleSentences(t.db, wordId, 'uk');

    expect(rows).toEqual([
      { id: a, wordId, textWithGap: 'a ___', answer: 'x', hint: 'h1' },
      { id: c, wordId, textWithGap: 'c ___', answer: 'y', hint: 'h3' },
    ]);
  });

  it('finds a sentence by id and returns null for a missing one', async () => {
    const id = await seedSentence(t.db, wordId, {
      gap: 'a ___',
      answer: 'x',
      hint: 'h',
    });

    expect(await findSentence(t.db, id)).toMatchObject({ id, answer: 'x' });
    expect(await findSentence(t.db, 9999)).toBeNull();
  });
});
