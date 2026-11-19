import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addSentence,
  fetchLeeches,
  saveNotes,
  unsuspend,
  type LeechItem,
  type Notes,
} from '../api/leeches';
import { useDeck } from '../decks/DeckContext';

type Props = { item: LeechItem; onReturned: () => void };

function LeechCard({ item, onReturned }: Props) {
  const { deck } = useDeck();
  const [mnemonic, setMnemonic] = useState(item.mnemonic);
  const [similarWord, setSimilarWord] = useState(item.similarWord);
  // What the server has: only fields that differ from it are sent, so another card of the same word
  // cannot be overwritten with stale text.
  const [saved, setSaved] = useState<Notes>({
    mnemonic: item.mnemonic,
    similarWord: item.similarWord,
  });
  const [gap, setGap] = useState('');
  const [answer, setAnswer] = useState('');
  const [hint, setHint] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sentenceFields = [gap, answer, hint].map((v) => v.trim());
  const filled = sentenceFields.filter(Boolean).length;
  const changes: Partial<Notes> = {
    ...(mnemonic !== saved.mnemonic ? { mnemonic } : {}),
    ...(similarWord !== saved.similarWord ? { similarWord } : {}),
  };
  const notesChanged = Object.keys(changes).length > 0;

  // Returns false when something was wrong, after showing why.
  async function persist(alwaysSaveNotes: boolean): Promise<boolean> {
    if (filled > 0 && filled < 3) {
      setError('Fill all three sentence fields.');
      return false;
    }
    try {
      if (alwaysSaveNotes || notesChanged || filled === 3)
        await saveNotes(deck.slug, item.wordId, changes);
      setSaved({ mnemonic, similarWord });
      if (filled === 3) {
        await addSentence(deck.slug, item.wordId, {
          textWithGap: sentenceFields[0]!,
          answer: sentenceFields[1]!,
          hint: sentenceFields[2]!,
        });
        setGap('');
        setAnswer('');
        setHint('');
      }
      return true;
    } catch {
      setError('Could not save. Try again.');
      return false;
    }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setStatus(null);
    await action();
    setBusy(false);
  }

  const save = () =>
    run(async () => {
      if (await persist(true)) setStatus('Saved');
    });

  const giveBack = () =>
    run(async () => {
      if (!(await persist(false))) return;
      try {
        await unsuspend(deck.slug, item.cardId);
        onReturned();
      } catch {
        setError('Could not return the card. Try again.');
      }
    });

  return (
    <article className="card leech" aria-label={item.lemma}>
      <header className="row">
        <h2 lang="lv">{item.lemma}</h2>
        <span className="badge">Failed {item.lapses} times</span>
      </header>
      <p className="translation">{item.translation}</p>
      {item.kind === 'cloze' && (
        <p className="muted">
          <span lang="lv">{item.textWithGap}</span>
          <br />
          {item.hint}
        </p>
      )}
      <label>
        Mnemonic
        <input
          value={mnemonic}
          onChange={(e) => setMnemonic(e.target.value)}
          maxLength={500}
        />
      </label>
      <label>
        Confused with
        <input
          value={similarWord}
          onChange={(e) => setSimilarWord(e.target.value)}
          maxLength={500}
          lang="lv"
        />
      </label>
      <fieldset>
        <legend>Stronger sentence (optional)</legend>
        <label>
          Sentence with ___
          <input
            value={gap}
            onChange={(e) => setGap(e.target.value)}
            lang="lv"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <label>
          Missing word
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            lang="lv"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <label>
          Translation
          <input value={hint} onChange={(e) => setHint(e.target.value)} />
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {status && <p className="muted">{status}</p>}
      <button type="button" disabled={busy} onClick={save}>
        Save notes
      </button>
      <button
        type="button"
        className="primary"
        disabled={busy}
        onClick={giveBack}
      >
        Return to queue
      </button>
    </article>
  );
}

export function LeechPage() {
  const { deck } = useDeck();
  const [items, setItems] = useState<LeechItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetchLeeches(deck.slug)
      .then(setItems)
      .catch(() => setLoadError(true));
  }, [deck.slug]);

  return (
    <section>
      <Link to="/stats" className="muted">
        ← Stats
      </Link>
      <h1>Leech Workshop</h1>
      {loadError && (
        <p role="alert" className="error">
          Could not load the leeches.
        </p>
      )}
      {items?.length === 0 && (
        <p className="muted">No leeches. Nothing is stuck.</p>
      )}
      <div className="leeches">
        {items?.map((item) => (
          <LeechCard
            key={item.cardId}
            item={item}
            onReturned={() =>
              setItems(
                (list) => list?.filter((i) => i.cardId !== item.cardId) ?? null,
              )
            }
          />
        ))}
      </div>
    </section>
  );
}
