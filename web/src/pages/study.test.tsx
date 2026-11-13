import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { setUnauthorizedHandler } from '../api/client';
import { mockApi, type MockHandler } from '../test/mockApi';

afterEach(() => {
  setUnauthorizedHandler(null);
  vi.unstubAllGlobals();
});

const me: Record<string, MockHandler> = {
  'GET /api/me': () => ({ body: { username: 'anton' } }),
};

const topics = [
  {
    id: 1,
    slug: 'home',
    title: 'Māja',
    titleUk: 'Дім',
    wordCounts: { A1: 3, A2: 5 },
    counts: { new: 6, learning: 1, learned: 1 },
  },
  {
    id: 2,
    slug: 'animals',
    title: 'Dzīvnieki',
    titleUk: 'Тварини',
    wordCounts: { A1: 4 },
    counts: { new: 4, learning: 0, learned: 0 },
  },
];

function card(overrides: object = {}) {
  return {
    index: 0,
    stage: 1,
    mode: 'flip',
    retry: false,
    wordId: 1,
    pos: 'noun',
    translation: 'будинок',
    lemma: 'māja',
    grammar: { gender: 'f', declension: 4 },
    ...overrides,
  };
}

function session(overrides: object = {}) {
  return {
    id: 's1',
    topicId: 1,
    total: 3,
    index: 0,
    card: card(),
    ...overrides,
  };
}

const home: Record<string, MockHandler> = {
  ...me,
  'GET /api/decks/lv-uk/topics': () => ({ body: topics }),
  'GET /api/streak?tzOffset=0': () => ({
    body: { days: 3, studiedToday: true },
  }),
  'GET /api/decks/lv-uk/sessions/current': () => ({
    status: 404,
    body: { error: 'session_not_found' },
  }),
};

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('Home', () => {
  it('lists topics with level chips and new / learning / learned counts', async () => {
    mockApi(home);

    renderApp('/');

    const item = await screen.findByRole('button', { name: /Māja/ });
    expect(item).toHaveTextContent('Дім');
    expect(item).toHaveTextContent('A1');
    expect(item).toHaveTextContent('A2');
    expect(item).toHaveTextContent('6 new');
    expect(item).toHaveTextContent('1 learning');
    expect(item).toHaveTextContent('1 learned');
    expect(
      screen.getByRole('button', { name: /Dzīvnieki/ }),
    ).not.toHaveTextContent('A2');
  });

  it('shows the streak badge', async () => {
    mockApi(home);

    renderApp('/');

    expect(await screen.findByText('3-day streak')).toBeInTheDocument();
  });

  it('invites to start a streak when there is none', async () => {
    mockApi({
      ...home,
      'GET /api/streak?tzOffset=0': () => ({
        body: { days: 0, studiedToday: false },
      }),
    });

    renderApp('/');

    expect(await screen.findByText('No streak yet')).toBeInTheDocument();
  });

  it('offers to continue an unfinished session', async () => {
    mockApi({
      ...home,
      'GET /api/decks/lv-uk/sessions/current': () => ({
        body: session({ index: 2 }),
      }),
    });

    renderApp('/');

    expect(
      await screen.findByRole('link', { name: /Continue/ }),
    ).toHaveAttribute('href', '/session');
  });

  it('starts a session for the tapped topic and shows its first card', async () => {
    let started: unknown;
    mockApi({
      ...home,
      'POST /api/decks/lv-uk/sessions': ({ body }) => {
        started = body;
        return { status: 201, body: session() };
      },
      'GET /api/decks/lv-uk/sessions/current': () =>
        started
          ? { body: session() }
          : { status: 404, body: { error: 'session_not_found' } },
    });
    renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Māja/ }));

    expect(started).toEqual({ topicId: 1 });
    expect(await screen.findByText('māja')).toBeInTheDocument();
  });

  it('says so when a topic has nothing to study right now', async () => {
    mockApi({
      ...home,
      'POST /api/decks/lv-uk/sessions': () => ({
        status: 409,
        body: { error: 'nothing_to_study' },
      }),
    });
    renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Māja/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nothing to study',
    );
  });
});

