import type { Verdict } from './checker';
import type { Grade } from './fsrs';

export const GRADE_VALUES: Record<Grade, 1 | 2 | 3 | 4> = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
};

const BY_VERDICT: Record<Verdict, Grade> = {
  exact: 'good',
  typo: 'hard',
  wrong: 'again',
};

export function gradeFromVerdict(verdict: Verdict): Grade {
  return BY_VERDICT[verdict];
}
