import { describe, expect, it } from 'vitest';
import { grammarLine } from './grammar';

describe('grammarLine', () => {
  it('shows gender and declension for nouns', () => {
    expect(grammarLine('noun', { gender: 'm', declension: 1 })).toBe(
      'masculine · 1st declension',
    );
    expect(grammarLine('noun', { gender: 'f', declension: 5 })).toBe(
      'feminine · 5th declension',
    );
    expect(grammarLine('noun', { gender: 'f', declension: 2 })).toBe(
      'feminine · 2nd declension',
    );
  });

  it('shows just the gender when the declension is unknown', () => {
    expect(grammarLine('noun', { gender: 'f' })).toBe('feminine');
  });

  it('shows conjugation and reflexive for verbs', () => {
    expect(grammarLine('verb', { conjugation: 1, reflexive: true })).toBe(
      '1st conjugation · reflexive',
    );
    expect(grammarLine('verb', { conjugation: 3, reflexive: false })).toBe(
      '3rd conjugation',
    );
  });

  it('returns null when there is nothing useful to show', () => {
    expect(grammarLine('noun', null)).toBeNull();
    expect(grammarLine('adverb', { adverb: 'asi' })).toBeNull();
    expect(grammarLine('noun', {})).toBeNull();
  });
});
