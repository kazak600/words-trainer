import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { SESSION_COOKIE, type AuthEnv } from '../middleware/auth';
import { login, logout, SESSION_SECONDS } from '../services/auth';
import type { Env } from '../types';

const cookieOptions = { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' } as const;

export const publicAuthRoutes = new Hono<{ Bindings: Env }>();

publicAuthRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (typeof body?.username !== 'string' || typeof body?.password !== 'string') {
    return c.json({ error: 'username and password are required' }, 400);
  }
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const result = await login(c.env.DB, body.username, body.password, ip, Math.floor(Date.now() / 1000));
  if (!result.ok) {
    return result.reason === 'rate_limited'
      ? c.json({ error: 'too many attempts, try again later' }, 429)
      : c.json({ error: 'invalid credentials' }, 401);
  }
  setCookie(c, SESSION_COOKIE, result.token, { ...cookieOptions, maxAge: SESSION_SECONDS });
  return c.json({ username: result.user.username });
});

publicAuthRoutes.post('/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await logout(c.env.DB, token);
  deleteCookie(c, SESSION_COOKIE, cookieOptions);
  return c.json({ ok: true });
});

export const protectedAuthRoutes = new Hono<AuthEnv>();

protectedAuthRoutes.get('/me', (c) => c.json({ username: c.get('user').username }));
