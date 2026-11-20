import type { Card } from '../api/study';
import { GrammarPanel } from '../grammar/GrammarPanel';
import { grammarLine } from '../grammar/line';

type Props = {
  card: Card;
  lang: string;
  busy: boolean;
  onContinue: () => void;
};

// A new word shown with its translation; the user types it right after.
export function IntroCard({ card, lang, busy, onContinue }: Props) {
  const grammar = grammarLine(card.pos, card.grammar);
  return (
    <>
      <div className="flip-card intro">
        <span className="tag">New word · {card.pos}</span>
        <span className="lemma" lang={lang}>
          {card.lemma}
        </span>
        <span className="back">
          <span className="translation">{card.translation}</span>
          {grammar && <span className="muted">{grammar}</span>}
        </span>
      </div>
      <GrammarPanel
        lang={lang}
        pos={card.pos}
        grammar={card.grammar}
        forms={card.forms}
        showLine={false}
      />
      <button
        type="button"
        className="primary"
        disabled={busy}
        autoFocus
        onClick={onContinue}
      >
        Got it
      </button>
    </>
  );
}
