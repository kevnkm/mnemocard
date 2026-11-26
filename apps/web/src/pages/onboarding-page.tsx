import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  BookOpen,
  Brain,
  Briefcase,
  Check,
  Flame,
  FlaskConical,
  Globe,
  GraduationCap,
  Heart,
  Landmark,
  LayoutGrid,
  MessageCircleMore,
  Plane,
  Sigma,
  Target,
  Zap,
} from 'lucide-react';
import {
  DAILY_GOALS,
  INTEREST_CATEGORIES,
  LIBRARY_CATEGORIES,
  MOTIVATIONS,
  REQUIRED_INTERESTS,
  formatSubjectLabel,
  isOwnedDeck,
  resolveDeckColor,
  type AppIconName,
} from '@mnemocard/core';

import { DeckListSkeleton } from '@/components/skeleton';
import { StableLabel } from '@/components/stable-label';
import { useI18n } from '@/i18n';
import {
  loadRecommendedDecks,
  toggleWebDeckInMyDecks,
  updateWebPreferences,
  useWebStore,
} from '@/lib/local-store';

const ICONS: Record<AppIconName, React.ComponentType<{ className?: string }>> = {
  'book-open': BookOpen,
  brain: Brain,
  briefcase: Briefcase,
  flame: Flame,
  'flask-conical': FlaskConical,
  globe: Globe,
  'graduation-cap': GraduationCap,
  heart: Heart,
  landmark: Landmark,
  'layout-grid': LayoutGrid,
  'message-circle-more': MessageCircleMore,
  plane: Plane,
  sigma: Sigma,
  target: Target,
  zap: Zap,
};

const STEPS = ['subjects', 'motivation', 'goal', 'interests', 'decks'] as const;
type Step = (typeof STEPS)[number];

/** Number of recommended decks pre-selected on the last step. */
const PRESELECT_DECKS = 3;

const chip = (active: boolean) =>
  `h-8 px-3 rounded-full text-sm border cursor-pointer transition-colors inline-flex items-center gap-1.5 ${
    active
      ? 'border-foreground/40 bg-muted text-foreground font-medium'
      : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40'
  }`;

const optionCard = (active: boolean) =>
  `p-3 rounded-lg border text-left flex items-center gap-3 cursor-pointer transition-colors ${
    active ? 'border-foreground/40 bg-muted' : 'border-border bg-card hover:bg-muted/50'
  }`;

