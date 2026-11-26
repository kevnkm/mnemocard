import { DEFAULT_FIELD_LANG, effectiveFieldLang } from './field-languages';
import { toFieldLabelId, type FieldType, type FieldLabelId, type MnemonicRole } from './types';

/** A card field as the study screens hold it. */
export interface SpeakableField {
  label: string;
  type: FieldType;
  lang?: string;
  content: string;
  role?: MnemonicRole;
}

export interface SpeechRequest {
  text: string;
  /** Undefined lets the speaker guess from the text. */
  lang?: string;
}

/** Reading these aloud doesn't help anyone. */
const SILENT_LABELS: ReadonlySet<FieldLabelId> = new Set(['code', 'syntax', 'diagram']);

const MATH_LABELS: ReadonlySet<FieldLabelId> = new Set(['latex', 'formula', 'equation']);

/** Characters a language's own writing uses. Text in such a language without them is a romanization. */
const NATIVE_SCRIPTS: Readonly<Record<string, RegExp>> = {
  ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
  ko: /\p{Script=Hangul}/u,
  zh: /\p{Script=Han}/u,
  ru: /\p{Script=Cyrillic}/u,
  ar: /\p{Script=Arabic}/u,
  hi: /\p{Script=Devanagari}/u,
  th: /\p{Script=Thai}/u,
  el: /\p{Script=Greek}/u,
  he: /\p{Script=Hebrew}/u,
};

/** Labels that hold how another field is said, not text of their own. */
const TRANSCRIPTION_LABELS: ReadonlySet<FieldLabelId> = new Set([
  'pinyin',
  'romaji',
  'pronunciation',
  'reading',
]);

/** Symbols used only in phonetic notation, or a transcription wrapped in /.../ or [...]. */
const IPA = /[ɑɐɒɓʙɕɗɖʤəɘɚɜɝɞɟʄɡɠɢʛɦɧɥʜɨɪʝɭɬɫɮʟɱɯɰɳɲɴɵɸɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑ]|^\s*[/[].+[/\]]\s*$/u;

const baseOf = (lang: string | undefined) => lang?.toLowerCase().split('-')[0];

const langOf = (f: SpeakableField) =>
  effectiveFieldLang({ label: f.label, type: f.type, lang: f.lang ?? DEFAULT_FIELD_LANG });

/**
 * What to say for a card field, or null when it shouldn't be spoken.
 *
 * - A romanization (pinyin, romaji, romanized Korean) or an IPA transcription
 *   speaks the field it transcribes instead, so the learner hears the word itself.
 * - LaTeX, formulas and inline `$...$` math are read as words.
 * - Code and diagrams stay silent. Markdown and emoji are left out everywhere.
 */
export function speechForField(
  field: SpeakableField,
  card: readonly SpeakableField[]
): SpeechRequest | null {
  if (field.type !== 'text' || !field.content.trim()) return null;
  const id = toFieldLabelId(field.label);
  if (id && SILENT_LABELS.has(id)) return null;

  if (id && MATH_LABELS.has(id)) {
    // A formula written in, say, Korean is left to that language's voice.
    const latin = !/[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(
      field.content.replace(/\\[a-zA-Z]+/g, '')
    );
    const text = mathToSpeech(stripMathDelimiters(field.content), latin ? 'words' : 'symbols');
    return text ? { text, lang: latin ? 'en' : undefined } : null;
  }

  const lang = langOf(field);
  const script = NATIVE_SCRIPTS[baseOf(lang) ?? ''];
  const romanized = script && !script.test(field.content) && /\p{Script=Latin}/u.test(field.content);
  // Custom labels may be transcriptions too, such as "Romanization".
  const transcription = !id || id === 'other' || TRANSCRIPTION_LABELS.has(id);
  if (IPA.test(field.content) || (romanized && transcription)) {
    const source = findTranscribedField(field, card, lang);
    if (!source) return null;
    const sourceLang = langOf(source);
    return speakable(source.content, baseOf(sourceLang) === baseOf(lang) ? sourceLang : lang);
  }

  // Latin text in a field such as a Korean term ("BTS") is read as it's written.
  return speakable(field.content, romanized ? undefined : lang);
}

/**
 * The field a transcription is of: one in the same language written in its own
 * script, preferring the card's subject, and for Japanese a kana field, whose
 * reading isn't ambiguous like kanji. Without a native script (an English IPA
 * field), another field in the same language.
 */
function findTranscribedField(
  field: SpeakableField,
  card: readonly SpeakableField[],
  lang: string | undefined
): SpeakableField | undefined {
  const script = NATIVE_SCRIPTS[baseOf(lang) ?? ''];
  const candidates = card
    .filter((f) => f !== field && f.type === 'text' && f.content.trim())
    .filter((f) => !IPA.test(f.content))
    .filter((f) => (script ? script.test(f.content) : baseOf(langOf(f)) === baseOf(lang)))
    .map((f) => ({
      field: f,
      score:
        (baseOf(lang) === 'ja' && !/\p{Script=Han}/u.test(f.content) ? 2 : 0) +
        Number(f.role === 'subject'),
    }))
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.field;
}

function speakable(raw: string, lang: string | undefined): SpeechRequest | null {
  const mode = !lang || baseOf(lang) === 'en' ? 'words' : 'symbols';
  const text = cleanForSpeech(raw.replace(/\$([^$\n]+)\$/g, (_, math: string) => mathToSpeech(math, mode)));
  return text ? { text, lang } : null;
}

/** Removes formatting a voice would read out or stumble on. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^\s{0,3}(?:#{1,6}|[-*+•]|\d+[.)]|>)\s+/gm, '')
    .replace(/(\*\*|__|\*|_|`|~~)(\S(?:.*?\S)?)\1/g, '$2')
    .replace(/`/g, '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/([^\s.!?。！？,;:、，])\s*\n+\s*/gu, '$1. ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripMathDelimiters(text: string): string {
  return text.trim().replace(/^\$\$?([\s\S]*?)\$?\$$/, '$1').replace(/^\\[[(]([\s\S]*)\\[\])]$/, '$1');
}

