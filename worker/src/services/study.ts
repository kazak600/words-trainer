import { checkAnswer, type DiffItem, type Verdict } from '../lib/checker';
import {
  isLearned,
  isLeech,
  newCard,
  review,
  type Grade,
  type MemoryCard,
} from '../lib/fsrs';
import { GRADE_VALUES, gradeFromVerdict } from '../lib/grading';
import { localDayWindow } from '../lib/day';
import {
  countNewWordsBetween,
  findCard,
  findDueCards,
  findNewWordIds,
  insertCardIfMissingStatement,
  upsertCardStatement,
  type CardFlags,
  type CardKey,
} from '../repositories/cards';
import {
  findDeckById,
  findDeckBySlug,
  type DeckRow,
} from '../repositories/decks';
import {
  deleteSessionStatement,
  findSessionByDeck,
  findSessionById,
  insertReviewLogStatement,
  raiseLatestGradeStatement,
  upsertSessionStatement,
} from '../repositories/study';
import { findTopic } from '../repositories/topics';
import {
  findSentence,
  listVisibleSentences,
  type SentenceRow,
} from '../repositories/sentences';
import { listWordsByIds, type WordCoreRow } from '../repositories/words';

export const NEW_WORDS_PER_DAY = 15;
const TOPIC_SESSION_SIZE = 10;
const REVIEW_SESSION_SIZE = 20;
const MODES = {
  recognition: 'flip',
  production: 'write',
  cloze: 'gap',
} as const;
const GRADES: Grade[] = ['again', 'hard', 'good', 'easy'];
const DAY_SECONDS = 86_400;
const MAX_TYPED_LENGTH = 100;
const NO_FLAGS: CardFlags = { suspended: false, leech: false };

type StudyKind = 'recognition' | 'production' | 'cloze';
type PayloadCard = {
  wordId: number;
  kind: StudyKind;
  sentenceId?: number | null;
  retry: boolean;
};
type Payload = {
  id: string;
  topicId: number | null;
  cards: PayloadCard[];
  index: number;
  correct: number;
  wrong: number;
  // Set after an exact typed answer, so it can be replayed as Easy until the next answer.
  lastExact?: {
    index: number;
    wordId: number;
    kind: StudyKind;
    sentenceId: number | null;
    before: MemoryCard;
    at: number;
  };
};

export type CardView = {
  index: number;
  kind: StudyKind;
  retry: boolean;
  wordId: number;
  pos: string;
  translation: string;
  lemma?: string;
  grammar?: unknown;
  textWithGap?: string;
  hint?: string;
};
export type SessionView = {
  id: string;
  topicId: number | null;
  total: number;
  index: number;
  card: CardView;
};
export type AnswerInput = {
  cardIndex?: unknown;
  grade?: unknown;
  typed?: unknown;
};
export type AnswerView = {
  grade: Grade;
  verdict?: Verdict;
  correct: boolean;
  leech: boolean;
  expected: string;
  diff?: DiffItem[];
  learned: boolean;
  canRaise: boolean;
  finished: boolean;
  next: CardView | null;
  summary?: { cards: number; correct: number; wrong: number };
};
export type SessionTarget = { topicId: number } | { review: true };

export type StudyErrorCode =
  | 'deck_not_found'
  | 'topic_not_found'
  | 'nothing_to_study'
  | 'daily_cap_reached'
  | 'session_not_found'
  | 'stale_card'
  | 'not_raisable'
  | 'bad_answer';

export class StudyError extends Error {
  constructor(readonly code: StudyErrorCode) {
    super(code);
  }
}

export async function requireDeck(
  db: D1Database,
  slug: string,
): Promise<DeckRow> {
  const deck = await findDeckBySlug(db, slug);
  if (!deck) throw new StudyError('deck_not_found');
  return deck;
}

export async function countNewToday(
  db: D1Database,
  userId: number,
  deckId: number,
  tzOffsetMinutes: number,
  now: number,
): Promise<number> {
  return countNewWordsBetween(db, {
    userId,
    deckId,
    ...localDayWindow(now, tzOffsetMinutes),
  });
}

// A session saved before cards existed has no card kind; it cannot be resumed.
function parsePayload(json: string): Payload | null {
  const payload = JSON.parse(json) as Payload;
  const card = payload.cards[payload.index];
  return card?.kind ? payload : null;
}

async function toCardView(
  db: D1Database,
  deck: DeckRow,
  payload: Payload,
  card: PayloadCard,
): Promise<CardView> {
  const [word] = await listWordsByIds(db, [card.wordId], deck.target_lang);
  if (!word) throw new StudyError('session_not_found');
  const view: CardView = {
    index: payload.cards.indexOf(card),
    kind: card.kind,
    retry: card.retry,
    wordId: word.id,
    pos: word.pos,
    translation: word.translation,
  };
  if (card.kind === 'recognition') {
    view.lemma = word.lemma;
    view.grammar = word.grammar_json ? JSON.parse(word.grammar_json) : null;
  }
  if (card.kind === 'cloze') {
    const sentence = card.sentenceId
      ? await findSentence(db, card.sentenceId)
      : null;
    if (!sentence) throw new StudyError('session_not_found');
    view.textWithGap = sentence.textWithGap;
    view.hint = sentence.hint;
  }
  return view;
}

