import { checkAnswer, type DiffItem } from '../lib/checker';
import {
  initialProgress,
  resultFromCorrect,
  schedule,
  type Progress,
  type Result,
  type Stage,
} from '../lib/scheduler';
import {
  findDeckById,
  findDeckBySlug,
  type DeckRow,
} from '../repositories/decks';
import {
  deleteSessionStatement,
  findDistractorIds,
  findDueWords,
  findNewWordIds,
  findProgress,
  findSessionByDeck,
  findSessionById,
  insertReviewLogStatement,
  upsertProgressStatement,
  upsertSessionStatement,
} from '../repositories/study';
import { findTopic } from '../repositories/topics';
import { listWordsByIds, type WordCoreRow } from '../repositories/words';

const SESSION_SIZE = 10;
const OPTIONS_PER_CARD = 4;
const MODES = { 1: 'flip', 2: 'choice', 3: 'write' } as const;
const RESULTS: Result[] = ['again', 'good', 'easy'];

type Card = {
  wordId: number;
  stage: Stage;
  retry: boolean;
  optionIds?: number[];
};
type Payload = {
  id: string;
  topicId: number;
  cards: Card[];
  index: number;
  correct: number;
  wrong: number;
};

export type CardView = {
  index: number;
  stage: Stage;
  mode: 'flip' | 'choice' | 'write';
  retry: boolean;
  wordId: number;
  pos: string;
  translation: string;
  lemma?: string;
  grammar?: unknown;
  options?: { wordId: number; lemma: string }[];
};
export type SessionView = {
  id: string;
  topicId: number;
  total: number;
  index: number;
  card: CardView;
};
export type AnswerInput = {
  cardIndex?: unknown;
  result?: unknown;
  choiceWordId?: unknown;
  typed?: unknown;
};
export type AnswerView = {
  correct: boolean;
  expected: string;
  diff?: DiffItem[];
  learned: boolean;
  finished: boolean;
  next: CardView | null;
  summary?: { cards: number; correct: number; wrong: number };
};

export type StudyErrorCode =
  | 'deck_not_found'
  | 'topic_not_found'
  | 'nothing_to_study'
  | 'session_not_found'
  | 'stale_card'
  | 'bad_answer';

