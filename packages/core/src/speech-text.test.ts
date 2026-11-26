import { describe, expect, it } from 'vitest';

import { cleanForSpeech, mathToSpeech, speechForField, type SpeakableField } from './speech-text';

const field = (label: string, content: string, lang = 'en', role: SpeakableField['role'] = 'none'): SpeakableField => ({
  label,
  type: 'text',
  lang,
  content,
  role,
});

describe('speechForField: transcriptions speak the word itself', () => {
  it('reads the characters for pinyin, in the pinyin field’s script', () => {
    const hanzi = field('character', '你好', 'zh-Hant', 'subject');
    const pinyin = field('pinyin', 'nǐ hǎo', 'zh-Hant');
    expect(speechForField(pinyin, [hanzi, pinyin, field('definition', 'hello')])).toEqual({
      text: '你好',
      lang: 'zh-Hant',
    });
  });

  it('prefers the kana reading over kanji for romaji', () => {
    const card = [
      field('kanji', '日本', 'ja', 'subject'),
      field('reading', 'にほん', 'ja'),
      field('romaji', 'nihon', 'ja'),
    ];
    expect(speechForField(card[2]!, card)).toEqual({ text: 'にほん', lang: 'ja' });
  });

  it('reads the Korean word for its romanization', () => {
    const card = [field('term', '안녕하세요', 'ko', 'subject'), field('pronunciation', 'annyeonghaseyo', 'ko')];
    expect(speechForField(card[1]!, card)?.text).toBe('안녕하세요');
  });

  it('reads the English word for an IPA transcription', () => {
    const card = [field('term', 'apple', 'en', 'subject'), field('pronunciation', '/ˈæp.əl/', 'en')];
    expect(speechForField(card[1]!, card)?.text).toBe('apple');
  });

  it('stays silent when the transcribed word is missing', () => {
    const pinyin = field('pinyin', 'nǐ hǎo', 'zh-Hans');
    expect(speechForField(pinyin, [pinyin, field('definition', 'hello')])).toBeNull();
  });

  it('reads Latin text in an ordinary field as written', () => {
    const term = field('term', 'BTS', 'ko', 'subject');
    expect(speechForField(term, [term, field('definition', '방탄소년단', 'ko')])).toEqual({
      text: 'BTS',
      lang: undefined,
    });
  });

  it('does not mistake French or Greek letters for phonetics', () => {
    const french = field('term', 'garçon, cœur', 'fr', 'subject');
    expect(speechForField(french, [french])).toEqual({ text: 'garçon, cœur', lang: 'fr' });
    const greek = field('term', 'θάλασσα', 'el', 'subject');
    expect(speechForField(greek, [greek])?.text).toBe('θάλασσα');
  });
});

describe('speechForField: notation', () => {
  it('reads LaTeX as English words', () => {
    expect(speechForField(field('latex', '\\frac{a}{b} = x^2'), [])).toEqual({
      text: 'a over b, equals x squared',
      lang: 'en',
    });
  });

  it('keeps code and diagrams silent', () => {
    expect(speechForField(field('code', 'const x = 1;'), [])).toBeNull();
    expect(speechForField(field('diagram', 'A --> B'), [])).toBeNull();
  });

  it('reads inline math in the field’s own language', () => {
    expect(speechForField(field('definition', 'Area is $\\pi r^2$.'), [])?.text).toBe(
      'Area is pi r squared.'
    );
    expect(speechForField(field('definition', '넓이는 $\\pi r^2$', 'ko'), [])?.text).toBe('넓이는 π r²');
  });

  it('skips media and empty fields', () => {
    expect(speechForField({ label: 'image', type: 'image', content: 'https://x/y.png' }, [])).toBeNull();
    expect(speechForField(field('term', '  '), [])).toBeNull();
  });
});

describe('mathToSpeech', () => {
  it.each([
    ['E = mc^2', 'E equals m c squared'],
    ['\\sqrt{x^2 + 1}', 'the square root of x squared plus 1'],
    ['\\sqrt[3]{8} = 2', 'the cube root of 8, equals 2'],
    ['a^{n+1}', 'a to the power of n plus 1'],
    ['\\alpha \\le \\beta', 'alpha is less than or equal to beta'],
    ['H_2O', 'H 2 O'],
    ['\\sin(\\theta)', 'sine theta'],
    ['speed = distance / time', 'speed equals distance over time'],
    ['\\text{m/s}', 'm over s'],
  ])('reads %s', (src, expected) => {
    expect(mathToSpeech(src, 'words')).toBe(expected);
  });

  it('writes symbols for other languages', () => {
    expect(mathToSpeech('\\frac{1}{2} \\times x^2', 'symbols')).toBe('1/2 × x²');
    expect(mathToSpeech('H_2O', 'symbols')).toBe('H₂O');
  });
});

describe('cleanForSpeech', () => {
  it('drops formatting, links and emoji', () => {
    expect(cleanForSpeech('**Bold** and `code` 🎉\n- see [docs](https://x.y)')).toBe(
      'Bold and code. see docs'
    );
  });
});
