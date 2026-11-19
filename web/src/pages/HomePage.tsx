import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchCurrentSession,
  fetchReview,
  fetchTopics,
  startReviewSession,
  startTopicSession,
  type ReviewSummary,
  type Topic,
} from '../api/study';
import { useDeck } from '../decks/DeckContext';
import { useStartSession } from './startSession';

export function HomePage() {
  const { deck } = useDeck();
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [review, setReview] = useState<ReviewSummary | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { start, starting, error } = useStartSession();

  useEffect(() => {
    fetchTopics(deck.slug)
      .then(setTopics)
      .catch(() => setLoadError('Could not load topics.'));
    fetchReview(deck.slug)
      .then(setReview)
      .catch(() => setLoadError('Could not load topics.'));
    fetchCurrentSession(deck.slug)
      .then(() => setHasSession(true))
      .catch(() => setHasSession(false));
  }, [deck.slug]);

  const message = error ?? loadError;

  return (
    <section>
      <h1>Topics</h1>
      {hasSession && (
        <Link to="/session" className="continue">
          Continue your session
        </Link>
      )}
      {review && review.leeches > 0 && (
        <Link to="/stats/leeches" className="continue">
          Leech Workshop · {review.leeches}
        </Link>
      )}
      {review && (
        <div className="card review-cta">
          <button
            type="button"
            className="primary"
            disabled={starting || review.due === 0}
            onClick={() => start(() => startReviewSession(deck.slug))}
          >
            Review · {review.due} due
          </button>
          <p className="muted center">
            New today: {review.newToday} / {review.newCap}
          </p>
        </div>
      )}
      {message && (
        <p role="alert" className="error">
          {message}
        </p>
      )}
      <ul className="topics">
        {topics?.map((topic) => (
          <li key={topic.id}>
            <button
              type="button"
              className="topic"
              disabled={starting}
              onClick={() =>
                start(() => startTopicSession(deck.slug, topic.id))
              }
            >
              <span className="topic-title">
                {topic.title} <span className="muted">{topic.titleUk}</span>
              </span>
              <span className="chips">
                {Object.keys(topic.wordCounts).map((level) => (
                  <span key={level} className="chip">
                    {level}
                  </span>
                ))}
              </span>
              <span className="muted">
                {topic.counts.new} new · {topic.counts.learning} learning ·{' '}
                {topic.counts.learned} learned
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
