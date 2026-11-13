export type Stage = 1 | 2 | 3;
export type Result = 'again' | 'good' | 'easy';

export type Progress = {
  stage: Stage;
  ease: number;
  intervalDays: number;
  reps: number;
  lapses: number;
  learned: boolean;
};

export type Scheduled = Progress & { dueAt: number };

const DAY_SECONDS = 86_400;
const RETRY_SECONDS = 600;
const START_EASE = 2.5;
const MIN_EASE = 1.3;
const MAX_INTERVAL_DAYS = 365;
const FIRST_INTERVAL_DAYS = 1;
const SECOND_INTERVAL_DAYS = 3;
const EASY_BONUS = 1.3;
const EASY_EASE_STEP = 0.15;
const AGAIN_EASE_STEP = 0.2;

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function initialProgress(): Progress {
  return {
    stage: 1,
    ease: START_EASE,
    intervalDays: 0,
    reps: 0,
    lapses: 0,
    learned: false,
  };
}

export function resultFromCorrect(correct: boolean): Result {
  return correct ? 'good' : 'again';
}

// Stage is the card type the word is shown as next. Answering at the writing stage correctly means learned.
export function schedule(
  current: Progress,
  result: Result,
  now: number,
): Scheduled {
  if (result === 'again') {
    return {
      stage: Math.max(1, current.stage - 1) as Stage,
      ease: round2(Math.max(MIN_EASE, current.ease - AGAIN_EASE_STEP)),
      intervalDays: 0,
      reps: 0,
      lapses: current.reps > 0 ? current.lapses + 1 : current.lapses,
      learned: false,
      dueAt: now + RETRY_SECONDS,
    };
  }

  const reps = current.reps + 1;
  const ease =
    result === 'easy' ? round2(current.ease + EASY_EASE_STEP) : current.ease;
  const base =
    reps === 1
      ? FIRST_INTERVAL_DAYS
      : reps === 2
        ? SECOND_INTERVAL_DAYS
        : current.intervalDays * ease;
  const grown = result === 'easy' ? base * EASY_BONUS : base;
  const intervalDays = round2(Math.min(MAX_INTERVAL_DAYS, grown));

  return {
    stage: Math.min(3, current.stage + 1) as Stage,
    ease,
    intervalDays,
    reps,
    lapses: current.lapses,
    learned: current.stage === 3,
    dueAt: Math.round(now + intervalDays * DAY_SECONDS),
  };
}
