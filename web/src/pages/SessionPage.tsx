import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  answerFlipCard,
  fetchCurrentSession,
  startSession,
  type AnswerView,
  type Card,
  type SessionView,
} from '../api/study';
import { grammarLine } from '../grammar';

type Phase =
  | { kind: 'loading' }
  | { kind: 'none' }
  | {
      kind: 'card';
      session: SessionView;
      card: Card;
      index: number;
      total: number;
    }
  | {
      kind: 'done';
      topicId: number;
      summary: NonNullable<AnswerView['summary']>;
    };

function toPhase(session: SessionView): Phase {
  return {
    kind: 'card',
    session,
    card: session.card,
    index: session.index,
    total: session.total,
  };
}

export function SessionPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentSession()
      .then((session) => setPhase(toPhase(session)))
      .catch(() => setPhase({ kind: 'none' }));
  }, []);

  if (phase.kind === 'loading') return null;
  if (phase.kind === 'none') return <Navigate to="/" replace />;

  if (phase.kind === 'done') {
    const { summary, topicId } = phase;
    async function another() {
      setBusy(true);
      try {
        setPhase(toPhase(await startSession(topicId)));
        setFlipped(false);
      } catch {
        setError('Nothing more to study in this topic right now.');
      }
      setBusy(false);
    }
    return (
      <section className="card center">
        <h1>Session complete</h1>
        <p>
          {summary.cards} cards · {summary.correct} correct · {summary.wrong}{' '}
          missed
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={another}
        >
          Another session
        </button>
        <button type="button" onClick={() => navigate('/')}>
          Home
        </button>
      </section>
    );
  }

  const { card, index, total, session } = phase;

  async function answer(result: 'again' | 'good' | 'easy') {
    setBusy(true);
    setError(null);
    try {
      const reply = await answerFlipCard(session.id, index, result);
      setFlipped(false);
      if (reply.finished && reply.summary) {
        setPhase({
          kind: 'done',
          topicId: session.topicId,
          summary: reply.summary,
        });
      } else if (reply.next) {
        setPhase({
          kind: 'card',
          session,
          card: reply.next,
          index: reply.next.index,
          total: Math.max(total, reply.next.index + 1),
        });
      }
    } catch {
      setError('Could not save the answer. Try again.');
    }
    setBusy(false);
  }

  const grammar = flipped ? grammarLine(card.pos, card.grammar) : null;

  return (
    <section className="session">
      <header className="row">
        <button type="button" onClick={() => navigate('/')}>
          Exit
        </button>
        <progress value={index} max={total} aria-label="Session progress" />
      </header>

      {card.mode !== 'flip' ? (
        <div className="card center">
          <p>This card type is not available yet.</p>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="flip-card"
            onClick={() => setFlipped(true)}
            disabled={flipped}
          >
            <span className="lemma">{card.lemma}</span>
            {flipped && (
              <span className="back" key={card.index}>
                <span className="translation">{card.translation}</span>
                {grammar && <span className="muted">{grammar}</span>}
              </span>
            )}
            {!flipped && <span className="muted">Tap to flip</span>}
          </button>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {flipped && (
            <div className="answers">
              <button
                type="button"
                disabled={busy}
                onClick={() => answer('again')}
              >
                Again
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => answer('good')}
              >
                Good
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => answer('easy')}
              >
                Easy
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
