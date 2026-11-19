import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeckProvider, useDeck } from './DeckContext';
import { mockApi } from '../test/mockApi';

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

function Probe() {
  const { deck, decks, setDeck } = useDeck();
  return (
    <div>
      <span data-testid="current">{deck.slug}</span>
      <span data-testid="count">{decks.length}</span>
      <button onClick={() => setDeck('en-uk')}>pick</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <DeckProvider>
      <Probe />
    </DeckProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mockApi({ 'GET /api/decks': () => ({ body: decks }) });
});

afterEach(() => vi.unstubAllGlobals());

describe('DeckProvider', () => {
  it('shows nothing until the decks are loaded, then the first deck', async () => {
    renderProbe();

    expect(screen.queryByTestId('current')).not.toBeInTheDocument();
    expect(await screen.findByTestId('current')).toHaveTextContent('lv-uk');
    expect(screen.getByTestId('count')).toHaveTextContent('2');
  });

  it('offers a retry when the decks cannot be loaded, then recovers', async () => {
    let up = false;
    mockApi({
      'GET /api/decks': () =>
        up ? { body: decks } : { status: 503, body: {} },
    });
    renderProbe();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load',
    );
    up = true;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByTestId('current')).toHaveTextContent('lv-uk');
  });

  it('uses the stored deck', async () => {
    localStorage.setItem('deck', 'en-uk');

    renderProbe();

    expect(await screen.findByTestId('current')).toHaveTextContent('en-uk');
  });

  it('falls back to the first deck when the stored one does not exist', async () => {
    localStorage.setItem('deck', 'gone');

    renderProbe();

    expect(await screen.findByTestId('current')).toHaveTextContent('lv-uk');
  });

  it('remembers a picked deck', async () => {
    renderProbe();

    await userEvent.click(await screen.findByRole('button', { name: 'pick' }));

    expect(screen.getByTestId('current')).toHaveTextContent('en-uk');
    expect(localStorage.getItem('deck')).toBe('en-uk');
  });

  it('survives a localStorage that throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    renderProbe();
    await userEvent.click(await screen.findByRole('button', { name: 'pick' }));

    expect(screen.getByTestId('current')).toHaveTextContent('en-uk');
    vi.restoreAllMocks();
  });
});
