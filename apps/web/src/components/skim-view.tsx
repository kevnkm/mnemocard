import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ArrowDownUp,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  PanelRight,
  Play,
  RotateCcw,
  Shuffle,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  buildSkimFaces,
  getPreferredAudioFace,
  getSkimPullThresholds,
  Rating,
  resolveSkimWheelSettle,
  SKIM_CLASSIC_ADVANCE_PX,
  SKIM_FLICK_MIN_PULL_PX,
  SKIM_FLICK_VELOCITY_PX_S,
  SKIM_MIN_DWELL_MS,
  SKIM_WHEEL_SETTLE_MS,
  SKIM_WHEEL_UP_SCALE,
  stepSkimWheelDown,
  type SkimFace,
  type StudyCard,
} from '@mnemocard/core';

import { ReelCard, type WebReelCard } from '@/components/reel-card';
import { StudyModeToggle, type StudyMode } from '@/components/study-mode-toggle';
import { ratingLabel, useI18n } from '@/i18n';
import {
  formatWebInterval,
  recordWebCardReview,
  setWebAnswerSide,
  updateWebPreferences,
  useWebStore,
} from '@/lib/local-store';
import { AUTO_PLAY_DELAY_MS, speakField, stopWebSpeech } from '@/lib/speech';

const SHOW_CONTROLS_KEY = 'mnemocard.scroll.showControls';

function readShowControls(): boolean {
  try {
    return window.localStorage.getItem(SHOW_CONTROLS_KEY) === '1';
  } catch {
    return false;
  }
}

/** True when an element between `target` and `boundary` can still scroll in the wheel direction. */
function canScrollInside(target: EventTarget | null, boundary: HTMLElement, dy: number): boolean {
  let node = target instanceof HTMLElement ? target : null;
  while (node && node !== boundary) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1) {
      if (dy > 0 ? node.scrollTop + node.clientHeight < node.scrollHeight - 1 : node.scrollTop > 0) {
        return true;
      }
    }
    node = node.parentElement;
  }
  return false;
}

