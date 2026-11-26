import { fieldTypeForLabel, toFieldLabelId, type FieldConfig, type FieldLabelId } from './types';

export interface FieldLanguage {
  /** BCP 47 tag stored on the field. Chinese is split by script, not region. */
  code: string;
  /** Endonym, shown in pickers so they read the same in every UI locale. */
  name: string;
  /** English name, used in AI prompts. */
  english: string;
  /** Compact text for the field badge. */
  badge: string;
}

/** Languages a field can be set to. */
export const FIELD_LANGUAGES: readonly FieldLanguage[] = [
  { code: 'en', name: 'English', english: 'English', badge: 'EN' },
  { code: 'ko', name: '한국어', english: 'Korean', badge: 'KO' },
  { code: 'ja', name: '日本語', english: 'Japanese', badge: 'JA' },
  { code: 'zh-Hans', name: '简体中文', english: 'Simplified Chinese', badge: '简' },
  { code: 'zh-Hant', name: '繁體中文', english: 'Traditional Chinese', badge: '繁' },
  { code: 'es', name: 'Español', english: 'Spanish', badge: 'ES' },
  { code: 'fr', name: 'Français', english: 'French', badge: 'FR' },
  { code: 'de', name: 'Deutsch', english: 'German', badge: 'DE' },
  { code: 'it', name: 'Italiano', english: 'Italian', badge: 'IT' },
  { code: 'pt', name: 'Português', english: 'Portuguese', badge: 'PT' },
  { code: 'ru', name: 'Русский', english: 'Russian', badge: 'RU' },
  { code: 'ar', name: 'العربية', english: 'Arabic', badge: 'AR' },
  { code: 'hi', name: 'हिन्दी', english: 'Hindi', badge: 'HI' },
  { code: 'vi', name: 'Tiếng Việt', english: 'Vietnamese', badge: 'VI' },
  { code: 'th', name: 'ไทย', english: 'Thai', badge: 'TH' },
  { code: 'id', name: 'Bahasa Indonesia', english: 'Indonesian', badge: 'ID' },
  { code: 'tr', name: 'Türkçe', english: 'Turkish', badge: 'TR' },
  { code: 'nl', name: 'Nederlands', english: 'Dutch', badge: 'NL' },
  { code: 'pl', name: 'Polski', english: 'Polish', badge: 'PL' },
  { code: 'sv', name: 'Svenska', english: 'Swedish', badge: 'SV' },
  { code: 'el', name: 'Ελληνικά', english: 'Greek', badge: 'EL' },
  { code: 'he', name: 'עברית', english: 'Hebrew', badge: 'HE' },
  { code: 'la', name: 'Latina', english: 'Latin', badge: 'LA' },
];

export const DEFAULT_FIELD_LANG = 'en';

const BY_CODE = new Map(FIELD_LANGUAGES.map((l) => [l.code.toLowerCase(), l]));

/** Labels whose content isn't in a spoken language (notation, code, numbers, media): no language at all. */
const LANGUAGE_NEUTRAL_LABELS: ReadonlySet<FieldLabelId> = new Set([
  'formula',
  'equation',
  'latex',
  'code',
  'syntax',
  'variable',
  'symbol',
  'diagram',
  'date',
  'image',
  'audio',
]);

/**
 * Labels tied to specific languages. One entry: the language is fixed and not
 * shown as a setting. Several: the field can only pick among them.
 */
const LABEL_LANGS: Partial<Record<FieldLabelId, readonly string[]>> = {
  kanji: ['ja'],
  romaji: ['ja'],
  pinyin: ['zh-Hans', 'zh-Hant'],
};

/** Labels whose content naturally shares the subject (term) field's language. */
const SUBJECT_BOUND_LABELS: ReadonlySet<FieldLabelId> = new Set([
  'example',
  'pronunciation',
  'reading',
  'conjugation',
  'synonym',
  'antonym',
]);

/** Labels whose content naturally shares the target (definition/explanation) field's language. */
const TARGET_BOUND_LABELS: ReadonlySet<FieldLabelId> = new Set([
  'definition',
  'translation',
  'answer',
  'note',
  'hint',
  'mnemonics',
  'story',
  'acronym',
  'analogy',
  'key_takeaway',
  'etymology',
  'grammar',
  'context',
  'rule',
  'law',
  'timeline',
]);

