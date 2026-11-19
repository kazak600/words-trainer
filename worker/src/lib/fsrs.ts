import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card,
  type Grade as FsrsGrade,
} from 'ts-fsrs';

export type Grade = 'again' | 'hard' | 'good' | 'easy';
export type CardState = 0 | 1 | 2 | 3;

export type MemoryCard = {
  state: CardState;
  dueAt: number;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  lastReviewAt: number | null;
};

export const REQUEST_RETENTION = 0.9;
export const LEARNED_STABILITY_DAYS = 21;
export const LEECH_LAPSES = 5;

const scheduler = fsrs({
  request_retention: REQUEST_RETENTION,
  enable_fuzz: false,
});

const RATINGS: Record<Grade, FsrsGrade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const toDate = (seconds: number): Date => new Date(seconds * 1000);
const toSeconds = (date: Date): number => Math.round(date.getTime() / 1000);

export function newCard(now: number): MemoryCard {
  return {
    state: 0,
    dueAt: now,
    stability: 0,
    difficulty: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    lastReviewAt: null,
  };
}

function toLibraryCard(card: MemoryCard): Card {
  return {
    ...createEmptyCard(toDate(card.dueAt)),
    due: toDate(card.dueAt),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as State,
    last_review:
      card.lastReviewAt === null ? undefined : toDate(card.lastReviewAt),
  };
}

export function review(card: MemoryCard, grade: Grade, now: number): MemoryCard {
  const next = scheduler.next(
    toLibraryCard(card),
    toDate(now),
    RATINGS[grade],
  ).card;
  return {
    state: next.state as CardState,
    dueAt: toSeconds(next.due),
    stability: next.stability,
    difficulty: next.difficulty,
    scheduledDays: next.scheduled_days,
    learningSteps: next.learning_steps,
    reps: next.reps,
    lapses: next.lapses,
    lastReviewAt: next.last_review ? toSeconds(next.last_review) : now,
  };
}

export function isLearned(production: MemoryCard | null): boolean {
  return (
    production !== null &&
    production.state === State.Review &&
    production.stability >= LEARNED_STABILITY_DAYS
  );
}

export function isLeech(card: MemoryCard): boolean {
  return card.lapses >= LEECH_LAPSES;
}
