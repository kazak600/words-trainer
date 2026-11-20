import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { setUnauthorizedHandler } from '../api/client';
import { appRoutes, mockApi } from '../test/mockApi';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  setUnauthorizedHandler(null);
  vi.unstubAllGlobals();
  localStorage.clear();
});

const stats = {
  states: { new: 10, learning: 3, review: 4, learned: 2 },
  levels: [
    { level: 'A1', total: 12, learned: 2 },
    { level: 'A2', total: 7, learned: 0 },
  ],
  topics: [
    { topicId: 1, title: 'Māja', titleUk: 'Дім', total: 8, learned: 2 },
    { topicId: 2, title: 'Ēdiens', titleUk: 'Їжа', total: 11, learned: 0 },
  ],
  days: [
    { day: '2026-11-18', reviews: 12 },
    { day: '2026-11-20', reviews: 5 },
  ],
};

function setup(body: object = stats, leeches = 0) {
  mockApi(
    appRoutes({
      'GET /api/decks/lv-uk/stats?tzOffset=0': () => ({ body }),
      'GET /api/decks/lv-uk/review?tzOffset=0': () => ({
        body: { due: 0, newToday: 0, newCap: 10, leeches, cards: [] },
      }),
    }),
  );
  render(
    <MemoryRouter initialEntries={['/stats']}>
      <App />
    </MemoryRouter>,
  );
}

describe('stats page', () => {
  it('shows the words by state', async () => {
    setup();

    const states = await screen.findByRole('list', { name: 'Words by state' });
    const items = within(states)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items).toEqual(['New10', 'Learning3', 'Review4', 'Learned2']);
  });

  it('shows learned per level and per topic', async () => {
    setup();

    const levels = await screen.findByRole('table', { name: 'By level' });
    expect(within(levels).getByRole('row', { name: /A1/ })).toHaveTextContent(
      '2 / 12',
    );
    const topics = screen.getByRole('table', { name: 'By topic' });
    expect(within(topics).getByRole('row', { name: /Māja/ })).toHaveTextContent(
      '2 / 8',
    );
  });

  it('marks study days on the calendar and lists the latest reviews per day', async () => {
    setup();

    const calendar = await screen.findByRole('grid', { name: 'Study days' });
    expect(
      within(calendar).getByRole('gridcell', { name: '2026-11-20: 5 reviews' }),
    ).toBeInTheDocument();
    expect(
      within(calendar).getByRole('gridcell', {
        name: '2026-11-19: no reviews',
      }),
    ).toBeInTheDocument();
    const recent = screen.getByRole('table', { name: 'Reviews per day' });
    expect(
      within(recent).getByRole('row', { name: /2026-11-18/ }),
    ).toHaveTextContent('12');
    const rows = within(recent).getAllByRole('row');
    expect(rows).toHaveLength(14);
    expect(rows[0]).toHaveTextContent('2026-11-20');
    expect(
      within(recent).getByRole('row', { name: /2026-11-19/ }),
    ).toHaveTextContent('0');
  });

  it('keeps the Leech Workshop link and has no streak anywhere', async () => {
    setup(stats, 2);

    expect(
      await screen.findByRole('link', { name: /Leech Workshop · 2/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/streak/i)).toBeNull();
  });

  it('says so when the deck has no words or reviews yet', async () => {
    setup({
      states: { new: 0, learning: 0, review: 0, learned: 0 },
      levels: [],
      topics: [],
      days: [],
    });

    expect(await screen.findByText('No reviews yet.')).toBeInTheDocument();
  });
});
