import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { loginCookie } from './helpers/auth';
import {
  createTestD1,
  seedCard,
  seedUser,
  seedWord,
  type TestD1,
} from './helpers/d1';

let t: TestD1;
let env: { DB: D1Database };
let headers: { cookie: string };

async function topicId(slug: string): Promise<number> {
  const row = await t.db
    .prepare("SELECT id FROM topics WHERE lang = 'lv' AND slug = ?")
    .bind(slug)
    .first<{ id: number }>();
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
  it('lists the seeded decks', async () => {
    const res = await app.request('/api/decks', { headers }, env);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        slug: 'lv-uk',
        sourceLang: 'lv',
        targetLang: 'uk',
        title: 'Latvian → Ukrainian',
      },
      {
        slug: 'en-uk',
        sourceLang: 'en',
        targetLang: 'uk',
        title: 'English → Ukrainian',
      },
    ]);
  });
});

describe('GET /api/decks/:deck/topics', () => {
  it('counts visible words per level and hides topics with none', async () => {
    await seedWord(t.db, { lemma: 'māja', topic: 'home', level: 'A2' });
    await seedWord(t.db, {
      lemma: 'istaba',
      topic: 'home',
      level: 'A2',
      status: 'edited',
    });
    await seedWord(t.db, { lemma: 'durvis', topic: 'home', level: 'A1' });
    await seedWord(t.db, {
      lemma: 'jumts',
      topic: 'home',
      level: 'A2',
      status: 'pending',
    });
    await seedWord(t.db, {
      lemma: 'suns',
      topic: 'animals',
      level: 'A1',
      status: 'pending',
    });

    const res = await app.request('/api/decks/lv-uk/topics', { headers }, env);
    const body = (await res.json()) as {
      slug: string;
      wordCounts: Record<string, number>;
    }[];

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

describe('topic progress counts', () => {
  async function counts(): Promise<object> {
    const res = await app.request('/api/decks/lv-uk/topics', { headers }, env);
    return ((await res.json()) as { counts: object }[])[0]!.counts;
  }
  const word = (lemma: string, level = 'A1') =>
    seedWord(t.db, { lemma, topic: 'home', level });
  const meId = async () =>
    (await t.db.prepare('SELECT id FROM users').first<{ id: number }>())!.id;

  it('splits visible words into new, learning and learned', async () => {
    const me = await meId();
    const learned = await word('a');
    const young = await word('b');
    const recOnly = await word('c');
    await word('d', 'A2');
    await seedWord(t.db, {
      lemma: 'hidden',
      topic: 'home',
      level: 'A2',
      status: 'pending',
    });
    await seedCard(t.db, { userId: me, wordId: learned });
    await seedCard(t.db, {
      userId: me,
      wordId: learned,
      kind: 'production',
      state: 2,
      stability: 25,
    });
    await seedCard(t.db, { userId: me, wordId: young });
    await seedCard(t.db, {
      userId: me,
      wordId: young,
      kind: 'production',
      state: 2,
      stability: 10,
    });
    await seedCard(t.db, { userId: me, wordId: recOnly });

    expect(await counts()).toEqual({ new: 1, learning: 2, learned: 1 });
  });

  it("ignores another user's cards", async () => {
    const other = await seedUser(t.db, 'other', 'pw');
    const id = await word('a');
    await seedCard(t.db, { userId: other, wordId: id });
    await seedCard(t.db, {
      userId: other,
      wordId: id,
      kind: 'production',
      state: 2,
      stability: 99,
    });

    expect(await counts()).toEqual({ new: 1, learning: 0, learned: 0 });
  });

  it('keeps a suspended word out of the new count', async () => {
    const me = await meId();
    const id = await word('a');
    await seedCard(t.db, { userId: me, wordId: id, suspended: true });

    expect(await counts()).toEqual({ new: 0, learning: 1, learned: 0 });
  });

  it('does not count a learning production card as learned when its state is relearning', async () => {
    const me = await meId();
    const id = await word('a');
    await seedCard(t.db, { userId: me, wordId: id });
    await seedCard(t.db, {
      userId: me,
      wordId: id,
      kind: 'production',
      state: 3,
      stability: 40,
    });

    expect(await counts()).toEqual({ new: 0, learning: 1, learned: 0 });
  });
});

describe('GET /api/decks/:deck/topics/:topicId/words', () => {
  it('returns approved and edited words ordered by level then dataset order, hiding pending', async () => {
    await seedWord(t.db, {
      lemma: 'māja',
      topic: 'home',
      level: 'A2',
      ukrainian: 'будинок',
    });
    await seedWord(t.db, {
      lemma: 'durvis',
      topic: 'home',
      level: 'A1',
      grammar: { gender: 'f' },
      sentence: { gap: 'Atver ___!', answer: 'durvis', hint: 'Відчини двері!' },
    });
    await seedWord(t.db, {
      lemma: 'istaba',
      topic: 'home',
      level: 'A2',
      status: 'edited',
    });
    await seedWord(t.db, {
      lemma: 'jumts',
      topic: 'home',
      level: 'A2',
      status: 'pending',
    });
    await seedWord(t.db, { lemma: 'suns', topic: 'animals', level: 'A1' });

    const res = await app.request(
      `/api/decks/lv-uk/topics/${await topicId('home')}/words`,
      { headers },
      env,
    );
    const body = (await res.json()) as Record<string, unknown>[];

    expect(res.status).toBe(200);
    expect(body.map((w) => w.lemma)).toEqual(['durvis', 'māja', 'istaba']);
    expect(body[0]).toMatchObject({
      pos: 'noun',
      level: 'A1',
      translation: 'uk-durvis',
      grammar: { gender: 'f' },
      sentences: [
        { textWithGap: 'Atver ___!', answer: 'durvis', hint: 'Відчини двері!' },
      ],
    });
    expect(body[1]).toMatchObject({
      translation: 'будинок',
      grammar: null,
      sentences: [],
    });
  });

  it('returns 404 for an unknown topic or deck', async () => {
    const unknownTopic = await app.request(
      '/api/decks/lv-uk/topics/99999/words',
      { headers },
      env,
    );
    const unknownDeck = await app.request(
      `/api/decks/nope/topics/${await topicId('home')}/words`,
      { headers },
      env,
    );

    expect(unknownTopic.status).toBe(404);
    expect(unknownDeck.status).toBe(404);
  });

  it('rejects a non-numeric topic id', async () => {
    const res = await app.request(
      '/api/decks/lv-uk/topics/abc/words',
      { headers },
      env,
    );

    expect(res.status).toBe(400);
  });
});
