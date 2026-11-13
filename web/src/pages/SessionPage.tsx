import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  answerCard,
  fetchCurrentSession,
  startSession,
  type AnswerInput,
  type AnswerView,
  type Card,
  type SessionView,
} from '../api/study';
import { grammarLine } from '../grammar';
import { ChoiceCard } from '../session/ChoiceCard';
import { Feedback } from '../session/Feedback';
import { WriteCard } from '../session/WriteCard';

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

type Checked = { reply: AnswerView; picked?: number; typed?: string };

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
  const [checked, setChecked] = useState<Checked | null>(null);
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
        setChecked(null);
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

  function advance(reply: AnswerView) {
    setFlipped(false);
    setChecked(null);
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
  }

  async function submit(input: AnswerInput): Promise<AnswerView | null> {
    setBusy(true);
    setError(null);
    try {
      return await answerCard(session.id, index, input);
    } catch {
      setError('Could not save the answer. Try again.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function rate(result: 'again' | 'good' | 'easy') {
    const reply = await submit({ result });
    if (reply) advance(reply);
  }

  async function choose(wordId: number) {
    const reply = await submit({ choiceWordId: wordId });
    if (reply) setChecked({ reply, picked: wordId });
  }

  async function write(typed: string) {
    const reply = await submit({ typed });
    if (reply) setChecked({ reply, typed });
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

      {card.mode === 'flip' && (
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
          {flipped && (
            <div className="answers">
              <button
                type="button"
                disabled={busy}
                onClick={() => rate('again')}
              >
                Again
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => rate('good')}
              >
                Good
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => rate('easy')}
              >
                Easy
              </button>
            </div>
          )}
        </>
      )}

      {card.mode === 'choice' && (
        <ChoiceCard
          card={card}
          picked={checked?.picked ?? null}
          rightId={
            checked
              ? checked.reply.correct
                ? checked.picked!
                : card.wordId
              : null
          }
          busy={busy}
          onPick={choose}
        />
      )}

      {card.mode === 'write' && (
        <WriteCard
          key={card.index}
          card={card}
          locked={checked !== null}
          busy={busy}
          onSubmit={write}
        />
      )}

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {checked && (
        <Feedback
          reply={checked.reply}
          typed={checked.typed}
          onContinue={() => advance(checked.reply)}
        />
      )}
    </section>
  );
}
