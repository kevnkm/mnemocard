import { Link } from 'react-router';
import { Globe } from 'lucide-react';

import { LOCALES, setLocale, useI18n, type LocaleCode } from '@/i18n';

export function Footer() {
  const { t, locale } = useI18n();

  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 h-12 flex items-center justify-between gap-4 text-xs text-muted-foreground">
        <nav className="flex items-center gap-4">
          <Link to="/terms" className="hover:text-foreground transition-colors">
            {t('footer.terms')}
          </Link>
          <Link to="/privacy" className="hover:text-foreground transition-colors">
            {t('footer.privacy')}
          </Link>
        </nav>

        <label className="relative flex items-center">
          <Globe className="w-3.5 h-3.5 absolute left-2 pointer-events-none" aria-hidden="true" />
          <span className="sr-only">{t('footer.language')}</span>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as LocaleCode)}
            className="h-8 pl-7 pr-2 rounded-md bg-transparent hover:text-foreground hover:bg-muted/60 cursor-pointer outline-none transition-colors"
          >
            {LOCALES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </footer>
  );
}
