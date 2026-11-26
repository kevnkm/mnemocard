import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  History,
  Play,
  Volume2,
} from 'lucide-react';

import { MathText } from '@/components/math-text';
import { fieldLabel, ratingLabel, useI18n } from '@/i18n';
import {
  Rating,
  State,
  type LocalCardProgress,
  type SkimFace,
  type StudyCard,
  type StudyDeck,
} from '@mnemocard/core';

export type WebReelCard = StudyCard & {
  progress?: LocalCardProgress;
};

interface ReelCardProps {
  card: WebReelCard;
  deck?: Partial<StudyDeck> | null;
  faces: SkimFace[];
  faceIndex: number;
  onFaceIndexChange: (nextIdx: number) => void;
  pullOffset: number;
  pullRating: Rating | 0;
  isViewingHistory: boolean;
  reasonTag?: string | null;
  isAutoSkim?: boolean;
  /** Shown top-right when provided. */
  cardPositionLabel?: string;
  /** Shows the deck icon/title footer (useful when cards from many decks are mixed). */
  showDeckInfo?: boolean;
  intervalLabels?: Record<Rating, string>;
  onVerticalDragMove: (dy: number) => void;
  onVerticalDragEnd: (dy: number, velocityY: number) => void;
  onSpeakFace: (face: SkimFace) => void;
  onOpenDeck?: () => void;
}

const RATING_COLORS: Record<Rating, string> = {
  [Rating.Again]: '#ea580c',
  [Rating.Hard]: '#9333ea',
  [Rating.Good]: '#0284c7',
  [Rating.Easy]: '#10b981',
};

function getStatusKey(progress?: LocalCardProgress): string {
  switch (progress?.state) {
    case State.Learning:
      return 'status.learning';
    case State.Review:
      return 'status.review';
    case State.Relearning:
      return 'status.relearning';
    case State.New:
    default:
      return 'status.new';
  }
}