function seededShuffle(cards: StudyCard[], seed: number): StudyCard[] {
  const copy = [...cards];
  let s = seed >>> 0;
  for (let i = copy.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export function SkimView({
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

  const baseCards = useMemo(() => deck?.cards ?? [], [deck?.cards]);
  const [isShuffled, setIsShuffled] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(1);
  const [isAutoSkim, setIsAutoSkim] = useState(false);

  const [queue, setQueue] = useState<StudyCard[]>(() => [...baseCards]);
  const [queueCursor, setQueueCursor] = useState(0);
  const [feed, setFeed] = useState<StudyCard[]>(() =>
    baseCards.length > 0 ? [baseCards[0]!] : []
  );
  const [feedIndex, setFeedIndex] = useState(0);
  const [faceIndex, setFaceIndex] = useState(0);
  const [masteredIds, setMasteredIds] = useState<Set<string>>(() => new Set());
  const [stats, setStats] = useState({ correct: 0, incorrect: 0 });
  const [isFinished, setIsFinished] = useState(baseCards.length === 0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [pullOffset, setPullOffset] = useState(0);
  const [pullRating, setPullRating] = useState<Rating | 0>(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const cardShownAtRef = useRef(0);
  const [showControls, setShowControls] = useState(readShowControls);
  const toggleControls = useCallback(() => {
    setShowControls((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SHOW_CONTROLS_KEY, next ? '1' : '0');
      } catch {
        // Preference just won't persist.
      }
      return next;
    });
  }, []);

  const resetDeck = useCallback(
    (shuffled: boolean, seed: number) => {
      stopWebSpeech();
      const ordered = shuffled ? seededShuffle(baseCards, seed) : [...baseCards];
      setQueue(ordered);
      setQueueCursor(0);
      setFeed(ordered.length > 0 ? [ordered[0]!] : []);
      setFeedIndex(0);
      setFaceIndex(0);
      setMasteredIds(new Set());
      setStats({ correct: 0, incorrect: 0 });
      setIsFinished(ordered.length === 0);
    },
    [baseCards]
  );

  const deckKey = `${id ?? ''}:${baseCards.map((c) => c.id).join(',')}`;
  const [prevDeckKey, setPrevDeckKey] = useState(deckKey);
  if (prevDeckKey !== deckKey) {
    setPrevDeckKey(deckKey);
    resetDeck(isShuffled, shuffleSeed);
  }

  const currentCard = feed[feedIndex] ?? null;
  useEffect(() => {
    cardShownAtRef.current = Date.now();
  }, [currentCard?.id, feedIndex]);
  const isViewingHistory = feedIndex < feed.length - 1;
  const canGoPrevious = feedIndex > 0;

  const faces = useMemo(() => {
    if (!currentCard || !deck) return [];
    return buildSkimFaces(
      currentCard,
      deck.fieldConfigs,
      preferences.answerSide,
      (raw, idx) => raw || (idx === 0 ? 'Term' : idx === 1 ? 'Definition' : `Field ${idx + 1}`)
    );
  }, [currentCard, deck, preferences.answerSide]);

  const safeFaceIndex = Math.min(Math.max(faceIndex, 0), Math.max(faces.length - 1, 0));

  // Left/right arrow keys move between card fields.
  useEffect(() => {
    if (isFinished) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setFaceIndex(Math.min(safeFaceIndex + 1, Math.max(faces.length - 1, 0)));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setFaceIndex(Math.max(safeFaceIndex - 1, 0));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFinished, safeFaceIndex, faces.length]);

  useEffect(() => {
    if (!preferences.autoPlayAudio || !currentCard || isFinished) return;
    const face = getPreferredAudioFace(faces, safeFaceIndex);
    if (face && face.mediaKind === 'text' && face.content) {
      const timer = setTimeout(() => speakField(face, faces), AUTO_PLAY_DELAY_MS);
      return () => {
        clearTimeout(timer);
        stopWebSpeech();
      };
    }
  }, [preferences.autoPlayAudio, currentCard, isFinished, faces, safeFaceIndex]);

  const handleCommitNext = useCallback(
    (rating: Rating | null = Rating.Good) => {
      stopWebSpeech();
      setDirection(1);
      setFaceIndex(0);
      setPullOffset(0);
      setPullRating(0);

      if (isViewingHistory) {
        setFeedIndex((prev) => Math.min(prev + 1, feed.length - 1));
        return;
      }

      if (!deck || !currentCard) return;
      // `null` = skipped without an explicit rating: nothing is recorded.
      if (rating !== null) recordWebCardReview(deck.id, currentCard.id, rating);

      let nextQueue = queue;
      if (rating === null || rating === Rating.Again || rating === Rating.Hard) {
        if (rating !== null) setStats((s) => ({ ...s, incorrect: s.incorrect + 1 }));
        const remaining = queue.length - queueCursor;
        const gap = Math.min(10, Math.max(2, Math.floor(remaining * 0.45)));
        const insertAt = Math.min(queueCursor + 1 + gap, queue.length);
        nextQueue = [
          ...queue.slice(0, insertAt),
          currentCard,
          ...queue.slice(insertAt),
        ];
        setQueue(nextQueue);
      } else {
        setStats((s) => ({ ...s, correct: s.correct + 1 }));
        setMasteredIds((prev) => {
          const next = new Set(prev);
          next.add(currentCard.id);
          return next;
        });
      }

      const nextCursor = queueCursor + 1;
      if (nextCursor < nextQueue.length) {
        const nextCard = nextQueue[nextCursor]!;
        setQueueCursor(nextCursor);
        setFeed((prev) => [...prev, nextCard]);
        setFeedIndex((prev) => prev + 1);
      } else {
        setIsFinished(true);
      }
    },
    [isViewingHistory, feed.length, deck, currentCard, queue, queueCursor]
  );

  const handleCommitPrevious = useCallback(() => {
    if (!canGoPrevious) return;
    stopWebSpeech();
    setDirection(-1);
    setFaceIndex(0);
    setPullOffset(0);
    setPullRating(0);
    setFeedIndex((prev) => Math.max(0, prev - 1));
  }, [canGoPrevious]);

  useEffect(() => {
    if (!isAutoSkim || isFinished || !currentCard) return;
    const timer = setTimeout(() => {
      if (safeFaceIndex < Math.min(1, faces.length - 1)) {
        setFaceIndex((i) => i + 1);
      } else {
        handleCommitNext(null);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [isAutoSkim, isFinished, currentCard, safeFaceIndex, faces.length, handleCommitNext]);

  const handleVerticalDragMove = (dy: number) => {
    const height = stageRef.current?.clientHeight || 520;
    const t = getSkimPullThresholds(height);
    setPullOffset(dy);

    if (dy < 0 && !isViewingHistory) {
      const pull = -dy;
      let r: Rating | 0 = 0;
      if (pull >= t.easy) r = Rating.Easy;
      else if (pull >= t.good) r = Rating.Good;
      else if (pull >= t.hard) r = Rating.Hard;
      else if (pull >= t.cancel) r = Rating.Again;
      setPullRating(r);
    } else {
      setPullRating(0);
    }
  };

  const handleVerticalDragEnd = (dy: number, velocityY: number) => {
    const height = stageRef.current?.clientHeight || 520;
    const t = getSkimPullThresholds(height);

    if (dy < 0) {
      const pull = -dy;
      const upVel = -velocityY;
      let resolved: Rating | 0 = 0;
      if (!isViewingHistory) {
        if (pull >= t.easy) resolved = Rating.Easy;
        else if (pull >= t.good) resolved = Rating.Good;
        else if (pull >= t.hard) resolved = Rating.Hard;
        else if (pull >= t.cancel) resolved = Rating.Again;
        else if (upVel >= SKIM_FLICK_VELOCITY_PX_S && pull >= SKIM_FLICK_MIN_PULL_PX) {
          const dwelled = Date.now() - cardShownAtRef.current >= SKIM_MIN_DWELL_MS;
          handleCommitNext(dwelled ? Rating.Again : null);
          return;
        }
      } else if (pull >= SKIM_CLASSIC_ADVANCE_PX || upVel >= SKIM_FLICK_VELOCITY_PX_S) {
        handleCommitNext(null);
        return;
      }
      if (resolved !== 0) {
        handleCommitNext(resolved);
        return;
      }
    } else if (dy > 0 && canGoPrevious) {
      if (dy >= SKIM_CLASSIC_ADVANCE_PX || velocityY >= SKIM_FLICK_VELOCITY_PX_S) {
        handleCommitPrevious();
        return;
      }
    }

    setPullOffset(0);
    setPullRating(0);
  };

  // Mouse wheel / trackpad scrolling: a brief scroll advances with null eval;
  // double (consecutive) scrolls activate the FSRS evaluation gauge (Again -> Easy).
  const wheelActionsRef = useRef({
    commit: (() => {}) as (rating: Rating | null) => void,
    previous: () => {},
    face: (() => {}) as (delta: number) => void,
    isViewingHistory: false,
  });
  useEffect(() => {
    wheelActionsRef.current = {
      commit: (rating: Rating | null) => {
        if (isViewingHistory) {
          handleCommitNext(null);
        } else {
          handleCommitNext(rating);
        }
      },
      previous: handleCommitPrevious,
      face: (delta: number) =>
        setFaceIndex(Math.min(Math.max(safeFaceIndex + delta, 0), Math.max(faces.length - 1, 0))),
      isViewingHistory,
    };
  });

  const hasCard = Boolean(currentCard) && !isFinished;
  useEffect(() => {
    const el = mainRef.current;
    if (!el || !hasCard) return;
    const HORIZ_THRESHOLD = 60;
    const LOCK_MS = 380;

    const st = {
      x: 0,
      pull: 0,
      upPull: 0,
      last: 0,
      evalActive: false,
      lockUntil: 0,
      settleTimer: null as number | null,
    };

    const clearSettle = () => {
      if (st.settleTimer !== null) {
        window.clearTimeout(st.settleTimer);
        st.settleTimer = null;
      }
    };

    const resetPullVisuals = () => {
      st.pull = 0;
      st.upPull = 0;
      st.last = 0;
      st.evalActive = false;
      setPullOffset(0);
      setPullRating(0);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return; // pinch-zoom
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      const vertical = Math.abs(dy) >= Math.abs(dx);
      if (vertical && canScrollInside(e.target, el, dy)) return;
      e.preventDefault();

      const now = performance.now();
      if (now < st.lockUntil) return;

      if (!vertical) {
        if (now - st.last > 200) st.x = 0;
        st.last = now;
        st.x += dx;
        if (Math.abs(st.x) >= HORIZ_THRESHOLD) {
          wheelActionsRef.current.face(st.x > 0 ? 1 : -1);
          st.x = 0;
          st.lockUntil = now + LOCK_MS;
        }
        return;
      }

      const height = stageRef.current?.clientHeight || 520;
      const t = getSkimPullThresholds(height);

      if (st.pull > 0 || dy > 0) {
        st.upPull = 0;
        const { next, rating } = stepSkimWheelDown(
          { pull: st.pull, lastEventMs: st.last, evalActive: st.evalActive },
          dy,
          now,
          t,
          wheelActionsRef.current.isViewingHistory
        );
        st.pull = next.pull;
        st.last = next.lastEventMs;
        st.evalActive = next.evalActive;

        setPullOffset(-st.pull);
        setPullRating(rating);

        clearSettle();
        st.settleTimer = window.setTimeout(() => {
          st.settleTimer = null;
          const settled = resolveSkimWheelSettle(
            { pull: st.pull, lastEventMs: st.last, evalActive: st.evalActive },
            t,
            wheelActionsRef.current.isViewingHistory
          );
          resetPullVisuals();

          if (settled.shouldCommit) {
            st.lockUntil = performance.now() + LOCK_MS;
            wheelActionsRef.current.commit(settled.rating);
          }
        }, SKIM_WHEEL_SETTLE_MS);
      } else {
        // Scrolling up from rest navigates to the previous card.
        st.last = now;
        clearSettle();
        st.upPull += -dy * SKIM_WHEEL_UP_SCALE;
        setPullOffset(Math.min(SKIM_CLASSIC_ADVANCE_PX, st.upPull));
        setPullRating(0);

        if (st.upPull >= SKIM_CLASSIC_ADVANCE_PX) {
          resetPullVisuals();
          st.lockUntil = now + LOCK_MS;
          wheelActionsRef.current.previous();
        } else {
          st.settleTimer = window.setTimeout(() => {
            st.settleTimer = null;
            resetPullVisuals();
          }, SKIM_WHEEL_SETTLE_MS);
        }
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      clearSettle();
      el.removeEventListener('wheel', onWheel);
    };
  }, [hasCard]);

  if (!deck) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4 bg-background text-foreground overscroll-none">
        <Link to="/explore" className="px-5 py-2.5 rounded-md bg-primary text-white font-semibold">
          {t('common.back_to_library')}
        </Link>
      </div>
    );
  }

  const progressPct =
    baseCards.length > 0 ? Math.round((masteredIds.size / baseCards.length) * 100) : 0;
  const totalAttempts = stats.correct + stats.incorrect;
  const accuracy = totalAttempts > 0 ? Math.round((stats.correct / totalAttempts) * 100) : 100;
  const cardProgress = currentCard ? progressMap[currentCard.id] : undefined;
  const intervalLabels: Record<Rating, string> = {
    [Rating.Again]: formatWebInterval(cardProgress, Rating.Again),
    [Rating.Hard]: formatWebInterval(cardProgress, Rating.Hard),
    [Rating.Good]: formatWebInterval(cardProgress, Rating.Good),
    [Rating.Easy]: formatWebInterval(cardProgress, Rating.Easy),
  };

  const webReelCard: WebReelCard | null = currentCard
    ? { ...currentCard, progress: cardProgress }
    : null;

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground overscroll-none overflow-x-hidden">
      <header className="px-3 sm:px-8 min-h-12 py-1.5 sm:py-0 sm:h-12 border-b border-border bg-background flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-3 gap-y-1.5 z-30">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 basis-[160px]">
          <button
            type="button"
            onClick={() => void navigate(`/deck/${deck.id}`)}
            className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-md text-muted-foreground hover:bg-muted flex items-center justify-center cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-semibold truncate">{deck.title}</h1>
            <p className="text-[11px] font-semibold text-muted-foreground truncate whitespace-nowrap">
              {masteredIds.size} / {baseCards.length} mastered
            </p>
          </div>
        </div>

        <div className="hidden md:block flex-1 max-w-md h-2 rounded-full bg-muted overflow-hidden">
          <div
            style={{ width: `${progressPct}%` }}
            className="h-full rounded-full bg-foreground/70 transition-all duration-300"
          />
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 ml-auto shrink-0 max-w-full overflow-x-auto no-scrollbar">
          <StudyModeToggle mode={mode} onChange={onModeChange} />
          <button
            type="button"
            onClick={() =>
              setWebAnswerSide(preferences.answerSide === 'term' ? 'definition' : 'term')
            }
            className="px-2.5 sm:px-3 py-1.5 rounded-md bg-muted text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <ArrowDownUp className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {preferences.answerSide === 'term' ? t('skim.term_first') : t('skim.def_first')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsAutoSkim((a) => !a)}
            className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0 ${
              isAutoSkim ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Play className="w-3 h-3 fill-current" />
            <span className="hidden sm:inline">{t('skim.auto')}</span>
          </button>

          <button
            type="button"
            onClick={toggleControls}
            aria-pressed={showControls}
            title={t('skim.controls')}
            className={`w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-md flex items-center justify-center cursor-pointer ${
              showControls ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <PanelRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              const nextShuffle = !isShuffled;
              const nextSeed = nextShuffle ? shuffleSeed + 1 : shuffleSeed;
              setIsShuffled(nextShuffle);
              setShuffleSeed(nextSeed);
              resetDeck(nextShuffle, nextSeed);
            }}
            className={`w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-md flex items-center justify-center cursor-pointer ${
              isShuffled ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Shuffle className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() =>
              updateWebPreferences({ autoPlayAudio: !preferences.autoPlayAudio })
            }
            className={`w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-md flex items-center justify-center cursor-pointer ${
              preferences.autoPlayAudio
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {preferences.autoPlayAudio ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
          </button>
        </div>
      </header>

      <main ref={mainRef} className="flex-1 flex items-center justify-center p-4 sm:p-6">
        {isFinished || !currentCard || !webReelCard ? (
          <div className="bubbly-card max-w-md w-full text-center text-balance space-y-6 p-6 sm:p-10">
            <div className="w-20 h-20 mx-auto rounded-xl text-muted-foreground bg-muted flex items-center justify-center">
              <Trophy className="w-10 h-10" />
            </div>
            <h2 className="text-3xl font-semibold">{t('common.session_complete')}</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-lg bg-muted/60">
                <div className="text-2xl font-semibold">{accuracy}%</div>
                <div className="text-xs font-medium text-muted-foreground mt-1">
                  {t('common.accuracy')}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-muted/60">
                <div className="text-2xl font-semibold">{stats.correct}</div>
                <div className="text-xs font-medium text-muted-foreground mt-1">
                  {t('skim.perfects')}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => resetDeck(isShuffled, shuffleSeed)}
              className="w-full h-12 rounded-lg bg-primary text-white font-semibold flex items-center justify-center gap-2 cursor-pointer "
            >
              <RotateCcw className="w-4 h-4" /> {t('common.study_again')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row items-center gap-6 w-full max-w-3xl justify-center">
            <div
              ref={stageRef}
              style={{ transform: `translateY(${pullOffset * 0.14}px)` }}
              className="w-full max-w-[440px] h-[540px] sm:h-[600px] transition-transform duration-75"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`${feedIndex}-${currentCard.id}`}
                  initial={{ opacity: 0, y: direction * 28, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -direction * 24, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="w-full h-full"
                >
                  <ReelCard
                    card={webReelCard}
                    deck={deck}
                    faces={faces}
                    faceIndex={safeFaceIndex}
                    onFaceIndexChange={setFaceIndex}
                    pullOffset={pullOffset}
                    pullRating={pullRating}
                    isViewingHistory={isViewingHistory}
                    isAutoSkim={isAutoSkim}
                    intervalLabels={intervalLabels}
                    onVerticalDragMove={handleVerticalDragMove}
                    onVerticalDragEnd={handleVerticalDragEnd}
                    onSpeakFace={(face: SkimFace) => speakField(face, faces)}
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            {showControls && (
              <div className="flex lg:flex-col items-center gap-2 sm:gap-3 w-full max-w-[440px] lg:w-auto">
                <div className="flex lg:flex-col gap-1.5 sm:gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={!canGoPrevious}
                    onClick={handleCommitPrevious}
                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-md bg-card border border-border flex items-center justify-center disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronUp className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCommitNext(Rating.Good)}
                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-md bg-card border border-border flex items-center justify-center cursor-pointer"
                  >
                    <ChevronDown className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 min-w-0 grid grid-cols-4 lg:grid-cols-1 gap-1.5 sm:gap-2 w-full lg:w-32">
                  {[Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleCommitNext(r)}
                      className="px-1.5 sm:px-3 py-2.5 rounded-lg bg-card border border-border hover:bg-muted font-semibold text-xs flex flex-col items-center lg:items-start cursor-pointer min-w-0"
                    >
                      <span className="truncate max-w-full">
                        {ratingLabel(t, r)}
                      </span>
                      <span className="text-[10px] opacity-60 truncate max-w-full">{intervalLabels[r]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
