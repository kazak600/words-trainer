import { Hono } from 'hono';
import type { AuthEnv } from '../middleware/auth';
import { getStreak } from '../services/streak';

export const streakRoutes = new Hono<AuthEnv>();

// tzOffset is minutes east of UTC, so a late-evening study session counts for the local day.
streakRoutes.get('/streak', async (c) => {
  const raw = c.req.query('tzOffset') ?? '0';
  const offset = Number(raw);
  if (!Number.isInteger(offset) || Math.abs(offset) > 14 * 60) {
    return c.json({ error: 'invalid tzOffset' }, 400);
  }
  return c.json(
    await getStreak(
      c.env.DB,
      c.get('user').id,
      offset,
      Math.floor(Date.now() / 1000),
    ),
  );
});
