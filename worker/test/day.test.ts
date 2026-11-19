import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { localDay, localDayWindow, parseTzOffset } from '../src/lib/day';
import { loginCookie } from './helpers/auth';
import { createTestD1, type TestD1 } from './helpers/d1';

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

describe('localDay', () => {
  it('shifts the day boundary by the offset in minutes east of UTC', () => {
    const lateEveningUtc = 20 * 86_400 + 23 * 3600 + 30 * 60;

    expect(localDay(lateEveningUtc, 0)).toBe(20);
    expect(localDay(lateEveningUtc, 120)).toBe(21);
    expect(localDay(lateEveningUtc, -300)).toBe(20);
    expect(localDay(20 * 86_400 + 60, -120)).toBe(19);
  });
});

describe('removed streak', () => {
  let t: TestD1;

  beforeEach(async () => {
    t = await createTestD1();
  });
  afterEach(async () => {
    await t.dispose();
  });

  it('has no /api/streak route any more', async () => {
    const env = { DB: t.db };
    const cookie = await loginCookie(env);

    const res = await app.request('/api/streak', { headers: { cookie } }, env);

    expect(res.status).toBe(404);
  });
});
