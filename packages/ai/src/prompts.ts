import {
  effectiveFieldLang,
  fieldLanguage,
  toFieldLabelId,
  type FieldConfig,
} from '@mnemocard/core';
import type {
  EvaluateRecallInput,
  EvaluateRecallOutput,
  FillDeckFieldsInput,
  FillDeckFieldsOutput,
  GenerateDeckInput,
  GeneratedDeckOutput,
} from './types';

/** Extra guidance for labels whose content has a specific form. */
const FIELD_FORMAT_HINTS: Record<string, string> = {
  definition: 'concise clear meaning or definition',
  translation: 'natural direct translation',
  example: 'one natural example sentence using the subject term',
  context: 'brief usage context or nuance',
  synonym: '1-3 close synonyms',
  antonym: '1-3 clear antonyms',
  conjugation: 'key conjugated forms',
  grammar: 'brief grammar pattern or usage note',
  reading: 'phonetic reading (e.g., hiragana/kana for Japanese)',
  etymology: 'brief word origin or root breakdown',
  kanji: 'kanji only',
  romaji: 'Hepburn romanization',
  pinyin: 'Hanyu Pinyin with tone marks',
  pronunciation: 'how it is pronounced',
  latex: 'LaTeX source without $ delimiters',
  equation: 'plain-text equation',
  formula: 'plain-text formula',
  code: 'source code',
  mnemonics: 'one vivid memory hook',
  story: 'one-sentence vivid mnemonic story',
  acronym: 'memorable acronym breakdown',
  analogy: 'vivid relatable analogy',
  hint: 'subtle recall cue without giving away the answer',
  note: 'brief helpful study note',
  key_takeaway: 'single concise takeaway',
};

/**
 * One line per field, e.g. `2. definition (Korean)`. Media fields are marked
 * empty because the model can't produce them.
 */
export function describeDeckFields(fields: readonly FieldConfig[]): string[] {
  return fields.map((f, i) => {
    const id = toFieldLabelId(f.label);
    const name = (id ?? f.label).replace(/_/g, ' ');
    if (f.type !== 'text') return `${i + 1}. ${name}: always ""`;
    const lang = effectiveFieldLang(f);
    const parts = [lang ? `${name} (${fieldLanguage(lang).english})` : name];
    const hint = id ? FIELD_FORMAT_HINTS[id] : undefined;
    if (hint) parts.push(hint);
    return `${i + 1}. ${parts.join(': ')}`;
  });
}

export function buildGenerateDeckPrompt(input: GenerateDeckInput): string {
  const language = input.language || 'English';
  const fields = input.fieldConfigs?.length ? input.fieldConfigs : null;
  const interestsText =
    input.interests && input.interests.length > 0
      ? `Personalize mnemonic hooks around these user interests when helpful: ${input.interests.join(', ')}.`
      : 'Use vivid, concrete everyday imagery for memory hooks.';
  const exampleContent = fields
    ? `[${fields.map((_, i) => `"field ${i + 1}"`).join(', ')}]`
    : '["Term or prompt", "Concise clear definition", "One-sentence vivid mnemonic story"]';

  return [
    'You are MnemoCard, an expert learning-science and mnemonic tutor.',
    fields
      ? `Generate a flashcard study deck of exactly ${input.cardCount} cards. Write the title and description in ${language}.`
      : `Generate a flashcard study deck of exactly ${input.cardCount} cards in ${language}.`,
    ...(fields
      ? [
          `Each card's "content" has exactly ${fields.length} entries, in this order, each in the language given:`,
          ...describeDeckFields(fields),
        ]
      : []),
    interestsText,
    'Return ONLY valid JSON matching this exact structure (no markdown fences):',
    '{',
    '  "title": "Short engaging deck title",',
    '  "description": "One-sentence summary of what the deck teaches",',
    `  "category": "${input.category || 'other'}",`,
    `  "subject": "${input.subject || 'general'}",`,
    '  "cards": [',
    '    {',
    `      "content": ${exampleContent}`,
    '    }',
    '  ]',
    '}',
    '',
    `Topic or study notes:\n${input.topicOrNotes.trim()}`,
  ].join('\n');
}

