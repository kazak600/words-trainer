import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { authenticate, type CurrentUser } from '../services/auth';
import type { Env } from '../types';

export const SESSION_COOKIE = 'session';

export type AuthEnv = { Bindings: Env; Variables: { user: CurrentUser } };

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? await authenticate(c.env.DB, token, Math.floor(Date.now() / 1000)) : null;
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  c.set('user', user);
  await next();
});
