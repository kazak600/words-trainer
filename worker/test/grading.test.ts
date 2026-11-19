import { describe, expect, it } from 'vitest';
import { newCard, review } from '../src/lib/fsrs';
import { GRADE_VALUES, gradeFromVerdict } from '../src/lib/grading';

describe('gradeFromVerdict', () => {
  it('maps exact to good, typo to hard, wrong to again', () => {
    expect(gradeFromVerdict('exact')).toBe('good');
    expect(gradeFromVerdict('typo')).toBe('hard');
    expect(gradeFromVerdict('wrong')).toBe('again');
  });

  it('numbers the grades 1 to 4', () => {
    expect(GRADE_VALUES).toEqual({ again: 1, hard: 2, good: 3, easy: 4 });
  });

  it('gives a typo a shorter interval than an exact answer on the same card', () => {
    const t0 = 1_700_000_000;
    let card = newCard(t0);
    for (let i = 0; i < 3; i++) card = review(card, 'good', card.dueAt);
    const typo = review(card, gradeFromVerdict('typo'), card.dueAt);
    const exact = review(card, gradeFromVerdict('exact'), card.dueAt);
    expect(typo.scheduledDays).toBeLessThan(exact.scheduledDays);
  });
});
