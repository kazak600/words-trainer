import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  fetchCurrentSession,
  fetchStreak,
  fetchTopics,
  startSession,
  type Streak,
  type Topic,
} from '../api/study';
import { useAuth } from '../auth/AuthContext';

function streakLabel(streak: Streak): string {
  return streak.days > 0 ? `${streak.days}-day streak` : 'No streak yet';
}

export function HomePage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetchTopics()
      .then(setTopics)
      .catch(() => setError('Could not load topics.'));
    fetchStreak()
      .then(setStreak)
      .catch(() => {});
    fetchCurrentSession()
      .then(() => setHasSession(true))
      .catch(() => setHasSession(false));
  }, []);

  async function start(topic: Topic) {
    setStarting(true);
    setError(null);
    try {
      await startSession(topic.id);
      navigate('/session');
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? 'Nothing to study in this topic right now. Come back when words are due.'
          : 'Could not start the session. Try again.',
      );
      setStarting(false);
    }
  }

  return (
    <section>
      <header className="row">
        <h1>Topics</h1>
        {streak && <span className="badge">{streakLabel(streak)}</span>}
      </header>
      {hasSession && (
        <Link to="/session" className="continue">
          Continue your session
        </Link>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <ul className="topics">
        {topics?.map((topic) => (
          <li key={topic.id}>
            <button
              type="button"
              className="topic"
              disabled={starting}
              onClick={() => start(topic)}
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
      <button type="button" className="link" onClick={logout}>
        Log out
      </button>
    </section>
  );
}
