import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { hashToken } from '../src/lib/crypto';
import { cookieValue, loginCookie, PASSWORD, USERNAME } from './helpers/auth';
import { createTestD1, seedUser, type TestD1 } from './helpers/d1';

let t: TestD1;
let env: { DB: D1Database };

beforeEach(async () => {
  t = await createTestD1();
  env = { DB: t.db };
});

afterEach(async () => {
  await t.dispose();
});

function login(username: string, password: string, headers: Record<string, string> = {}) {
  return app.request(
    '/api/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ username, password }),
    },
    env,
  );
}

function me(cookie?: string) {
  return app.request('/api/me', cookie ? { headers: { cookie } } : {}, env);
}

describe('POST /api/login', () => {
  it('logs in, sets a hardened cookie and stores only the token hash', async () => {
    await seedUser(t.db, USERNAME, PASSWORD);

    const res = await login(USERNAME, PASSWORD);
    const token = cookieValue(res)!;
    const cookie = res.headers.get('set-cookie')!;

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ username: USERNAME });
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=7776000/);
    const rows = await t.db.prepare('SELECT token_hash FROM sessions').all<{ token_hash: string }>();
    expect(rows.results.map((r) => r.token_hash)).toEqual([await hashToken(token)]);
  });

  it('returns the same generic 401 for a wrong password and an unknown user', async () => {
    await seedUser(t.db, USERNAME, PASSWORD);

    const wrongPassword = await login(USERNAME, 'nope');
    const unknownUser = await login('ghost', 'nope');

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(await wrongPassword.json()).toEqual(await unknownUser.json());
    expect(cookieValue(wrongPassword)).toBeNull();
  });

  it('rejects a malformed body with 400', async () => {
    const res = await app.request(
      '/api/login',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"username":1}' },
      env,
    );

    expect(res.status).toBe(400);
  });

  it('locks the account after 5 failures, even for the right password', async () => {
    await seedUser(t.db, USERNAME, PASSWORD);
    for (let i = 0; i < 5; i++) expect((await login(USERNAME, 'bad')).status).toBe(401);

    const locked = await login(USERNAME, PASSWORD);

    expect(locked.status).toBe(429);
  });

  it('limits failures per IP across usernames', async () => {
    const headers = { 'cf-connecting-ip': '203.0.113.7' };
    for (let i = 0; i < 20; i++) expect((await login(`ghost${i}`, 'bad', headers)).status).toBe(401);

    expect((await login('another', 'bad', headers)).status).toBe(429);
  });

  it('a successful login clears the failure count', async () => {
    await seedUser(t.db, USERNAME, PASSWORD);
    for (let i = 0; i < 4; i++) await login(USERNAME, 'bad');
    expect((await login(USERNAME, PASSWORD)).status).toBe(200);

    for (let i = 0; i < 4; i++) expect((await login(USERNAME, 'bad')).status).toBe(401);
  });
});

describe('auth middleware and GET /api/me', () => {
  it('returns the current user for a valid session', async () => {
    const cookie = await loginCookie(env);

    const res = await me(cookie);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ username: USERNAME });
  });

  it('returns 401 without a cookie or with an unknown token', async () => {
    expect((await me()).status).toBe(401);
    expect((await me('session=not-a-real-token')).status).toBe(401);
  });

  it('returns 401 for an expired session', async () => {
    const cookie = await loginCookie(env);
    await t.db.prepare('UPDATE sessions SET expires_at = unixepoch() - 1').run();

    expect((await me(cookie)).status).toBe(401);
  });

  it('protects the word routes but leaves health public', async () => {
    expect((await app.request('/api/decks', {}, env)).status).toBe(401);
    expect((await app.request('/api/decks/lv-uk/topics', {}, env)).status).toBe(401);
    expect((await app.request('/api/health', {}, env)).status).toBe(200);
  });
});

describe('POST /api/logout', () => {
  it('deletes the session and clears the cookie', async () => {
    const cookie = await loginCookie(env);

    const res = await app.request('/api/logout', { method: 'POST', headers: { cookie } }, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/);
    expect((await me(cookie)).status).toBe(401);
    expect((await t.db.prepare('SELECT count(*) AS n FROM sessions').first<{ n: number }>())!.n).toBe(0);
  });

  it('succeeds without a session', async () => {
    const res = await app.request('/api/logout', { method: 'POST' }, env);

    expect(res.status).toBe(200);
  });
});
