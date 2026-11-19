import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchReview } from '../api/study';
import { useDeck } from '../decks/DeckContext';

export function StatsPage() {
  const { deck } = useDeck();
  const [leeches, setLeeches] = useState(0);

  useEffect(() => {
    fetchReview(deck.slug)
      .then((review) => setLeeches(review.leeches))
      .catch(() => setLeeches(0));
  }, [deck.slug]);

  return (
    <section>
      <h1>Stats</h1>
      <Link to="/stats/leeches" className="continue">
        Leech Workshop{leeches > 0 ? ` · ${leeches}` : ''}
      </Link>
      <p className="muted">Charts: coming soon</p>
    </section>
  );
}
