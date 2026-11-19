import { useEffect, useRef, useState, type FormEvent } from 'react';
import { languageName } from '../api/decks';
import { ApiError } from '../api/client';
import { addWord, fetchTopicOptions, type TopicOption } from '../api/manual';
import { useDeck } from '../decks/DeckContext';

const POS_OPTIONS = [
  ['noun', 'Noun'],
  ['verb', 'Verb'],
  ['adj', 'Adjective'],
  ['adv', 'Adverb'],
  ['num', 'Numeral'],
  ['pron', 'Pronoun'],
  ['phrase', 'Phrase'],
  ['propn', 'Proper noun'],
  ['prep', 'Preposition'],
  ['conj', 'Conjunction'],
  ['part', 'Particle'],
  ['interj', 'Interjection'],
];
const LEVELS = ['A1', 'A2', 'B1', 'B2'];
const TOPIC_KEY = 'add.topic';

function storedTopic(): number | null {
  try {
    const value = Number(localStorage.getItem(TOPIC_KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function rememberTopic(id: number): void {
  try {
    localStorage.setItem(TOPIC_KEY, String(id));
  } catch {
    // Only the preselection is lost.
  }
}

function failureMessage(error: unknown, lemma: string): string {
  if (error instanceof ApiError && error.code === 'duplicate_word')
    return `${lemma} is already in your deck.`;
  if (error instanceof ApiError && error.code === 'invalid_word')
    return 'Check the fields and try again.';
  return 'Could not add the word. Try again.';
}

export function AddPage() {
  const { deck } = useDeck();
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [topicId, setTopicId] = useState<number | null>(storedTopic());
  const [pos, setPos] = useState('noun');
  const [level, setLevel] = useState('A2');
  const [lemma, setLemma] = useState('');
  const [translation, setTranslation] = useState('');
  const [gap, setGap] = useState('');
  const [answer, setAnswer] = useState('');
  const [hint, setHint] = useState('');
  const [added, setAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const lemmaInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchTopicOptions(deck.slug)
      .then(setTopics)
      .catch(() => setError('Could not load the topics.'));
  }, [deck.slug]);

  const selectedTopic =
    topics.find((t) => t.id === topicId)?.id ?? topics[0]?.id ?? '';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sendingRef.current || selectedTopic === '') return;
    const sentence = [gap, answer, hint].map((v) => v.trim());
    const filled = sentence.filter(Boolean).length;
    setAdded(null);
    if (filled > 0 && filled < 3) {
      setError('Fill all three sentence fields.');
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setError(null);
    const word = lemma.trim();
    try {
      await addWord(deck.slug, {
        lemma: word,
        translation: translation.trim(),
        pos,
        topicId: selectedTopic,
        level,
        ...(filled === 3
          ? {
              sentence: {
                textWithGap: sentence[0]!,
                answer: sentence[1]!,
                hint: sentence[2]!,
              },
            }
          : {}),
      });
      rememberTopic(selectedTopic);
      setAdded(`Added ${word}`);
      setLemma('');
      setTranslation('');
      setGap('');
      setAnswer('');
      setHint('');
      lemmaInput.current?.focus();
    } catch (e) {
      setError(failureMessage(e, word));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  return (
    <section>
      <h1>Add</h1>
      <form className="add" onSubmit={submit}>
        <label>
          {languageName(deck.sourceLang)}
          <input
            ref={lemmaInput}
            value={lemma}
            onChange={(e) => setLemma(e.target.value)}
            lang={deck.sourceLang}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
          />
        </label>
        <label>
          {languageName(deck.targetLang)}
          <input
            value={translation}
            onChange={(e) => setTranslation(e.target.value)}
            lang={deck.targetLang}
            autoComplete="off"
          />
        </label>
        <div className="selects">
          <label>
            Part of speech
            <select value={pos} onChange={(e) => setPos(e.target.value)}>
              {POS_OPTIONS.map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Level
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Topic
          <select
            value={selectedTopic}
            onChange={(e) => setTopicId(Number(e.target.value))}
          >
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <details>
          <summary>Sentence (optional)</summary>
          <label>
            Sentence with ___
            <input
              value={gap}
              onChange={(e) => setGap(e.target.value)}
              lang={deck.sourceLang}
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
              lang={deck.sourceLang}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <label>
            Translation
            <input value={hint} onChange={(e) => setHint(e.target.value)} />
          </label>
        </details>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {added && (
          <p role="status" className="added">
            {added}
          </p>
        )}
        <button
          type="submit"
          className="primary"
          disabled={
            sending ||
            selectedTopic === '' ||
            !lemma.trim() ||
            !translation.trim()
          }
        >
          Add word
        </button>
      </form>
    </section>
  );
}
