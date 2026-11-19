import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import {
  computeStreak,
  localDay,
  localDayWindow,
  parseTzOffset,
} from '../src/lib/streak';
import { loginCookie } from './helpers/auth';
import { createTestD1, seedWord, type TestD1 } from './helpers/d1';

describe('localDayWindow', () => {
  const utc = (iso: string) => Math.floor(Date.parse(iso) / 1000);

  it('is the UTC day for offset 0', () => {
    expect(localDayWindow(utc('2026-03-10T13:00:00Z'), 0)).toEqual({
      from: utc('2026-03-10T00:00:00Z'),
      to: utc('2026-03-11T00:00:00Z'),
    });
  });

  it('starts at local midnight east of UTC', () => {
    expect(localDayWindow(utc('2026-03-09T22:10:00Z'), 120)).toEqual({
      from: utc('2026-03-09T22:00:00Z'),
      to: utc('2026-03-10T22:00:00Z'),
    });
  });

  it('starts at local midnight west of UTC', () => {
    expect(localDayWindow(utc('2026-03-10T03:00:00Z'), -300)).toEqual({
      from: utc('2026-03-09T05:00:00Z'),
      to: utc('2026-03-10T05:00:00Z'),
    });
  });
});

describe('parseTzOffset', () => {
  it('defaults to 0 and accepts whole minutes within 14 hours', () => {
    expect(parseTzOffset(undefined)).toBe(0);
    expect(parseTzOffset('120')).toBe(120);
    expect(parseTzOffset(-300)).toBe(-300);
  });

  it('rejects anything else', () => {
    expect(parseTzOffset('abc')).toBeNull();
    expect(parseTzOffset('1.5')).toBeNull();
    expect(parseTzOffset(841)).toBeNull();
  });
});

describe('computeStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(computeStreak([10, 9, 8], 10)).toEqual({
      days: 3,
      studiedToday: true,
    });
  });

  it('keeps the streak alive when today has no study yet', () => {
    expect(computeStreak([9, 8], 10)).toEqual({ days: 2, studiedToday: false });
  });

  it('is zero when the last study day is older than yesterday', () => {
    expect(computeStreak([8, 7], 10)).toEqual({ days: 0, studiedToday: false });
  });

  it('stops at the first gap and ignores duplicates and future days', () => {
    expect(computeStreak([10, 10, 9, 7, 6], 10)).toEqual({
      days: 2,
      studiedToday: true,
    });
    expect(computeStreak([11, 10], 10).days).toBe(1);
  });

  it('is zero without any study', () => {
    expect(computeStreak([], 10)).toEqual({ days: 0, studiedToday: false });
  });
});

describe('localDay', () => {
  it('shifts the day boundary by the offset in minutes east of UTC', () => {
    const lateEveningUtc = 20 * 86_400 + 23 * 3600 + 30 * 60;

    expect(localDay(lateEveningUtc, 0)).toBe(20);
    expect(localDay(lateEveningUtc, 120)).toBe(21);
    expect(localDay(lateEveningUtc, -300)).toBe(20);
    expect(localDay(20 * 86_400 + 60, -120)).toBe(19);
  });
});

describe('GET /api/streak', () => {
  let t: TestD1;
  let env: { DB: D1Database };
  let cookie: string;
  let userId: number;
  let wordId: number;
  const DAY = 86_400;
  const now = () => Math.floor(Date.now() / 1000);

  beforeEach(async () => {
    t = await createTestD1();
    env = { DB: t.db };
    cookie = await loginCookie(env);
    userId = (await t.db
      .prepare('SELECT id FROM users')
      .first<{ id: number }>())!.id;
    wordId = await seedWord(t.db, {
      lemma: 'māja',
      topic: 'home',
      level: 'A1',
    });
  });

  afterEach(async () => {
    await t.dispose();
  });

  async function logReview(at: number) {
    await t.db
      .prepare(
        `INSERT INTO review_log (user_id, deck_id, word_id, mode, correct, created_at)
         VALUES (?, 1, ?, 'flip', 1, ?)`,
      )
      .bind(userId, wordId, at)
      .run();
  }

  function streak(query = '') {
    return app.request(`/api/streak${query}`, { headers: { cookie } }, env);
  }

  it('counts days with at least one review, two reviews on a day count once', async () => {
    await logReview(now());
    await logReview(now() - 60);
    await logReview(now() - DAY);
    await logReview(now() - 2 * DAY);

    const res = await streak();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ days: 3, studiedToday: true });
  });

  it('breaks after a missed day', async () => {
    await logReview(now() - 3 * DAY);
    await logReview(now() - 2 * DAY);

    expect(await (await streak()).json()).toEqual({
      days: 0,
      studiedToday: false,
    });
  });

  it('rejects an invalid tzOffset', async () => {
    expect((await streak('?tzOffset=abc')).status).toBe(400);
  });

  it('requires login', async () => {
    expect((await app.request('/api/streak', {}, env)).status).toBe(401);
  });
});
