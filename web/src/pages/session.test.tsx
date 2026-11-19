import { render, screen } from '@testing-library/react';
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

const base = { retry: false, wordId: 1, pos: 'noun', translation: 'хліб' };
const recognition = {
  ...base,
  index: 0,
  kind: 'recognition',
  lemma: 'maize',
  grammar: { gender: 'f', declension: 5 },
};
const production = { ...base, index: 0, kind: 'production' };
const cloze = {
  ...base,
  index: 0,
  kind: 'cloze',
  textWithGap: 'Es ēdu ___ ar sieru.',
  hint: 'Я їм хліб із сиром.',
};
const nextCard = {
  ...base,
  index: 1,
  kind: 'recognition',
  wordId: 2,
  translation: 'масло',
  lemma: 'sviests',
};

const reply = (over: object = {}) => ({
  grade: 'good',
  correct: true,
  expected: 'maize',
  learned: false,
  canRaise: false,
  finished: false,
  next: nextCard,
  ...over,
});

function setup(
  card: object,
  answer: MockHandler,
  extra: Record<string, MockHandler> = {},
  topicId: number | null = 1,
) {
  const bodies: unknown[] = [];
  const mocks = mockApi(
    appRoutes({
      'GET /api/decks/lv-uk/sessions/current': () => ({
        body: { id: 's1', topicId, total: 3, index: 0, card },
      }),
      'POST /api/sessions/s1/answer': (init) => {
        bodies.push(init.body);
        return answer(init);
      },
      ...extra,
    }),
  );
  render(
    <MemoryRouter initialEntries={['/session']}>
      <App />
    </MemoryRouter>,
  );
  return { ...mocks, bodies };
}

async function typeAndCheck(text: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByRole('textbox'), text);
  await user.click(screen.getByRole('button', { name: 'Check' }));
  return user;
}

describe('recognition card', () => {
  it('hides the translation and the grades until the card is revealed', async () => {
    setup(recognition, () => ({ body: reply() }));

    expect(await screen.findByText('maize')).toBeInTheDocument();
    expect(screen.getByText('Tap to reveal')).toBeInTheDocument();
    expect(screen.queryByText('хліб')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Good' }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /maize/ }));

    expect(screen.getByText('хліб')).toBeInTheDocument();
    expect(screen.getByText('feminine · 5th declension')).toBeInTheDocument();
    for (const grade of ['Again', 'Hard', 'Good', 'Easy'])
      expect(screen.getByRole('button', { name: grade })).toBeInTheDocument();
  });

  it.each([
    ['Again', 'again'],
    ['Hard', 'hard'],
    ['Good', 'good'],
    ['Easy', 'easy'],
  ])('sends the %s grade and moves to the next card', async (label, grade) => {
    const { bodies } = setup(recognition, () => ({ body: reply() }));
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /maize/ }));
    await user.click(screen.getByRole('button', { name: label }));

    expect(bodies).toEqual([{ cardIndex: 0, grade }]);
    expect(await screen.findByText('sviests')).toBeInTheDocument();
    expect(screen.queryByText('Not quite')).not.toBeInTheDocument();
  });

  it('shows no multiple-choice options anywhere', async () => {
    setup(recognition, () => ({ body: reply() }));

    await screen.findByText('maize');

    expect(
      screen.queryByText(/choose the latvian word/i),
    ).not.toBeInTheDocument();
  });
});

