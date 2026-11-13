import type { AnswerView } from '../api/study';
import { DiffWord } from './DiffWord';

type Props = {
  reply: AnswerView;
  typed?: string;
  onContinue: () => void;
};

export function Feedback({ reply, typed, onContinue }: Props) {
  return (
    <>
      <div role="status" className={`feedback ${reply.correct ? 'ok' : 'bad'}`}>
        <strong>{reply.correct ? 'Correct' : 'Not quite'}</strong>
        {reply.learned && <span className="badge">Learned ✓</span>}
        {!reply.correct &&
          (reply.diff && reply.diff.length > 0 ? (
            <DiffWord diff={reply.diff} />
          ) : (
            <span className="diff-word" lang="lv">
              {reply.expected}
            </span>
          ))}
        {!reply.correct && typed !== undefined && (
          <span className="muted">You typed: {typed.trim()}</span>
        )}
      </div>
      <button type="button" className="primary" onClick={onContinue}>
        Continue
      </button>
    </>
  );
}
