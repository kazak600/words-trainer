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

const item = {
  cardId: 10,
  wordId: 1,
  kind: 'production',
  lapses: 6,
  lemma: 'maize',
  pos: 'noun',
  translation: 'хліб',
  textWithGap: null,
  hint: null,
  mnemonic: 'corn bread',
  similarWord: 'maiz',
};

function setup(items: object[], extra: Record<string, MockHandler> = {}) {
  const mocks = mockApi(
    appRoutes({
      'GET /api/decks/lv-uk/leeches': () => ({ body: items }),
      ...extra,
    }),
  );
  render(
    <MemoryRouter initialEntries={['/stats/leeches']}>
      <App />
    </MemoryRouter>,
  );
  return mocks;
}

describe('Leech Workshop', () => {
  it('says so when nothing is stuck', async () => {
    setup([]);

    expect(
      await screen.findByRole('heading', { name: 'Leech Workshop' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('No leeches. Nothing is stuck.'),
    ).toBeInTheDocument();
  });

  it('shows the word, its translation, the failure count and the saved notes', async () => {
    setup([item]);

    const card = await screen.findByRole('article', { name: 'maize' });

    expect(within(card).getByText('хліб')).toBeInTheDocument();
    expect(within(card).getByText('Failed 6 times')).toBeInTheDocument();
    expect(within(card).getByLabelText('Mnemonic')).toHaveValue('corn bread');
    expect(within(card).getByLabelText('Confused with')).toHaveValue('maiz');
  });

  it('shows the sentence of a cloze leech', async () => {
    setup([
      {
        ...item,
        kind: 'cloze',
        textWithGap: 'Es ēdu ___.',
        hint: 'Я їм хліб.',
      },
    ]);

    expect(await screen.findByText('Es ēdu ___.')).toBeInTheDocument();
    expect(screen.getByText('Я їм хліб.')).toBeInTheDocument();
  });

  it('saves the notes', async () => {
    const bodies: unknown[] = [];
    setup([item], {
      'PUT /api/decks/lv-uk/words/1/notes': ({ body }) => {
        bodies.push(body);
        return { body: body as object };
      },
    });
    const user = userEvent.setup();
    const card = await screen.findByRole('article', { name: 'maize' });
    const mnemonic = within(card).getByLabelText('Mnemonic');

    await user.clear(mnemonic);
    await user.type(mnemonic, 'bread');
    await user.click(within(card).getByRole('button', { name: 'Save notes' }));

    expect(bodies).toEqual([{ mnemonic: 'bread' }]);
    expect(await within(card).findByText('Saved')).toBeInTheDocument();
  });

  it('sends only the changed field, so two cards of one word do not overwrite each other', async () => {
    const bodies: unknown[] = [];
    setup(
      [
        { ...item, mnemonic: '', similarWord: '' },
        {
          ...item,
          cardId: 11,
          kind: 'cloze',
          textWithGap: 'Es ēdu ___.',
          hint: 'Я їм.',
          mnemonic: '',
          similarWord: '',
        },
      ],
      {
        'PUT /api/decks/lv-uk/words/1/notes': ({ body }) => {
          bodies.push(body);
          return { body: body as object };
        },
      },
    );
    const user = userEvent.setup();
    const [first, second] = await screen.findAllByRole('article', {
      name: 'maize',
    });

    await user.type(within(first!).getByLabelText('Mnemonic'), 'M1');
    await user.click(
      within(first!).getByRole('button', { name: 'Save notes' }),
    );
    await user.type(within(second!).getByLabelText('Confused with'), 'maiss');
    await user.click(
      within(second!).getByRole('button', { name: 'Save notes' }),
    );

    await vi.waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies).toEqual([{ mnemonic: 'M1' }, { similarWord: 'maiss' }]);
  });

  it('compares with what was last saved, not with what was loaded', async () => {
    const bodies: unknown[] = [];
    setup([{ ...item, mnemonic: '' }], {
      'PUT /api/decks/lv-uk/words/1/notes': ({ body }) => {
        bodies.push(body);
        return { body: body as object };
      },
      'POST /api/decks/lv-uk/cards/10/unsuspend': () => ({
        body: { cardId: 10 },
      }),
    });
    const user = userEvent.setup();
    const card = await screen.findByRole('article', { name: 'maize' });
    const field = within(card).getByLabelText('Mnemonic');
    await user.type(field, 'x');
    await user.click(within(card).getByRole('button', { name: 'Save notes' }));
    await within(card).findByText('Saved');

    await user.clear(field);
    await user.click(
      within(card).getByRole('button', { name: 'Return to queue' }),
    );

    await screen.findByText('No leeches. Nothing is stuck.');
    expect(bodies).toEqual([{ mnemonic: 'x' }, { mnemonic: '' }]);
  });

  it('adds a stronger sentence when all three fields are filled, then clears them', async () => {
    const sentences: unknown[] = [];
    setup([item], {
      'PUT /api/decks/lv-uk/words/1/notes': ({ body }) => ({
        body: body as object,
      }),
      'POST /api/decks/lv-uk/words/1/sentences': ({ body }) => {
        sentences.push(body);
        return { status: 201, body: { sentenceId: 5 } };
      },
    });
    const user = userEvent.setup();
    const card = await screen.findByRole('article', { name: 'maize' });

    await user.type(
      within(card).getByLabelText('Sentence with ___'),
      'Es ēdu ___.',
    );
    await user.type(within(card).getByLabelText('Missing word'), 'maizi');
    await user.type(within(card).getByLabelText('Translation'), 'Я їм хліб.');
    await user.click(within(card).getByRole('button', { name: 'Save notes' }));

    expect(sentences).toEqual([
      { textWithGap: 'Es ēdu ___.', answer: 'maizi', hint: 'Я їм хліб.' },
    ]);
    expect(await within(card).findByText('Saved')).toBeInTheDocument();
    expect(within(card).getByLabelText('Missing word')).toHaveValue('');
  });

  it('refuses a half-filled sentence and sends nothing', async () => {
    const { calls } = setup([item]);
    const user = userEvent.setup();
    const card = await screen.findByRole('article', { name: 'maize' });

    await user.type(within(card).getByLabelText('Missing word'), 'maizi');
    await user.click(within(card).getByRole('button', { name: 'Save notes' }));

    expect(await within(card).findByRole('alert')).toHaveTextContent(
      'Fill all three sentence fields',
    );
    expect(
      calls.filter((c) => c.startsWith('PUT') || c.startsWith('POST')),
    ).toEqual([]);
  });

  it('returns the card to the queue and removes it from the list', async () => {
    const { calls } = setup([item], {
      'POST /api/decks/lv-uk/cards/10/unsuspend': () => ({
        body: { cardId: 10 },
      }),
    });
    const user = userEvent.setup();
    const card = await screen.findByRole('article', { name: 'maize' });

    await user.click(
      within(card).getByRole('button', { name: 'Return to queue' }),
    );

    expect(
      await screen.findByText('No leeches. Nothing is stuck.'),
    ).toBeInTheDocument();
    expect(calls).toContain('POST /api/decks/lv-uk/cards/10/unsuspend');
    expect(calls.filter((c) => c.startsWith('PUT'))).toEqual([]);
  });

  it('saves changed notes before returning the card', async () => {
    const { calls } = setup([item], {
      'PUT /api/decks/lv-uk/words/1/notes': ({ body }) => ({
        body: body as object,
      }),
      'POST /api/decks/lv-uk/cards/10/unsuspend': () => ({
        body: { cardId: 10 },
      }),
    });
    const user = userEvent.setup();
    const card = await screen.findByRole('article', { name: 'maize' });
    await user.type(within(card).getByLabelText('Mnemonic'), '!');

    await user.click(
      within(card).getByRole('button', { name: 'Return to queue' }),
    );

    await screen.findByText('No leeches. Nothing is stuck.');
    expect(calls.indexOf('PUT /api/decks/lv-uk/words/1/notes')).toBeLessThan(
      calls.indexOf('POST /api/decks/lv-uk/cards/10/unsuspend'),
    );
  });

  it('keeps the item and shows an alert when saving fails', async () => {
    setup([item], {
      'PUT /api/decks/lv-uk/words/1/notes': () => ({ status: 500, body: {} }),
    });
    const user = userEvent.setup();
    const card = await screen.findByRole('article', { name: 'maize' });

    await user.click(within(card).getByRole('button', { name: 'Save notes' }));

    expect(await within(card).findByRole('alert')).toHaveTextContent(
      'Could not save',
    );
    expect(screen.getByRole('article', { name: 'maize' })).toBeInTheDocument();
  });
});
