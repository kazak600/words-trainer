import { Hono } from 'hono';
import { parseTzOffset } from '../lib/day';
import type { AuthEnv } from '../middleware/auth';
import { getStats } from '../services/stats';
import { StudyError } from '../services/study';

export const statsRoutes = new Hono<AuthEnv>();

statsRoutes.get('/decks/:deck/stats', async (c) => {
  const tzOffset = parseTzOffset(c.req.query('tzOffset'));
  if (tzOffset === null) return c.json({ error: 'invalid tzOffset' }, 400);
  try {
    return c.json(
      await getStats(
        c.env.DB,
        c.get('user').id,
        c.req.param('deck'),
        tzOffset,
        Math.floor(Date.now() / 1000),
      ),
    );
  } catch (error) {
    if (error instanceof StudyError && error.code === 'deck_not_found')
      return c.json({ error: error.code }, 404);
    throw error;
  }
});
