import { describe, expect, it } from 'vitest';
import { checkAnswer, type Verdict } from '../src/lib/checker';

describe('checkAnswer (lv)', () => {
  const cases: [string, string, Verdict][] = [
    ['maize', 'maize', 'exact'],
    ['maize', 'maizē', 'typo'],
    ['seit', 'šeit', 'typo'],
    ['loti', 'ļoti', 'typo'],
    ['šeit', 'šeit', 'exact'],
    ['  maize  ', 'maize', 'exact'],
    ['Maize', 'maize', 'exact'],
    ['MAIZĒ', 'maizē', 'exact'],
    ['labā  diena', 'labā diena', 'exact'],
    ['', 'maize', 'wrong'],
    ['   ', 'maize', 'wrong'],
    ['maiz', 'maize', 'typo'],
    ['maizee', 'maize', 'typo'],
    ['maizeee', 'maize', 'wrong'],
    ['ir', 'is', 'wrong'],
    ['maja', 'mala', 'typo'],
    ['skolotajs', 'skolotājs', 'typo'],
    ['pardevejs', 'pārdevējs', 'typo'],
    ['pārdevējz', 'pārdevējs', 'typo'],
    ['pārdavējz', 'pārdevējs', 'typo'],
    ['pārdavēgz', 'pārdevējs', 'wrong'],
    ['skolotājz', 'skolotāj', 'typo'],
    ['skolotaz', 'skolotājs', 'wrong'],
    ['galds', 'galdi', 'typo'],
    ['gaxxi', 'galdi', 'wrong'],
  ];

  it.each(cases)('typed %j for %j → %s', (typed, expected, verdict) => {
    expect(checkAnswer(typed, expected, 'lv').verdict).toBe(verdict);
  });

  it('treats a decomposed ā (a + combining macron) the same as the single character', () => {
    expect(checkAnswer('ā', 'ā', 'lv').verdict).toBe('exact');
  });

  it('is case-insensitive for a capitalised expected word', () => {
    expect(checkAnswer('rīga', 'Rīga', 'lv').verdict).toBe('exact');
  });
});

describe('checkAnswer (en, no diacritic requirement)', () => {
  it('accepts a missing mark and any case', () => {
    expect(checkAnswer('Cafe', 'café', 'en').verdict).toBe('exact');
    expect(checkAnswer('cafe ', 'café', 'en').verdict).toBe('exact');
  });

  it('still rejects a wrong letter', () => {
    expect(checkAnswer('cafs', 'café', 'en').verdict).not.toBe('exact');
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
    const { verdict, diff } = checkAnswer('rīga', 'Rīga', 'lv');

    expect(verdict).toBe('exact');
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