type MathMode = 'words' | 'symbols';

const GREEK_NAMES =
  'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega'.split(
    ' '
  );
const GREEK_LOWER = 'αβγδεζηθικλμνξοπρστυφχψω';
const GREEK_UPPER = 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ';

/** LaTeX command: [spoken in English, symbol a voice reads in its own language]. */
const COMMANDS: Readonly<Record<string, readonly [string, string]>> = {
  times: ['times', '×'],
  cdot: ['times', '·'],
  div: ['divided by', '÷'],
  pm: ['plus or minus', '±'],
  mp: ['minus or plus', '∓'],
  le: ['is less than or equal to', '≤'],
  leq: ['is less than or equal to', '≤'],
  ge: ['is greater than or equal to', '≥'],
  geq: ['is greater than or equal to', '≥'],
  ne: ['is not equal to', '≠'],
  neq: ['is not equal to', '≠'],
  approx: ['is approximately', '≈'],
  equiv: ['is equivalent to', '≡'],
  propto: ['is proportional to', '∝'],
  infty: ['infinity', '∞'],
  to: ['to', '→'],
  rightarrow: ['to', '→'],
  Rightarrow: ['implies', '⇒'],
  implies: ['implies', '⇒'],
  leftrightarrow: ['if and only if', '↔'],
  iff: ['if and only if', '⇔'],
  sum: ['the sum of', '∑'],
  prod: ['the product of', '∏'],
  int: ['the integral of', '∫'],
  oint: ['the contour integral of', '∮'],
  partial: ['partial', '∂'],
  nabla: ['del', '∇'],
  lim: ['the limit', 'lim'],
  in: ['in', '∈'],
  notin: ['not in', '∉'],
  subset: ['subset of', '⊂'],
  cup: ['union', '∪'],
  cap: ['intersect', '∩'],
  forall: ['for all', '∀'],
  exists: ['there exists', '∃'],
  angle: ['angle', '∠'],
  perp: ['is perpendicular to', '⊥'],
  parallel: ['is parallel to', '∥'],
  circ: ['degrees', '°'],
  degree: ['degrees', '°'],
  ldots: ['and so on', '…'],
  cdots: ['and so on', '…'],
  dots: ['and so on', '…'],
  sin: ['sine', 'sin'],
  cos: ['cosine', 'cos'],
  tan: ['tangent', 'tan'],
  log: ['log', 'log'],
  ln: ['natural log', 'ln'],
  exp: ['e to the', 'exp'],
};

/** Plain characters read as words in English. */
const CHAR_WORDS: Readonly<Record<string, string>> = {
  '=': 'equals',
  '+': 'plus',
  '-': 'minus',
  '−': 'minus',
  '*': 'times',
  '/': 'over',
  '<': 'is less than',
  '>': 'is greater than',
  '!': 'factorial',
  '%': 'percent',
  '²': 'squared',
  '³': 'cubed',
  '√': 'the square root of',
  ...Object.fromEntries(Object.values(COMMANDS).map(([word, symbol]) => [symbol, word])),
  ...Object.fromEntries([...GREEK_LOWER].map((c, i) => [c, GREEK_NAMES[i]!])),
};

const IGNORED = new Set([
  'left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr',
  'displaystyle', 'textstyle', 'limits', 'nolimits',
]);
const SPACING = new Set([',', ';', ':', '!', ' ', 'quad', 'qquad']);
const TEXT_COMMANDS = new Set([
  'text', 'textrm', 'textbf', 'textit', 'mathrm', 'mathbf', 'mathit', 'mathcal', 'mathbb',
  'operatorname', 'boldsymbol', 'vec', 'hat', 'bar', 'overline', 'underline',
]);
const SUPERSCRIPTS: Readonly<Record<string, string>> = Object.fromEntries(
  [...'0123456789+-n'].map((c, i) => [c, '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿ'[i]!])
);
const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';