async function toSessionView(
  db: D1Database,
  deck: DeckRow,
  payload: Payload,
): Promise<SessionView> {
  return {
    id: payload.id,
    topicId: payload.topicId,
    total: payload.cards.length,
    index: payload.index,
    card: await toCardView(db, deck, payload, payload.cards[payload.index]!),
  };
}

async function topicCards(
  db: D1Database,
  deck: DeckRow,
  userId: number,
  topicId: number,
  tzOffsetMinutes: number,
  now: number,
): Promise<PayloadCard[]> {
  if (!(await findTopic(db, deck.source_lang, topicId)))
    throw new StudyError('topic_not_found');
  const used = await countNewToday(db, userId, deck.id, tzOffsetMinutes, now);
  const remaining = Math.max(0, NEW_WORDS_PER_DAY - used);
  const ids = await findNewWordIds(db, {
    userId,
    deckId: deck.id,
    topicId,
    targetLang: deck.target_lang,
    limit: Math.min(TOPIC_SESSION_SIZE, remaining) || 1,
  });
  if (ids.length === 0) throw new StudyError('nothing_to_study');
  if (remaining === 0) throw new StudyError('daily_cap_reached');
  return ids.map((wordId) => ({ wordId, kind: 'recognition', retry: false }));
}

async function reviewCards(
  db: D1Database,
  deck: DeckRow,
  userId: number,
  now: number,
): Promise<PayloadCard[]> {
  const due = await findDueCards(db, {
    userId,
    deckId: deck.id,
    targetLang: deck.target_lang,
    now,
    limit: REVIEW_SESSION_SIZE * 3,
  });
  // A word's other card is held back until the next review, so one card never shows the answer to the next.
  const seen = new Set<number>();
  const firstPerWord = due.filter(
    (d) => !seen.has(d.wordId) && seen.add(d.wordId),
  );
  return firstPerWord.slice(0, REVIEW_SESSION_SIZE).map((d) => ({
    wordId: d.wordId,
    kind: d.kind as StudyKind,
    sentenceId: d.sentenceId,
    retry: false,
  }));
}

export async function startSession(
  db: D1Database,
  userId: number,
  deckSlug: string,
  target: SessionTarget,
  tzOffsetMinutes: number,
  now: number,
): Promise<SessionView> {
  const deck = await requireDeck(db, deckSlug);
  const cards =
    'topicId' in target
      ? await topicCards(db, deck, userId, target.topicId, tzOffsetMinutes, now)
      : await reviewCards(db, deck, userId, now);
  if (cards.length === 0) throw new StudyError('nothing_to_study');

  const payload: Payload = {
    id: crypto.randomUUID(),
    topicId: 'topicId' in target ? target.topicId : null,
    cards,
    index: 0,
    correct: 0,
    wrong: 0,
  };
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
): Promise<SessionView> {
  const deck = await requireDeck(db, deckSlug);
  const row = await findSessionByDeck(db, userId, deck.id);
  const payload = row ? parsePayload(row.payload_json) : null;
  if (!payload) throw new StudyError('session_not_found');
  return toSessionView(db, deck, payload);
}

type Judgement = {
  grade: Grade;
  verdict?: Verdict;
  typed: string | null;
  diff?: DiffItem[];
};