export function ReelCard({
  card,
  deck,
  faces,
  faceIndex,
  onFaceIndexChange,
  pullRating,
  isViewingHistory,
  reasonTag,
  isAutoSkim = false,
  cardPositionLabel,
  showDeckInfo = false,
  intervalLabels,
  onVerticalDragMove,
  onVerticalDragEnd,
  onSpeakFace,
  onOpenDeck,
}: ReelCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState(0);
  const [dragWidth, setDragWidth] = useState(380);

  const pointerState = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    lastTime: number;
    velocityX: number;
    velocityY: number;
    axis: 'none' | 'x' | 'y';
  } | null>(null);

  const safeFaceIndex = Math.min(Math.max(faceIndex, 0), Math.max(faces.length - 1, 0));
  const { t } = useI18n();
  const statusLabel = t(getStatusKey(card.progress));

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, a, [data-no-drag="true"]')) return;

    const now = performance.now();
    pointerState.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      lastTime: now,
      velocityX: 0,
      velocityY: 0,
      axis: 'none',
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = pointerState.current;
    if (!st || !st.active || st.pointerId !== e.pointerId) return;

    const now = performance.now();
    const dt = Math.max(now - st.lastTime, 1);
    const vx = ((e.clientX - st.lastX) / dt) * 1000;
    const vy = ((e.clientY - st.lastY) / dt) * 1000;
    st.velocityX = st.velocityX * 0.4 + vx * 0.6;
    st.velocityY = st.velocityY * 0.4 + vy * 0.6;
    st.lastX = e.clientX;
    st.lastY = e.clientY;
    st.lastTime = now;

    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;

    if (st.axis === 'none') {
      const distX = Math.abs(dx);
      const distY = Math.abs(dy);
      if (distX < 8 && distY < 8) return;
      st.axis = distX > distY * 1.15 && faces.length > 1 ? 'x' : 'y';
      try {
        containerRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if capture unavailable
      }
    }

    if (st.axis === 'x') {
      const width = containerRef.current?.clientWidth || 380;
      const atStart = safeFaceIndex === 0 && dx > 0;
      const atEnd = safeFaceIndex >= faces.length - 1 && dx < 0;
      setDragWidth(width);
      setDragX(atStart || atEnd ? dx * 0.22 : dx);
    } else if (st.axis === 'y') {
      onVerticalDragMove(dy);
    }
  };

  const finishPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = pointerState.current;
    if (!st || !st.active || st.pointerId !== e.pointerId) return;
    pointerState.current = null;

    try {
      if (containerRef.current?.hasPointerCapture(e.pointerId)) {
        containerRef.current.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }

    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;

    if (st.axis === 'x') {
      const swipeLeft = (dx < -40 || (dx < -16 && st.velocityX < -420)) && st.velocityX <= 220;
      const swipeRight = (dx > 40 || (dx > 16 && st.velocityX > 420)) && st.velocityX >= -220;
      if (swipeLeft && safeFaceIndex < faces.length - 1) {
        onFaceIndexChange(safeFaceIndex + 1);
      } else if (swipeRight && safeFaceIndex > 0) {
        onFaceIndexChange(safeFaceIndex - 1);
      }
      setDragX(0);
    } else if (st.axis === 'y') {
      onVerticalDragEnd(dy, st.velocityY);
    } else if (faces.length > 1) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const relX = e.clientX - rect.left;
      if (relX < rect.width * 0.5) {
        if (safeFaceIndex > 0) onFaceIndexChange(safeFaceIndex - 1);
      } else if (safeFaceIndex < faces.length - 1) {
        onFaceIndexChange(safeFaceIndex + 1);
      }
    }
  };

  const activePullStyle =
    pullRating !== 0
      ? { label: ratingLabel(t, pullRating), color: RATING_COLORS[pullRating] }
      : null;
  const maxFaceIdx = Math.max(faces.length - 1, 0);
  const liveFaceProgress =
    dragX !== 0
      ? Math.min(Math.max(safeFaceIndex - dragX / Math.max(dragWidth, 1), 0), maxFaceIdx)
      : safeFaceIndex;

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      className="relative w-full h-full rounded-2xl bg-card border border-border  overflow-hidden select-none touch-none flex flex-col justify-between"
    >
      {isAutoSkim && (
        <div className="absolute top-0 inset-x-0 h-1 bg-muted z-30">
          <motion.div
            key={`${card.id}-${safeFaceIndex}`}
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 3, ease: 'linear' }}
            className="h-full bg-primary"
          />
        </div>
      )}

      {/* Top Overlay Header */}
      <div className="relative z-20 flex items-center justify-between px-5 pt-5 pb-2 gap-2">
        <div className="flex items-center flex-wrap gap-1.5 min-w-0">
          <span className="px-2.5 py-1 rounded-md bg-muted text-muted-foreground text-xs font-medium shrink-0">
            {statusLabel}
          </span>
          {reasonTag && (
            <span className="px-2.5 py-1 rounded-md bg-muted text-muted-foreground text-[10px] font-semibold tracking-wide shrink-0 truncate max-w-[120px]">
              {reasonTag}
            </span>
          )}
        </div>

        {faces.length > 1 && (
          <div className="flex items-center gap-1.5" data-no-drag="true">
            {faces.map((f, idx) => {
              const factor = Math.max(0, Math.min(1, 1 - Math.abs(liveFaceProgress - idx)));
              return (
                <button
                  key={`${f.idx}-${idx}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFaceIndexChange(idx);
                  }}
                  aria-label={fieldLabel(t, f.label)}
                  style={{
                    width: `${6 + factor * 14}px`,
                    transition:
                      dragX === 0 ? 'width 200ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
                  }}
                  className="relative h-1.5 rounded-full overflow-hidden bg-muted-foreground/30 hover:bg-muted-foreground/50 cursor-pointer"
                >
                  <span
                    style={{
                      opacity: factor,
                      transition:
                        dragX === 0 ? 'opacity 200ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
                    }}
                    className="absolute inset-0 rounded-md bg-primary"
                  />
                </button>
              );
            })}
          </div>
        )}

        {cardPositionLabel && (
          <div className="text-[11px] font-semibold text-muted-foreground/60 tabular-nums shrink-0">
            {cardPositionLabel}
          </div>
        )}
      </div>

      {isViewingHistory && (
        <div className="mx-5 mt-1 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1.5 text-[11px] font-semibold z-20">
          <History className="w-3.5 h-3.5" />
          <span>{t('reel.reviewing_earlier')}</span>
        </div>
      )}

      {/* Horizontal Carousel Stage */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div
          className="h-full flex"
          style={{
            width: `${Math.max(faces.length, 1) * 100}%`,
            transform: `translate3d(calc(-${(safeFaceIndex * 100) / Math.max(faces.length, 1)}% + ${dragX}px), 0, 0)`,
            transition:
              dragX === 0
                ? 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)'
                : 'none',
          }}
        >
          {faces.map((face, idx) => (
            <div
              key={`${card.id}-${face.idx}-${idx}`}
              style={{ width: `${100 / Math.max(faces.length, 1)}%` }}
              className="h-full flex flex-col items-center justify-center px-7 sm:px-9 py-6 text-center overflow-y-auto no-scrollbar relative"
            >
              <div className="mb-3 text-xs font-medium text-muted-foreground/60">
                {fieldLabel(t, face.label)}
              </div>

              {face.mediaKind === 'image' ? (
                <img
                  src={face.content}
                  alt={fieldLabel(t, face.label)}
                  draggable={false}
                  className="max-w-full max-h-[300px] rounded-lg object-contain "
                />
              ) : face.mediaKind === 'audio' ? (
                <button
                  type="button"
                  data-no-drag="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSpeakFace(face);
                  }}
                  className="w-24 h-24 rounded-md bg-primary text-white flex items-center justify-center  hover:scale-105 active:scale-95 transition-transform cursor-pointer"
                >
                  <Play className="w-10 h-10 fill-current ml-1" />
                </button>
              ) : (
                <h2
                  className={`font-semibold tracking-tight leading-snug text-foreground break-words max-w-full ${
                    face.content.length > 90
                      ? 'text-xl sm:text-2xl'
                      : face.content.length > 40
                        ? 'text-2xl sm:text-3xl'
                        : 'text-3xl sm:text-4xl'
                  }`}
                >
                  {face.content ? <MathText text={face.content} label={face.label} /> : '—'}
                </h2>
              )}

              {face.mediaKind === 'text' && face.content && (
                <button
                  type="button"
                  data-no-drag="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSpeakFace(face);
                  }}
                  className="mt-5 w-10 h-10 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-center transition-transform hover:scale-105 cursor-pointer"
                  aria-label={t('common.speak')}
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Reels Attribution */}
      {showDeckInfo && (
      <div className="relative z-20 px-6 pb-5 pt-2 flex items-center justify-between bg-gradient-to-t from-background/85 via-background/30 to-transparent">
        <div
          data-no-drag={onOpenDeck ? 'true' : undefined}
          onClick={onOpenDeck}
          className={`flex items-center gap-2.5 min-w-0 flex-1 ${
            onOpenDeck ? 'cursor-pointer group' : ''
          }`}
        >
          <span className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-base shrink-0">
            {deck?.icon || '📚'}
          </span>
          <div className="min-w-0 flex-1">
            <span className="block text-sm font-semibold truncate text-foreground group-hover:underline">
              {deck?.title || t('reel.fallback_deck')}
            </span>
            {deck?.subject && (
              <span className="block text-[11px] font-semibold text-muted-foreground truncate capitalize">
                {deck.subject.replace(/-/g, ' ')}
              </span>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Vertical Pull-to-Rate FSRS Overlay */}
      {activePullStyle && (
        <div
          style={{
            borderColor: activePullStyle.color,
            backgroundColor: `${activePullStyle.color}14`,
          }}
          className="absolute inset-0 z-30 pointer-events-none border-4 rounded-2xl flex flex-col items-center justify-end pb-20 px-5 transition-colors"
        >
          <div
            style={{ backgroundColor: activePullStyle.color }}
            className="px-5 py-2.5 rounded-md text-white  flex items-center gap-2.5"
          >
            <span className="text-base font-semibold tracking-tight">{activePullStyle.label}</span>
            {intervalLabels && pullRating !== 0 && (
              <span className="text-xs font-semibold opacity-90">{intervalLabels[pullRating]}</span>
            )}
          </div>

          <div className="mt-3 flex items-center gap-1.5 bg-background/95 px-3 py-1.5 rounded-md border border-border ">
            {[Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].map((r) => {
              const meta = { label: ratingLabel(t, r), color: RATING_COLORS[r] };
              const active = r === pullRating;
              return (
                <div
                  key={r}
                  style={{
                    backgroundColor: active ? meta.color : 'transparent',
                    color: active ? '#fff' : meta.color,
                  }}
                  className="px-2.5 py-0.5 rounded-md text-xs font-medium"
                >
                  {meta.label}
                </div>
              );
            })}
          </div>

        </div>
      )}
    </div>
  );
}
