import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AuthEnv } from '../middleware/auth';
import {
  getLeeches,
  LeechError,
  returnToQueue,
  saveNotes,
  type LeechErrorCode,
} from '../services/leeches';

const STATUS: Record<LeechErrorCode, ContentfulStatusCode> = {
  deck_not_found: 404,
  word_not_found: 404,
  card_not_found: 404,
  invalid_notes: 400,
};

const ID = /^\d+$/;

export const leechRoutes = new Hono<AuthEnv>();

leechRoutes.onError((error, c) => {
  if (error instanceof LeechError)
    return c.json({ error: error.code }, STATUS[error.code]);
  throw error;
});

leechRoutes.get('/decks/:deck/leeches', async (c) =>
  c.json(await getLeeches(c.env.DB, c.get('user').id, c.req.param('deck'))),
);

leechRoutes.put('/decks/:deck/words/:wordId/notes', async (c) => {
  const raw = c.req.param('wordId');
  const body = await c.req.json().catch(() => null);
  if (!ID.test(raw) || !body || typeof body !== 'object')
    return c.json({ error: 'invalid_notes' }, 400);
  return c.json(
    await saveNotes(
      c.env.DB,
      c.get('user').id,
      c.req.param('deck'),
      Number(raw),
      body,
    ),
  );
});

leechRoutes.post('/decks/:deck/cards/:cardId/unsuspend', async (c) => {
  const raw = c.req.param('cardId');
  if (!ID.test(raw)) return c.json({ error: 'card_not_found' }, 404);
  return c.json(
    await returnToQueue(
      c.env.DB,
      c.get('user').id,
      c.req.param('deck'),
      Number(raw),
    ),
  );
});
