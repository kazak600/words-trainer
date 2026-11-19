import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { parseTzOffset } from '../lib/streak';
import type { AuthEnv } from '../middleware/auth';
import { getReviewSummary } from '../services/review';
import {
  answerCard,
  getCurrentSession,
  raiseToEasy,
  startSession,
  StudyError,
  type StudyErrorCode,
} from '../services/study';

const STATUS: Record<StudyErrorCode, ContentfulStatusCode> = {
  deck_not_found: 404,
  topic_not_found: 404,
  daily_cap_reached: 409,
  session_not_found: 404,
  nothing_to_study: 409,
  stale_card: 409,
  not_raisable: 409,
  bad_answer: 400,
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

export const studyRoutes = new Hono<AuthEnv>();

studyRoutes.onError((error, c) => {
  if (error instanceof StudyError)
    return c.json({ error: error.code }, STATUS[error.code]);
  throw error;
});

studyRoutes.get('/decks/:deck/review', async (c) => {
  const tzOffset = parseTzOffset(c.req.query('tzOffset'));
  if (tzOffset === null) return c.json({ error: 'invalid tzOffset' }, 400);
  return c.json(
    await getReviewSummary(
      c.env.DB,
      c.get('user').id,
      c.req.param('deck'),
      tzOffset,
      nowSeconds(),
    ),
  );
});

studyRoutes.post('/decks/:deck/sessions', async (c) => {
  const body = await c.req.json().catch(() => null);
  const tzOffset = parseTzOffset(body?.tzOffset);
  if (tzOffset === null) return c.json({ error: 'invalid tzOffset' }, 400);
  const target = Number.isInteger(body?.topicId)
    ? { topicId: body.topicId as number }
    : body?.review === true
      ? { review: true as const }
      : null;
  if (!target) return c.json({ error: 'topicId or review is required' }, 400);
  const session = await startSession(
    c.env.DB,
    c.get('user').id,
    c.req.param('deck'),
    target,
    tzOffset,
    nowSeconds(),
  );
  return c.json(session, 201);
});

studyRoutes.get('/decks/:deck/sessions/current', async (c) =>
  c.json(
    await getCurrentSession(c.env.DB, c.get('user').id, c.req.param('deck')),
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

studyRoutes.post('/sessions/:id/easy', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!Number.isInteger(body?.cardIndex))
    return c.json({ error: 'cardIndex is required' }, 400);
  return c.json(
    await raiseToEasy(
      c.env.DB,
      c.get('user').id,
      c.req.param('id'),
      body.cardIndex,
      nowSeconds(),
    ),
  );
});