function judge(
  card: PayloadCard,
  word: WordCoreRow,
  expected: string,
  input: AnswerInput,
): Judgement {
  if (card.kind === 'recognition') {
    if (!GRADES.includes(input.grade as Grade))
      throw new StudyError('bad_answer');
    return { grade: input.grade as Grade, typed: null };
  }
  if (typeof input.typed !== 'string' || input.typed.length > MAX_TYPED_LENGTH)
    throw new StudyError('bad_answer');
  const checked = checkAnswer(input.typed, expected, word.lang, {
    strict: card.kind === 'cloze',
  });
  return {
    grade: gradeFromVerdict(checked.verdict),
    verdict: checked.verdict,
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
  const deck = row ? await findDeckById(db, row.deck_id) : null;
  const payload = row ? parsePayload(row.payload_json) : null;
  if (!deck || !payload) throw new StudyError('session_not_found');

  if (input.cardIndex !== payload.index) throw new StudyError('stale_card');
  const card = payload.cards[payload.index]!;
  const [word] = await listWordsByIds(db, [card.wordId], deck.target_lang);
  if (!word) throw new StudyError('session_not_found');

  const sentence: SentenceRow | null =
    card.kind === 'cloze' && card.sentenceId
      ? await findSentence(db, card.sentenceId)
      : null;
  if (card.kind === 'cloze' && !sentence)
    throw new StudyError('session_not_found');
  const expected = sentence?.answer ?? word.lemma;

  const judgement = judge(card, word, expected, input);
  const key: CardKey = {
    userId,
    deckId: deck.id,
    wordId: card.wordId,
    kind: card.kind,
    sentenceId: sentence?.id ?? null,
  };
  const stored = await findCard(db, key);
  const updated = review(stored?.card ?? newCard(now), judgement.grade, now);
  const correct = judgement.grade !== 'again';
  // Only the lapse that takes the card to the threshold suspends it, so a returned card gets another chance.
  const becameLeech =
    updated.lapses > (stored?.card.lapses ?? 0) && isLeech(updated);

  // A card that just became a leech has left the queue; asking it again would reschedule it.
  if (!correct && !card.retry && !becameLeech)
    payload.cards.push({ ...card, retry: true });
  if (correct) payload.correct++;
  else payload.wrong++;
  payload.index++;
  const finished = payload.index >= payload.cards.length;

  payload.lastExact =
    judgement.verdict === 'exact'
      ? {
          index: payload.index - 1,
          wordId: card.wordId,
          kind: card.kind,
          sentenceId: key.sentenceId,
          before: stored?.card ?? newCard(now),
          at: now,
        }
      : undefined;

  const statements = [
    upsertCardStatement(
      db,
      key,
      updated,
      becameLeech ? { suspended: true, leech: true } : (stored ?? NO_FLAGS),
    ),
    insertReviewLogStatement(db, {
      userId,
      deckId: deck.id,
      wordId: card.wordId,
      mode: MODES[card.kind],
      kind: card.kind,
      grade: GRADE_VALUES[judgement.grade],
      correct,
      typed: judgement.typed,
      now,
    }),
    finished && !payload.lastExact
      ? deleteSessionStatement(db, userId, deck.id)
      : upsertSessionStatement(
          db,
          userId,
          deck.id,
          JSON.stringify(payload),
          now,
        ),
  ];
  const productionKey: CardKey = { ...key, kind: 'production' };
  if (card.kind === 'recognition' && correct) {
    // Typing a word right after seeing it is not recall, so the production card waits a day.
    statements.push(
      insertCardIfMissingStatement(
        db,
        productionKey,
        newCard(Math.max(updated.dueAt, now + DAY_SECONDS)),
      ),
    );
  }
  if (card.kind === 'production' && correct) {
    // Cloze cards follow the production card, one per visible sentence of the word.
    // A day after the production card is due, so the two never come up together.
    const nextDue = Math.max(updated.dueAt, now + DAY_SECONDS) + DAY_SECONDS;
    for (const s of await listVisibleSentences(
      db,
      card.wordId,
      deck.target_lang,
    )) {
      statements.push(
        insertCardIfMissingStatement(
          db,
          { ...key, kind: 'cloze', sentenceId: s.id },
          newCard(nextDue),
        ),
      );
    }
  }
  await db.batch(statements);

  const production =
    card.kind === 'production'
      ? updated
      : ((await findCard(db, productionKey))?.card ?? null);

  return {
    grade: judgement.grade,
    verdict: judgement.verdict,
    correct,
    leech: becameLeech,
    expected,
    diff: judgement.diff,
    learned: isLearned(production),
    canRaise: judgement.verdict === 'exact',
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

export async function raiseToEasy(
  db: D1Database,
  userId: number,
  sessionId: string,
  cardIndex: number,
  now: number,
): Promise<{ grade: 'easy'; learned: boolean }> {
  const row = await findSessionById(db, userId, sessionId);
  if (!row) throw new StudyError('session_not_found');
  const payload = JSON.parse(row.payload_json) as Payload;
  const last = payload.lastExact;
  if (!last || last.index !== cardIndex) throw new StudyError('not_raisable');

  const key: CardKey = {
    userId,
    deckId: row.deck_id,
    wordId: last.wordId,
    kind: last.kind,
    sentenceId: last.sentenceId,
  };
  const stored = await findCard(db, key);
  const easy = review(last.before, 'easy', last.at);
  payload.lastExact = undefined;
  const finished = payload.index >= payload.cards.length;

  await db.batch([
    upsertCardStatement(db, key, easy, stored ?? NO_FLAGS),
    raiseLatestGradeStatement(
      db,
      userId,
      row.deck_id,
      last.wordId,
      last.kind,
      GRADE_VALUES.easy,
    ),
    finished
      ? deleteSessionStatement(db, userId, row.deck_id)
      : upsertSessionStatement(
          db,
          userId,
          row.deck_id,
          JSON.stringify(payload),
          now,
        ),
  ]);
  const production =
    last.kind === 'production'
      ? easy
      : ((await findCard(db, { ...key, kind: 'production', sentenceId: null }))
          ?.card ?? null);
  return { grade: 'easy', learned: isLearned(production) };
}
