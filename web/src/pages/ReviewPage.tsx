import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchCurrentSession,
  fetchReview,
  startReviewSession,
  type ReviewSummary,
} from '../api/study';
import { useDeck } from '../decks/DeckContext';
import { useStartSession } from './startSession';

export function ReviewPage() {
  const { deck } = useDeck();
  const [review, setReview] = useState<ReviewSummary | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const { start, starting, error } = useStartSession();

  useEffect(() => {
    fetchReview(deck.slug)
      .then(setReview)
      .catch(() => setLoadError(true));
    fetchCurrentSession(deck.slug)
      .then(() => setHasSession(true))
      .catch(() => setHasSession(false));
  }, [deck.slug]);

  const message =
    error ?? (loadError ? 'Could not load the review queue.' : null);

  return (
    <section>
      <h1>Review</h1>
      {hasSession && (
        <Link to="/session" className="continue">
          Continue your session
        </Link>
      )}
      {review && (
        <div className="card center">
          <p className="big">{review.due} due</p>
          {review.due === 0 && (
            <p className="muted">Nothing is due right now.</p>
          )}
        </div>
      )}
      {message && (
        <p role="alert" className="error">
          {message}
        </p>
      )}
      <button
        type="button"
        className="primary"
        disabled={starting || !review || review.due === 0}
        onClick={() => start(() => startReviewSession(deck.slug))}
      >
        Start review
      </button>
    </section>
  );
}
