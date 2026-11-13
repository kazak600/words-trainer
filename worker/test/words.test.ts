import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { loginCookie } from './helpers/auth';
import { createTestD1, seedWord, type TestD1 } from './helpers/d1';

let t: TestD1;
let env: { DB: D1Database };
let headers: { cookie: string };

async function topicId(slug: string): Promise<number> {
  const row = await t.db.prepare("SELECT id FROM topics WHERE slug = ?").bind(slug).first<{ id: number }>();
  return row!.id;
}

beforeEach(async () => {
  t = await createTestD1();
  env = { DB: t.db };
  headers = { cookie: await loginCookie(env) };
});

afterEach(async () => {
  await t.dispose();
});

describe('GET /api/decks', () => {
  it('lists the seeded deck', async () => {
    const res = await app.request('/api/decks', { headers }, env);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { slug: 'lv-uk', sourceLang: 'lv', targetLang: 'uk', title: 'Latvian → Ukrainian' },
    ]);
  });
});

describe('GET /api/decks/:deck/topics', () => {
  it('counts visible words per level and hides topics with none', async () => {
    await seedWord(t.db, { lemma: 'māja', topic: 'home', level: 'A2' });
    await seedWord(t.db, { lemma: 'istaba', topic: 'home', level: 'A2', status: 'edited' });
    await seedWord(t.db, { lemma: 'durvis', topic: 'home', level: 'A1' });
    await seedWord(t.db, { lemma: 'jumts', topic: 'home', level: 'A2', status: 'pending' });
    await seedWord(t.db, { lemma: 'suns', topic: 'animals', level: 'A1', status: 'pending' });

    const res = await app.request('/api/decks/lv-uk/topics', { headers }, env);
    const body = (await res.json()) as { slug: string; wordCounts: Record<string, number> }[];

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      slug: 'home',
      title: expect.any(String),
      titleUk: expect.any(String),
      wordCounts: { A1: 1, A2: 2 },
    });
  });

  it('returns 404 for an unknown deck', async () => {
    const res = await app.request('/api/decks/nope/topics', { headers }, env);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/decks/:deck/topics/:topicId/words', () => {
  it('returns approved and edited words ordered by level then dataset order, hiding pending', async () => {
    await seedWord(t.db, { lemma: 'māja', topic: 'home', level: 'A2', ukrainian: 'будинок' });
    await seedWord(t.db, {
      lemma: 'durvis',
      topic: 'home',
      level: 'A1',
      grammar: { gender: 'f' },
      sentence: { gap: 'Atver ___!', answer: 'durvis', hint: 'Відчини двері!' },
    });
    await seedWord(t.db, { lemma: 'istaba', topic: 'home', level: 'A2', status: 'edited' });
    await seedWord(t.db, { lemma: 'jumts', topic: 'home', level: 'A2', status: 'pending' });
    await seedWord(t.db, { lemma: 'suns', topic: 'animals', level: 'A1' });

    const res = await app.request(`/api/decks/lv-uk/topics/${await topicId('home')}/words`, { headers }, env);
    const body = (await res.json()) as Record<string, unknown>[];

    expect(res.status).toBe(200);
    expect(body.map((w) => w.lemma)).toEqual(['durvis', 'māja', 'istaba']);
    expect(body[0]).toMatchObject({
      pos: 'noun',
      level: 'A1',
      translation: 'uk-durvis',
      grammar: { gender: 'f' },
      sentences: [{ textWithGap: 'Atver ___!', answer: 'durvis', hint: 'Відчини двері!' }],
    });
    expect(body[1]).toMatchObject({ translation: 'будинок', grammar: null, sentences: [] });
  });

  it('returns 404 for an unknown topic or deck', async () => {
    const unknownTopic = await app.request('/api/decks/lv-uk/topics/99999/words', { headers }, env);
    const unknownDeck = await app.request(`/api/decks/nope/topics/${await topicId('home')}/words`, { headers }, env);

    expect(unknownTopic.status).toBe(404);
    expect(unknownDeck.status).toBe(404);
  });

  it('rejects a non-numeric topic id', async () => {
    const res = await app.request('/api/decks/lv-uk/topics/abc/words', { headers }, env);

    expect(res.status).toBe(400);
  });
});