export class StudyError extends Error {
  constructor(readonly code: StudyErrorCode) {
    super(code);
  }
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

async function requireDeck(db: D1Database, slug: string): Promise<DeckRow> {
  const deck = await findDeckBySlug(db, slug);
  if (!deck) throw new StudyError('deck_not_found');
  return deck;
}

// Options are chosen once, when the card becomes current, and stored so a resume shows the same ones.
async function ensureOptions(
  db: D1Database,
  deck: DeckRow,
  payload: Payload,
): Promise<void> {
  const card = payload.cards[payload.index];
  if (!card || card.stage !== 2 || card.optionIds) return;
  const [word] = await listWordsByIds(db, [card.wordId], deck.target_lang);
  if (!word) return;
  const distractors = await findDistractorIds(db, {
    lang: deck.source_lang,
    targetLang: deck.target_lang,
    pos: word.pos,
    topicId: payload.topicId,
    excludeWordId: word.id,
    limit: OPTIONS_PER_CARD - 1,
  });
  card.optionIds = shuffle([card.wordId, ...distractors]);
}

async function toSessionView(
  db: D1Database,
  deck: DeckRow,
  payload: Payload,
): Promise<SessionView> {
  const card = payload.cards[payload.index]!;
  return {
    id: payload.id,
    topicId: payload.topicId,
    total: payload.cards.length,
    index: payload.index,
    card: await toCardView(db, deck, payload, card),
  };
}

async function toCardView(
  db: D1Database,
  deck: DeckRow,
  payload: Payload,
  card: Card,
): Promise<CardView> {
  const ids = [card.wordId, ...(card.optionIds ?? [])];
  const words = new Map(
    (await listWordsByIds(db, ids, deck.target_lang)).map((w) => [w.id, w]),
  );
  const word = words.get(card.wordId)!;
  const view: CardView = {
    index: payload.cards.indexOf(card),
    stage: card.stage,
    mode: MODES[card.stage],
    retry: card.retry,
    wordId: word.id,
    pos: word.pos,
    translation: word.translation,
  };
  if (card.stage === 1) {
    view.lemma = word.lemma;
    view.grammar = word.grammar_json ? JSON.parse(word.grammar_json) : null;
  }
  if (card.stage === 2) {
    view.options = (card.optionIds ?? []).flatMap((id) => {
      const option = words.get(id);
      return option ? [{ wordId: option.id, lemma: option.lemma }] : [];
    });
  }
  return view;
}

export async function startSession(
  db: D1Database,
  userId: number,
  deckSlug: string,
  topicId: number,
  now: number,
): Promise<SessionView> {
  const deck = await requireDeck(db, deckSlug);
  if (!(await findTopic(db, deck.source_lang, topicId)))
    throw new StudyError('topic_not_found');

  const scope = {
    userId,
    deckId: deck.id,
    topicId,
    targetLang: deck.target_lang,
  };
  const due = await findDueWords(db, { ...scope, now, limit: SESSION_SIZE });
  const fresh =
    due.length < SESSION_SIZE
      ? await findNewWordIds(db, { ...scope, limit: SESSION_SIZE - due.length })
      : [];
  const cards: Card[] = [
    ...due.map((d) => ({
      wordId: d.id,
      stage: d.stage as Stage,
      retry: false,
    })),
    ...fresh.map((id) => ({ wordId: id, stage: 1 as Stage, retry: false })),
  ];
  if (cards.length === 0) throw new StudyError('nothing_to_study');

  const payload: Payload = {
    id: crypto.randomUUID(),
    topicId,
    cards,
    index: 0,
    correct: 0,
    wrong: 0,
  };
  await ensureOptions(db, deck, payload);
  await upsertSessionStatement(
    db,
    userId,
    deck.id,
    JSON.stringify(payload),
    now,
  ).run();
  return toSessionView(db, deck, payload);
}

export async function getCurrentSession(
  db: D1Database,
  userId: number,
  deckSlug: string,
  now: number,
): Promise<SessionView> {
  const deck = await requireDeck(db, deckSlug);
  const row = await findSessionByDeck(db, userId, deck.id);
  if (!row) throw new StudyError('session_not_found');
  const payload = JSON.parse(row.payload_json) as Payload;
  if (!payload.cards[payload.index]) throw new StudyError('session_not_found');
  await ensureOptions(db, deck, payload);
  await upsertSessionStatement(
    db,
    userId,
    deck.id,
    JSON.stringify(payload),
    now,
  ).run();
  return toSessionView(db, deck, payload);
}

type Judgement = {
  correct: boolean;
  result: Result;
  typed: string | null;
  diff?: DiffItem[];
};

function judge(card: Card, word: WordCoreRow, input: AnswerInput): Judgement {
  if (card.stage === 1) {
    if (
      typeof input.result !== 'string' ||
      !RESULTS.includes(input.result as Result)
    ) {
      throw new StudyError('bad_answer');
    }
    const result = input.result as Result;
    return { correct: result !== 'again', result, typed: null };
  }
  if (card.stage === 2) {
    if (typeof input.choiceWordId !== 'number')
      throw new StudyError('bad_answer');
    const correct = input.choiceWordId === card.wordId;
    return { correct, result: resultFromCorrect(correct), typed: null };
  }
  if (typeof input.typed !== 'string') throw new StudyError('bad_answer');
  const checked = checkAnswer(input.typed, word.lemma, word.lang);
  return {
    correct: checked.correct,
    result: resultFromCorrect(checked.correct),
    typed: input.typed,
    diff: checked.diff,
  };
}

export async function answerCard(
  db: D1Database,
  userId: number,
  sessionId: string,
  input: AnswerInput,
  now: number,
): Promise<AnswerView> {
  const row = await findSessionById(db, userId, sessionId);
  if (!row) throw new StudyError('session_not_found');
  const deck = await findDeckById(db, row.deck_id);
  if (!deck) throw new StudyError('session_not_found');
  const payload = JSON.parse(row.payload_json) as Payload;

  if (input.cardIndex !== payload.index) throw new StudyError('stale_card');
  const card = payload.cards[payload.index]!;
  const [word] = await listWordsByIds(db, [card.wordId], deck.target_lang);
  if (!word) throw new StudyError('session_not_found');

  const judgement = judge(card, word, input);
  const stored = await findProgress(db, userId, deck.id, card.wordId);
  const current: Progress = stored
    ? {
        stage: card.stage,
        ease: stored.ease,
        intervalDays: stored.interval_days,
        reps: stored.reps,
        lapses: stored.lapses,
        learned: stored.learned === 1,
      }
    : initialProgress();
  const scheduled = schedule(current, judgement.result, now);

  if (!judgement.correct && !card.retry) {
    payload.cards.push({
      wordId: card.wordId,
      stage: scheduled.stage,
      retry: true,
    });
  }
  if (judgement.correct) payload.correct++;
  else payload.wrong++;
  payload.index++;

  const finished = payload.index >= payload.cards.length;
  if (!finished) await ensureOptions(db, deck, payload);

  await db.batch([
    upsertProgressStatement(db, userId, deck.id, card.wordId, scheduled, now),
    insertReviewLogStatement(db, {
      userId,
      deckId: deck.id,
      wordId: card.wordId,
      mode: MODES[card.stage],
      correct: judgement.correct,
      typed: judgement.typed,
      now,
    }),
    finished
      ? deleteSessionStatement(db, userId, deck.id)
      : upsertSessionStatement(
          db,
          userId,
          deck.id,
          JSON.stringify(payload),
          now,
        ),
  ]);

  return {
    correct: judgement.correct,
    expected: word.lemma,
    diff: judgement.diff,
    learned: scheduled.learned,
    finished,
    next: finished
      ? null
      : await toCardView(db, deck, payload, payload.cards[payload.index]!),
    summary: finished
      ? {
          cards: payload.cards.length,
          correct: payload.correct,
          wrong: payload.wrong,
        }
      : undefined,
  };
}
