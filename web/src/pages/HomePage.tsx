import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  discardSession,
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

const STALE_AFTER_SECONDS = 86_400;

type Resume = {
  startedOn: string;
  stale: boolean;
  topicId: number | null;
};

function describeResume(
  updatedAt: number | undefined,
  topicId: number | null,
): Resume {
  const now = Date.now() / 1000;
  const offsetMs = -new Date().getTimezoneOffset() * 60_000;
  return {
    topicId,
    stale: updatedAt !== undefined && now - updatedAt > STALE_AFTER_SECONDS,
    startedOn: new Date((updatedAt ?? now) * 1000 + offsetMs)
      .toISOString()
      .slice(0, 10),
  };
}

export function HomePage() {
  const { deck } = useDeck();
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [review, setReview] = useState<ReviewSummary | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);
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
      .then((session) =>
        setResume(describeResume(session.updatedAt, session.topicId)),
      )
      .catch(() => setResume(null));
  }, [deck.slug]);

  async function startOver() {
    try {
      await discardSession(deck.slug);
      setResume(null);
    } catch {
      setLoadError('Could not discard the session. Try again.');
      return;
    }
    const topicId = resume?.topicId ?? null;
    await start(() =>
      topicId === null
        ? startReviewSession(deck.slug)
        : startTopicSession(deck.slug, topicId),
    );
  }

  const message = error ?? loadError;

  return (
    <section>
      <h1>Topics</h1>
      {resume && !resume.stale && (
        <Link to="/session" className="continue">
          Continue your session
        </Link>
      )}
      {resume?.stale && (
        <div className="card">
          <p>Your session from {resume.startedOn} is still open.</p>
          <Link to="/session" className="continue">
            Continue
          </Link>
          <button type="button" onClick={startOver}>
            Start over
          </button>
        </div>
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