describe('Session', () => {
  const current: Record<string, MockHandler> = {
    ...me,
    'GET /api/decks/lv-uk/sessions/current': () => ({ body: session() }),
  };

  it('shows the Latvian word first, then the translation and grammar after a flip', async () => {
    mockApi(current);
    renderApp('/session');
    const user = userEvent.setup();

    expect(await screen.findByText('māja')).toBeInTheDocument();
    expect(screen.queryByText('будинок')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Good' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /māja/ }));

    expect(screen.getByText('будинок')).toBeInTheDocument();
    expect(screen.getByText('feminine · 4th declension')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Good' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Easy' })).toBeInTheDocument();
  });

  it('shows progress through the session', async () => {
    mockApi({
      ...current,
      'GET /api/decks/lv-uk/sessions/current': () => ({
        body: session({ index: 1, card: card({ index: 1 }) }),
      }),
    });

    renderApp('/session');

    const bar = await screen.findByRole('progressbar');
    expect(bar).toHaveAttribute('value', '1');
    expect(bar).toHaveAttribute('max', '3');
  });

  it('sends the answer and moves to the next card, unflipped', async () => {
    let sent: unknown;
    mockApi({
      ...current,
      'POST /api/sessions/s1/answer': ({ body }) => {
        sent = body;
        return {
          body: {
            correct: true,
            expected: 'māja',
            learned: false,
            finished: false,
            next: card({
              index: 1,
              wordId: 2,
              lemma: 'istaba',
              translation: 'кімната',
            }),
          },
        };
      },
    });
    renderApp('/session');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /māja/ }));
    await user.click(screen.getByRole('button', { name: 'Easy' }));

    expect(sent).toEqual({ cardIndex: 0, result: 'easy' });
    expect(await screen.findByText('istaba')).toBeInTheDocument();
    expect(screen.queryByText('кімната')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '1');
  });

  it('shows the summary at the end and can start another session', async () => {
    let starts = 0;
    mockApi({
      ...current,
      'POST /api/sessions/s1/answer': () => ({
        body: {
          correct: true,
          expected: 'māja',
          learned: false,
          finished: true,
          next: null,
          summary: { cards: 4, correct: 3, wrong: 1 },
        },
      }),
      'POST /api/decks/lv-uk/sessions': ({ body }) => {
        starts++;
        expect(body).toEqual({ topicId: 1 });
        return {
          status: 201,
          body: session({
            id: 's2',
            card: card({ lemma: 'logs', translation: 'вікно' }),
          }),
        };
      },
    });
    renderApp('/session');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /māja/ }));
    await user.click(screen.getByRole('button', { name: 'Good' }));

    expect(await screen.findByText('Session complete')).toBeInTheDocument();
    expect(screen.getByText(/4 cards/)).toBeInTheDocument();
    expect(screen.getByText(/3 correct/)).toBeInTheDocument();
    expect(screen.getByText(/1 missed/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Another session' }));

    expect(await screen.findByText('logs')).toBeInTheDocument();
    expect(starts).toBe(1);
  });

  it('exits to Home without answering, leaving the session saved', async () => {
    const { calls } = mockApi({
      ...current,
      ...home,
      'GET /api/decks/lv-uk/sessions/current': () => ({ body: session() }),
    });
    renderApp('/session');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Exit' }));

    expect(
      await screen.findByRole('heading', { name: 'Topics' }),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.startsWith('POST /api/sessions'))).toBe(false);
  });

  it('goes Home when there is no unfinished session', async () => {
    mockApi({ ...home });
    renderApp('/session');

    expect(
      await screen.findByRole('heading', { name: 'Topics' }),
    ).toBeInTheDocument();
  });

  it('keeps the card and lets the user retry when the answer fails to save', async () => {
    let fail = true;
    mockApi({
      ...current,
      'POST /api/sessions/s1/answer': () =>
        fail
          ? { status: 500, body: { error: 'error' } }
          : {
              body: {
                correct: true,
                expected: 'māja',
                learned: false,
                finished: true,
                next: null,
                summary: { cards: 1, correct: 1, wrong: 0 },
              },
            },
    });
    renderApp('/session');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /māja/ }));
    await user.click(screen.getByRole('button', { name: 'Good' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save',
    );
    expect(screen.getByRole('button', { name: 'Good' })).toBeEnabled();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Good' }));
    await waitFor(() =>
      expect(screen.getByText('Session complete')).toBeInTheDocument(),
    );
  });
});
