import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ArrowLeft,
  Check,
  ListChecks,
  Loader2,
  PencilLine,
  RotateCcw,
  Shuffle,
  Sparkles,
  Target,
  ToggleLeft,
  Volume2,
  X,
} from 'lucide-react';
import {
  generateTest,
  gradeQuestion,
  outcomeToRating,
  toTestCards,
  type AnswerResponse,
  type GradedQuestion,
  type TestQuestion,
  type TestQuestionType,
} from '@mnemocard/core';
import { type EvaluateRecallOutput, type HybridResult } from '@mnemocard/ai';

import { Navbar } from '@/components/navbar';
import { useI18n } from '@/i18n';
import { getHybridAIClient } from '@/lib/firebase';
import { fetchWebDeckById, recordWebCardReview, useWebStore } from '@/lib/local-store';
import { speakField, speakWebText } from '@/lib/speech';

const ALL_TYPES: TestQuestionType[] = ['multiple_choice', 'written', 'true_false', 'matching'];
const PAIR_COLORS = ['#3B82F6', '#A855F7', '#22C55E', '#F97316', '#EC4899'];

const TYPE_META: Record<
  TestQuestionType,
  { icon: React.ComponentType<{ className?: string }> }
> = {
  multiple_choice: { icon: ListChecks },
  written: { icon: PencilLine },
  true_false: { icon: ToggleLeft },
  matching: { icon: Shuffle },
};

function emptyResponse(q: TestQuestion): AnswerResponse {
  switch (q.type) {
    case 'multiple_choice':
      return { type: 'multiple_choice', selectedIndex: null };
    case 'written':
      return { type: 'written', text: '' };
    case 'true_false':
      return { type: 'true_false', saysMatch: null };
    case 'matching':
      return { type: 'matching', assignment: {} };
  }
}

