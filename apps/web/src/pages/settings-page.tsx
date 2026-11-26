import { Link } from 'react-router';
import { INTEREST_CATEGORIES, LIBRARY_CATEGORIES, formatSubjectLabel } from '@mnemocard/core';

import { Footer } from '@/components/footer';
import { StableLabel } from '@/components/stable-label';
import { Navbar } from '@/components/navbar';
import { useI18n } from '@/i18n';
import {
  resetWebStore,
  setWebAnswerSide,
  updateWebPreferences,
  useWebStore,
} from '@/lib/local-store';

export default function SettingsPage() {
  const { t } = useI18n();
  const { preferences } = useWebStore();

  const toggleInterest = (item: string) => {
    const next = preferences.interests.includes(item)
      ? preferences.interests.filter((x) => x !== item)
      : [...preferences.interests, item];
    updateWebPreferences({ interests: next });
  };

  const toggleSubject = (sub: string) => {
    const current = preferences.subjectIds ?? [];
    const next = current.includes(sub) ? current.filter((x) => x !== sub) : [...current, sub];
    updateWebPreferences({ subjectIds: next });
  };

  const segBtn = (active: boolean) =>
    `h-8 px-2.5 sm:px-3 rounded-md text-sm cursor-pointer transition-colors ${
      active ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
    }`;

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      <Navbar />

      <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 pt-8 pb-16 space-y-8">
        <h1 className="text-xl font-semibold">{t('settings.title')}</h1>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">{t('settings.study')}</h2>
          <div className="divide-y divide-border border-y border-border">
            <div className="flex flex-wrap items-center justify-between gap-2 py-2 min-h-12">
              <span className="text-sm">{t('settings.daily_goal')}</span>
              <div className="flex flex-wrap gap-1">
                {[5, 15, 30, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => updateWebPreferences({ dailyGoalMinutes: mins })}
                    className={segBtn(preferences.dailyGoalMinutes === mins)}
                  >
                    <StableLabel>{t('settings.minutes_short', { count: mins })}</StableLabel>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 py-2 min-h-12">
              <span className="text-sm">{t('settings.answer_side')}</span>
              <div className="flex flex-wrap gap-1">
                {(['term', 'definition'] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => setWebAnswerSide(side)}
                    className={`${segBtn(preferences.answerSide === side)} capitalize`}
                  >
                    <StableLabel>{t(side === 'term' ? 'common.term' : 'common.definition')}</StableLabel>
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center justify-between h-12 cursor-pointer">
              <span className="text-sm">{t('settings.autoplay')}</span>
              <input
                type="checkbox"
                checked={preferences.autoPlayAudio}
                onChange={(e) => updateWebPreferences({ autoPlayAudio: e.target.checked })}
                className="w-4 h-4 accent-primary"
              />
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground">{t('settings.subjects')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5 text-balance">
              {t('settings.subjects_hint')}
            </p>
          </div>
          <div className="space-y-4">
            {LIBRARY_CATEGORIES.map((cat) => (
              <div key={cat.id} className="space-y-1.5">
                <div className="text-xs text-muted-foreground">{cat.label}</div>
                <div className="flex flex-wrap gap-1.5">
                  {cat.subjects.map((sub) => {
                    const active = (preferences.subjectIds ?? []).includes(sub);
                    return (
                      <button
                        key={sub}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleSubject(sub)}
                        className={`h-7 px-2.5 rounded-md text-xs border cursor-pointer ${
                          active
                            ? 'border-foreground/40 bg-muted text-foreground font-medium'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <StableLabel>{formatSubjectLabel(sub)}</StableLabel>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground">{t('settings.interests')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5 text-balance">
              {t('settings.interests_hint')}
            </p>
          </div>
          <div className="space-y-4">
            {INTEREST_CATEGORIES.map((cat) => (
              <div key={cat.id} className="space-y-1.5">
                <div className="text-xs text-muted-foreground">{cat.label}</div>
                <div className="flex flex-wrap gap-1.5">
                  {cat.items.map((item) => {
                    const active = preferences.interests.includes(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => toggleInterest(item)}
                        className={`h-7 px-2.5 rounded-md text-xs border cursor-pointer ${
                          active
                            ? 'border-foreground/40 bg-muted text-foreground font-medium'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <StableLabel>{item}</StableLabel>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col items-start gap-3">
          <Link to="/welcome" className="text-sm hover:underline">
            {t('settings.redo_onboarding')}
          </Link>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t('settings.reset_confirm'))) {
                resetWebStore();
              }
            }}
            className="text-sm text-red-600 dark:text-red-400 hover:underline cursor-pointer"
          >
            {t('settings.reset')}
          </button>
        </section>
      </main>

      <Footer />
    </div>
  );
}