export function buildFillFieldsPrompt(input: FillDeckFieldsInput): string {
  const fields = input.fieldConfigs;
  const fieldLines = describeDeckFields(fields).map((line, i) => {
    const role = fields[i]?.role;
    return role && role !== 'none' ? `${line} [${role}]` : line;
  });

  const contextLines: string[] = [];
  if (input.deckTitle?.trim()) contextLines.push(`Deck title: ${input.deckTitle.trim()}`);
  if (input.deckDescription?.trim()) {
    contextLines.push(`Deck description: ${input.deckDescription.trim()}`);
  }
  if (input.category?.trim() && input.category !== 'other') {
    contextLines.push(`Category: ${input.category.trim()}`);
  }
  if (input.interests && input.interests.length > 0) {
    contextLines.push(
      `Personalize any mnemonic/story/analogy fields around these learner interests when helpful: ${input.interests.join(', ')}.`
    );
  }

  const cardsPayload = input.cards.map((card) => ({
    id: card.id,
    content: fields.map((_, idx) => card.content[idx] ?? ''),
  }));

  return [
    'You are MnemoCard, an expert flashcard editor and multilingual tutor.',
    `Fill ONLY the empty ("") text entries in each card's "content" array.`,
    `Every card's "content" must have exactly ${fields.length} entries in this order, strictly matching each field's specified language and format:`,
    ...fieldLines,
    'Rules:',
    '- Keep every already-filled (non-empty) string verbatim without changing it.',
    '- Write each newly filled cell strictly in that column\'s specified language.',
    '- Anchor example sentences, synonyms, antonyms, readings, conjugations, and pronunciations to the card\'s [subject] term.',
    '- Keep non-text media fields (image/audio/video) as "".',
    '- Return the same cards in the same order with the same "id" values.',
    ...contextLines,
    'Return ONLY valid JSON matching this exact structure (no markdown fences):',
    '{"cards":[{"id":"...","content":["..."]}]}',
    '',
    'Cards to complete:',
    JSON.stringify({ cards: cardsPayload }),
  ].join('\n');
}

export function normalizeFilledCards(
  raw: Partial<FillDeckFieldsOutput>,
  input: FillDeckFieldsInput
): FillDeckFieldsOutput {
  const rawCards = Array.isArray(raw.cards) ? raw.cards : [];
  const rawById = new Map<string, string[]>();
  for (const c of rawCards) {
    if (c && typeof c.id === 'string' && Array.isArray(c.content)) {
      rawById.set(c.id, c.content.map((v) => String(v ?? '').trim()));
    }
  }

  const cards = input.cards.map((orig, idx) => {
    const candidate =
      rawById.get(orig.id) ??
      (Array.isArray(rawCards[idx]?.content)
        ? rawCards[idx]!.content.map((v) => String(v ?? '').trim())
        : []);

    const merged = input.fieldConfigs.map((cfg, fIdx) => {
      const existing = orig.content[fIdx] ?? '';
      // Never overwrite an already-filled cell or populate a non-text media column.
      if (existing.trim().length > 0 || cfg.type !== 'text') return existing;
      return candidate[fIdx] ?? '';
    });

    return { id: orig.id, content: merged };
  });

  return { cards };
}

export function buildEvaluateRecallPrompt(input: EvaluateRecallInput): string {
  const language = input.language || 'English';
  return [
    'You are MnemoCard, an encouraging active-recall tutor.',
    `Grade the learner's free-recall answer semantically in ${language}.`,
    `Prompt/Term: ${input.term}`,
    `Expected Meaning: ${input.expectedDefinition}`,
    `Learner Answer: ${input.userAnswer}`,
    'Return ONLY valid JSON:',
    '{"score":0.85,"isCorrect":true,"feedback":"1 concise encouraging sentence","memoryTip":"1 brief retention nudge"}',
  ].join('\n');
}

export function extractJsonObject<T>(rawText: string): T {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  const slice =
    firstBrace !== -1 && lastBrace > firstBrace
      ? cleaned.slice(firstBrace, lastBrace + 1)
      : cleaned;

  return JSON.parse(slice) as T;
}

export function normalizeGeneratedDeck(
  raw: Partial<GeneratedDeckOutput>,
  fallback: GenerateDeckInput
): GeneratedDeckOutput {
  const cards = Array.isArray(raw.cards) ? raw.cards : [];
  return {
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Generated Study Deck',
    description:
      typeof raw.description === 'string' && raw.description.trim()
        ? raw.description.trim()
        : `Study deck generated from ${fallback.topicOrNotes.slice(0, 60)}`,
    category: typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : fallback.category || 'other',
    subject: typeof raw.subject === 'string' && raw.subject.trim() ? raw.subject.trim() : fallback.subject || 'general',
    cards: cards
      .filter((c) => Array.isArray(c?.content) && c.content.length >= 2)
      .map((c) => ({
        content: c.content.map((item) => String(item ?? '').trim()),
        mnemonic: c.mnemonic,
      })),
  };
}

export function normalizeRecallOutput(raw: Partial<EvaluateRecallOutput>): EvaluateRecallOutput {
  const score = typeof raw.score === 'number' ? Math.min(1, Math.max(0, raw.score)) : 0.5;
  return {
    score,
    isCorrect: typeof raw.isCorrect === 'boolean' ? raw.isCorrect : score >= 0.7,
    feedback: typeof raw.feedback === 'string' && raw.feedback.trim() ? raw.feedback : 'Good effort — compare with the definition.',
    memoryTip: typeof raw.memoryTip === 'string' ? raw.memoryTip : '',
  };
}
