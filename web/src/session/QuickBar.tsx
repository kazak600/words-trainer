const LETTERS = 'ā č ē ģ ī ķ ļ ņ š ū ž'.split(' ');

// Buttons must not take focus from the input, or the keyboard would close on every tap.
export function QuickBar({ onInsert }: { onInsert: (letter: string) => void }) {
  return (
    <div className="quickbar">
      {LETTERS.map((letter) => (
        <button
          key={letter}
          type="button"
          lang="lv"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(letter)}
        >
          {letter}
        </button>
      ))}
    </div>
  );
}
