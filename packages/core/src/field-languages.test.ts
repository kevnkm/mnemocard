import { describe, expect, it } from 'vitest';

import {
  disambiguateFieldNames,
  effectiveFieldLang,
  fieldHasLanguage,
  fieldLangOptions,
  findFieldLanguageWarnings,
  isFieldLangConfigurable,
  langBadge,
  langForNewField,
  normalizeLang,
  relabelField,
  speechLang,
} from './field-languages';
import type { FieldConfig } from './types';

const text = (label: string, lang = 'en'): FieldConfig => ({ label, type: 'text', lang, role: 'none' });

describe('normalizeLang', () => {
  it('maps regions and bare codes onto picker codes', () => {
    expect(normalizeLang('en-US')).toBe('en');
    expect(normalizeLang('zh')).toBe('zh-Hans');
    expect(normalizeLang('zh-TW')).toBe('zh-Hant');
    expect(normalizeLang('zh_hant')).toBe('zh-Hant');
    expect(normalizeLang('')).toBe('en');
  });
});

describe('field language rules', () => {
  it('gives prose fields every language', () => {
    expect(isFieldLangConfigurable(text('definition'))).toBe(true);
    expect(isFieldLangConfigurable(text('Field 3'))).toBe(true);
  });
  it('gives notation and media fields no language', () => {
    expect(fieldHasLanguage(text('latex'))).toBe(false);
    expect(fieldHasLanguage(text('Equation'))).toBe(false);
    expect(fieldHasLanguage({ label: 'image', type: 'image' })).toBe(false);
  });
  it('fixes kanji to Japanese without making it configurable', () => {
    expect(fieldHasLanguage(text('kanji'))).toBe(true);
    expect(isFieldLangConfigurable(text('kanji'))).toBe(false);
    expect(effectiveFieldLang(text('kanji', 'en'))).toBe('ja');
  });
  it('limits pinyin to the two Chinese scripts', () => {
    expect(fieldLangOptions(text('pinyin')).map((l) => l.code)).toEqual(['zh-Hans', 'zh-Hant']);
    expect(effectiveFieldLang(text('pinyin', 'en'))).toBe('zh-Hans');
    expect(effectiveFieldLang(text('pinyin', 'zh-TW'))).toBe('zh-Hant');
  });
});

describe('langForNewField', () => {
  it('follows the last freely configurable field when no label is given', () => {
    expect(langForNewField([text('term', 'ko'), text('latex', 'en')])).toBe('ko');
    expect(langForNewField([text('definition', 'ko'), text('kanji', 'ja')])).toBe('ko');
    expect(langForNewField([])).toBe('en');
  });

  it('aligns subject-bound labels with subject and target-bound labels with target', () => {
    const bilingual: FieldConfig[] = [
      { label: 'term', type: 'text', lang: 'en', role: 'subject' },
      { label: 'definition', type: 'text', lang: 'ko', role: 'target' },
    ];
    expect(langForNewField(bilingual, 'example')).toBe('en');
    expect(langForNewField(bilingual, 'synonym')).toBe('en');
    expect(langForNewField(bilingual, 'mnemonics')).toBe('ko');
    expect(langForNewField(bilingual, 'note')).toBe('ko');
  });
});

describe('relabelField', () => {
  it('applies a label rule', () => {
    expect(relabelField([text('term', 'ko')], 0, 'kanji')).toMatchObject({ label: 'kanji', lang: 'ja' });
    expect(relabelField([text('term', 'ko')], 0, 'image')).toMatchObject({ type: 'image' });
  });
  it('returns to the deck language when leaving a rule-bound label', () => {
    const fields = [text('kanji', 'ja'), text('definition', 'ko')];
    expect(relabelField(fields, 0, 'term').lang).toBe('ko');
  });
  it('keeps the language between free labels when no anchor exists', () => {
    expect(relabelField([text('term', 'fr')], 0, 'note').lang).toBe('fr');
  });
  it('switches subject-bound fields to subject language and target-bound fields to target language', () => {
    const fields: FieldConfig[] = [
      { label: 'term', type: 'text', lang: 'en', role: 'subject' },
      { label: 'definition', type: 'text', lang: 'ko', role: 'target' },
      { label: 'other', type: 'text', lang: 'ko', role: 'none' },
    ];
    expect(relabelField(fields, 2, 'example').lang).toBe('en');
    expect(relabelField(fields, 2, 'pronunciation').lang).toBe('en');
    const withExample: FieldConfig[] = [
      fields[0]!,
      fields[1]!,
      { label: 'example', type: 'text', lang: 'en', role: 'none' },
    ];
    expect(relabelField(withExample, 2, 'mnemonics').lang).toBe('ko');
  });
});

describe('findFieldLanguageWarnings', () => {
  it('flags subject-bound fields whose language differs from the subject', () => {
    const fields: FieldConfig[] = [
      { label: 'term', type: 'text', lang: 'en', role: 'subject' },
      { label: 'definition', type: 'text', lang: 'ko', role: 'target' },
      { label: 'example', type: 'text', lang: 'ko', role: 'none' },
      { label: 'mnemonics', type: 'text', lang: 'ko', role: 'none' },
    ];
    expect(findFieldLanguageWarnings(fields)).toEqual([
      {
        fieldIndex: 2,
        fieldLabel: 'example',
        currentLang: 'ko',
        expectedLang: 'en',
        subjectLabel: 'term',
      },
    ]);
  });

  it('returns empty when subject-bound fields match the subject language', () => {
    const fields: FieldConfig[] = [
      { label: 'term', type: 'text', lang: 'en', role: 'subject' },
      { label: 'definition', type: 'text', lang: 'ko', role: 'target' },
      { label: 'example', type: 'text', lang: 'en', role: 'none' },
    ];
    expect(findFieldLanguageWarnings(fields)).toEqual([]);
  });
});

describe('badges and speech', () => {
  it('uses compact badges', () => {
    expect(langBadge('en-US')).toBe('EN');
    expect(langBadge('zh-Hant')).toBe('繁');
  });
  it('maps Chinese scripts to voice regions', () => {
    expect(speechLang('zh-Hans')).toBe('zh-CN');
    expect(speechLang('zh-Hant')).toBe('zh-TW');
    expect(speechLang('ko')).toBe('ko');
    expect(speechLang(undefined)).toBeUndefined();
  });
});

describe('disambiguateFieldNames', () => {
  it('suffixes repeated names that differ in language', () => {
    const fields = [text('term'), text('definition'), text('definition', 'ko')];
    expect(disambiguateFieldNames(['Term', 'Definition', 'Definition'], fields)).toEqual([
      'Term',
      'Definition (EN)',
      'Definition (KO)',
    ]);
  });
  it('leaves repeats in the same language alone', () => {
    const fields = [text('note'), text('note')];
    expect(disambiguateFieldNames(['Note', 'Note'], fields)).toEqual(['Note', 'Note']);
  });
});
