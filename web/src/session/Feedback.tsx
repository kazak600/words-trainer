import { useState } from 'react';
import type { AnswerView } from '../api/study';
import { DiffWord } from './DiffWord';

type Props = {
  reply: AnswerView;
  typed?: string;
  onRaise: () => Promise<{ learned: boolean } | null>;
  onContinue: () => void;
};

export function Feedback({ reply, typed, onRaise, onContinue }: Props) {
  const [raised, setRaised] = useState(false);
  const [raising, setRaising] = useState(false);
  const [learnedByRaise, setLearnedByRaise] = useState(false);
  const variant =
    reply.verdict === 'typo' ? 'typo' : reply.correct ? 'ok' : 'bad';
  const title = { ok: 'Correct', typo: 'Pass with typo', bad: 'Not quite' }[
    variant
  ];

  async function raise() {
    if (raising) return;
    setRaising(true);
    const result = await onRaise();
    setRaising(false);
    if (result) {
      setRaised(true);
      setLearnedByRaise(result.learned);
    }
  }

  return (
    <>
      <div role="status" className={`feedback ${variant}`}>
        <strong>{title}</strong>
        {(reply.learned || learnedByRaise) && (
          <span className="badge">Learned ✓</span>
        )}
        {variant !== 'ok' &&
          (reply.diff && reply.diff.length > 0 ? (
            <DiffWord diff={reply.diff} />
          ) : (
            <span className="diff-word" lang="lv">
              {reply.expected}
            </span>
          ))}
        {variant !== 'ok' && typed !== undefined && (
          <span className="muted">You typed: {typed.trim()}</span>
        )}
        {variant === 'typo' && (
          <span className="muted">Short interval, no promotion.</span>
        )}
      </div>
      {reply.canRaise &&
        (raised ? (
          <p className="muted center">Marked as easy</p>
        ) : (
          <button type="button" disabled={raising} onClick={raise}>
            Mark as easy
          </button>
        ))}
      <button
        type="button"
        className="primary"
        disabled={raising}
        autoFocus
        onClick={onContinue}
      >
        Continue
      </button>
    </>
  );
}
