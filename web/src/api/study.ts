import { api } from './client';

const DECK = 'lv-uk';

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
  stage: 1 | 2 | 3;
  mode: 'flip' | 'choice' | 'write';
  retry: boolean;
  wordId: number;
  pos: string;
  translation: string;
  lemma?: string;
  grammar?: Record<string, unknown> | null;
  options?: { wordId: number; lemma: string }[];
};

export type SessionView = {
  id: string;
  topicId: number;
  total: number;
  index: number;
  card: Card;
};

export type AnswerView = {
  correct: boolean;
  expected: string;
  learned: boolean;
  finished: boolean;
  next: Card | null;
  summary?: { cards: number; correct: number; wrong: number };
};

export type Streak = { days: number; studiedToday: boolean };

export const fetchTopics = () => api<Topic[]>(`/api/decks/${DECK}/topics`);
export const fetchStreak = () =>
  api<Streak>(`/api/streak?tzOffset=${-new Date().getTimezoneOffset()}`);
export const fetchCurrentSession = () =>
  api<SessionView>(`/api/decks/${DECK}/sessions/current`);
export const startSession = (topicId: number) =>
  api<SessionView>(`/api/decks/${DECK}/sessions`, {
    method: 'POST',
    body: { topicId },
  });
export const answerFlipCard = (
  sessionId: string,
  cardIndex: number,
  result: 'again' | 'good' | 'easy',
) =>
  api<AnswerView>(`/api/sessions/${sessionId}/answer`, {
    method: 'POST',
    body: { cardIndex, result },
  });
