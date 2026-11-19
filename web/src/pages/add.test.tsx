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

function setup(
  add: MockHandler = () => ({ status: 201, body: { wordId: 1 } }),
) {
  const bodies: unknown[] = [];
  const mocks = mockApi(
    appRoutes({
      'POST /api/decks/lv-uk/words': (init) => {
        bodies.push(init.body);
        return add(init);
      },
    }),
  );
  render(
    <MemoryRouter initialEntries={['/add']}>
      <App />
    </MemoryRouter>,
  );
  return { ...mocks, bodies };
}

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  lemma: string,
  translation: string,
) {
  await user.type(await screen.findByLabelText('Latvian'), lemma);
  await user.type(screen.getByLabelText('Ukrainian'), translation);
}

describe('Add page', () => {
  it('offers the deck topics and sensible defaults', async () => {
    setup();

    expect(await screen.findByLabelText('Part of speech')).toHaveValue('noun');
    expect(screen.getByLabelText('Level')).toHaveValue('A2');
    const topic = screen.getByLabelText('Topic');
    expect(
      await screen.findByRole('option', { name: 'Food and drink' }),
    ).toBeInTheDocument();
    expect(topic).toHaveValue('1');
  });

  it('keeps the button disabled while there is no topic to add to', async () => {
    mockApi(
      appRoutes({
        'GET /api/decks/lv-uk/topic-options': () => ({ status: 500, body: {} }),
      }),
    );
    render(
      <MemoryRouter initialEntries={['/add']}>
        <App />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await fill(user, 'maize', 'хліб');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load the topics.',
    );
    expect(screen.getByRole('button', { name: 'Add word' })).toBeDisabled();
  });

  it('disables the button until both words are filled', async () => {
    setup();
    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: 'Add word' });
    expect(button).toBeDisabled();

    await fill(user, 'maize', 'хліб');

    expect(button).toBeEnabled();
  });

  it('posts the trimmed word with the defaults, then clears and refocuses the field', async () => {
    const { bodies } = setup();
    const user = userEvent.setup();

    await fill(user, '  maize ', ' хліб ');
    await user.click(screen.getByRole('button', { name: 'Add word' }));

    expect(bodies).toEqual([
      {
        lemma: 'maize',
        translation: 'хліб',
        pos: 'noun',
        topicId: 1,
        level: 'A2',
      },
    ]);
    expect(await screen.findByRole('status')).toHaveTextContent('Added maize');
    const latvian = screen.getByLabelText('Latvian');
    expect(latvian).toHaveValue('');
    expect(screen.getByLabelText('Ukrainian')).toHaveValue('');
    expect(latvian).toHaveFocus();
  });

  it('keeps the chosen topic, part of speech and level for the next word, and remembers the topic', async () => {
    const { bodies } = setup();
    const user = userEvent.setup();
    await fill(user, 'ēst', 'їсти');
    await user.selectOptions(screen.getByLabelText('Part of speech'), 'verb');
    await user.selectOptions(screen.getByLabelText('Topic'), '2');
    await user.selectOptions(screen.getByLabelText('Level'), 'B1');
    await user.click(screen.getByRole('button', { name: 'Add word' }));
    await screen.findByRole('status');

    await user.type(screen.getByLabelText('Latvian'), 'dzert');
    await user.type(screen.getByLabelText('Ukrainian'), 'пити');
    await user.click(screen.getByRole('button', { name: 'Add word' }));

    await vi.waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toMatchObject({ pos: 'verb', topicId: 2, level: 'B1' });
    expect(localStorage.getItem('add.topic')).toBe('2');
  });

  it('preselects the remembered topic', async () => {
    localStorage.setItem('add.topic', '2');
    setup();

    await screen.findByRole('option', { name: 'Food and drink' });

    expect(screen.getByLabelText('Topic')).toHaveValue('2');
  });

  it('sends a complete optional sentence', async () => {
    const { bodies } = setup();
    const user = userEvent.setup();
    await fill(user, 'maize', 'хліб');

    await user.click(screen.getByText('Sentence (optional)'));
    await user.type(screen.getByLabelText('Sentence with ___'), 'Es ēdu ___.');
    await user.type(screen.getByLabelText('Missing word'), 'maizi');
    await user.type(screen.getByLabelText('Translation'), 'Я їм хліб.');
    await user.click(screen.getByRole('button', { name: 'Add word' }));

    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      sentence: {
        textWithGap: 'Es ēdu ___.',
        answer: 'maizi',
        hint: 'Я їм хліб.',
      },
    });
  });

  it('blocks a half-filled sentence', async () => {
    const { bodies } = setup();
    const user = userEvent.setup();
    await fill(user, 'maize', 'хліб');
    await user.click(screen.getByText('Sentence (optional)'));
    await user.type(screen.getByLabelText('Missing word'), 'maizi');

    await user.click(screen.getByRole('button', { name: 'Add word' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Fill all three sentence fields.',
    );
    expect(bodies).toEqual([]);
  });

  it.each([
    [409, 'duplicate_word', 'maize is already in your deck.'],
    [400, 'invalid_word', 'Check the fields and try again.'],
    [500, 'error', 'Could not add the word. Try again.'],
  ])('explains a failed add (%i %s)', async (status, error, message) => {
    setup(() => ({ status, body: { error } }));
    const user = userEvent.setup();
    await fill(user, 'maize', 'хліб');

    await user.click(screen.getByRole('button', { name: 'Add word' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Latvian')).toHaveValue('maize');
  });

  it('sends one request on a double click', async () => {
    const { bodies } = setup();
    const user = userEvent.setup();
    await fill(user, 'maize', 'хліб');

    await user.dblClick(screen.getByRole('button', { name: 'Add word' }));

    await screen.findByRole('status');
    expect(bodies).toHaveLength(1);
  });

  it('names the first field after the deck language', async () => {
    localStorage.setItem('deck', 'en-uk');
    mockApi(
      appRoutes({
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
        'GET /api/decks/en-uk/topic-options': () => ({
          body: [{ id: 9, slug: 'x', title: 'X', titleUk: 'Х' }],
        }),
      }),
    );
    render(
      <MemoryRouter initialEntries={['/add']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText('English')).toBeInTheDocument();
  });
});