/**
 * Reads LaTeX or a plain formula aloud. "words" gives English ("x squared plus
 * one"); "symbols" gives Unicode math ("x²+1") for a voice in another language
 * to read in its own words.
 */
export function mathToSpeech(src: string, mode: MathMode): string {
  let i = 0;
  const words = mode === 'words';

  const join = (parts: string[]) =>
    (words ? parts.join(' ') : parts.join('')).replace(/\s+/g, ' ').trim();

  const run = (pattern: RegExp): string => {
    const start = i;
    while (i < src.length && pattern.test(src[i]!)) i += 1;
    return src.slice(start, i);
  };

  const letters = (token: string): string => {
    if (!words) return token;
    const command = COMMANDS[token];
    if (command) return command[0];
    // Short runs are variables ("mc" is m times c); longer ones are words.
    return token.length <= 2 ? [...token].join(' ') : token;
  };

  const char = (ch: string): string => {
    const sub = SUBSCRIPT_DIGITS.indexOf(ch);
    if (sub !== -1) return words ? ` ${sub} ` : ch;
    if (words) {
      if ('()[]{}|'.includes(ch)) return ' ';
      return CHAR_WORDS[ch] ?? ch;
    }
    return ch === '*' ? '×' : ch;
  };

  const atom = (): string => {
    while (src[i] === ' ') i += 1;
    const ch = src[i];
    if (ch === undefined) return '';
    if (ch === '{') {
      i += 1;
      const inner = sequence('}');
      i += 1;
      return inner;
    }
    if (ch === '\\') return command();
    if (/\p{L}/u.test(ch) && !CHAR_WORDS[ch]) return letters(run(/\p{L}/u));
    if (/\d/.test(ch)) return run(/[\d.]/);
    i += 1;
    return char(ch);
  };

  const command = (): string => {
    i += 1;
    const name = /[a-zA-Z]/.test(src[i] ?? '') ? run(/[a-zA-Z]/) : (src[i++] ?? '');
    if (IGNORED.has(name)) return '';
    if (SPACING.has(name)) return ' ';
    if (TEXT_COMMANDS.has(name)) return atom();
    if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
      const top = atom();
      const bottom = atom();
      return words ? `${top} over ${bottom},` : `${top}/${bottom}`;
    }
    if (name === 'sqrt') {
      let degree = '';
      if (src[i] === '[') {
        const end = src.indexOf(']', i);
        degree = mathToSpeech(src.slice(i + 1, end), mode);
        i = end + 1;
      }
      const body = atom();
      if (!words) return `${degree === '3' ? '∛' : degree === '4' ? '∜' : '√'}${body}`;
      const root = !degree ? 'square' : degree === '3' ? 'cube' : `${degree}th`;
      return `the ${root} root of ${body},`;
    }
    const greek = GREEK_NAMES.indexOf(name.toLowerCase());
    if (greek !== -1) {
      if (words) return GREEK_NAMES[greek]!;
      return (name[0] === name[0]!.toUpperCase() ? GREEK_UPPER : GREEK_LOWER)[greek]!;
    }
    const known = COMMANDS[name];
    if (known) return words ? known[0] : known[1];
    return /[a-zA-Z]/.test(name) ? name : char(name);
  };

  const power = (exponent: string): string => {
    if (words) {
      if (exponent === '2') return 'squared';
      if (exponent === '3') return 'cubed';
      if (exponent === 'degrees') return 'degrees';
      return `to the power of ${exponent},`;
    }
    const sup = [...exponent].map((c) => SUPERSCRIPTS[c]);
    return sup.every(Boolean) ? sup.join('') : `^${exponent}`;
  };

  const subscript = (index: string): string =>
    /^\d+$/.test(index) ? [...index].map((d) => SUBSCRIPT_DIGITS[Number(d)]).join('') : ` ${index}`;

  const sequence = (end?: string): string => {
    const parts: string[] = [];
    while (i < src.length && src[i] !== end) {
      const ch = src[i]!;
      if (ch === '^' || ch === '_') {
        i += 1;
        const arg = atom();
        parts.push(ch === '^' ? power(arg) : words ? arg : subscript(arg));
      } else if (ch === ' ') {
        i += 1;
        parts.push(' ');
      } else if (ch === '}') {
        i += 1;
      } else {
        parts.push(atom());
      }
    }
    return join(parts);
  };

  return sequence()
    .replace(/\s+,/g, ',')
    .replace(/,(\s*,)+/g, ',')
    .replace(/,\s*$/, '')
    .trim();
}