const SUBJECT_FALLBACK_LABELS: ReadonlySet<FieldLabelId> = new Set([
  'term',
  'character',
  'kanji',
  'question',
]);

const TARGET_FALLBACK_LABELS: ReadonlySet<FieldLabelId> = new Set([
  'definition',
  'translation',
  'answer',
]);

/**
 * Canonical code for a stored lang: "en-US" -> "en", "zh-TW" -> "zh-Hant",
 * "zh" -> "zh-Hans". Unknown languages keep their lowercased base.
 */
export function normalizeLang(lang: string | undefined): string {
  const raw = (lang || DEFAULT_FIELD_LANG).trim().replace(/_/g, '-');
  const lower = raw.toLowerCase();
  const exact = BY_CODE.get(lower);
  if (exact) return exact.code;
  const [base, ...rest] = lower.split('-');
  if (base === 'zh') {
    const traditional = rest.some((p) => p === 'hant' || p === 'tw' || p === 'hk' || p === 'mo');
    return traditional ? 'zh-Hant' : 'zh-Hans';
  }
  return BY_CODE.get(base!)?.code ?? base!;
}

/** Picker entry for a lang (unknown languages get a generated one). */
export function fieldLanguage(lang: string | undefined): FieldLanguage {
  const code = normalizeLang(lang);
  return BY_CODE.get(code.toLowerCase()) ?? { code, name: code, english: code, badge: code.toUpperCase() };
}

/** Compact badge text for a lang ("en-US" -> "EN", "zh-Hant" -> "繁"). */
export function langBadge(lang: string | undefined): string {
  return fieldLanguage(lang).badge;
}

/** Tag for text-to-speech engines, which expect regions rather than scripts for Chinese. */
export function speechLang(lang: string | undefined): string | undefined {
  if (!lang) return undefined;
  const code = normalizeLang(lang);
  if (code === 'zh-Hans') return 'zh-CN';
  if (code === 'zh-Hant') return 'zh-TW';
  return lang;
}

function labelRule(label: string): readonly string[] | undefined {
  const id = toFieldLabelId(label);
  return id ? LABEL_LANGS[id] : undefined;
}

/** Languages a field may use: none (neutral), a label's restricted set, or all of them. */
export function fieldLangOptions(field: Pick<FieldConfig, 'label' | 'type'>): readonly FieldLanguage[] {
  if (field.type !== 'text') return [];
  const id = toFieldLabelId(field.label);
  if (id && LANGUAGE_NEUTRAL_LABELS.has(id)) return [];
  const rule = labelRule(field.label);
  return rule ? rule.map((c) => fieldLanguage(c)) : FIELD_LANGUAGES;
}

/** Whether a field has a language at all (configurable or fixed by its label). */
export function fieldHasLanguage(field: Pick<FieldConfig, 'label' | 'type'>): boolean {
  return fieldLangOptions(field).length > 0;
}

/** Whether the user can change a field's language (more than one choice). */
export function isFieldLangConfigurable(field: Pick<FieldConfig, 'label' | 'type'>): boolean {
  return fieldLangOptions(field).length > 1;
}

/**
 * The language a field actually uses: its stored lang, coerced into what its
 * label allows. Undefined for language-neutral fields.
 */
export function effectiveFieldLang(field: Pick<FieldConfig, 'label' | 'type' | 'lang'>): string | undefined {
  const options = fieldLangOptions(field);
  if (options.length === 0) return undefined;
  const code = normalizeLang(field.lang);
  return options.some((o) => o.code === code) ? code : options[0]!.code;
}

/** Stores each field's effective language, e.g. when an older deck is opened for editing. */
export function normalizeFieldLangs(fields: readonly FieldConfig[]): FieldConfig[] {
  return fields.map((f) => {
    const lang = effectiveFieldLang(f);
    return lang && lang !== f.lang ? { ...f, lang } : f;
  });
}

function findSubjectField(fields: readonly FieldConfig[]): FieldConfig | undefined {
  return (
    fields.find((f) => f.role === 'subject') ??
    fields.find((f) => {
      const id = toFieldLabelId(f.label);
      return id !== null && SUBJECT_FALLBACK_LABELS.has(id);
    })
  );
}

function findTargetField(fields: readonly FieldConfig[]): FieldConfig | undefined {
  return (
    fields.find((f) => f.role === 'target') ??
    fields.find((f) => {
      const id = toFieldLabelId(f.label);
      return id !== null && TARGET_FALLBACK_LABELS.has(id);
    })
  );
}

