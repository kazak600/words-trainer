import { useAuth } from '../auth/AuthContext';
import { useDeck } from '../decks/DeckContext';

export function SettingsPage() {
  const { logout } = useAuth();
  const { decks, deck, setDeck } = useDeck();
  return (
    <section>
      <h1>Settings</h1>
      <h2>Language</h2>
      <div className="choices">
        {decks.map((d) => (
          <button
            key={d.slug}
            type="button"
            className="choice"
            aria-pressed={d.slug === deck.slug}
            onClick={() => setDeck(d.slug)}
          >
            {d.title}
          </button>
        ))}
      </div>
      <button type="button" className="link" onClick={logout}>
        Log out
      </button>
    </section>
  );
}
