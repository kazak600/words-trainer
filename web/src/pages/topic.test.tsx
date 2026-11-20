import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { setUnauthorizedHandler } from '../api/client';
import { appRoutes, mockApi, type MockHandler } from '../test/mockApi';

beforeEach(() => localStorage.clear());
afterEach(() => {
  setUnauthorizedHandler(null);
  vi.unstubAllGlobals();
  localStorage.clear();
});

const topics = [
  {
    id: 1,
    slug: 'home',
    title: 'Home',
    titleUk: 'Дім',
    wordCounts: { A1: 2 },
    counts: { new: 2, learning: 0, learned: 0 },
  },
];

const words = [
  {
    id: 10,
    lemma: 'māja',
    pos: 'noun',
    level: 'A1',
    translation: 'дім',
    sentences: [],
  },
  {
    id: 11,
    lemma: 'istaba',
    pos: 'noun',
    level: 'A1',
    translation: 'кімната',
    sentences: [],
  },
];

const firstCard = {
  index: 0,
  kind: 'recognition',
  retry: false,
  wordId: 10,
  pos: 'noun',
  translation: 'дім',
  lemma: 'māja',
};
const session = {
  body: { id: 's1', topicId: 1, total: 2, index: 0, card: firstCard },
};

function setup(extra: Record<string, MockHandler> = {}) {
  const mocks = mockApi(
    appRoutes({
      'GET /api/decks/lv-uk/topics': () => ({ body: topics }),
      'GET /api/decks/lv-uk/topics/1/words': () => ({ body: words }),
      ...extra,
    }),
  );
  render(
    <MemoryRouter initialEntries={['/topics/1']}>
      <App />
    </MemoryRouter>,
  );
  return mocks;
}

describe('Topic page', () => {
  it('shows the topic title and every word with its translation', async () => {
    setup();

    expect(
      await screen.findByRole('heading', { name: /Home/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 words')).toBeInTheDocument();
    const first = screen.getByText('māja').closest('li')!;
    expect(within(first).getByText('дім')).toBeInTheDocument();
    expect(within(first).getByText('A1')).toBeInTheDocument();
    expect(screen.getByText('istaba')).toBeInTheDocument();
    expect(screen.getByText('кімната')).toBeInTheDocument();
  });

  it('links back to the topics list', async () => {
    setup();

    expect(
      await screen.findByRole('link', { name: '← Topics' }),
    ).toHaveAttribute('href', '/');
  });

  it('starts a session for this topic from the Study button', async () => {
    const bodies: unknown[] = [];
    setup({
      'POST /api/decks/lv-uk/sessions': ({ body }) => {
        bodies.push(body);
        return { ...session, status: 201 };
      },
      'GET /api/decks/lv-uk/sessions/current': () => session,
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Study this topic' }),
    );

    expect(bodies).toEqual([{ topicId: 1, learn: true, tzOffset: 0 }]);
    expect(await screen.findByText('māja')).toBeInTheDocument();
  });

  it.each([
    [409, 'daily_cap_reached', 'Daily limit of new words reached.'],
    [409, 'nothing_to_study', 'Nothing to study right now.'],
    [500, 'error', 'Could not start the session. Try again.'],
  ])('explains a failed start (%i %s)', async (status, error, message) => {
    setup({
      'POST /api/decks/lv-uk/sessions': () => ({ status, body: { error } }),
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Study this topic' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('says so when the words cannot be loaded', async () => {
    setup({
      'GET /api/decks/lv-uk/topics/1/words': () => ({
        status: 500,
        body: { error: 'boom' },
      }),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load the words.',
    );
  });
});
