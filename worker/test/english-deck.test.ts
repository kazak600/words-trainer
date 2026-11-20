import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { loginCookie } from './helpers/auth';
import { createTestD1, seedWord, type TestD1 } from './helpers/d1';

let t: TestD1;
let env: { DB: D1Database };
let cookie: string;

beforeEach(async () => {
  t = await createTestD1();
  env = { DB: t.db };
  cookie = await loginCookie(env);
});

afterEach(async () => {
  await t.dispose();
});

const call = (path: string, method = 'GET', body?: unknown) =>
  app.request(
    path,
    {
      method,
      headers: { 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );

type Topic = { id: number; slug: string; counts: { new: number } };
const topics = async (deck: string) =>
  (await (await call(`/api/decks/${deck}/topics`)).json()) as Topic[];

async function seedEnglish() {
  await seedWord(t.db, {
    lang: 'en',
    lemma: 'bread',
    topic: 'food-and-drink',
    level: 'A1',
    ukrainian: 'хліб',
    sentence: { gap: 'I eat ___.', answer: 'bread', hint: 'Я їм хліб.' },
  });
  await seedWord(t.db, {
    lang: 'en',
    lemma: 'cheese',
    topic: 'food-and-drink',
    level: 'A1',
    ukrainian: 'сир',
  });
  await seedWord(t.db, {
    lemma: 'maize',
    topic: 'food-and-drink',
    level: 'A1',
  });
}

describe('the en-uk deck', () => {
  it('is listed next to lv-uk', async () => {
    const decks = (await (await call('/api/decks')).json()) as {
      slug: string;
      sourceLang: string;
      targetLang: string;
    }[];

    expect(decks.map((d) => [d.slug, d.sourceLang, d.targetLang])).toEqual([
      ['lv-uk', 'lv', 'uk'],
      ['en-uk', 'en', 'uk'],
    ]);
  });

  it('has its own topics and word counts, apart from the Latvian ones', async () => {
    await seedEnglish();

    const english = await topics('en-uk');
    const latvian = await topics('lv-uk');

    expect(english.find((x) => x.slug === 'food-and-drink')?.counts.new).toBe(
      2,
    );
    expect(latvian.find((x) => x.slug === 'food-and-drink')?.counts.new).toBe(
      1,
    );
    expect(english.every((x) => x.id !== latvian[0]!.id)).toBe(true);
  });

  it('studies English words through the same session flow, never mixing in Latvian ones', async () => {
    await seedEnglish();
    const food = (await topics('en-uk')).find(
      (x) => x.slug === 'food-and-drink',
    )!;

    const res = await call('/api/decks/en-uk/sessions', 'POST', {
      topicId: food.id,
      learn: true,
    });
    const session = (await res.json()) as {
      id: string;
      total: number;
      card: { kind: string; lemma: string };
    };

    expect(res.status).toBe(201);
    expect(session.total).toBe(6);
    expect(session.card).toMatchObject({ kind: 'intro' });
    expect(['bread', 'cheese']).toContain(session.card.lemma);
  });

  it('keeps the Latvian topics out of an English session', async () => {
    await seedEnglish();
    const latvianFood = (await topics('lv-uk')).find(
      (x) => x.slug === 'food-and-drink',
    )!;

    const res = await call('/api/decks/en-uk/sessions', 'POST', {
      topicId: latvianFood.id,
    });

    expect(res.status).toBe(404);
  });

  it('passes a one-letter English typo and shows it as a typo', async () => {
    await seedEnglish();
    const food = (await topics('en-uk')).find(
      (x) => x.slug === 'food-and-drink',
    )!;
    const session = (await (
      await call('/api/decks/en-uk/sessions', 'POST', {
        topicId: food.id,
        learn: true,
      })
    ).json()) as { id: string; card: { lemma: string } };
    await call(`/api/sessions/${session.id}/answer`, 'POST', {
      cardIndex: 0,
      grade: 'good',
    });

    const reply = (await (
      await call(`/api/sessions/${session.id}/answer`, 'POST', {
        cardIndex: 1,
        typed: session.card.lemma + 'x',
      })
    ).json()) as { verdict: string; correct: boolean };

    expect(reply).toMatchObject({ verdict: 'typo', correct: true });
  });
});
