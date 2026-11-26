import { describe, expect, it } from 'vitest';
import {
  editDistance,
  isWrittenAnswerCorrect,
  normalizeAnswer,
  outcomeToRating,
} from './test';
import { Rating } from './srs';

describe('normalizeAnswer', () => {
  it('lowercases, strips accents and punctuation, and collapses whitespace', () => {
    expect(normalizeAnswer('  Café,   AU   lait! ')).toBe('cafe au lait');
  });

  it('drops a leading article but keeps a lone one', () => {
    expect(normalizeAnswer('The Mitochondria')).toBe('mitochondria');
    expect(normalizeAnswer('the')).toBe('the');
  });

  it('handles empty and nullish input', () => {
    expect(normalizeAnswer('')).toBe('');
    expect(normalizeAnswer(undefined as unknown as string)).toBe('');
  });

  it('keeps non-Latin letters', () => {
    // Output is NFD-decomposed, so compare through the same normalization.
    expect(normalizeAnswer('기억 術!')).toBe('기억 術'.normalize('NFD'));
    expect(normalizeAnswer('기억')).toBe(normalizeAnswer('기억'.normalize('NFD')));
  });
});

describe('editDistance', () => {
  it('computes Levenshtein distance', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('same', 'same')).toBe(0);
  });

  it('counts an adjacent transposition as one edit', () => {
    expect(editDistance('recieve', 'receive')).toBe(1);
  });
});

describe('isWrittenAnswerCorrect', () => {
  it('accepts exact answers regardless of case and articles', () => {
    expect(isWrittenAnswerCorrect('the Heart', 'heart')).toBe(true);
  });

  it('tolerates small typos on longer answers', () => {
    expect(isWrittenAnswerCorrect('mitochondrai', 'mitochondria')).toBe(true);
  });

  it('rejects wrong or empty answers', () => {
    expect(isWrittenAnswerCorrect('liver', 'heart')).toBe(false);
    expect(isWrittenAnswerCorrect('   ', 'heart')).toBe(false);
  });

  it('accepts any of several alternatives separated by / , ;', () => {
    expect(isWrittenAnswerCorrect('colour', 'color / colour')).toBe(true);
    expect(isWrittenAnswerCorrect('grey', 'gray; grey')).toBe(true);
  });
});

describe('outcomeToRating', () => {
  it('maps correct to Good and incorrect to Again', () => {
    expect(outcomeToRating(true)).toBe(Rating.Good);
    expect(outcomeToRating(false)).toBe(Rating.Again);
  });
});
