import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AuthEnv } from '../middleware/auth';
import {
  answerCard,
  getCurrentSession,
  startSession,
  StudyError,
  type StudyErrorCode,
} from '../services/study';

const STATUS: Record<StudyErrorCode, ContentfulStatusCode> = {
  deck_not_found: 404,
  topic_not_found: 404,
  session_not_found: 404,
  nothing_to_study: 409,
  stale_card: 409,
  bad_answer: 400,
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

export const studyRoutes = new Hono<AuthEnv>();

studyRoutes.onError((error, c) => {
  if (error instanceof StudyError)
    return c.json({ error: error.code }, STATUS[error.code]);
  throw error;
});

studyRoutes.post('/decks/:deck/sessions', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!Number.isInteger(body?.topicId))
    return c.json({ error: 'topicId is required' }, 400);
  const session = await startSession(
    c.env.DB,
    c.get('user').id,
    c.req.param('deck'),
    body.topicId,
    nowSeconds(),
  );
  return c.json(session, 201);
});

studyRoutes.get('/decks/:deck/sessions/current', async (c) =>
  c.json(
    await getCurrentSession(
      c.env.DB,
      c.get('user').id,
      c.req.param('deck'),
      nowSeconds(),
    ),
  ),
);

studyRoutes.post('/sessions/:id/answer', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object')
    return c.json({ error: 'invalid body' }, 400);
  return c.json(
    await answerCard(
      c.env.DB,
      c.get('user').id,
      c.req.param('id'),
      body,
      nowSeconds(),
    ),
  );
});
