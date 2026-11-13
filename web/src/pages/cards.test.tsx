import { render, screen, within } from '@testing-library/react';
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

const choiceCard = {
  index: 0,
  stage: 2,
  mode: 'choice',
  retry: false,
  wordId: 1,
  pos: 'noun',
  translation: 'хліб',
  options: [
    { wordId: 5, lemma: 'siers' },
    { wordId: 1, lemma: 'maize' },
    { wordId: 6, lemma: 'piens' },
    { wordId: 7, lemma: 'ola' },
  ],
};

const writeCard = {
  index: 0,
  stage: 3,
  mode: 'write',
  retry: false,
  wordId: 1,
  pos: 'noun',
  translation: 'хліб',
};

const nextCard = {
  index: 1,
  stage: 1,
  mode: 'flip',
  retry: false,
  wordId: 2,
  pos: 'noun',
  translation: 'масло',
  lemma: 'sviests',
};

function sessionWith(card: object) {
  return { id: 's1', topicId: 1, total: 3, index: 0, card };
}

function setup(card: object, answer: MockHandler) {
  const mocks = mockApi({
    ...me,
    'GET /api/decks/lv-uk/sessions/current': () => ({
      body: sessionWith(card),
    }),
    'POST /api/sessions/s1/answer': answer,
  });
  render(
    <MemoryRouter initialEntries={['/session']}>
      <App />
    </MemoryRouter>,
  );
  return mocks;
}

