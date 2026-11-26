import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  buildSkimFaces,
  buildTodayWorkspace,
  getPreferredAudioFace,
  getSkimPullThresholds,
  Rating,
  SKIM_CLASSIC_ADVANCE_PX,
  SKIM_FLICK_MIN_PULL_PX,
  SKIM_FLICK_VELOCITY_PX_S,
  type SkimFace,
  type TodayQueueItem,
} from '@mnemocard/core';

import { ReelCard, type WebReelCard } from '@/components/reel-card';
import { useI18n } from '@/i18n';
import {
  formatWebInterval,
  recordWebCardReview,
  updateWebPreferences,
  useWebStore,
} from '@/lib/local-store';
import { speakWebText, stopWebSpeech } from '@/lib/speech';

export default function TodayReviewPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  const { decks, progressMap, preferences } = useWebStore();

  const initialQueue = useMemo<TodayQueueItem[]>(() => {
    const ws = buildTodayWorkspace({ decks, progressMap });
    if (mode === 'new' && ws.dueQueue.length === 0) return ws.upNextQueue;
    return [...ws.dueQueue, ...ws.upNextQueue];
  }, [decks, progressMap, mode]);

  const [queue, setQueue] = useState<TodayQueueItem[]>(() => initialQueue);
  const [cursor, setCursor] = useState(0);
  const [history, setHistory] = useState<TodayQueueItem[]>(() =>
    initialQueue.length > 0 ? [initialQueue[0]!] : []
  );
  const [historyIndex, setHistoryIndex] = useState(0);
  const [faceIndex, setFaceIndex] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [isDone, setIsDone] = useState(initialQueue.length === 0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [pullOffset, setPullOffset] = useState(0);
  const [pullRating, setPullRating] = useState<Rating | 0>(0);
  const stageRef = useRef<HTMLDivElement>(null);

  const currentItem = !isDone ? history[historyIndex] ?? null : null;
  const isViewingHistory = historyIndex < history.length - 1;
  const canGoPrevious = historyIndex > 0;

  const faces = useMemo(() => {
    if (!currentItem) return [];
    return buildSkimFaces(
      currentItem.card,
      currentItem.deck.fieldConfigs,
      preferences.answerSide,
      (raw, idx) => raw || (idx === 0 ? 'Term' : idx === 1 ? 'Definition' : `Field ${idx + 1}`)
    );
  }, [currentItem, preferences.answerSide]);

  const safeFaceIdx = Math.min(Math.max(faceIndex, 0), Math.max(faces.length - 1, 0));

  // Left/right arrow keys move between card fields.
  useEffect(() => {
    if (isDone) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setFaceIndex(Math.min(safeFaceIdx + 1, Math.max(faces.length - 1, 0)));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setFaceIndex(Math.max(safeFaceIdx - 1, 0));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDone, safeFaceIdx, faces.length]);

  useEffect(() => {
    if (!preferences.autoPlayAudio || !currentItem || isDone) return;
    const face = getPreferredAudioFace(faces, safeFaceIdx);
    if (face && face.mediaKind === 'text' && face.content) {
      const timer = setTimeout(() => speakWebText(face.content, face.lang), 180);
      return () => {
        clearTimeout(timer);
        stopWebSpeech();
      };
    }
  }, [preferences.autoPlayAudio, currentItem, isDone, faces, safeFaceIdx]);

  const commitNext = useCallback(
    (rating: Rating = Rating.Good) => {
      stopWebSpeech();
      setDirection(1);
      setFaceIndex(0);
      setPullOffset(0);
      setPullRating(0);

      if (isViewingHistory) {
        setHistoryIndex((i) => Math.min(i + 1, history.length - 1));
        return;
      }

      if (!currentItem) {
        setIsDone(true);
        return;
      }

      recordWebCardReview(currentItem.deck.id, currentItem.card.id, rating);

      let workingQueue = queue;
      if (rating === Rating.Again || rating === Rating.Hard) {
        const remaining = queue.length - cursor;
        const gap = Math.min(6, Math.max(2, Math.floor(remaining * 0.4)));
        const insertAt = Math.min(cursor + 1 + gap, queue.length);
        workingQueue = [
          ...queue.slice(0, insertAt),
          currentItem,
          ...queue.slice(insertAt),
        ];
        setQueue(workingQueue);
      } else {
        setCompletedCount((c) => c + 1);
      }

      const nextCursor = cursor + 1;
      if (nextCursor < workingQueue.length) {
        const upcoming = workingQueue[nextCursor]!;
        setCursor(nextCursor);
        setHistory((h) => [...h, upcoming]);
        setHistoryIndex((i) => i + 1);
      } else {
        setIsDone(true);
      }
    },
    [isViewingHistory, history.length, currentItem, queue, cursor]
  );

  const commitPrevious = useCallback(() => {
    if (!canGoPrevious) return;
    stopWebSpeech();
    setDirection(-1);
    setFaceIndex(0);
    setPullOffset(0);
    setPullRating(0);
    setHistoryIndex((i) => Math.max(0, i - 1));
  }, [canGoPrevious]);

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
          resolved = Rating.Again;
        }
      } else if (pull >= SKIM_CLASSIC_ADVANCE_PX || upVel >= SKIM_FLICK_VELOCITY_PX_S) {
        resolved = Rating.Again;
      }

      if (resolved !== 0) {
        commitNext(resolved);
        return;
      }
    } else if (dy > 0 && canGoPrevious) {
      if (dy >= SKIM_CLASSIC_ADVANCE_PX || velocityY >= SKIM_FLICK_VELOCITY_PX_S) {
        commitPrevious();
        return;
      }
    }

    setPullOffset(0);
    setPullRating(0);
  };

  const cardProgress = currentItem ? progressMap[currentItem.card.id] : undefined;
  const intervalLabels: Record<Rating, string> = {
    [Rating.Again]: formatWebInterval(cardProgress, Rating.Again),
    [Rating.Hard]: formatWebInterval(cardProgress, Rating.Hard),
    [Rating.Good]: formatWebInterval(cardProgress, Rating.Good),
    [Rating.Easy]: formatWebInterval(cardProgress, Rating.Easy),
  };

  const webCard: WebReelCard | null = currentItem
    ? { ...currentItem.card, progress: cardProgress }
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="px-4 sm:px-8 h-12 border-b border-border bg-background flex items-center justify-between gap-4 z-30">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void navigate('/')}
            className="w-9 h-9 rounded-md text-muted-foreground hover:bg-muted flex items-center justify-center cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm sm:text-base font-semibold">{t('review.title')}</h1>
            <p className="text-[11px] font-semibold text-muted-foreground">
              {completedCount} / {initialQueue.length} completed
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            updateWebPreferences({ autoPlayAudio: !preferences.autoPlayAudio })
          }
          className={`w-9 h-9 rounded-md flex items-center justify-center cursor-pointer ${
            preferences.autoPlayAudio
              ? 'bg-primary text-white'
              : 'bg-muted text-muted-foreground'
          }`}
          aria-label={t('review.toggle_audio')}
        >
          {preferences.autoPlayAudio ? (
            <Volume2 className="w-4 h-4" />
          ) : (
            <VolumeX className="w-4 h-4" />
          )}
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        {isDone || !currentItem || !webCard ? (
          <div className="bubbly-card max-w-md w-full text-center text-balance space-y-5 p-10">
            <div className="w-20 h-20 mx-auto rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-3xl font-semibold">{t('review.complete')}</h2>
            <Link
              to="/"
              className="inline-flex items-center justify-center w-full h-12 rounded-lg bg-primary text-white font-semibold "
            >
              {t('common.back_to_home')}
            </Link>
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
                  key={`${historyIndex}-${currentItem.queueKey}`}
                  initial={{ opacity: 0, y: direction * 28, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -direction * 24, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="w-full h-full"
                >
                  <ReelCard
                    card={webCard}
                    deck={currentItem.deck}
                    faces={faces}
                    faceIndex={safeFaceIdx}
                    onFaceIndexChange={setFaceIndex}
                    pullOffset={pullOffset}
                    pullRating={pullRating}
                    isViewingHistory={isViewingHistory}
                    reasonTag={currentItem.reason === 'new' ? 'New' : 'Due'}
                    cardPositionLabel={`${completedCount + 1} / ${initialQueue.length}`}
                    showDeckInfo
                    intervalLabels={intervalLabels}
                    onVerticalDragMove={handleVerticalDragMove}
                    onVerticalDragEnd={handleVerticalDragEnd}
                    onSpeakFace={(face: SkimFace) => speakWebText(face.content, face.lang)}
                    onOpenDeck={() => void navigate(`/deck/${currentItem.deck.id}`)}
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="flex lg:flex-col items-center gap-3 w-full max-w-[440px] lg:w-auto">
              <div className="flex lg:flex-col gap-2">
                <button
                  type="button"
                  disabled={!canGoPrevious}
                  onClick={commitPrevious}
                  className="w-11 h-11 rounded-md bg-card border border-border flex items-center justify-center disabled:opacity-30 cursor-pointer"
                >
                  <ChevronUp className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => commitNext(Rating.Good)}
                  className="w-11 h-11 rounded-md bg-card border border-border flex items-center justify-center cursor-pointer"
                >
                  <ChevronDown className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 grid grid-cols-4 lg:grid-cols-1 gap-2 w-full lg:w-32">
                {[Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => commitNext(r)}
                    className="px-3 py-2.5 rounded-lg bg-card border border-border hover:bg-muted font-semibold text-xs flex flex-col items-center lg:items-start cursor-pointer"
                  >
                    <span>
                      {r === Rating.Again
                        ? 'Again'
                        : r === Rating.Hard
                          ? 'Hard'
                          : r === Rating.Good
                            ? 'Good'
                            : 'Easy'}
                    </span>
                    <span className="text-[10px] opacity-60">{intervalLabels[r]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
