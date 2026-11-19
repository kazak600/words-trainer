import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app';
import { loginCookie } from './helpers/auth';
import {
  createTestD1,
  seedCard,
  seedReviewLog,
  seedWord,
  type TestD1,
} from './helpers/d1';

let t: TestD1;
let env: { DB: D1Database };
let cookie: string;
let userId: number;

beforeEach(async () => {
  t = await createTestD1();
  env = { DB: t.db };
  cookie = await loginCookie(env);
  userId = (await t.db.prepare('SELECT id FROM users').first<{ id: number }>())!
    .id;
});

afterEach(async () => {
  vi.useRealTimers();
  await t.dispose();
});

const get = (path: string, withCookie = true) =>
  app.request(path, { headers: withCookie ? { cookie } : {} }, env);
const iso = (s: string) => Math.floor(Date.parse(s) / 1000);

describe('GET /api/decks/:deck/review', () => {
  it('counts and lists due cards across topics, with the daily cap numbers', async () => {
    const a = await seedWord(t.db, { lemma: 'a', topic: 'home', level: 'A1' });
    const b = await seedWord(t.db, {
      lemma: 'b',
      topic: 'food-and-drink',
      level: 'A1',
    });
    const c = await seedWord(t.db, { lemma: 'c', topic: 'home', level: 'A1' });
    const cardA = await seedCard(t.db, { userId, wordId: a, dueAt: 20 });
    const cardB = await seedCard(t.db, {
      userId,
      wordId: b,
      kind: 'production',
      dueAt: 10,
    });
    await seedCard(t.db, { userId, wordId: c, dueAt: 9_999_999_999 });

    const res = await get('/api/decks/lv-uk/review');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      due: 2,
      newToday: 0,
      newCap: 15,
      cards: [
        { cardId: cardB, wordId: b, kind: 'production' },
        { cardId: cardA, wordId: a, kind: 'recognition' },
      ],
    });
  });

  it('counts new words of the local day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(iso('2026-03-09T22:10:00Z') * 1000); // 00:10 at +02:00
    const a = await seedWord(t.db, { lemma: 'a', topic: 'home', level: 'A1' });
    const b = await seedWord(t.db, { lemma: 'b', topic: 'home', level: 'A1' });
    await seedReviewLog(t.db, userId, a, iso('2026-03-09T21:30:00Z'));
    await seedReviewLog(t.db, userId, b, iso('2026-03-09T22:05:00Z'));

    const body = (await (
      await get('/api/decks/lv-uk/review?tzOffset=120')
    ).json()) as { newToday: number };

    expect(body.newToday).toBe(1);
  });

  it('rejects a bad tzOffset, an unknown deck and a missing login', async () => {
    expect((await get('/api/decks/lv-uk/review?tzOffset=abc')).status).toBe(
      400,
    );
    expect((await get('/api/decks/nope/review')).status).toBe(404);
    expect((await get('/api/decks/lv-uk/review', false)).status).toBe(401);
  });
});