describe('multiple-choice card', () => {
  it('shows the Ukrainian word and four Latvian options, not the answer label', async () => {
    setup(choiceCard, () => ({ body: {} }));

    expect(await screen.findByText('хліб')).toBeInTheDocument();
    for (const lemma of ['siers', 'maize', 'piens', 'ola']) {
      expect(screen.getByRole('button', { name: lemma })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole('button', { name: 'Again' }),
    ).not.toBeInTheDocument();
  });

  it('sends the chosen word and shows immediate feedback on a right answer', async () => {
    let sent: unknown;
    setup(choiceCard, ({ body }) => {
      sent = body;
      return {
        body: {
          correct: true,
          expected: 'maize',
          learned: false,
          finished: false,
          next: nextCard,
        },
      };
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'maize' }));

    expect(sent).toEqual({ cardIndex: 0, choiceWordId: 1 });
    expect(await screen.findByRole('status')).toHaveTextContent('Correct');
    expect(screen.getByRole('button', { name: 'maize' })).toHaveAttribute(
      'data-state',
      'right',
    );
    expect(screen.getByRole('button', { name: 'siers' })).toBeDisabled();
  });

  it('marks the wrong pick and reveals the right option', async () => {
    setup(choiceCard, () => ({
      body: {
        correct: false,
        expected: 'maize',
        learned: false,
        finished: false,
        next: nextCard,
      },
    }));
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'siers' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Not quite');
    expect(screen.getByRole('button', { name: 'siers' })).toHaveAttribute(
      'data-state',
      'wrong',
    );
    expect(screen.getByRole('button', { name: 'maize' })).toHaveAttribute(
      'data-state',
      'right',
    );
  });

  it('moves to the next card only after Continue', async () => {
    setup(choiceCard, () => ({
      body: {
        correct: true,
        expected: 'maize',
        learned: false,
        finished: false,
        next: nextCard,
      },
    }));
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'maize' }));
    expect(screen.queryByText('sviests')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('sviests')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '1');
  });

  it('shows the summary after Continue on the last card', async () => {
    setup(choiceCard, () => ({
      body: {
        correct: true,
        expected: 'maize',
        learned: false,
        finished: true,
        next: null,
        summary: { cards: 3, correct: 3, wrong: 0 },
      },
    }));
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'maize' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Session complete')).toBeInTheDocument();
  });

  it('lets the user tap again when the answer fails to save', async () => {
    let fail = true;
    setup(choiceCard, () =>
      fail
        ? { status: 500, body: { error: 'error' } }
        : {
            body: {
              correct: true,
              expected: 'maize',
              learned: false,
              finished: false,
              next: nextCard,
            },
          },
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'maize' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save',
    );
    fail = false;
    await user.click(screen.getByRole('button', { name: 'maize' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Correct');
  });
});

describe('writing card', () => {
  it('shows the Ukrainian word and a text field set up for typing Latvian', async () => {
    setup(writeCard, () => ({ body: {} }));

    expect(await screen.findByText('хліб')).toBeInTheDocument();
    const input = screen.getByLabelText('Type it in Latvian');
    expect(input).toHaveAttribute('autocapitalize', 'none');
    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
    expect(input).toHaveAttribute('lang', 'lv');
    expect(screen.getByText(/long-press/i)).toHaveTextContent(/ā/);
    expect(screen.getByText(/long-press/i)).toHaveTextContent(/š/);
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
  });

  it('sends the typed text exactly as entered and shows a correct answer as learned', async () => {
    let sent: unknown;
    setup(writeCard, ({ body }) => {
      sent = body;
      return {
        body: {
          correct: true,
          expected: 'maizē',
          learned: true,
          finished: false,
          next: nextCard,
          diff: [],
        },
      };
    });
    const user = userEvent.setup();

    await user.type(
      await screen.findByLabelText('Type it in Latvian'),
      'Maizē ',
    );
    await user.click(screen.getByRole('button', { name: 'Check' }));

    expect(sent).toEqual({ cardIndex: 0, typed: 'Maizē ' });
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Correct');
    expect(status).toHaveTextContent('Learned');
  });

  it('submits with the Enter key', async () => {
    const { calls } = setup(writeCard, () => ({
      body: {
        correct: true,
        expected: 'maize',
        learned: false,
        finished: false,
        next: nextCard,
      },
    }));
    const user = userEvent.setup();

    await user.type(
      await screen.findByLabelText('Type it in Latvian'),
      'maize{Enter}',
    );

    expect(await screen.findByRole('status')).toHaveTextContent('Correct');
    expect(calls).toContain('POST /api/sessions/s1/answer');
  });

  it('shows a missing diacritic as an error with the highlighted letter', async () => {
    setup(writeCard, () => ({
      body: {
        correct: false,
        expected: 'maizē',
        learned: false,
        finished: false,
        next: { ...nextCard, retry: true },
        diff: [
          { kind: 'match', expected: 'm', typed: 'm' },
          { kind: 'match', expected: 'a', typed: 'a' },
          { kind: 'match', expected: 'i', typed: 'i' },
          { kind: 'match', expected: 'z', typed: 'z' },
          { kind: 'diacritic', expected: 'ē', typed: 'e' },
        ],
      },
    }));
    const user = userEvent.setup();

    await user.type(
      await screen.findByLabelText('Type it in Latvian'),
      'maize',
    );
    await user.click(screen.getByRole('button', { name: 'Check' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Not quite');
    expect(status).toHaveTextContent('You typed: maize');
    expect(status).toHaveTextContent('maizē');
    const marks = status.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent('ē');
    expect(marks[0]).toHaveAttribute('data-kind', 'diacritic');
    expect(within(status).getByText(/accent/i)).toBeInTheDocument();
  });

  it('marks a missing letter and an extra letter', async () => {
    setup(writeCard, () => ({
      body: {
        correct: false,
        expected: 'maize',
        learned: false,
        finished: false,
        next: nextCard,
        diff: [
          { kind: 'match', expected: 'm', typed: 'm' },
          { kind: 'missing', expected: 'a' },
          { kind: 'extra', typed: 'x' },
          { kind: 'wrong', expected: 'i', typed: 'o' },
        ],
      },
    }));
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Type it in Latvian'), 'mxo');
    await user.click(screen.getByRole('button', { name: 'Check' }));

    const kinds = [
      ...(await screen.findByRole('status')).querySelectorAll('mark'),
    ].map((m) => m.getAttribute('data-kind'));
    expect(kinds).toEqual(['missing', 'extra', 'wrong']);
  });

  it('disables the field after checking and continues to the next card', async () => {
    setup(writeCard, () => ({
      body: {
        correct: false,
        expected: 'maize',
        learned: false,
        finished: false,
        next: nextCard,
        diff: [],
      },
    }));
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Type it in Latvian'), 'maiz');
    await user.click(screen.getByRole('button', { name: 'Check' }));

    expect(screen.getByLabelText('Type it in Latvian')).toBeDisabled();
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('sviests')).toBeInTheDocument();
  });
});
