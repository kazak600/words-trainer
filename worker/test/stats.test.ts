import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app';
import { loginCookie } from './helpers/auth';
import {
  createTestD1,
  seedCard,
  seedReviewLog,
  seedUser,
  seedWord,
  type TestD1,
} from './helpers/d1';

import type { Stats } from '../src/services/stats';

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
  freezeClock();
});

afterEach(async () => {
  vi.useRealTimers();
  await t.dispose();
});

const get = (path: string, withCookie = true) =>
  app.request(path, { headers: withCookie ? { cookie } : {} }, env);
const iso = (s: string) => Math.floor(Date.parse(s) / 1000);
const NOW = iso('2026-11-20T12:00:00Z');
const freezeClock = () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW * 1000);
};

async function seedProgress() {
  const learned = await seedWord(t.db, {
    lemma: 'a',
    topic: 'home',
    level: 'A1',
  });
  const review = await seedWord(t.db, {
    lemma: 'b',
    topic: 'home',
    level: 'A1',
  });
  const learning = await seedWord(t.db, {
    lemma: 'c',
    topic: 'food-and-drink',
    level: 'A2',
  });
  const relearning = await seedWord(t.db, {
    lemma: 'd',
    topic: 'food-and-drink',
    level: 'A2',
  });
  const fresh = await seedWord(t.db, {
    lemma: 'e',
    topic: 'food-and-drink',
    level: 'A2',
  });
  await seedWord(t.db, {
    lemma: 'hidden',
    topic: 'home',
    level: 'A1',
    status: 'pending',
  });

  await seedCard(t.db, {
    userId,
    wordId: learned,
    kind: 'production',
    state: 2,
    stability: 30,
  });
  await seedCard(t.db, {
    userId,
    wordId: learned,
    kind: 'recognition',
    state: 2,
    stability: 30,
  });
  await seedCard(t.db, {
    userId,
    wordId: review,
    kind: 'production',
    state: 2,
    stability: 5,
  });
  await seedCard(t.db, {
    userId,
    wordId: learning,
    kind: 'recognition',
    state: 1,
  });
  await seedCard(t.db, {
    userId,
    wordId: relearning,
    kind: 'recognition',
    state: 3,
    suspended: true,
    leech: true,
  });
  return { learned, review, learning, relearning, fresh };
}

describe('GET /api/decks/:deck/stats', () => {
  it('counts words by state, level and topic', async () => {
    await seedProgress();

    const res = await get('/api/decks/lv-uk/stats');

    expect(res.status).toBe(200);
    const body = (await res.json()) as Stats;
    expect(body.states).toEqual({ new: 1, learning: 2, review: 1, learned: 1 });
    expect(body.levels).toEqual([
      { level: 'A1', total: 2, learned: 1 },
      { level: 'A2', total: 3, learned: 0 },
    ]);
    expect(body.topics.map((x) => [x.title, x.total, x.learned])).toEqual([
      ['Māja un dzīvesvieta', 2, 1],
      ['Ēdiens un dzērieni', 3, 0],
    ]);
  });

  it('does not count a word as learned when only the recognition card is mature', async () => {
    const w = await seedWord(t.db, { lemma: 'a', topic: 'home', level: 'A1' });
    await seedCard(t.db, {
      userId,
      wordId: w,
      kind: 'recognition',
      state: 2,
      stability: 99,
    });

    const body = (await (await get('/api/decks/lv-uk/stats')).json()) as Stats;

    expect(body.states).toEqual({ new: 0, learning: 0, review: 1, learned: 0 });
  });

  it('ignores the cards of other users', async () => {
    const other = await seedUser(t.db, 'other', 'pw');
    const w = await seedWord(t.db, { lemma: 'a', topic: 'home', level: 'A1' });
    await seedCard(t.db, {
      userId: other,
      wordId: w,
      kind: 'production',
      state: 2,
      stability: 30,
    });
    await seedReviewLog(t.db, other, w, NOW - 10);

    const body = (await (await get('/api/decks/lv-uk/stats')).json()) as Stats;

    expect(body.states).toEqual({ new: 1, learning: 0, review: 0, learned: 0 });
    expect(body.days).toEqual([]);
  });

  it('groups reviews by local day', async () => {
    const w = await seedWord(t.db, { lemma: 'a', topic: 'home', level: 'A1' });
    await seedReviewLog(t.db, userId, w, iso('2026-11-19T22:30:00Z'));
    await seedReviewLog(t.db, userId, w, iso('2026-11-19T21:30:00Z'));
    await seedReviewLog(t.db, userId, w, iso('2026-11-20T08:00:00Z'));

    const east = (await (
      await get('/api/decks/lv-uk/stats?tzOffset=120')
    ).json()) as Stats;
    expect(east.days).toEqual([
      { day: '2026-11-19', reviews: 1 },
      { day: '2026-11-20', reviews: 2 },
    ]);

    const west = (await (
      await get('/api/decks/lv-uk/stats?tzOffset=-300')
    ).json()) as Stats;
    expect(west.days).toEqual([
      { day: '2026-11-19', reviews: 2 },
      { day: '2026-11-20', reviews: 1 },
    ]);
  });

  it('keeps only the last 90 local days', async () => {
    const w = await seedWord(t.db, { lemma: 'a', topic: 'home', level: 'A1' });
    await seedReviewLog(t.db, userId, w, NOW - 100 * 86_400);
    await seedReviewLog(t.db, userId, w, NOW - 3 * 86_400);

    const body = (await (await get('/api/decks/lv-uk/stats')).json()) as Stats;

    expect(body.days).toEqual([{ day: '2026-11-17', reviews: 1 }]);
  });

  it('rejects a bad tzOffset, an unknown deck and a missing cookie', async () => {
    expect((await get('/api/decks/lv-uk/stats?tzOffset=abc')).status).toBe(400);
    expect((await get('/api/decks/nope/stats')).status).toBe(404);
    expect((await get('/api/decks/lv-uk/stats', false)).status).toBe(401);
  });
});
