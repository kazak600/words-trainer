import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { setUnauthorizedHandler } from '../api/client';
import { appRoutes, lvDeck, mockApi } from '../test/mockApi';

const enDeck = {
  slug: 'en-uk',
  sourceLang: 'en',
  targetLang: 'uk',
  title: 'English → Ukrainian',
};

beforeEach(() => localStorage.setItem('deck', 'en-uk'));
afterEach(() => {
  setUnauthorizedHandler(null);
  vi.unstubAllGlobals();
  localStorage.clear();
});

const base = { retry: false, wordId: 1, pos: 'noun', translation: 'хліб' };

function setup(card: object, answer: object = {}) {
  mockApi(
    appRoutes({
      'GET /api/decks': () => ({ body: [lvDeck, enDeck] }),
      'GET /api/decks/en-uk/sessions/current': () => ({
        body: { id: 's1', topicId: 1, total: 3, index: 0, card },
      }),
      'POST /api/sessions/s1/answer': () => ({
        body: {
          grade: 'good',
          correct: true,
          expected: 'bread',
          learned: false,
          canRaise: false,
          finished: false,
          next: null,
          ...answer,
        },
      }),
    }),
  );
  render(
    <MemoryRouter initialEntries={['/session']}>
      <App />
    </MemoryRouter>,
  );
}

describe('an English deck session', () => {
  it('asks to type in English, marks the input as English and shows no Latvian letters', async () => {
    setup({ ...base, index: 0, kind: 'production' });

    const input = await screen.findByRole('textbox');

    expect(screen.getByText('Type it in English')).toBeInTheDocument();
    expect(input).toHaveAttribute('lang', 'en');
    expect(screen.queryByRole('button', { name: 'ā' })).toBeNull();
  });

  it('marks the word of a recognition card as English', async () => {
    setup({ ...base, index: 0, kind: 'recognition', lemma: 'bread' });

    expect(await screen.findByText('bread')).toHaveAttribute('lang', 'en');
  });

  it('marks the sentence of a cloze card as English', async () => {
    setup({
      ...base,
      index: 0,
      kind: 'cloze',
      textWithGap: 'I eat ___ every day.',
      hint: 'Я їм хліб щодня.',
    });

    const sentence = await screen.findByText(/I eat/);
    expect(sentence).toHaveAttribute('lang', 'en');
  });

  it('shows the intro word as English and offers no forms panel for it', async () => {
    setup({
      ...base,
      index: 0,
      kind: 'intro',
      lemma: 'bread',
      forms: { singular: { nominative: 'bread' } },
    });

    expect(await screen.findByText('bread')).toHaveAttribute('lang', 'en');
    expect(screen.queryByText('Forms')).toBeNull();
  });
});

describe('a Latvian deck session', () => {
  it('still offers the Latvian letters', async () => {
    localStorage.setItem('deck', 'lv-uk');
    mockApi(
      appRoutes({
        'GET /api/decks/lv-uk/sessions/current': () => ({
          body: {
            id: 's1',
            topicId: 1,
            total: 1,
            index: 0,
            card: { ...base, index: 0, kind: 'production' },
          },
        }),
      }),
    );
    render(
      <MemoryRouter initialEntries={['/session']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('button', { name: 'ā' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAttribute('lang', 'lv');
  });
});
