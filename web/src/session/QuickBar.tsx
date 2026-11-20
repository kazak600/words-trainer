// Letters missing from a phone keyboard, per language; English needs none.
const LETTERS: Record<string, string[]> = {
  lv: 'ā č ē ģ ī ķ ļ ņ š ū ž'.split(' '),
};

// Buttons must not take focus from the input, or the keyboard would close on every tap.
export function QuickBar({
  lang,
  onInsert,
}: {
  lang: string;
  onInsert: (letter: string) => void;
}) {
  const letters = LETTERS[lang];
  if (!letters) return null;
  return (
    <div className="quickbar">
      {letters.map((letter) => (
        <button
          key={letter}
          type="button"
          lang={lang}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(letter)}
        >
          {letter}
        </button>
      ))}
    </div>
  );
}
