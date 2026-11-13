import { useState, type FormEvent } from 'react';
import type { Card } from '../api/study';

type Props = {
  card: Card;
  locked: boolean;
  busy: boolean;
  onSubmit: (typed: string) => void;
};

export function WriteCard({ card, locked, busy, onSubmit }: Props) {
  const [typed, setTyped] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (typed.trim() && !locked && !busy) onSubmit(typed);
  }

  return (
    <form onSubmit={submit} className="write">
      <div className="prompt">
        <span className="translation">{card.translation}</span>
      </div>
      <label htmlFor="typed">Type it in Latvian</label>
      <input
        id="typed"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        disabled={locked || busy}
        lang="lv"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
      />
      <p className="muted hint">
        Tip: long-press a letter for marks — ā, č, ē, ģ, ī, ķ, ļ, ņ, š, ū, ž —
        or add the Latvian keyboard.
      </p>
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
