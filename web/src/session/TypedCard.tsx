import {
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { Card } from '../api/study';
import { QuickBar } from './QuickBar';

type Props = {
  card: Card;
  language: string;
  lang: string;
  locked: boolean;
  busy: boolean;
  onSubmit: (typed: string) => void;
};

function Sentence({ text, lang }: { text: string; lang: string }) {
  const parts = text.split('___');
  const pieces: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (i > 0)
      pieces.push(
        <span key={i} className="gap" role="img" aria-label="blank" />,
      );
    pieces.push(part);
  });
  return (
    <p className="sentence" lang={lang}>
      {pieces}
    </p>
  );
}

export function TypedCard({
  card,
  language,
  lang,
  locked,
  busy,
  onSubmit,
}: Props) {
  const [typed, setTyped] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  // The caret has to move after React has written the new value into the input.
  useLayoutEffect(() => {
    if (caret.current !== null && input.current) {
      input.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [typed]);

  function insert(letter: string) {
    const el = input.current;
    const start = el?.selectionStart ?? typed.length;
    const end = el?.selectionEnd ?? typed.length;
    caret.current = start + letter.length;
    setTyped(typed.slice(0, start) + letter + typed.slice(end));
    el?.focus();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (typed.trim() && !locked && !busy) onSubmit(typed);
  }

  return (
    <form onSubmit={submit} className="typed">
      <div className="prompt">
        {card.kind === 'cloze' ? (
          <>
            <span className="tag">Type the missing word</span>
            <Sentence text={card.textWithGap ?? ''} lang={lang} />
            <p className="hint">{card.hint}</p>
          </>
        ) : (
          <>
            <span className="tag">Type it in {language}</span>
            <span className="translation">{card.translation}</span>
          </>
        )}
      </div>
      <input
        ref={input}
        aria-label="Your answer"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        disabled={locked || busy}
        lang={lang}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
      />
      {!locked && <QuickBar lang={lang} onInsert={insert} />}
      {!locked && (
        <button
          type="submit"
          className="primary"
          disabled={busy || !typed.trim()}
        >
          Check
        </button>
      )}
    </form>
  );
}
