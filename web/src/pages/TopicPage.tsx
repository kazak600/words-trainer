import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchTopics, startTopicSession, type Topic } from '../api/study';
import { fetchTopicWords, type TopicWord } from '../api/words';
import { useDeck } from '../decks/DeckContext';
import { useStartSession } from './startSession';

export function TopicPage() {
  const { deck } = useDeck();
  const { topicId: raw } = useParams();
  const topicId = Number(raw);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [words, setWords] = useState<TopicWord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { start, starting, error } = useStartSession();

  useEffect(() => {
    if (!Number.isInteger(topicId)) {
      setLoadError('Topic not found.');
      return;
    }
    setTopic(null);
    setWords(null);
    setLoadError(null);
    fetchTopics(deck.slug)
      .then((all) => setTopic(all.find((t) => t.id === topicId) ?? null))
      .catch(() => setLoadError('Could not load the topic.'));
    fetchTopicWords(deck.slug, topicId)
      .then(setWords)
      .catch(() => setLoadError('Could not load the words.'));
  }, [deck.slug, topicId]);

  const message = error ?? loadError;

  return (
    <section>
      <Link to="/" className="back">
        ← Topics
      </Link>
      {topic && (
        <>
          <h1>
            {topic.title} <span className="muted">{topic.titleUk}</span>
          </h1>
          <button
            type="button"
            className="primary"
            disabled={starting}
            onClick={() => start(() => startTopicSession(deck.slug, topic.id))}
          >
            Study this topic
          </button>
        </>
      )}
      {message && (
        <p role="alert" className="error">
          {message}
        </p>
      )}
      {words && (
        <>
          <p className="muted">{words.length} words</p>
          <ul className="word-list">
            {words.map((word) => (
              <li key={word.id} className="word">
                <span className="word-main">
                  <span className="word-lemma">{word.lemma}</span>{' '}
                  <span className="muted">{word.pos}</span>{' '}
                  <span className="chip">{word.level}</span>
                </span>
                <span className="word-translation">{word.translation}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
