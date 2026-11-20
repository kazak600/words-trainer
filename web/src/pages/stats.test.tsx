import userEvent from '@testing-library/user-event';
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
    expect(rows).toHaveLength(5);
    await userEvent.setup().click(
      within(recent.parentElement!).getByRole('button', {
        name: 'Show more',
      }),
    );
    expect(within(recent).getAllByRole('row')).toHaveLength(14);
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

describe('Study calendar month view', () => {
  it('shows the current month with its totals and pages back and forward', async () => {
    setup();
    const user = userEvent.setup();

    expect(await screen.findByText('November 2026')).toBeInTheDocument();
    expect(
      screen.getByText('2 study days · 17 reviews this month'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Previous month' }));

    expect(screen.getByText('October 2026')).toBeInTheDocument();
    expect(
      screen.getByText('0 study days · 0 reviews this month'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('November 2026')).toBeInTheDocument();
  });

  it('stops paging back at the start of the 90-day window', async () => {
    setup();
    const user = userEvent.setup({ advanceTimers: () => {} });
    await screen.findByText('November 2026');

    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole('button', { name: 'Previous month' }));
    }

    expect(screen.getByText('August 2026')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Previous month' }),
    ).toBeDisabled();
  });
});

describe('Stats lists', () => {
  const manyTopics = Array.from({ length: 7 }, (_, i) => ({
    topicId: i + 1,
    title: `Topic ${i + 1}`,
    titleUk: `Тема ${i + 1}`,
    total: 4,
    learned: 1,
  }));

  it('shows five topics and expands the full list with Show more', async () => {
    setup({ ...stats, topics: manyTopics });
    const user = userEvent.setup();
    const topics = await screen.findByRole('table', { name: 'By topic' });
    const toggle = () => topics.nextElementSibling as HTMLElement;

    expect(within(topics).getAllByRole('row')).toHaveLength(5);
    expect(toggle()).toHaveTextContent('Show more');
    await user.click(toggle());
    expect(within(topics).getAllByRole('row')).toHaveLength(7);
    expect(toggle()).toHaveTextContent('Show less');
    await user.click(toggle());
    expect(within(topics).getAllByRole('row')).toHaveLength(5);
  });

  it('shows no toggle when the topic list fits in five rows', async () => {
    setup();

    const topics = await screen.findByRole('table', { name: 'By topic' });
    expect(topics.nextElementSibling?.tagName).toBe('H2');
  });
});
