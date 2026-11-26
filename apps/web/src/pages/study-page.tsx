import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ArrowLeft,
  ArrowLeftRight,
  BookOpen,
  RotateCcw,
  Shuffle,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Rating } from '@mnemocard/core';

import {
  formatWebInterval,
  recordWebCardReview,
  updateWebPreferences,
  useWebStore,
} from '@/lib/local-store';
import { SkimView } from '@/components/skim-view';
import { MathText } from '@/components/math-text';
import { fieldLabel, useI18n } from '@/i18n';
import { StudyModeToggle, type StudyMode } from '@/components/study-mode-toggle';
import { speakWebText, stopWebSpeech } from '@/lib/speech';

function CardsView({
  mode,
  onModeChange,
}: {
  mode: StudyMode;
  onModeChange: (mode: StudyMode) => void;
}) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { decks, progressMap, preferences } = useWebStore();
  const deck = decks.find((d) => d.id === id) ?? null;

  const [isShuffled, setIsShuffled] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(1);
  const [isSwapped, setIsSwapped] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [faceIndex, setFaceIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [correctCount, setCorrectCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [stageWidth, setStageWidth] = useState(320);
  const stageRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    setStageWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setStageWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cards = useMemo(() => {
    const rawCards = deck?.cards ?? [];
    if (!isShuffled) return rawCards;
    const copy = [...rawCards];
    let s = shuffleSeed >>> 0;
    for (let i = copy.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const j = s % (i + 1);
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
  }, [deck?.cards, isShuffled, shuffleSeed]);

  const currentCard = cards[currentIndex] ?? null;

  const faces = useMemo(() => {
    if (!currentCard || !deck) return [];
    const list = deck.fieldConfigs.map((cfg, idx) => ({
      label: cfg.label,
      type: cfg.type,
      lang: cfg.lang,
      content: currentCard.content[idx] ?? '',
    }));
    if (isSwapped && list.length >= 2) {
      const [first, second, ...rest] = list;
      return [second!, first!, ...rest];
    }
    return list.filter((f, idx) => idx < 2 || Boolean(f.content.trim()));
  }, [currentCard, deck, isSwapped]);

  useEffect(() => {
    if (!preferences.autoPlayAudio || !currentCard || isFinished) return;
    const text = faces[0]?.content;
    if (text) {
      const timer = setTimeout(() => speakWebText(text, faces[0]?.lang), 180);
      return () => {
        clearTimeout(timer);
        stopWebSpeech();
      };
    }
  }, [preferences.autoPlayAudio, currentCard, isFinished, faces]);

  const handleFlip = useCallback(
    (delta = 1) => {
      if (faces.length > 1) setFaceIndex((i) => i + delta);
    },
    [faces.length]
  );

  const handleRate = useCallback(
    (rating: Rating) => {
      if (!deck || !currentCard) return;
      stopWebSpeech();
      recordWebCardReview(deck.id, currentCard.id, rating);
      if (rating >= Rating.Good) setCorrectCount((c) => c + 1);

      setDirection(1);
      setFaceIndex(0);

      if (currentIndex + 1 < cards.length) {
        setCurrentIndex((i) => i + 1);
      } else {
        setIsFinished(true);
      }
    },
    [deck, currentCard, currentIndex, cards.length]
  );

  const handleRestart = useCallback(() => {
    stopWebSpeech();
    setCurrentIndex(0);
    setFaceIndex(0);
    setCorrectCount(0);
    setIsFinished(false);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isFinished) return;
      if (e.code === 'Space') {
        e.preventDefault();
        handleFlip(1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleFlip(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleFlip(-1);
      } else if (e.key === '1') handleRate(Rating.Again);
      else if (e.key === '2') handleRate(Rating.Hard);
      else if (e.key === '3') handleRate(Rating.Good);
      else if (e.key === '4') handleRate(Rating.Easy);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFinished, handleFlip, handleRate]);

  if (!deck) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Link to="/explore" className="px-5 py-2.5 rounded-md bg-primary text-white font-semibold">
          {t('common.back_to_library')}
        </Link>
      </div>
    );
  }

  const progressPct = cards.length > 0 ? Math.round(((currentIndex + (isFinished ? 1 : 0)) / cards.length) * 100) : 0;
  const accuracy = cards.length > 0 ? Math.round((correctCount / cards.length) * 100) : 0;
  const cardProgress = currentCard ? progressMap[currentCard.id] : undefined;

  const angleStep = faces.length > 0 ? 360 / faces.length : 180;
  // Apothem of the regular prism whose side faces are as wide as the card stage.
  const radius =
    faces.length <= 2 ? 0 : Math.round(stageWidth / (2 * Math.tan(Math.PI / faces.length)));

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Compact Study Header */}
      <header className="px-4 sm:px-8 h-12 border-b border-border bg-background flex items-center justify-between gap-4 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => void navigate(`/deck/${deck.id}`)}
            className="w-9 h-9 rounded-md text-muted-foreground hover:bg-muted flex items-center justify-center cursor-pointer"
            aria-label={t('common.back_to_deck')}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-semibold truncate">{deck.title}</h1>
            <p className="text-[11px] font-semibold text-muted-foreground">
              {Math.min(currentIndex + 1, cards.length)} / {cards.length}
            </p>
          </div>
        </div>

        {/* Center Progress Bar */}
        <div className="hidden md:block flex-1 max-w-md h-2 rounded-full bg-muted overflow-hidden">
          <div
            style={{ width: `${progressPct}%` }}
            className="h-full rounded-full bg-foreground/70 transition-all duration-300"
          />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5">
          <StudyModeToggle mode={mode} onChange={onModeChange} />
          <button
            type="button"
            onClick={() => setIsSwapped((s) => !s)}
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
              isSwapped ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
            title={t('study.swap')}
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setIsShuffled((s) => {
                if (!s) setShuffleSeed((n) => n + 1);
                return !s;
              });
              setCurrentIndex(0);
              setFaceIndex(0);
                    }}
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
              isShuffled ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
            title={t('study.shuffle')}
          >
            <Shuffle className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              updateWebPreferences({ autoPlayAudio: !preferences.autoPlayAudio })
            }
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
              preferences.autoPlayAudio
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
            title={t('study.autoplay')}
          >
            {preferences.autoPlayAudio ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
        <AnimatePresence mode="wait">
          {isFinished ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bubbly-card max-w-lg w-full p-10 text-center text-balance space-y-8"
            >
              <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center mx-auto ">
                <Trophy className="w-10 h-10" />
              </div>
              <div>
                <h2 className="text-3xl font-semibold">{t('common.session_complete')}</h2>
                <p className="text-muted-foreground mt-1">
                  {t('study.reviewed_all', { count: cards.length, deck: deck.title })}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 rounded-xl bg-muted/60">
                  <div className="text-3xl font-semibold text-emerald-500">{accuracy}%</div>
                  <div className="text-xs font-medium text-muted-foreground mt-1">
                    {t('common.accuracy')}
                  </div>
                </div>
                <div className="p-5 rounded-xl bg-muted/60">
                  <div className="text-3xl font-semibold">{correctCount}</div>
                  <div className="text-xs font-medium text-muted-foreground mt-1">
                    {t('study.mastered')}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleRestart}
                  className="flex-1 h-12 rounded-lg bg-primary text-white font-semibold flex items-center justify-center gap-2 cursor-pointer "
                >
                  <RotateCcw className="w-4 h-4" /> {t('common.study_again')}
                </button>
                <Link
                  to={`/deck/${deck.id}`}
                  className="flex-1 h-12 rounded-lg bg-muted text-foreground font-semibold flex items-center justify-center gap-2"
                >
                  <BookOpen className="w-4 h-4" /> {t('common.back_to_deck')}
                </Link>
              </div>
            </motion.div>
          ) : currentCard ? (
            <motion.div
              key={currentCard.id}
              initial={{ x: direction * 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -direction * 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="w-full max-w-3xl flex flex-col items-center gap-6"
            >
              {/* 3D Prism Card Stage */}
              <div
                ref={stageRef}
                className="w-full aspect-[4/3] md:aspect-[3/2] max-h-[460px] perspective-2000"
              >
                  <motion.div
                    className="w-full h-full relative preserve-3d cursor-pointer"
                    animate={{ rotateY: faceIndex * -angleStep, z: -radius }}
                    transition={{ type: 'spring', stiffness: 360, damping: 34, mass: 0.8 }}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      handleFlip(e.clientX - rect.left < rect.width / 2 ? -1 : 1);
                    }}
                  >
                    {faces.map((face, idx) => (
                      <div
                        key={idx}
                        style={{
                          transform: `rotateY(${idx * angleStep}deg) translateZ(${radius}px)`,
                          backfaceVisibility: 'hidden',
                        }}
                        className="absolute inset-0 bg-card border-2 border-border rounded-2xl p-5 sm:p-8 md:p-10 flex flex-col items-center gap-3 text-center"
                      >
                        <div className="w-full shrink-0 truncate text-center text-xs font-medium text-muted-foreground">
                          {fieldLabel(t, face.label)}
                        </div>

                        {/* min-h-0 + overflow lets long content scroll inside the face; m-auto keeps short content centered */}
                        <div
                          className="flex-1 min-h-0 w-full flex flex-col overflow-y-auto overscroll-contain px-2"
                          onWheel={(e) => e.stopPropagation()}
                        >
                          {face.type === 'image' && face.content ? (
                            <img
                              src={face.content}
                              alt={face.label}
                              className="m-auto max-h-full max-w-full rounded-lg object-contain border border-border"
                            />
                          ) : (
                            <h2
                              className={`m-auto w-full [overflow-wrap:anywhere] whitespace-pre-wrap leading-tight font-semibold ${contentSizeClass(face.content.length)}`}
                            >
                              {face.content ? <MathText text={face.content} label={face.label} /> : '—'}
                            </h2>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            speakWebText(face.content, face.lang);
                          }}
                          className="shrink-0 p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                        >
                          <Volume2 className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                  </motion.div>
              </div>

              {/* Rating Controls */}
              <div className="w-full max-w-2xl grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { rating: Rating.Again, label: t('ratings.again'), cls: 'text-red-600 dark:text-red-400', key: '1' },
                  { rating: Rating.Hard, label: t('ratings.hard'), cls: 'text-orange-600 dark:text-orange-400', key: '2' },
                  { rating: Rating.Good, label: t('ratings.good'), cls: 'text-emerald-600 dark:text-emerald-400', key: '3' },
                  { rating: Rating.Easy, label: t('ratings.easy'), cls: 'text-blue-600 dark:text-blue-400', key: '4' },
                ].map((opt) => (
                  <button
                    key={opt.rating}
                    type="button"
                    onClick={() => handleRate(opt.rating)}
                    className={`h-16 sm:h-20 rounded-lg bg-card border border-border hover:bg-muted font-semibold transition-colors active:scale-[0.98] flex flex-col items-center justify-center relative cursor-pointer ${opt.cls}`}
                  >
                    <span className="text-base sm:text-lg">{opt.label}</span>
                    <span className="text-[10px] opacity-80">
                      {formatWebInterval(cardProgress, opt.rating)}
                    </span>
                  </button>
                ))}
              </div>

            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>
    </div>
  );
}

const STUDY_MODE_KEY = 'mnemocard_web_study_mode';

function readStoredMode(): StudyMode {
  try {
    return window.localStorage.getItem(STUDY_MODE_KEY) === 'cards' ? 'cards' : 'skim';
  } catch {
    return 'skim';
  }
}

/** Shrinks card text in steps as it gets longer; anything still too tall scrolls. */
function contentSizeClass(length: number): string {
  if (length > 220) return 'text-base sm:text-lg';
  if (length > 100) return 'text-xl sm:text-2xl';
  if (length > 40) return 'text-2xl sm:text-3xl';
  return 'text-3xl sm:text-4xl lg:text-5xl';
}

export default function StudyPage() {
  const [mode, setModeState] = useState<StudyMode>(readStoredMode);
  const setMode = useCallback((next: StudyMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STUDY_MODE_KEY, next);
    } catch {
      /* storage unavailable; mode just won't persist */
    }
  }, []);
  return mode === 'skim' ? (
    <SkimView mode={mode} onModeChange={setMode} />
  ) : (
    <CardsView mode={mode} onModeChange={setMode} />
  );
}
