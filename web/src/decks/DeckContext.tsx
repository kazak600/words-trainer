import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { fetchDecks, type Deck } from '../api/decks';

const STORAGE_KEY = 'deck';

type DeckContextValue = {
  decks: Deck[];
  deck: Deck;
  setDeck: (slug: string) => void;
};

const DeckContext = createContext<DeckContextValue | null>(null);

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(slug: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, slug);
  } catch {
    // The choice then only lasts until the page is reloaded.
  }
}

export function DeckProvider({ children }: { children: ReactNode }) {
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [slug, setSlug] = useState<string | null>(readStored);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    fetchDecks()
      .then(setDecks)
      .catch(() => setDecks([]));
  }, [attempt]);

  function retry() {
    setDecks(null);
    setAttempt((n) => n + 1);
  }

  const setDeck = useCallback((next: string) => {
    setSlug(next);
    store(next);
  }, []);

  if (!decks) return null;
  if (decks.length === 0)
    return (
      <section className="card center">
        <p role="alert" className="error">
          Could not load your decks.
        </p>
        <button type="button" className="primary" onClick={retry}>
          Retry
        </button>
      </section>
    );
  const deck = decks.find((d) => d.slug === slug) ?? decks[0]!;
  return (
    <DeckContext.Provider value={{ decks, deck, setDeck }}>
      {children}
    </DeckContext.Provider>
  );
}

export function useDeck(): DeckContextValue {
  const value = useContext(DeckContext);
  if (!value) throw new Error('useDeck must be used inside DeckProvider');
  return value;
}
