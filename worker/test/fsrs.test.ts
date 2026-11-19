import { describe, expect, it } from 'vitest';
import {
  isLearned,
  isLeech,
  newCard,
  review,
  type MemoryCard,
} from '../src/lib/fsrs';

const NOW = 1_800_000_000;
const DAY = 86_400;

function card(overrides: Partial<MemoryCard> = {}): MemoryCard {
  return { ...newCard(NOW), ...overrides };
}

// A card that already has a real review history.
function reviewed(): MemoryCard {
  let c = newCard(NOW);
  c = review(c, 'good', NOW);
  c = review(c, 'good', c.dueAt);
  c = review(c, 'good', c.dueAt);
  return c;
}

describe('newCard', () => {
  it('is new, due now, with no history', () => {
    expect(newCard(NOW)).toEqual({
      state: 0,
      dueAt: NOW,
      stability: 0,
      difficulty: 0,
      scheduledDays: 0,
      learningSteps: 0,
      reps: 0,
      lapses: 0,
      lastReviewAt: null,
    });
  });
});

describe('review', () => {
  it('Good on a new card schedules it later and starts its memory', () => {
    const next = review(newCard(NOW), 'good', NOW);

    expect(next.reps).toBe(1);
    expect(next.stability).toBeGreaterThan(0);
    expect(next.lastReviewAt).toBe(NOW);
    expect(next.dueAt).toBeGreaterThan(NOW);
  });

  it('Again on a new card enters learning with a due time under an hour', () => {
    const next = review(newCard(NOW), 'again', NOW);

    expect(next.state).toBe(1);
    expect(next.dueAt - NOW).toBeLessThan(3600);
  });

  it('gives longer intervals for Hard, Good, Easy in that order', () => {
    const base = reviewed();
    const at = base.dueAt;
    const hard = review(base, 'hard', at).dueAt;
    const good = review(base, 'good', at).dueAt;
    const easy = review(base, 'easy', at).dueAt;

    expect(hard).toBeLessThan(good);
    expect(good).toBeLessThan(easy);
  });

  it('Again on a review card is a lapse: relearning, lower stability', () => {
    const base = reviewed();
    expect(base.state).toBe(2);

    const lapsed = review(base, 'again', base.dueAt);

    expect(lapsed.state).toBe(3);
    expect(lapsed.lapses).toBe(base.lapses + 1);
    expect(lapsed.stability).toBeLessThan(base.stability);
  });

  it('still schedules a card reviewed two months late', () => {
    const base = reviewed();
    const lateAt = base.dueAt + 60 * DAY;

    const next = review(base, 'good', lateAt);

    expect(Number.isFinite(next.stability)).toBe(true);
    expect(next.stability).toBeGreaterThan(0);
    expect(next.dueAt).toBeGreaterThan(lateAt);
  });

  it('is deterministic: the same input gives the same output', () => {
    const base = reviewed();

    expect(review(base, 'good', base.dueAt)).toEqual(
      review(base, 'good', base.dueAt),
    );
  });

  it('keeps dueAt an integer number of seconds', () => {
    const next = review(reviewed(), 'easy', NOW + 5 * DAY);

    expect(Number.isInteger(next.dueAt)).toBe(true);
  });
});

describe('isLearned', () => {
  it('is false without a production card', () => {
    expect(isLearned(null)).toBe(false);
  });

  it('needs review state and stability of at least 21 days', () => {
    expect(isLearned(card({ state: 2, stability: 20.9 }))).toBe(false);
    expect(isLearned(card({ state: 2, stability: 21 }))).toBe(true);
    expect(isLearned(card({ state: 1, stability: 30 }))).toBe(false);
    expect(isLearned(card({ state: 3, stability: 30 }))).toBe(false);
  });
});

describe('isLeech', () => {
  it('flags a card at 5 lapses, not at 4', () => {
    expect(isLeech(card({ lapses: 4 }))).toBe(false);
    expect(isLeech(card({ lapses: 5 }))).toBe(true);
  });
});