describe('production card', () => {
  it('asks for the Latvian word, with the quick-bar and a phone-friendly input', async () => {
    setup(production, () => ({ body: reply() }));

    expect(await screen.findByText('хліб')).toBeInTheDocument();
    expect(screen.getByText('Type it in Latvian')).toBeInTheDocument();
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('autocapitalize', 'none');
    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
    for (const ch of 'ā č ē ģ ī ķ ļ ņ š ū ž'.split(' '))
      expect(screen.getByRole('button', { name: ch })).toBeInTheDocument();
  });

  it('names the language from the current deck', async () => {
    localStorage.setItem('deck', 'en-uk');
    const decks = [
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
    ];
    mockApi(
      appRoutes({
        'GET /api/decks': () => ({ body: decks }),
        'GET /api/decks/en-uk/sessions/current': () => ({
          body: { id: 's1', topicId: 1, total: 2, index: 0, card: production },
        }),
      }),
    );
    render(
      <MemoryRouter initialEntries={['/session']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Type it in English')).toBeInTheDocument();
  });

  it('inserts a quick-bar letter at the cursor, keeps the focus and does not submit', async () => {
    const { bodies } = setup(production, () => ({ body: reply() }));
    const user = userEvent.setup();
    const input = (await screen.findByRole('textbox')) as HTMLInputElement;
    await user.type(input, 'maiz');
    input.setSelectionRange(2, 2);

    await user.click(screen.getByRole('button', { name: 'š' }));

    expect(input.value).toBe('mašiz');
    expect(input).toHaveFocus();
    expect(bodies).toEqual([]);
  });

  it('shows an exact answer as correct and lets the user raise it to Easy', async () => {
    const easy: unknown[] = [];
    const { bodies } = setup(
      production,
      () => ({
        body: reply({ verdict: 'exact', canRaise: true, grade: 'good' }),
      }),
      {
        'POST /api/sessions/s1/easy': ({ body }) => {
          easy.push(body);
          return { body: { grade: 'easy', learned: false } };
        },
      },
    );
    const user = await typeAndCheck('maize');

    expect(bodies).toEqual([{ cardIndex: 0, typed: 'maize' }]);
    expect(await screen.findByText('Correct')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark as easy' }));

    expect(easy).toEqual([{ cardIndex: 0 }]);
    expect(await screen.findByText('Marked as easy')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Mark as easy' }),
    ).not.toBeInTheDocument();
  });

  it('shows a typo as a pass with the diff, without the Easy option', async () => {
    setup(production, () => ({
      body: reply({
        verdict: 'typo',
        grade: 'hard',
        expected: 'maizē',
        diff: [
          { kind: 'match', expected: 'm', typed: 'm' },
          { kind: 'diacritic', expected: 'ē', typed: 'e' },
        ],
      }),
    }));
    await typeAndCheck('maize');

    expect(await screen.findByText('Pass with typo')).toBeInTheDocument();
    expect(screen.getByText('Check the accent marks.')).toBeInTheDocument();
    expect(screen.getByText('You typed: maize')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Mark as easy' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Not quite')).not.toBeInTheDocument();
  });

  it('shows a wrong answer with the diff', async () => {
    setup(production, () => ({
      body: reply({
        verdict: 'wrong',
        grade: 'again',
        correct: false,
        diff: [{ kind: 'wrong', expected: 'm', typed: 'p' }],
      }),
    }));
    await typeAndCheck('piens');

    expect(await screen.findByText('Not quite')).toBeInTheDocument();
    expect(screen.getByText('A letter is wrong.')).toBeInTheDocument();
  });

  it('sends the Easy request once even when tapped twice', async () => {
    const easy: unknown[] = [];
    setup(
      production,
      () => ({ body: reply({ verdict: 'exact', canRaise: true }) }),
      {
        'POST /api/sessions/s1/easy': ({ body }) => {
          easy.push(body);
          return { body: { grade: 'easy', learned: false } };
        },
      },
    );
    const user = await typeAndCheck('maize');

    await user.dblClick(
      await screen.findByRole('button', { name: 'Mark as easy' }),
    );

    expect(easy).toHaveLength(1);
  });

  it('shows the learned badge when Easy makes the word learned', async () => {
    setup(
      production,
      () => ({ body: reply({ verdict: 'exact', canRaise: true }) }),
      {
        'POST /api/sessions/s1/easy': () => ({
          body: { grade: 'easy', learned: true },
        }),
      },
    );
    const user = await typeAndCheck('maize');
    expect(screen.queryByText('Learned ✓')).not.toBeInTheDocument();

    await user.click(
      await screen.findByRole('button', { name: 'Mark as easy' }),
    );

    expect(await screen.findByText('Learned ✓')).toBeInTheDocument();
  });

  it('drops a failed Easy error when moving to the next card', async () => {
    setup(
      production,
      () => ({ body: reply({ verdict: 'exact', canRaise: true }) }),
      { 'POST /api/sessions/s1/easy': () => ({ status: 500, body: {} }) },
    );
    const user = await typeAndCheck('maize');
    await user.click(
      await screen.findByRole('button', { name: 'Mark as easy' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not mark',
    );

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('sviests')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('moves the focus to Continue after checking, so Enter goes on', async () => {
    setup(production, () => ({ body: reply({ verdict: 'exact' }) }));
    await typeAndCheck('maize');

    expect(
      await screen.findByRole('button', { name: 'Continue' }),
    ).toHaveFocus();
  });

  it('tells the user when a card became a leech', async () => {
    setup(production, () => ({
      body: reply({
        verdict: 'wrong',
        correct: false,
        grade: 'again',
        leech: true,
        finished: true,
        next: null,
        summary: { cards: 1, correct: 0, wrong: 1 },
      }),
    }));
    await typeAndCheck('piens');

    expect(await screen.findByText(/Leech Workshop/)).toBeInTheDocument();
  });

  it('shows the learned badge', async () => {
    setup(production, () => ({
      body: reply({ verdict: 'exact', canRaise: true, learned: true }),
    }));
    await typeAndCheck('maize');

    expect(await screen.findByText('Learned ✓')).toBeInTheDocument();
  });

  it('continues to the next card', async () => {
    setup(production, () => ({ body: reply({ verdict: 'exact' }) }));
    const user = await typeAndCheck('maize');

    await user.click(await screen.findByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('sviests')).toBeInTheDocument();
  });
});

describe('cloze card', () => {
  it('shows the sentence with a blank and the hint, never the answer', async () => {
    setup(cloze, () => ({ body: reply() }));

    expect(await screen.findByText(/Es ēdu/)).toBeInTheDocument();
    expect(screen.getByLabelText('blank')).toBeInTheDocument();
    expect(screen.getByText('Я їм хліб із сиром.')).toBeInTheDocument();
    expect(screen.getByText('Type the missing word')).toBeInTheDocument();
    expect(screen.queryByText('maizi')).not.toBeInTheDocument();
  });

  it('sends the typed form like any typed card', async () => {
    const { bodies } = setup(cloze, () => ({
      body: reply({ verdict: 'exact', expected: 'maizi' }),
    }));
    await typeAndCheck('maizi');

    expect(bodies).toEqual([{ cardIndex: 0, typed: 'maizi' }]);
    expect(await screen.findByText('Correct')).toBeInTheDocument();
  });
});

describe('session flow', () => {
  const done = (summary = { cards: 3, correct: 2, wrong: 1 }) =>
    reply({ finished: true, next: null, summary });

  it('shows the summary when the session finishes', async () => {
    setup(recognition, () => ({ body: done() }));
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /maize/ }));
    await user.click(screen.getByRole('button', { name: 'Good' }));

    expect(await screen.findByText('Session complete')).toBeInTheDocument();
    expect(
      screen.getByText('3 cards · 2 correct · 1 missed'),
    ).toBeInTheDocument();
  });

  it.each([
    [7, { topicId: 7, tzOffset: 0 }],
    [null, { review: true, tzOffset: 0 }],
  ])(
    '"Another session" for topic %s repeats the same kind',
    async (topicId, expected) => {
      const started: unknown[] = [];
      setup(
        recognition,
        () => ({ body: done() }),
        {
          'POST /api/decks/lv-uk/sessions': ({ body }) => {
            started.push(body);
            return {
              status: 201,
              body: { id: 's2', topicId, total: 2, index: 0, card: nextCard },
            };
          },
        },
        topicId,
      );
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /maize/ }));
      await user.click(screen.getByRole('button', { name: 'Good' }));

      await user.click(
        await screen.findByRole('button', { name: 'Another session' }),
      );

      expect(started).toEqual([expected]);
      expect(await screen.findByText('sviests')).toBeInTheDocument();
    },
  );

  it('explains why another session cannot start', async () => {
    setup(recognition, () => ({ body: done() }), {
      'POST /api/decks/lv-uk/sessions': () => ({
        status: 409,
        body: { error: 'daily_cap_reached' },
      }),
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /maize/ }));
    await user.click(screen.getByRole('button', { name: 'Good' }));

    await user.click(
      await screen.findByRole('button', { name: 'Another session' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Daily limit reached: 15 new words today.',
    );
  });

  it('leaves the session with Exit without answering anything', async () => {
    const { calls } = setup(recognition, () => ({ body: reply() }));
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Exit' }));

    expect(
      await screen.findByRole('heading', { name: 'Topics' }),
    ).toBeInTheDocument();
    expect(calls.filter((c) => c.includes('/answer'))).toEqual([]);
  });

  it('goes Home when there is no session', async () => {
    mockApi(appRoutes());
    render(
      <MemoryRouter initialEntries={['/session']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Topics' }),
    ).toBeInTheDocument();
  });

  it('keeps the card and shows an error when saving fails', async () => {
    setup(production, () => ({ status: 500, body: { error: 'error' } }));
    await typeAndCheck('maize');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save the answer',
    );
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});
