import { useState } from 'react';
import type { Card, Grade } from '../api/study';
import { grammarLine } from '../grammar';

const GRADES: { grade: Grade; label: string }[] = [
  { grade: 'again', label: 'Again' },
  { grade: 'hard', label: 'Hard' },
  { grade: 'good', label: 'Good' },
  { grade: 'easy', label: 'Easy' },
];

type Props = { card: Card; busy: boolean; onGrade: (grade: Grade) => void };

export function RecognitionCard({ card, busy, onGrade }: Props) {
  const [revealed, setRevealed] = useState(false);
  const grammar = revealed ? grammarLine(card.pos, card.grammar) : null;
  return (
    <>
      <button
        type="button"
        className="flip-card"
        onClick={() => setRevealed(true)}
        disabled={revealed}
      >
        <span className="tag">{card.pos}</span>
        <span className="lemma" lang="lv">
          {card.lemma}
        </span>
        {revealed ? (
          <span className="back">
            <span className="translation">{card.translation}</span>
            {grammar && <span className="muted">{grammar}</span>}
          </span>
        ) : (
          <span className="muted">Tap to reveal</span>
        )}
      </button>
      {revealed && (
        <div className="grades">
          {GRADES.map(({ grade, label }) => (
            <button
              key={grade}
              type="button"
              className={`grade ${grade}`}
              disabled={busy}
              onClick={() => onGrade(grade)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
