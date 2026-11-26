import { describe, expect, it } from 'vitest';
import {
  buildEvaluateRecallPrompt,
  buildFillFieldsPrompt,
  buildGenerateDeckPrompt,
  extractJsonObject,
  normalizeFilledCards,
  normalizeGeneratedDeck,
  normalizeRecallOutput,
} from './prompts';

describe('extractJsonObject', () => {
  it('parses plain JSON', () => {
    expect(extractJsonObject<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips markdown fences', () => {
    expect(extractJsonObject<{ a: number }>('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('ignores prose around the object', () => {
    expect(extractJsonObject<{ a: number }>('Sure! {"a":1} Hope that helps.')).toEqual({ a: 1 });
  });

  it('throws on invalid JSON', () => {
    expect(() => extractJsonObject('not json')).toThrow();
  });
});

describe('prompt builders', () => {
  it('includes card count, language, interests and notes in the deck prompt', () => {
    const p = buildGenerateDeckPrompt({
      topicOrNotes: '  Krebs cycle  ',
      cardCount: 7,
      language: 'French',
      interests: ['soccer'],
    });
    expect(p).toContain('exactly 7 cards in French');
    expect(p).toContain('soccer');
    expect(p).toContain('Krebs cycle');
  });

  it('lists each field with its language when fields are given', () => {
    const p = buildGenerateDeckPrompt({
      topicOrNotes: 'Mandarin greetings',
      cardCount: 3,
      fieldConfigs: [
        { label: 'term', type: 'text', lang: 'en', role: 'subject' },
        { label: 'definition', type: 'text', lang: 'ko', role: 'target' },
        { label: 'pinyin', type: 'text', lang: 'zh-Hant', role: 'none' },
        { label: 'latex', type: 'text', lang: 'en', role: 'none' },
        { label: 'image', type: 'image', lang: 'en', role: 'none' },
      ],
    });
    expect(p).toContain('exactly 5 entries');
    expect(p).toContain('1. term (English)');
    expect(p).toContain('2. definition (Korean)');
    expect(p).toContain('3. pinyin (Traditional Chinese): Hanyu Pinyin with tone marks');
    expect(p).toContain('4. latex: LaTeX source');
    expect(p).toContain('5. image: always ""');
  });

  it('defaults the language to English', () => {
    expect(buildGenerateDeckPrompt({ topicOrNotes: 'x', cardCount: 1 })).toContain('in English');
  });

  it('includes the learner answer in the recall prompt', () => {
    const p = buildEvaluateRecallPrompt({
      term: 'ATP',
      expectedDefinition: 'energy currency',
      userAnswer: 'cell fuel',
    });
    expect(p).toContain('Learner Answer: cell fuel');
  });
});

describe('normalizeGeneratedDeck', () => {
  const fallback = { topicOrNotes: 'Biology notes', cardCount: 2, category: 'science', subject: 'bio' };

  it('fills defaults for an empty response', () => {
    const deck = normalizeGeneratedDeck({}, fallback);
    expect(deck.title).toBe('Generated Study Deck');
    expect(deck.category).toBe('science');
    expect(deck.subject).toBe('bio');
    expect(deck.cards).toEqual([]);
  });

  it('drops malformed cards and trims content', () => {
    const deck = normalizeGeneratedDeck(
      {
        title: ' T ',
        cards: [
          { content: [' a ', ' b '] },
          { content: ['only one'] },
          {} as never,
        ],
      },
      fallback
    );
    expect(deck.title).toBe('T');
    expect(deck.cards).toHaveLength(1);
    expect(deck.cards[0]!.content).toEqual(['a', 'b']);
  });
});

describe('normalizeRecallOutput', () => {
  it('clamps score to [0, 1]', () => {
    expect(normalizeRecallOutput({ score: 4 }).score).toBe(1);
    expect(normalizeRecallOutput({ score: -2 }).score).toBe(0);
  });

  it('derives isCorrect from score when missing', () => {
    expect(normalizeRecallOutput({ score: 0.8 }).isCorrect).toBe(true);
    expect(normalizeRecallOutput({ score: 0.2 }).isCorrect).toBe(false);
  });

  it('defaults to a neutral result', () => {
    const out = normalizeRecallOutput({});
    expect(out.score).toBe(0.5);
    expect(out.feedback).not.toBe('');
  });
});

describe('fillDeckFields prompt & normalizer', () => {
  const fieldConfigs = [
    { label: 'term', type: 'text' as const, lang: 'en', role: 'subject' as const },
    { label: 'definition', type: 'text' as const, lang: 'ko', role: 'target' as const },
    { label: 'example', type: 'text' as const, lang: 'en', role: 'none' as const },
    { label: 'image', type: 'image' as const, lang: 'en', role: 'none' as const },
  ];

  it('describes each column language, role, and cards to complete', () => {
    const p = buildFillFieldsPrompt({
      fieldConfigs,
      deckTitle: 'TOEIC Vocab',
      cards: [{ id: 'c1', content: ['ephemeral', '', '', ''] }],
    });
    expect(p).toContain('1. term (English) [subject]');
    expect(p).toContain('2. definition (Korean)');
    expect(p).toContain('3. example (English)');
    expect(p).toContain('4. image: always ""');
    expect(p).toContain('"ephemeral"');
  });

  it('preserves already-filled cells verbatim and keeps media cells empty', () => {
    const out = normalizeFilledCards(
      {
        cards: [
          {
            id: 'c1',
            content: ['MODIFIED', '일시적인', 'Cherry blossoms are ephemeral.', 'should-not-fill'],
          },
        ],
      },
      {
        fieldConfigs,
        cards: [{ id: 'c1', content: ['ephemeral', '', '', ''] }],
      }
    );
    expect(out.cards).toEqual([
      {
        id: 'c1',
        content: ['ephemeral', '일시적인', 'Cherry blossoms are ephemeral.', ''],
      },
    ]);
  });

  it('falls back to positional matching when the model omits or alters ids', () => {
    const out = normalizeFilledCards(
      {
        cards: [{ id: 'wrong-id', content: ['ephemeral', '덧없는', 'Life is ephemeral.', ''] }],
      },
      {
        fieldConfigs,
        cards: [{ id: 'c1', content: ['ephemeral', '', '', ''] }],
      }
    );
    expect(out.cards[0]).toEqual({
      id: 'c1',
      content: ['ephemeral', '덧없는', 'Life is ephemeral.', ''],
    });
  });
});
