import { langBadge, normalizeLang, type FieldLanguage } from '@mnemocard/core';

import { useI18n } from '@/i18n';

/**
 * Small language badge ("EN") for a field. A transparent native <select> sits on
 * top of it, so the menu, keyboard handling and positioning come from the browser.
 * `options` is what the field's label allows (all languages, or e.g. just the two
 * Chinese scripts for pinyin).
 */
export function FieldLangPicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly FieldLanguage[];
  onChange: (lang: string) => void;
}) {
  const { t } = useI18n();
  const current = normalizeLang(value);
  return (
    <span
      title={t('editor.field_language')}
      className="relative shrink-0 inline-flex items-center h-5 px-1.5 rounded-full border border-border text-[10px] font-bold tracking-wide text-muted-foreground hover:text-foreground hover:border-foreground/30 focus-within:ring-2 focus-within:ring-ring"
    >
      {langBadge(value)}
      <select
        aria-label={t('editor.field_language')}
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer"
      >
        {options.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </span>
  );
}
