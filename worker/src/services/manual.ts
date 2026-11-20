import { findDeckBySlug } from '../repositories/decks';
import {
  findWordId,
  insertManualSentenceStatement,
  insertManualTranslationStatement,
  insertManualWordStatement,
  listTopicOptions,
  topicExists,
  wordExistsAs,
  type SentenceInput,
  type TopicOptionRow,
} from '../repositories/manual';
import { wordExistsInLang } from '../repositories/leeches';

const MAX_LENGTH = 100;
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const DEFAULT_LEVEL = 'A2';
const POS = [
  'noun',
  'verb',
  'adj',
  'adv',
  'num',
  'pron',
  'phrase',
  'propn',
  'prep',
  'conj',
  'part',
  'interj',
];
const GAP = '___';

export type ManualErrorCode =
  | 'deck_not_found'
  | 'topic_not_found'
  | 'word_not_found'
  | 'invalid_word'
  | 'duplicate_word';

export class ManualError extends Error {
  constructor(readonly code: ManualErrorCode) {
    super(code);
  }
}

async function requireDeck(db: D1Database, slug: string) {
  const deck = await findDeckBySlug(db, slug);
  if (!deck) throw new ManualError('deck_not_found');
  return deck;
}

function text(value: unknown, max = MAX_LENGTH): string {
  if (typeof value !== 'string') throw new ManualError('invalid_word');
  const trimmed = value.normalize('NFC').trim();
  if (trimmed === '' || trimmed.length > max)
    throw new ManualError('invalid_word');
  return trimmed;
}

function parseSentence(value: unknown): SentenceInput {
  if (!value || typeof value !== 'object')
    throw new ManualError('invalid_word');
  const raw = value as Record<string, unknown>;
  const textWithGap = text(raw.textWithGap, 300);
  // Exactly one run of underscores, and it is the gap marker.
  const runs = textWithGap.match(/_+/g) ?? [];
  if (runs.length !== 1 || runs[0] !== GAP)
    throw new ManualError('invalid_word');
  return { textWithGap, answer: text(raw.answer), hint: text(raw.hint, 300) };
}

export async function getTopicOptions(
  db: D1Database,
  deckSlug: string,
): Promise<TopicOptionRow[]> {
  const deck = await requireDeck(db, deckSlug);
  return listTopicOptions(db, deck.source_lang);
}

function spellings(lemma: string, locale: string): string[] {
  const lower = lemma.toLocaleLowerCase(locale);
  const capital = lower.charAt(0).toLocaleUpperCase(locale) + lower.slice(1);
  return [...new Set([lemma, lower, capital])];
}

export async function addWord(
  db: D1Database,
  deckSlug: string,
  input: Record<string, unknown>,
): Promise<{ wordId: number }> {
  const deck = await requireDeck(db, deckSlug);
  const lemma = text(input.lemma);
  const translation = text(input.translation);
  const pos = typeof input.pos === 'string' ? input.pos : '';
  const level = input.level === undefined ? DEFAULT_LEVEL : input.level;
  if (
    !POS.includes(pos) ||
    typeof level !== 'string' ||
    !LEVELS.includes(level)
  )
    throw new ManualError('invalid_word');
  if (!Number.isInteger(input.topicId)) throw new ManualError('invalid_word');
  const sentence =
    input.sentence === undefined ? null : parseSentence(input.sentence);

  const lang = deck.source_lang;
  const topicId = input.topicId as number;
  if (!(await topicExists(db, lang, topicId)))
    throw new ManualError('topic_not_found');
  if (await wordExistsAs(db, { lang, pos, lemmas: spellings(lemma, lang) }))
    throw new ManualError('duplicate_word');

  const key = { lang, lemma, pos };
  const statements = [
    insertManualWordStatement(db, { ...key, topicId, level }),
    insertManualTranslationStatement(db, key, deck.target_lang, translation),
  ];
  if (sentence)
    statements.push(
      insertManualSentenceStatement(db, key, deck.target_lang, sentence),
    );
  try {
    await db.batch(statements);
  } catch (error) {
    // Two requests can pass the check together; the unique key then decides.
    if (String(error).includes('UNIQUE'))
      throw new ManualError('duplicate_word');
    throw error;
  }
  return { wordId: (await findWordId(db, key))!.id };
}

export async function addSentence(
  db: D1Database,
  deckSlug: string,
  wordId: number,
  input: unknown,
): Promise<{ sentenceId: number }> {
  const deck = await requireDeck(db, deckSlug);
  if (!(await wordExistsInLang(db, wordId, deck.source_lang)))
    throw new ManualError('word_not_found');
  const sentence = parseSentence(input);
  const [result] = await db.batch([
    insertManualSentenceStatement(db, { wordId }, deck.target_lang, sentence),
  ]);
  return { sentenceId: result!.meta.last_row_id };
}
