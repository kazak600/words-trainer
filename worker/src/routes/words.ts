import { Hono } from 'hono';
import { getDecks, getTopics, getTopicWords } from '../services/words';
import type { Env } from '../types';

export const wordRoutes = new Hono<{ Bindings: Env }>();

wordRoutes.get('/decks', async (c) => c.json(await getDecks(c.env.DB)));

wordRoutes.get('/decks/:deck/topics', async (c) => {
  const topics = await getTopics(c.env.DB, c.req.param('deck'));
  return topics ? c.json(topics) : c.json({ error: 'deck not found' }, 404);
});

wordRoutes.get('/decks/:deck/topics/:topicId/words', async (c) => {
  const raw = c.req.param('topicId');
  if (!/^\d+$/.test(raw)) return c.json({ error: 'invalid topic id' }, 400);
  const words = await getTopicWords(c.env.DB, c.req.param('deck'), Number(raw));
  return words ? c.json(words) : c.json({ error: 'not found' }, 404);
});