export default function TestPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const { decks, decksStatus } = useWebStore();
  const deck = decks.find((d) => d.id === id) ?? null;
  const [fetchedId, setFetchedId] = useState<string | null>(null);

  useEffect(() => {
    if (deck || !id) return;
    let active = true;
    void fetchWebDeckById(id).finally(() => {
      if (active) setFetchedId(id);
    });
    return () => {
      active = false;
    };
  }, [deck, id]);

  const testCards = useMemo(
    () => (deck ? toTestCards(deck.cards, deck.fieldConfigs) : []),
    [deck]
  );

  const [phase, setPhase] = useState<'setup' | 'running' | 'results'>('setup');
  const [count, setCount] = useState(10);
  const [types, setTypes] = useState<TestQuestionType[]>(ALL_TYPES);
  const [showAnswerImmediately, setShowAnswerImmediately] = useState(true);
  const [useAIGrading, setUseAIGrading] = useState(true);
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [responses, setResponses] = useState<Record<string, AnswerResponse | undefined>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [aiEvals, setAiEvals] = useState<Record<string, HybridResult<EvaluateRecallOutput>>>({});
  const [aiEvalBusyId, setAiEvalBusyId] = useState<string | null>(null);
  const [aiEvalErrors, setAiEvalErrors] = useState<Record<string, string>>({});
  const [graded, setGraded] = useState<GradedQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);

  if (!deck) {
    const isLoading = decksStatus === 'loading' || (Boolean(id) && fetchedId !== id);
    return (
      <div className="min-h-dvh flex flex-col bg-background text-foreground overscroll-none">
        <Navbar />
        {!isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
            <h1 className="text-lg font-semibold">{t('common.deck_not_found')}</h1>
            <Link to="/explore" className="text-sm text-muted-foreground underline">
              {t('common.back_to_library')}
            </Link>
          </div>
        )}
      </div>
    );
  }

  // toTestCards takes prompts from the first text field, so speech reads that field of the card.
  const promptFieldIdx = deck.fieldConfigs.findIndex((f) => f.type !== 'image' && f.type !== 'audio');
  const speakPrompt = (cardId: string, prompt: string) => {
    const card = deck.cards.find((c) => c.id === cardId);
    const fields = deck.fieldConfigs.map((cfg, i) => ({
      ...cfg,
      content: (card?.content[i] ?? '').toString(),
    }));
    const field = fields[promptFieldIdx];
    if (field && card) speakField(field, fields);
    else speakWebText(prompt);
  };

  const maxQuestions = testCards.length;
  const clampedCount = Math.min(count, Math.max(1, maxQuestions));

  const startTest = (pool: typeof testCards, targetCount: number, qTypes: TestQuestionType[]) => {
    const qs = generateTest(pool, {
      questionCount: targetCount,
      types: qTypes,
      matchingGroupSize: Math.min(5, Math.max(2, pool.length)),
    });
    if (!qs.length) return;
    setQuestions(qs);
    setResponses({});
    setRevealed({});
    setAiEvals({});
    setAiEvalBusyId(null);
    setAiEvalErrors({});
    setGraded([]);
    setCurrent(0);
    setSelectedPrompt(null);
    setPhase('running');
  };

  const handleEvaluateWritten = async (
    q: Extract<TestQuestion, { type: 'written' }>,
    answerText: string
  ) => {
    setRevealed((p) => ({ ...p, [q.id]: true }));
    const trimmed = answerText.trim();
    if (!useAIGrading || !trimmed) return;

    setAiEvalBusyId(q.id);
    setAiEvalErrors((prev) => {
      const next = { ...prev };
      delete next[q.id];
      return next;
    });

    try {
      const result = await getHybridAIClient().evaluateRecall({
        term: q.prompt,
        expectedDefinition: q.answer,
        userAnswer: trimmed,
        language: locale,
      });
      setAiEvals((prev) => ({ ...prev, [q.id]: result }));
    } catch (err) {
      setAiEvalErrors((prev) => ({
        ...prev,
        [q.id]: err instanceof Error ? err.message : t('test.ai_grade_fallback'),
      }));
    } finally {
      setAiEvalBusyId((prev) => (prev === q.id ? null : prev));
    }
  };

  const finishTest = () => {
    const results = questions.map((q) => {
      const base = gradeQuestion(q, responses[q.id] ?? emptyResponse(q));
      const aiEval = q.type === 'written' ? aiEvals[q.id] : undefined;
      if (!aiEval) return base;
      const aiCorrect = aiEval.data.isCorrect;
      return {
        ...base,
        correct: aiCorrect,
        cardOutcomes: base.cardOutcomes.map((o) => ({ ...o, correct: aiCorrect })),
      };
    });
    setGraded(results);

    const perCard = new Map<string, boolean>();
    for (const g of results) {
      for (const o of g.cardOutcomes) {
        perCard.set(o.cardId, (perCard.get(o.cardId) ?? true) && o.correct);
      }
    }
    perCard.forEach((correct, cardId) => {
      recordWebCardReview(deck.id, cardId, outcomeToRating(correct));
    });

    setPhase('results');
  };

  const currentQuestion = questions[current];

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground overscroll-none">
      <header className="px-3 sm:px-8 h-12 border-b border-border bg-background flex items-center justify-between gap-3 sm:gap-4 z-30">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => void navigate(`/deck/${deck.id}`)}
            className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-md text-muted-foreground hover:bg-muted flex items-center justify-center cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-semibold truncate">{t('test.title', { deck: deck.title })}</h1>
            {phase === 'running' && (
              <p className="text-[11px] font-semibold text-muted-foreground truncate whitespace-nowrap">
                {t('test.question_n', { current: current + 1, total: questions.length })}
              </p>
            )}
          </div>
        </div>

        {phase === 'running' && (
          <button
            type="button"
            onClick={() => setPhase('setup')}
            className="px-3 sm:px-4 py-1.5 rounded-md bg-muted text-xs font-semibold cursor-pointer shrink-0 whitespace-nowrap"
          >
            {t('test.restart')}
          </button>
        )}
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-8">
        {phase === 'setup' && (
          <div className="space-y-6">
            {maxQuestions < 2 ? (
              <div className="rounded-lg border border-border p-4 text-center py-12 space-y-4">
                <p className="text-muted-foreground text-balance">
                  {t('test.min_cards')}
                </p>
                <Link
                  to={`/deck/${deck.id}`}
                  className="inline-block px-6 py-2.5 rounded-md bg-primary text-white font-semibold text-sm"
                >
                  {t('common.back_to_deck')}
                </Link>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-border p-4 space-y-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {t('test.question_count')}
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setCount(Math.max(1, clampedCount - 1))}
                        className="w-9 h-9 rounded-md border border-border font-semibold cursor-pointer"
                      >
                        −
                      </button>
                      <span className="text-xl font-semibold w-10 text-center">
                        {clampedCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCount(Math.min(maxQuestions, clampedCount + 1))}
                        className="w-9 h-9 rounded-md border border-border font-semibold cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {Array.from(
                      new Set([5, 10, 20, maxQuestions].filter((n) => n > 0 && n <= maxQuestions))
                    ).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setCount(preset)}
                        className={`px-4 py-1.5 rounded-md text-xs font-semibold border cursor-pointer ${
                          clampedCount === preset
                            ? 'bg-muted text-foreground border-foreground/40'
                            : 'border-border text-muted-foreground'
                        }`}
                      >
                        {preset === maxQuestions ? t('test.all') : preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {ALL_TYPES.map((type) => {
                    const active = types.includes(type);
                    const Icon = TYPE_META[type].icon;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() =>
                          setTypes((prev) =>
                            prev.includes(type)
                              ? prev.filter((x) => x !== type)
                              : [...prev, type]
                          )
                        }
                        className={`p-4 rounded-lg border text-left transition-all cursor-pointer ${
                          active
                            ? 'border-foreground/40 bg-muted'
                            : 'border-border bg-card hover:bg-muted/40'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Icon className={`w-5 h-5 ${active ? 'text-foreground' : 'text-muted-foreground'}`} />
                          {active && <Check className="w-4 h-4" />}
                        </div>
                        <div className="font-semibold text-sm">{t(`test.types.${type}`)}</div>
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-2.5">
                  <label className="rounded-lg border border-border p-4 flex items-center justify-between cursor-pointer">
                    <span className="font-semibold text-sm">{t('test.show_answer')}</span>
                    <input
                      type="checkbox"
                      checked={showAnswerImmediately}
                      onChange={(e) => setShowAnswerImmediately(e.target.checked)}
                      className="w-5 h-5 accent-primary"
                    />
                  </label>

                  {types.includes('written') && showAnswerImmediately && (
                    <label className="rounded-lg border border-border p-4 flex items-center justify-between gap-4 cursor-pointer">
                      <span className="font-semibold text-sm flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{t('test.ai_grade_toggle')}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={useAIGrading}
                        onChange={(e) => setUseAIGrading(e.target.checked)}
                        className="w-5 h-5 accent-primary shrink-0"
                      />
                    </label>
                  )}
                </div>

                <button
                  type="button"
                  disabled={types.length === 0}
                  onClick={() => startTest(testCards, clampedCount, types)}
                  className="w-full h-10 rounded-md bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40 cursor-pointer"
                >
                  {t('test.start')}
                </button>
              </>
            )}
          </div>
        )}

        {phase === 'running' && currentQuestion && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {t(`test.types.${currentQuestion.type}`)}
              </span>

              {currentQuestion.type !== 'matching' && (
                <button
                  type="button"
                  onClick={() => speakPrompt(currentQuestion.cardId, currentQuestion.prompt)}
                  className="w-9 h-9 rounded-md bg-card border border-border flex items-center justify-center cursor-pointer"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {currentQuestion.type === 'multiple_choice' && (
              <div className="rounded-lg border border-border p-4 space-y-5">
                <h2 className="text-2xl sm:text-3xl font-semibold text-center text-balance py-4">
                  {currentQuestion.prompt}
                </h2>
                <div className="space-y-2.5">
                  {currentQuestion.options.map((opt, idx) => {
                    const resp = responses[currentQuestion.id];
                    const selected = resp?.type === 'multiple_choice' ? resp.selectedIndex : null;
                    const isRev = showAnswerImmediately && !!revealed[currentQuestion.id];
                    const isCorrectOpt = isRev && idx === currentQuestion.correctIndex;
                    const isWrongOpt =
                      isRev && selected === idx && idx !== currentQuestion.correctIndex;

                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={isRev}
                        onClick={() => {
                          setResponses((p) => ({
                            ...p,
                            [currentQuestion.id]: { type: 'multiple_choice', selectedIndex: idx },
                          }));
                          if (showAnswerImmediately) {
                            setRevealed((p) => ({ ...p, [currentQuestion.id]: true }));
                          }
                        }}
                        className={`w-full p-4 rounded-lg border text-left font-semibold flex items-center justify-between transition-all cursor-pointer ${
                          isCorrectOpt
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600'
                            : isWrongOpt
                              ? 'border-red-500 bg-red-500/10 text-red-600'
                              : selected === idx
                                ? 'border-foreground/40 bg-muted text-foreground'
                                : 'border-border hover:bg-muted/60'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-7 h-7 shrink-0 rounded-md border border-current flex items-center justify-center text-xs font-semibold">
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span className="min-w-0 break-words">{opt}</span>
                        </div>
                        {isCorrectOpt && <Check className="w-4 h-4" />}
                        {isWrongOpt && <X className="w-4 h-4" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {currentQuestion.type === 'written' && (() => {
              const resp = responses[currentQuestion.id];
              const text = resp?.type === 'written' ? resp.text : '';
              const isRev = showAnswerImmediately && !!revealed[currentQuestion.id];
              const aiEval = aiEvals[currentQuestion.id];
              const aiBusy = aiEvalBusyId === currentQuestion.id;
              const aiErr = aiEvalErrors[currentQuestion.id];
              const isCorrect = aiEval
                ? aiEval.data.isCorrect
                : isRev && gradeQuestion(currentQuestion, { type: 'written', text }).correct;

              return (
                <div className="rounded-lg border border-border p-4 space-y-5">
                  <h2 className="text-2xl sm:text-3xl font-semibold text-center text-balance py-4">
                    {currentQuestion.prompt}
                  </h2>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (showAnswerImmediately && !isRev) {
                        void handleEvaluateWritten(currentQuestion, text);
                      }
                    }}
                    className="space-y-3"
                  >
                    <input
                      type="text"
                      value={text}
                      disabled={isRev}
                      onChange={(e) =>
                        setResponses((p) => ({
                          ...p,
                          [currentQuestion.id]: { type: 'written', text: e.target.value },
                        }))
                      }
                      placeholder={t('test.type_answer')}
                      className="w-full h-14 px-5 rounded-lg border-2 border-border focus:border-foreground/40 outline-none text-center font-semibold text-lg bg-background"
                    />
                    {!isRev && showAnswerImmediately && (
                      <button
                        type="submit"
                        className="w-full h-11 rounded-lg bg-muted text-foreground font-semibold text-sm cursor-pointer inline-flex items-center justify-center gap-2"
                      >
                        {useAIGrading && <Sparkles className="w-4 h-4" />}
                        <span>{t('test.check_answer')}</span>
                      </button>
                    )}
                  </form>

                  {aiBusy && (
                    <div className="p-4 rounded-lg border border-border bg-muted/40 text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>{t('test.ai_evaluating')}</span>
                    </div>
                  )}

                  {isRev && !aiBusy && (
                    <div
                      className={`p-4 rounded-lg border space-y-2.5 text-sm ${
                        isCorrect
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          : 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 font-semibold">
                        <span>
                          {isCorrect
                            ? t('test.correct')
                            : t('test.incorrect_answer', { answer: currentQuestion.answer })}
                        </span>
                        {aiEval && (
                          <span className="px-2 py-0.5 rounded-full text-xs border border-current tabular-nums">
                            {t('test.ai_score', { score: aiEval.data.score })}
                          </span>
                        )}
                      </div>

                      {aiEval && (
                        <>
                          {aiEval.data.feedback && (
                            <p className="text-xs text-foreground/90 font-normal">
                              {aiEval.data.feedback}
                            </p>
                          )}
                          {aiEval.data.memoryTip && (
                            <p className="text-xs text-muted-foreground font-normal border-t border-current/15 pt-2">
                              <span className="font-semibold text-foreground">
                                {t('test.ai_memory_tip')}:
                              </span>{' '}
                              {aiEval.data.memoryTip}
                            </p>
                          )}
                        </>
                      )}

                      {aiErr && !aiEval && (
                        <p className="text-xs text-muted-foreground font-normal">
                          {t('test.ai_grade_fallback')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {currentQuestion.type === 'true_false' && (() => {
              const resp = responses[currentQuestion.id];
              const saysMatch = resp?.type === 'true_false' ? resp.saysMatch : null;
              const isRev = showAnswerImmediately && !!revealed[currentQuestion.id];

              return (
                <div className="rounded-lg border border-border p-4 space-y-5 text-center">
                  <div className="p-4 rounded-lg bg-muted/50 text-xl font-semibold">
                    {currentQuestion.prompt}
                  </div>
                  <div className="text-muted-foreground font-semibold">↕</div>
                  <div className="p-4 rounded-lg bg-muted/50 text-lg font-semibold">
                    {currentQuestion.proposedAnswer}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    {[
                      { val: true, label: t('test.true'), icon: Check },
                      { val: false, label: t('test.false'), icon: X },
                    ].map((opt) => {
                      const Icon = opt.icon;
                      const active = saysMatch === opt.val;
                      const correctChoice = isRev && currentQuestion.isMatch === opt.val;
                      const wrongChoice = isRev && active && currentQuestion.isMatch !== opt.val;

                      return (
                        <button
                          key={String(opt.val)}
                          type="button"
                          disabled={isRev}
                          onClick={() => {
                            setResponses((p) => ({
                              ...p,
                              [currentQuestion.id]: { type: 'true_false', saysMatch: opt.val },
                            }));
                            if (showAnswerImmediately) {
                              setRevealed((p) => ({ ...p, [currentQuestion.id]: true }));
                            }
                          }}
                          className={`h-14 rounded-lg border-2 font-semibold flex items-center justify-center gap-2 cursor-pointer ${
                            correctChoice
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : wrongChoice
                                ? 'border-red-500 bg-red-500 text-white'
                                : active
                                  ? 'border-foreground/40 bg-muted text-foreground'
                                  : 'border-border'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {currentQuestion.type === 'matching' && (() => {
              const resp = responses[currentQuestion.id];
              const assignment = resp?.type === 'matching' ? resp.assignment : {};
              const isRev = showAnswerImmediately && !!revealed[currentQuestion.id];

              return (
                <div className="rounded-lg border border-border p-4 space-y-4">
                  <p className="text-xs font-semibold text-muted-foreground text-center text-balance">
                    {t('test.match_hint')}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      {currentQuestion.prompts.map((p, idx) => {
                        const paired = !!assignment[p.cardId];
                        const isSel = selectedPrompt === p.cardId;
                        const pairColor = PAIR_COLORS[idx % PAIR_COLORS.length];
                        return (
                          <button
                            key={p.cardId}
                            type="button"
                            disabled={isRev}
                            onClick={() => setSelectedPrompt(isSel ? null : p.cardId)}
                            style={
                              paired
                                ? { borderColor: pairColor, backgroundColor: `${pairColor}18` }
                                : undefined
                            }
                            className={`w-full p-2.5 sm:p-3 rounded-lg border text-left text-xs sm:text-sm font-semibold [overflow-wrap:anywhere] cursor-pointer ${
                              isSel ? 'border-foreground/60 ring-2 ring-foreground/10' : 'border-border'
                            }`}
                          >
                            {p.text}
                          </button>
                        );
                      })}
                    </div>

                    <div className="space-y-2">
                      {currentQuestion.answers.map((a) => {
                        const pairedPromptId = Object.keys(assignment).find(
                          (pid) => assignment[pid] === a.cardId
                        );
                        const idx = pairedPromptId
                          ? currentQuestion.prompts.findIndex((p) => p.cardId === pairedPromptId)
                          : -1;
                        const pairColor = idx >= 0 ? PAIR_COLORS[idx % PAIR_COLORS.length] : undefined;
                        return (
                          <button
                            key={a.cardId}
                            type="button"
                            disabled={isRev}
                            onClick={() => {
                              if (!selectedPrompt) {
                                if (!pairedPromptId) return;
                                const next = { ...assignment };
                                delete next[pairedPromptId];
                                setResponses((prev) => ({
                                  ...prev,
                                  [currentQuestion.id]: { type: 'matching', assignment: next },
                                }));
                                return;
                              }
                              const next = { ...assignment };
                              for (const pid of Object.keys(next)) {
                                if (next[pid] === a.cardId) delete next[pid];
                              }
                              next[selectedPrompt] = a.cardId;
                              setSelectedPrompt(null);
                              setResponses((prev) => ({
                                ...prev,
                                [currentQuestion.id]: { type: 'matching', assignment: next },
                              }));
                              if (
                                showAnswerImmediately &&
                                Object.keys(next).length === currentQuestion.prompts.length
                              ) {
                                setRevealed((p) => ({ ...p, [currentQuestion.id]: true }));
                              }
                            }}
                            style={
                              pairColor
                                ? { borderColor: pairColor, backgroundColor: `${pairColor}18` }
                                : undefined
                            }
                            className="w-full p-2.5 sm:p-3 rounded-lg border border-border text-left text-xs sm:text-sm font-semibold [overflow-wrap:anywhere] cursor-pointer"
                          >
                            {a.text}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Footer Controls */}
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={current === 0}
                onClick={() => setCurrent((c) => Math.max(0, c - 1))}
                className="px-5 h-12 rounded-md border border-border font-semibold text-sm disabled:opacity-30 cursor-pointer"
              >
                {t('test.previous')}
              </button>

              {current < questions.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setCurrent((c) => c + 1)}
                  className="px-7 h-12 rounded-md bg-primary text-white font-semibold text-sm cursor-pointer "
                >
                  {t('test.next')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={finishTest}
                  className="px-7 h-12 rounded-md bg-primary text-white font-semibold text-sm cursor-pointer "
                >
                  {t('test.submit')}
                </button>
              )}
            </div>
          </div>
        )}

        {phase === 'results' && (() => {
          const correctCount = graded.filter((g) => g.correct).length;
          const pct = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;
          const missedCardIds = Array.from(
            new Set(
              graded.flatMap((g) => g.cardOutcomes.filter((o) => !o.correct).map((o) => o.cardId))
            )
          );

          return (
            <div className="space-y-6">
              <div className="rounded-lg border border-border p-4 text-center py-10 space-y-2">
                <div className="text-5xl font-semibold">{pct}%</div>
                <p className="text-muted-foreground font-semibold">
                  {t('test.score', { correct: correctCount, total: questions.length })}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setPhase('setup')}
                  className="flex-1 h-12 rounded-md bg-primary text-white font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" /> {t('test.retake')}
                </button>
                {missedCardIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const missedSet = new Set(missedCardIds);
                      const pool = testCards.filter((c) => missedSet.has(c.id));
                      startTest(
                        pool,
                        pool.length,
                        pool.length === 1 ? ['written'] : ALL_TYPES
                      );
                    }}
                    className="flex-1 h-12 rounded-md bg-muted font-semibold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Target className="w-4 h-4" /> {t('test.retake_missed', { count: missedCardIds.length })}
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {questions.map((q) => {
                  const g = graded.find((x) => x.questionId === q.id);
                  const ok = !!g?.correct;
                  const aiEval = q.type === 'written' ? aiEvals[q.id] : undefined;
                  return (
                    <div
                      key={q.id}
                      className={`p-4 rounded-lg border space-y-2 ${
                        ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 font-semibold text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          {ok ? (
                            <Check className="w-4 h-4 shrink-0 text-emerald-500" />
                          ) : (
                            <X className="w-4 h-4 shrink-0 text-red-500" />
                          )}
                          <span className="min-w-0 break-words">
                            {q.type === 'matching'
                              ? t('test.matching_group')
                              : q.prompt}
                          </span>
                        </div>
                        {aiEval && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {t('test.ai_score', { score: aiEval.data.score })}
                          </span>
                        )}
                      </div>
                      {aiEval && (
                        <div className="text-xs text-muted-foreground space-y-1 pl-6">
                          {aiEval.data.feedback && <p>{aiEval.data.feedback}</p>}
                          {aiEval.data.memoryTip && (
                            <p>
                              <span className="font-semibold text-foreground">
                                {t('test.ai_memory_tip')}:
                              </span>{' '}
                              {aiEval.data.memoryTip}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </main>
    </div>
  );
}
