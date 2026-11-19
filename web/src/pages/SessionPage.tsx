import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { languageName } from '../api/decks';
import {
  answerCard,
  fetchCurrentSession,
  raiseToEasy,
  startReviewSession,
  startTopicSession,
  type AnswerInput,
  type AnswerView,
  type Card,
  type Grade,
  type SessionView,
} from '../api/study';
import { useDeck } from '../decks/DeckContext';
import { Feedback } from '../session/Feedback';
import { RecognitionCard } from '../session/RecognitionCard';
import { TypedCard } from '../session/TypedCard';
import { describeStartError } from './startSession';

type Phase =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'card'; session: SessionView; card: Card; total: number }
  | {
      kind: 'done';
      topicId: number | null;
      summary: NonNullable<AnswerView['summary']>;
    };

type Checked = { reply: AnswerView; typed: string };

const toPhase = (session: SessionView): Phase => ({
  kind: 'card',
  session,
  card: session.card,
  total: session.total,
});

export function SessionPage() {
  const navigate = useNavigate();
  const { deck } = useDeck();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [checked, setChecked] = useState<Checked | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentSession(deck.slug)
      .then((session) => setPhase(toPhase(session)))
      .catch(() => setPhase({ kind: 'none' }));
  }, [deck.slug]);

  if (phase.kind === 'loading') return null;
  if (phase.kind === 'none') return <Navigate to="/" replace />;

  if (phase.kind === 'done') {
    const { summary, topicId } = phase;
    async function another() {
      setBusy(true);
      setError(null);
      try {
        const session =
          topicId === null
            ? await startReviewSession(deck.slug)
            : await startTopicSession(deck.slug, topicId);
        setPhase(toPhase(session));
        setChecked(null);
      } catch (e) {
        setError(describeStartError(e));
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

  const { card, session, total } = phase;

  function advance(reply: AnswerView) {
    setChecked(null);
    setError(null);
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
        total: Math.max(total, reply.next.index + 1),
      });
    }
  }

  async function submit(input: AnswerInput): Promise<AnswerView | null> {
    setBusy(true);
    setError(null);
    try {
      return await answerCard(session.id, card.index, input);
    } catch {
      setError('Could not save the answer. Try again.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function grade(value: Grade) {
    const reply = await submit({ grade: value });
    if (reply) advance(reply);
  }

  async function type(typed: string) {
    const reply = await submit({ typed });
    if (reply) setChecked({ reply, typed });
  }

  async function raise(): Promise<{ learned: boolean } | null> {
    try {
      const { learned } = await raiseToEasy(session.id, card.index);
      return { learned };
    } catch {
      setError('Could not mark the card as easy.');
      return null;
    }
  }

  return (
    <section className="session">
      <header className="topbar">
        <button type="button" className="exit" onClick={() => navigate('/')}>
          Exit
        </button>
        <progress
          value={card.index}
          max={total}
          aria-label="Session progress"
        />
      </header>

      {card.kind === 'recognition' ? (
        <RecognitionCard
          key={card.index}
          card={card}
          busy={busy}
          onGrade={grade}
        />
      ) : (
        <TypedCard
          key={card.index}
          card={card}
          language={languageName(deck.sourceLang)}
          locked={checked !== null}
          busy={busy}
          onSubmit={type}
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
          onRaise={raise}
          onContinue={() => advance(checked.reply)}
        />
      )}
    </section>
  );
}
