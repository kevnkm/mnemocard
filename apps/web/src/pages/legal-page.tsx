import { Footer } from '@/components/footer';
import { Navbar } from '@/components/navbar';
import { formatDate, useI18n } from '@/i18n';

const LAST_UPDATED = '2026-11-26';
const REPO_URL = 'https://github.com/kevnkm/mnemocard';
const SECTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export default function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const { t, locale } = useI18n();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 pt-8 pb-16 space-y-8">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold">{t(`${kind}.title`)}</h1>
          <p className="text-xs text-muted-foreground">
            {t('legal.updated', { date: formatDate(LAST_UPDATED, locale) })}
          </p>
        </header>

        {SECTIONS.map((n) => (
          <section key={n} className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t(`${kind}.s${n}_h`)}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t(`${kind}.s${n}_p`)}
              {n === 7 && (
                <>
                  {' '}
                  <a
                    href={REPO_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-foreground"
                  >
                    {t('legal.contact_link')}
                  </a>
                  .
                </>
              )}
            </p>
          </section>
        ))}
      </main>

      <Footer />
    </div>
  );
}
