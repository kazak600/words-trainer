import { describe, expect, it } from 'vitest';
import {
  initialProgress,
  resultFromCorrect,
  schedule,
  type Progress,
} from '../src/lib/scheduler';

const NOW = 1_800_000_000;
const DAY = 86_400;

function progress(overrides: Partial<Progress> = {}): Progress {
  return { ...initialProgress(), ...overrides };
}

describe('initialProgress', () => {
  it('starts a new word at the flip stage, not learned', () => {
    expect(initialProgress()).toEqual({
      stage: 1,
      ease: 2.5,
      intervalDays: 0,
      reps: 0,
      lapses: 0,
      learned: false,
    });
  });
});

describe('interval growth', () => {
  it('Good grows the interval 1 day, 3 days, then by the ease factor', () => {
    const first = schedule(progress(), 'good', NOW);
    const second = schedule(first, 'good', NOW);
    const third = schedule(second, 'good', NOW);

    expect([
      first.intervalDays,
      second.intervalDays,
      third.intervalDays,
    ]).toEqual([1, 3, 7.5]);
    expect(first.dueAt).toBe(NOW + DAY);
    expect(third.dueAt).toBe(NOW + 7.5 * DAY);
    expect(third.reps).toBe(3);
  });

  it('Easy gives a longer interval than Good and raises the ease', () => {
    const base = progress({ reps: 2, intervalDays: 3, stage: 2 });

    const good = schedule(base, 'good', NOW);
    const easy = schedule(base, 'easy', NOW);

    expect(easy.intervalDays).toBeGreaterThan(good.intervalDays);
    expect(easy.ease).toBeCloseTo(2.65);
    expect(good.ease).toBe(2.5);
  });

  it('caps the interval at one year', () => {
    const next = schedule(
      progress({ reps: 5, intervalDays: 300, stage: 3, learned: true }),
      'easy',
      NOW,
    );

    expect(next.intervalDays).toBe(365);
  });
});

describe('lapses', () => {
  it('Again brings the word back in 10 minutes and lowers the ease', () => {
    const next = schedule(
      progress({ reps: 3, intervalDays: 7.5, stage: 3, learned: true }),
      'again',
      NOW,
    );

    expect(next.intervalDays).toBe(0);
    expect(next.dueAt).toBe(NOW + 600);
    expect(next.ease).toBeCloseTo(2.3);
    expect(next.reps).toBe(0);
    expect(next.lapses).toBe(1);
  });

  it('never lets the ease fall below 1.3', () => {
    const next = schedule(progress({ ease: 1.35, reps: 2 }), 'again', NOW);

    expect(next.ease).toBe(1.3);
  });

  it('does not count a lapse for a word that was never answered correctly', () => {
    const next = schedule(progress(), 'again', NOW);

    expect(next.lapses).toBe(0);
  });

  it('after a lapse the interval starts over at 1 day', () => {
    const lapsed = schedule(
      progress({ reps: 4, intervalDays: 20, stage: 2 }),
      'again',
      NOW,
    );

    expect(schedule(lapsed, 'good', NOW).intervalDays).toBe(1);
  });
});

describe('stage moves', () => {
  it('moves flip → multiple choice → writing on correct answers', () => {
    const toChoice = schedule(progress({ stage: 1 }), 'good', NOW);
    const toWrite = schedule(toChoice, 'good', NOW);

    expect([toChoice.stage, toWrite.stage]).toEqual([2, 3]);
  });

  it('Easy moves only one stage too', () => {
    expect(schedule(progress({ stage: 1 }), 'easy', NOW).stage).toBe(2);
  });

  it('a wrong answer moves the word back one stage, never below flip', () => {
    expect(schedule(progress({ stage: 3 }), 'again', NOW).stage).toBe(2);
    expect(schedule(progress({ stage: 2 }), 'again', NOW).stage).toBe(1);
    expect(schedule(progress({ stage: 1 }), 'again', NOW).stage).toBe(1);
  });
});

describe('learned', () => {
  it('becomes learned only when typed correctly at the writing stage', () => {
    const atChoice = schedule(progress({ stage: 2 }), 'good', NOW);
    const typed = schedule(atChoice, 'good', NOW);

    expect(atChoice.stage).toBe(3);
    expect(atChoice.learned).toBe(false);
    expect(typed.learned).toBe(true);
    expect(typed.stage).toBe(3);
  });

  it('is lost on a wrong answer', () => {
    const lost = schedule(
      progress({ stage: 3, learned: true, reps: 3 }),
      'again',
      NOW,
    );

    expect(lost.learned).toBe(false);
    expect(lost.stage).toBe(2);
  });
});

describe('resultFromCorrect', () => {
  it('maps a checked answer to Good or Again', () => {
    expect(resultFromCorrect(true)).toBe('good');
    expect(resultFromCorrect(false)).toBe('again');
  });
});
