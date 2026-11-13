import type { Card } from '../api/study';

type Props = {
  card: Card;
  picked: number | null;
  rightId: number | null;
  busy: boolean;
  onPick: (wordId: number) => void;
};

export function ChoiceCard({ card, picked, rightId, busy, onPick }: Props) {
  const answered = rightId !== null;
  return (
    <>
      <div className="prompt">
        <span className="translation">{card.translation}</span>
        <span className="muted">Choose the Latvian word</span>
      </div>
      <div className="options">
        {card.options?.map((option) => {
          const state = !answered
            ? undefined
            : option.wordId === rightId
              ? 'right'
              : option.wordId === picked
                ? 'wrong'
                : undefined;
          return (
            <button
              key={option.wordId}
              type="button"
              lang="lv"
              data-state={state}
              disabled={busy || answered}
              onClick={() => onPick(option.wordId)}
            >
              {option.lemma}
            </button>
          );
        })}
      </div>
    </>
  );
}
