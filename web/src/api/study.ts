import { api } from './client';

export type Topic = {
  id: number;
  slug: string;
  title: string;
  titleUk: string;
  wordCounts: Record<string, number>;
  counts: { new: number; learning: number; learned: number };
};

export type Card = {
  index: number;
  kind: 'recognition' | 'production' | 'cloze';
  retry: boolean;
  wordId: number;
  pos: string;
  translation: string;
  lemma?: string;
  grammar?: Record<string, unknown> | null;
  textWithGap?: string;
  hint?: string;
};

export type SessionView = {
  id: string;
  topicId: number | null;
  total: number;
  index: number;
  card: Card;
};

export type DiffItem = {
  kind: 'match' | 'diacritic' | 'wrong' | 'missing' | 'extra';
  expected?: string;
  typed?: string;
};

export type Grade = 'again' | 'hard' | 'good' | 'easy';
export type Verdict = 'exact' | 'typo' | 'wrong';

export type AnswerInput = { grade: Grade } | { typed: string };

export type AnswerView = {
  grade: Grade;
  verdict?: Verdict;
  correct: boolean;
  expected: string;
  diff?: DiffItem[];
  learned: boolean;
  canRaise: boolean;
  finished: boolean;
  next: Card | null;
  summary?: { cards: number; correct: number; wrong: number };
};

export type ReviewSummary = {
  due: number;
  newToday: number;
  newCap: number;
  cards: { cardId: number; wordId: number; kind: string }[];
};

// Minutes east of UTC; the server uses it to find the user's local day.
const tzOffset = () => -new Date().getTimezoneOffset();

export const fetchTopics = (deck: string) =>
  api<Topic[]>(`/api/decks/${deck}/topics`);
export const fetchReview = (deck: string) =>
  api<ReviewSummary>(`/api/decks/${deck}/review?tzOffset=${tzOffset()}`);
export const fetchCurrentSession = (deck: string) =>
  api<SessionView>(`/api/decks/${deck}/sessions/current`);
export const startTopicSession = (deck: string, topicId: number) =>
  api<SessionView>(`/api/decks/${deck}/sessions`, {
    method: 'POST',
    body: { topicId, tzOffset: tzOffset() },
  });
export const startReviewSession = (deck: string) =>
  api<SessionView>(`/api/decks/${deck}/sessions`, {
    method: 'POST',
    body: { review: true, tzOffset: tzOffset() },
  });
export const answerCard = (
  sessionId: string,
  cardIndex: number,
  input: AnswerInput,
) =>
  api<AnswerView>(`/api/sessions/${sessionId}/answer`, {
    method: 'POST',
    body: { cardIndex, ...input },
  });
export const raiseToEasy = (sessionId: string, cardIndex: number) =>
  api<{ grade: 'easy'; learned: boolean }>(`/api/sessions/${sessionId}/easy`, {
    method: 'POST',
    body: { cardIndex },
  });
