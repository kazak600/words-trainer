import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  answerCard,
  fetchCurrentSession,
  fetchReview,
  fetchTopics,
  raiseToEasy,
  startReviewSession,
  startTopicSession,
} from './study';
import { mockApi } from '../test/mockApi';

afterEach(() => vi.unstubAllGlobals());

function recorded(route: string) {
  const bodies: unknown[] = [];
  const mocks = mockApi({
    [route]: ({ body }) => {
      bodies.push(body);
      return { body: {} };
    },
  });
  return { bodies, calls: mocks.calls };
}

describe('study api', () => {
  it('reads topics, the review summary and the current session for the given deck', async () => {
    const { calls } = mockApi({
      'GET /api/decks/en-uk/topics': () => ({ body: [] }),
      'GET /api/decks/en-uk/review?tzOffset=0': () => ({ body: {} }),
      'GET /api/decks/en-uk/sessions/current': () => ({ body: {} }),
    });

    await fetchTopics('en-uk');
    await fetchReview('en-uk');
    await fetchCurrentSession('en-uk');

    expect(calls).toEqual([
      'GET /api/decks/en-uk/topics',
      'GET /api/decks/en-uk/review?tzOffset=0',
      'GET /api/decks/en-uk/sessions/current',
    ]);
  });

  it('starts a topic session with the topic and the timezone offset', async () => {
    const { bodies } = recorded('POST /api/decks/lv-uk/sessions');

    await startTopicSession('lv-uk', 7);

    expect(bodies).toEqual([{ topicId: 7, tzOffset: 0 }]);
  });

  it('starts a review session', async () => {
    const { bodies } = recorded('POST /api/decks/lv-uk/sessions');

    await startReviewSession('lv-uk');

    expect(bodies).toEqual([{ review: true, tzOffset: 0 }]);
  });

  it('sends a grade or a typed answer with the card index', async () => {
    const { bodies } = recorded('POST /api/sessions/s1/answer');

    await answerCard('s1', 2, { grade: 'hard' });
    await answerCard('s1', 3, { typed: 'maize' });

    expect(bodies).toEqual([
      { cardIndex: 2, grade: 'hard' },
      { cardIndex: 3, typed: 'maize' },
    ]);
  });

  it('raises a card to Easy by index', async () => {
    const { bodies } = recorded('POST /api/sessions/s1/easy');

    await raiseToEasy('s1', 4);

    expect(bodies).toEqual([{ cardIndex: 4 }]);
  });
});