export default function OnboardingPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { preferences, decks, currentUid, recommendedDeckIds, recommendedStatus } =
    useWebStore();

  // Answers are kept locally until the user finishes, then written in one update.
  const [stepIndex, setStepIndex] = useState(0);
  const [subjectIds, setSubjectIds] = useState<string[]>(preferences.subjectIds ?? []);
  const [motivation, setMotivation] = useState(preferences.motivation ?? '');
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(preferences.dailyGoalMinutes);
  const [interests, setInterests] = useState<string[]>(preferences.interests);
  const [selectedDeckIds, setSelectedDeckIds] = useState<Set<string> | null>(null);

  const step: Step = STEPS[stepIndex]!;

  // Prefetch recommendations as soon as subjects are chosen, so the last step is instant.
  useEffect(() => {
    if (step !== 'subjects') void loadRecommendedDecks(subjectIds);
  }, [step, subjectIds]);

  const recommended = useMemo(() => {
    const byId = new Map(decks.map((d) => [d.id, d]));
    return recommendedDeckIds
      .flatMap((id) => byId.get(id) ?? [])
      .filter((d) => !isOwnedDeck(d, currentUid));
  }, [decks, recommendedDeckIds, currentUid]);

  // Pre-select the top few once recommendations arrive (user can change it).
  const effectiveSelection = useMemo(
    () =>
      selectedDeckIds ??
      new Set(recommended.filter((d) => !d.inMyDecks).slice(0, PRESELECT_DECKS).map((d) => d.id)),
    [selectedDeckIds, recommended]
  );

  const toggle = (list: string[], item: string) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  const canContinue =
    step === 'subjects'
      ? subjectIds.length > 0
      : step === 'motivation'
        ? motivation !== ''
        : step === 'interests'
          ? interests.length >= REQUIRED_INTERESTS
          : true;

  const isLastStep = stepIndex === STEPS.length - 1;

  // Saves whatever was answered; skipped steps keep their previous/default values.
  const finish = ({ addDecks }: { addDecks: boolean }) => {
    if (addDecks) {
      for (const id of effectiveSelection) toggleWebDeckInMyDecks(id, true);
    }
    updateWebPreferences({
      subjectIds,
      motivation,
      dailyGoalMinutes,
      interests,
      onboardingCompleted: true,
    });
    navigate('/', { replace: true });
  };

  const next = () => {
    if (!canContinue) return;
    if (isLastStep) finish({ addDecks: true });
    else setStepIndex(stepIndex + 1);
  };

  /** Skips only the current step; skipping the last one finishes without adding decks. */
  const skipStep = () => {
    if (isLastStep) finish({ addDecks: false });
    else setStepIndex(stepIndex + 1);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="mx-auto max-w-2xl w-full px-4 sm:px-6 h-12 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <img src="/mnemocard.svg" alt="" className="w-6 h-6" />
          <span className="font-display text-lg">MnemoCard</span>
        </Link>
        <button
          type="button"
          onClick={skipStep}
          className="text-sm text-muted-foreground hover:text-foreground cursor-pointer"
        >
          {t('onboarding.skip')}
        </button>
      </header>

      <main className="max-w-2xl w-full mx-auto px-4 sm:px-6 pt-6 pb-28 flex-1 space-y-6">
        <div className="space-y-3">
          <div className="flex gap-1" aria-hidden="true">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full ${i <= stepIndex ? 'bg-primary' : 'bg-muted'}`}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('onboarding.step', { current: stepIndex + 1, total: STEPS.length })}
          </p>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">{t(`onboarding.${step}_title`)}</h1>
            <p className="text-sm text-muted-foreground text-balance">
              {step === 'interests'
                ? t('onboarding.interests_hint', { count: REQUIRED_INTERESTS })
                : t(`onboarding.${step}_hint`)}
            </p>
          </div>
        </div>

        {step === 'subjects' && (
          <div className="space-y-5">
            {LIBRARY_CATEGORIES.map((cat) => {
              const Icon = ICONS[cat.icon] ?? LayoutGrid;
              return (
                <section key={cat.id} className="space-y-2">
                  <h2 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5" /> {cat.label}
                  </h2>
                  <div className="flex flex-wrap gap-1.5">
                    {cat.subjects.map((sub) => {
                      const active = subjectIds.includes(sub);
                      return (
                        <button
                          key={sub}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setSubjectIds(toggle(subjectIds, sub))}
                          className={chip(active)}
                        >
                          {active && <Check className="w-3.5 h-3.5" />}
                          <StableLabel>{formatSubjectLabel(sub)}</StableLabel>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {step === 'motivation' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup">
            {MOTIVATIONS.map((m) => {
              const Icon = ICONS[m.icon] ?? LayoutGrid;
              const active = motivation === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setMotivation(m.id)}
                  className={optionCard(active)}
                >
                  <div className="w-8 h-8 rounded-md bg-background border border-border flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-medium">{m.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {step === 'goal' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup">
            {DAILY_GOALS.map((g) => {
              const Icon = ICONS[g.icon] ?? Target;
              const active = dailyGoalMinutes === g.minutes;
              return (
                <button
                  key={g.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setDailyGoalMinutes(g.minutes)}
                  className={optionCard(active)}
                >
                  <div className="w-8 h-8 rounded-md bg-background border border-border flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{g.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('onboarding.goal_minutes', { count: g.minutes })}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {step === 'interests' && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground tabular-nums">
              {t('onboarding.interests_selected', {
                selected: interests.length,
                required: REQUIRED_INTERESTS,
              })}
            </p>
            {INTEREST_CATEGORIES.map((cat) => (
              <section key={cat.id} className="space-y-2">
                <h2 className="text-xs font-medium text-muted-foreground">
                  {cat.emoji} {cat.label}
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {cat.items.map((item) => {
                    const active = interests.includes(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setInterests(toggle(interests, item))}
                        className={chip(active)}
                      >
                        {active && <Check className="w-3.5 h-3.5" />}
                        <StableLabel>{item}</StableLabel>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {step === 'decks' &&
          (recommendedStatus === 'loading' ? (
            <DeckListSkeleton rows={4} />
          ) : recommended.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center text-balance">
              {t('onboarding.decks_empty')}
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {t('onboarding.decks_selected', { count: effectiveSelection.size })}
              </p>
              <ul className="divide-y divide-border border-y border-border">
                {recommended.map((deck) => {
                  const color = resolveDeckColor(deck.color);
                  const already = Boolean(deck.inMyDecks);
                  const checked = already || effectiveSelection.has(deck.id);
                  return (
                    <li key={deck.id}>
                      <label
                        className={`flex items-center gap-3 py-3 ${already ? 'opacity-60' : 'cursor-pointer'}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={already}
                          onChange={() => {
                            const nextSel = new Set(effectiveSelection);
                            if (nextSel.has(deck.id)) nextSel.delete(deck.id);
                            else nextSel.add(deck.id);
                            setSelectedDeckIds(nextSel);
                          }}
                          className="w-4 h-4 accent-primary shrink-0"
                        />
                        <div
                          style={{ backgroundColor: `${color}1A` }}
                          className="w-9 h-9 rounded-md flex items-center justify-center text-lg shrink-0"
                        >
                          {deck.icon || '📚'}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{deck.title}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {formatSubjectLabel(deck.subject)} ·{' '}
                            {t('common.cards_count', { count: deck.cards.length })}
                          </div>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
      </main>

      <footer className="fixed bottom-0 inset-x-0 border-t border-border glass-panel">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setStepIndex(Math.max(0, stepIndex - 1))}
            disabled={stepIndex === 0}
            className="h-9 px-4 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer disabled:invisible"
          >
            {t('onboarding.back')}
          </button>
          <button
            type="button"
            onClick={next}
            disabled={!canContinue}
            className="h-9 px-5 rounded-md bg-primary text-primary-foreground text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLastStep ? t('onboarding.finish') : t('onboarding.continue')}
          </button>
        </div>
      </footer>
    </div>
  );
}