/**
 * Language for a field being added after `fields`.
 * - Subject-bound labels (`example`, `synonym`, `pronunciation`, etc.) follow the subject field.
 * - Target/explanation labels (`mnemonics`, `note`, etc.) follow the target field.
 * - Otherwise follows the last freely configurable field.
 */
export function langForNewField(fields: readonly FieldConfig[], label?: string): string {
  const id = label ? toFieldLabelId(label) : null;
  if (id && SUBJECT_BOUND_LABELS.has(id)) {
    const subject = findSubjectField(fields);
    const subjectLang = subject ? effectiveFieldLang(subject) : undefined;
    if (subjectLang) return subjectLang;
  }
  if (id && TARGET_BOUND_LABELS.has(id)) {
    const target = findTargetField(fields);
    const targetLang = target ? effectiveFieldLang(target) : undefined;
    if (targetLang) return targetLang;
  }
  for (let i = fields.length - 1; i >= 0; i--) {
    const f = fields[i]!;
    if (fieldHasLanguage(f) && !labelRule(f.label)) return normalizeLang(f.lang);
  }
  return DEFAULT_FIELD_LANG;
}

/**
 * Field `index` with a new label: its type follows the label, and its language
 * follows the label's rule (kanji -> ja), or aligns with the deck's subject/target
 * language for subject-bound (`example`, `synonym`, etc.) and target-bound labels.
 */
export function relabelField(fields: readonly FieldConfig[], index: number, label: string): FieldConfig {
  const field = fields[index]!;
  const type = fieldTypeForLabel(label) ?? 'text';
  const otherFields = fields.filter((_, i) => i !== index);
  const id = toFieldLabelId(label);
  const leavingRule = !!labelRule(field.label) && !labelRule(label);

  let lang = field.lang;
  if (!labelRule(label)) {
    if (id && SUBJECT_BOUND_LABELS.has(id)) {
      const subject = findSubjectField(otherFields);
      const subjectLang = subject ? effectiveFieldLang(subject) : undefined;
      if (subjectLang) lang = subjectLang;
    } else if (id && TARGET_BOUND_LABELS.has(id)) {
      const target = findTargetField(otherFields);
      const targetLang = target ? effectiveFieldLang(target) : undefined;
      if (targetLang) lang = targetLang;
    } else if (leavingRule) {
      lang = langForNewField(otherFields);
    }
  }

  const next = { ...field, label, type, lang };
  return { ...next, lang: effectiveFieldLang(next) ?? lang };
}

export interface FieldLanguageWarning {
  fieldIndex: number;
  fieldLabel: string;
  currentLang: string;
  expectedLang: string;
  subjectLabel: string;
}

/**
 * Detects subject-bound fields (such as `example`, `synonym`, `pronunciation`)
 * whose configured language doesn't match the deck's subject field.
 */
export function findFieldLanguageWarnings(fields: readonly FieldConfig[]): FieldLanguageWarning[] {
  const subject = findSubjectField(fields);
  if (!subject) return [];
  const subjectLang = effectiveFieldLang(subject);
  if (!subjectLang) return [];

  const warnings: FieldLanguageWarning[] = [];
  fields.forEach((f, idx) => {
    if (f === subject) return;
    const id = toFieldLabelId(f.label);
    if (!id || !SUBJECT_BOUND_LABELS.has(id)) return;
    const currentLang = effectiveFieldLang(f);
    if (currentLang && currentLang !== subjectLang) {
      warnings.push({
        fieldIndex: idx,
        fieldLabel: f.label,
        currentLang,
        expectedLang: subjectLang,
        subjectLabel: subject.label,
      });
    }
  });
  return warnings;
}

/**
 * Display names for a deck's fields, given their localized label names. A name
 * shared with a field in another language gets its language appended
 * ("Definition (KO)"), so the two can be told apart.
 */
export function disambiguateFieldNames(names: readonly string[], fields: readonly FieldConfig[]): string[] {
  const langs = fields.map((f) => effectiveFieldLang(f));
  return names.map((name, i) => {
    const lang = langs[i];
    if (!lang) return name;
    const clash = names.some((other, j) => j !== i && other === name && langs[j] !== lang);
    return clash ? `${name} (${langBadge(lang)})` : name;
  });
}
