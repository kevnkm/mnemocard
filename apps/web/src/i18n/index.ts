import { useMemo, useSyncExternalStore } from 'react';

import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';

export const LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
] as const;

export type LocaleCode = (typeof LOCALES)[number]['code'];

type Dictionary = { [key: string]: string | Dictionary };

const DICTIONARIES: Record<LocaleCode, Dictionary> = { en, es, fr, ja, ko };
const STORAGE_KEY = 'mnemocard_web_locale';

function isLocaleCode(value: string | null | undefined): value is LocaleCode {
  return LOCALES.some((l) => l.code === value);
}

function detectLocale(): LocaleCode {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocaleCode(stored)) return stored;
  } catch {
    /* storage unavailable */
  }
  for (const lang of window.navigator.languages ?? [window.navigator.language]) {
    const base = lang.toLowerCase().split('-')[0];
    if (isLocaleCode(base)) return base;
  }
  return 'en';
}

let currentLocale: LocaleCode = detectLocale();
const listeners = new Set<() => void>();

if (typeof document !== 'undefined') document.documentElement.lang = currentLocale;

export function getLocale(): LocaleCode {
  return currentLocale;
}

export function setLocale(code: LocaleCode): void {
  if (code === currentLocale) return;
  currentLocale = code;
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* storage unavailable; choice just won't persist */
  }
  document.documentElement.lang = code;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function lookup(dict: Dictionary, key: string): string | undefined {
  let node: string | Dictionary | undefined = dict;
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export type TVars = Record<string, string | number>;

export function translate(locale: LocaleCode, key: string, vars?: TVars): string {
  let template: string | undefined;
  if (typeof vars?.count === 'number') {
    const category = new Intl.PluralRules(locale).select(vars.count);
    template =
      lookup(DICTIONARIES[locale], `${key}_${category}`) ??
      lookup(DICTIONARIES.en, `${key}_${category}`);
  }
  template ??= lookup(DICTIONARIES[locale], key) ?? lookup(DICTIONARIES.en, key) ?? key;
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name] ?? ''));
}

export type TFunction = (key: string, vars?: TVars) => string;

export function useI18n(): { t: TFunction; locale: LocaleCode } {
  const locale = useSyncExternalStore(subscribe, getLocale, () => 'en' as LocaleCode);
  return useMemo(
    () => ({ locale, t: (key: string, vars?: TVars) => translate(locale, key, vars) }),
    [locale]
  );
}

/** Localized label for a deck field ("term" -> "Término"); unknown labels pass through. */
export function fieldLabel(t: TFunction, label: string): string {
  const id = label.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const key = `fieldLabels.${id}`;
  const out = t(key);
  return out === key ? label : out;
}

/** "in 3 days" / "tomorrow" in the active locale. */
export function formatNextDue(nextDueAt: string | null, locale: LocaleCode, t: TFunction): string {
  if (!nextDueAt) return t('time.scheduled');
  const diffMs = Date.parse(nextDueAt) - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return t('time.due_now');
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const hours = Math.ceil(diffMs / 3_600_000);
  if (hours < 24) return rtf.format(Math.max(hours, 1), 'hour');
  return rtf.format(Math.round(hours / 24), 'day');
}

export function formatDate(iso: string, locale: LocaleCode): string {
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(
    new Date(iso)
  );
}

const RATING_IDS = ['', 'again', 'hard', 'good', 'easy'] as const;

/** Localized FSRS rating name for a Rating value (1 = Again … 4 = Easy). */
export function ratingLabel(t: TFunction, rating: number): string {
  return t(`ratings.${RATING_IDS[rating] ?? 'good'}`);
}
