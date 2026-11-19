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
    wordCounts: { A1: 4, A2: 6 },
    counts: { new: 7, learning: 2, learned: 1 },
  },
  {
    id: 2,
    slug: 'food',
    title: 'Food and drink',
    titleUk: 'Їжа',
    wordCounts: { A1: 3 },
    counts: { new: 3, learning: 0, learned: 0 },
  },
];

const review = (due: number, newToday = 3, leeches = 0) => ({
  due,
  newToday,
  newCap: 15,
  leeches,
  cards: [],
});

const firstCard = {
  index: 0,
  kind: 'recognition',
  retry: false,
  wordId: 1,
  pos: 'noun',
  translation: 'хліб',
  lemma: 'maize',
};
const session = (topicId: number | null) => ({
  body: { id: 's1', topicId, total: 2, index: 0, card: firstCard },
});

function setup(extra: Record<string, MockHandler> = {}, path = '/') {
  const mocks = mockApi(
    appRoutes({
      'GET /api/decks/lv-uk/topics': () => ({ body: topics }),
      'GET /api/decks/lv-uk/review?tzOffset=0': () => ({ body: review(12) }),
      ...extra,
    }),
  );
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  return mocks;
}

describe('Home', () => {
  it('shows the due count, new words today and the topics with counts and level chips', async () => {
    setup();

    expect(
      await screen.findByRole('button', { name: 'Review · 12 due' }),
    ).toBeEnabled();
    expect(screen.getByText('New today: 3 / 15')).toBeInTheDocument();
    const topic = screen.getByRole('button', { name: /Home/ });
    expect(within(topic).getByText('A1')).toBeInTheDocument();
    expect(within(topic).getByText('A2')).toBeInTheDocument();
    expect(topic).toHaveTextContent('7 new · 2 learning · 1 learned');
  });

  it('has no streak badge and no logout button', async () => {
    setup();

    await screen.findByRole('button', { name: 'Review · 12 due' });

    expect(screen.queryByText(/streak/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Log out' }),
    ).not.toBeInTheDocument();
  });

  it('starts a review session and opens it', async () => {
    const bodies: unknown[] = [];
    setup({
      'POST /api/decks/lv-uk/sessions': ({ body }) => {
        bodies.push(body);
        return { ...session(null), status: 201 };
      },
      'GET /api/decks/lv-uk/sessions/current': () => session(null),
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Review · 12 due' }),
    );

    expect(bodies).toEqual([{ review: true, tzOffset: 0 }]);
    expect(await screen.findByText('maize')).toBeInTheDocument();
  });

  it('disables Review when nothing is due', async () => {
    setup({
      'GET /api/decks/lv-uk/review?tzOffset=0': () => ({ body: review(0) }),
    });

    expect(
      await screen.findByRole('button', { name: 'Review · 0 due' }),
    ).toBeDisabled();
  });

  it('starts a topic session with the topic id', async () => {
    const bodies: unknown[] = [];
    setup({
      'POST /api/decks/lv-uk/sessions': ({ body }) => {
        bodies.push(body);
        return { ...session(1), status: 201 };
      },
      'GET /api/decks/lv-uk/sessions/current': () => session(1),
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: /Food and drink/ }),
    );

    expect(bodies).toEqual([{ topicId: 2, tzOffset: 0 }]);
    expect(await screen.findByText('maize')).toBeInTheDocument();
  });

  it.each([
    [409, 'daily_cap_reached', 'Daily limit reached: 15 new words today.'],
    [409, 'nothing_to_study', 'Nothing to study right now.'],
    [500, 'error', 'Could not start the session. Try again.'],
  ])('explains a failed start (%i %s)', async (status, error, message) => {
    setup({
      'POST /api/decks/lv-uk/sessions': () => ({ status, body: { error } }),
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Home/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('offers to continue an unfinished session', async () => {
    setup({ 'GET /api/decks/lv-uk/sessions/current': () => session(1) });

    expect(
      await screen.findByRole('link', { name: 'Continue your session' }),
    ).toHaveAttribute('href', '/session');
  });

  it('reads everything from the stored deck, not a hard-coded one', async () => {
    localStorage.setItem('deck', 'en-uk');
    const { calls } = setup({
      'GET /api/decks': () => ({
        body: [
          {
            slug: 'lv-uk',
            sourceLang: 'lv',
            targetLang: 'uk',
            title: 'Latvian → Ukrainian',
          },
          {
            slug: 'en-uk',
            sourceLang: 'en',
            targetLang: 'uk',
            title: 'English → Ukrainian',
          },
        ],
      }),
      'GET /api/decks/en-uk/topics': () => ({ body: [] }),
      'GET /api/decks/en-uk/review?tzOffset=0': () => ({ body: review(1, 0) }),
    });

    await screen.findByRole('button', { name: 'Review · 1 due' });

    expect(calls.filter((c) => c.includes('/api/decks/lv-uk'))).toEqual([]);
    expect(calls).toContain('GET /api/decks/en-uk/topics');
  });
});

describe('Leech Workshop link', () => {
  it('shows the leech count on Home and links to the workshop', async () => {
    setup({
      'GET /api/decks/lv-uk/review?tzOffset=0': () => ({
        body: review(1, 0, 3),
      }),
    });

    expect(
      await screen.findByRole('link', { name: 'Leech Workshop · 3' }),
    ).toHaveAttribute('href', '/stats/leeches');
  });

  it('is hidden without leeches', async () => {
    setup();

    await screen.findByRole('button', { name: 'Review · 12 due' });

    expect(
      screen.queryByRole('link', { name: /Leech Workshop/ }),
    ).not.toBeInTheDocument();
  });
});

describe('Review page', () => {
  it('shows the due count and starts a review', async () => {
    const bodies: unknown[] = [];
    setup(
      {
        'POST /api/decks/lv-uk/sessions': ({ body }) => {
          bodies.push(body);
          return { ...session(null), status: 201 };
        },
        'GET /api/decks/lv-uk/sessions/current': () => session(null),
      },
      '/review',
    );
    const user = userEvent.setup();

    expect(await screen.findByText('12 due')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start review' }));

    expect(bodies).toEqual([{ review: true, tzOffset: 0 }]);
  });

  it('disables Start when nothing is due', async () => {
    setup(
      { 'GET /api/decks/lv-uk/review?tzOffset=0': () => ({ body: review(0) }) },
      '/review',
    );

    expect(
      await screen.findByText('Nothing is due right now.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start review' })).toBeDisabled();
  });
});
