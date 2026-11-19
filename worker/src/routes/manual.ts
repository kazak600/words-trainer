import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AuthEnv } from '../middleware/auth';
import {
  addSentence,
  addWord,
  getTopicOptions,
  ManualError,
  type ManualErrorCode,
} from '../services/manual';

const STATUS: Record<ManualErrorCode, ContentfulStatusCode> = {
  deck_not_found: 404,
  topic_not_found: 404,
  word_not_found: 404,
  invalid_word: 400,
  duplicate_word: 409,
};

export const manualRoutes = new Hono<AuthEnv>();

manualRoutes.onError((error, c) => {
  if (error instanceof ManualError)
    return c.json({ error: error.code }, STATUS[error.code]);
  throw error;
});

manualRoutes.get('/decks/:deck/topic-options', async (c) =>
  c.json(await getTopicOptions(c.env.DB, c.req.param('deck'))),
);

manualRoutes.post('/decks/:deck/words', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return c.json({ error: 'invalid_word' }, 400);
  return c.json(await addWord(c.env.DB, c.req.param('deck'), body), 201);
});

manualRoutes.post('/decks/:deck/words/:wordId/sentences', async (c) => {
  const raw = c.req.param('wordId');
  if (!/^\d+$/.test(raw)) return c.json({ error: 'word_not_found' }, 404);
  const body = await c.req.json().catch(() => null);
  return c.json(
    await addSentence(c.env.DB, c.req.param('deck'), Number(raw), body),
    201,
  );
});
