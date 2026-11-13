import { describe, expect, it } from 'vitest';
import { checkAnswer } from '../src/lib/checker';

describe('checkAnswer (lv, strict diacritics)', () => {
  const cases: [string, string, boolean][] = [
    ['maize', 'maize', true],
    ['maize', 'maizē', false],
    ['seit', 'šeit', false],
    ['loti', 'ļoti', false],
    ['šeit', 'šeit', true],
    ['  maize  ', 'maize', true],
    ['Maize', 'maize', true],
    ['MAIZĒ', 'maizē', true],
    ['labā  diena', 'labā diena', true],
    ['', 'maize', false],
    ['maiz', 'maize', false],
    ['maizee', 'maize', false],
  ];

  it.each(cases)('typed %j for %j → %s', (typed, expected, correct) => {
    expect(checkAnswer(typed, expected, 'lv').correct).toBe(correct);
  });

  it('treats a decomposed ā (a + combining macron) the same as the single character', () => {
    expect(checkAnswer('ā', 'ā', 'lv').correct).toBe(true);
  });

  it('is case-insensitive for a capitalised expected word', () => {
    expect(checkAnswer('rīga', 'Rīga', 'lv').correct).toBe(true);
  });
});

describe('checkAnswer (en, no diacritic requirement)', () => {
  it('accepts a missing mark and any case', () => {
    expect(checkAnswer('Cafe', 'café', 'en').correct).toBe(true);
    expect(checkAnswer('cafe ', 'café', 'en').correct).toBe(true);
  });

  it('still rejects a wrong letter', () => {
    expect(checkAnswer('cafs', 'café', 'en').correct).toBe(false);
  });

  it('shows no diacritic difference when the mark is optional', () => {
    const { diff } = checkAnswer('cafe', 'café', 'en');

    expect(diff.every((d) => d.kind === 'match')).toBe(true);
  });
});

describe('checkAnswer diff', () => {
  it('marks a missing diacritic on the exact letter', () => {
    const { diff } = checkAnswer('maize', 'maizē', 'lv');

    expect(diff.map((d) => d.kind)).toEqual([
      'match',
      'match',
      'match',
      'match',
      'diacritic',
    ]);
    expect(diff[4]).toEqual({ kind: 'diacritic', expected: 'ē', typed: 'e' });
  });

  it('marks several missing marks', () => {
    const { diff } = checkAnswer('seit', 'šeit', 'lv');

    expect(diff.map((d) => d.kind)).toEqual([
      'diacritic',
      'match',
      'match',
      'match',
    ]);
  });

  it('marks a different letter as wrong', () => {
    const { diff } = checkAnswer('maiza', 'maize', 'lv');

    expect(diff[4]).toEqual({ kind: 'wrong', expected: 'e', typed: 'a' });
  });

  it('marks a letter that was not typed as missing', () => {
    const { diff } = checkAnswer('maiz', 'maize', 'lv');

    expect(diff.at(-1)).toEqual({ kind: 'missing', expected: 'e' });
  });

  it('marks an extra typed letter', () => {
    const { diff } = checkAnswer('maizee', 'maize', 'lv');

    expect(diff.filter((d) => d.kind === 'extra')).toEqual([
      { kind: 'extra', typed: 'e' },
    ]);
  });

  it('keeps the case of the expected word and ignores case differences', () => {
    const { correct, diff } = checkAnswer('rīga', 'Rīga', 'lv');

    expect(correct).toBe(true);
    expect(diff[0]).toEqual({ kind: 'match', expected: 'R', typed: 'r' });
  });

  it('returns a diff of all matches for a correct answer', () => {
    const { diff } = checkAnswer(' šeit ', 'šeit', 'lv');

    expect(diff.map((d) => ('expected' in d ? d.expected : '')).join('')).toBe(
      'šeit',
    );
    expect(diff.every((d) => d.kind === 'match')).toBe(true);
  });
});

describe('checkAnswer language table', () => {
  it('throws for a language with no rules instead of guessing', () => {
    expect(() => checkAnswer('x', 'x', 'xx')).toThrow(/xx/);
  });
});
