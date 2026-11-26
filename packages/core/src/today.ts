import { State } from './srs';
import type { LocalCardProgress, StudyCard, StudyDeck } from './types';

/** A deck is owned (editable/deletable) when it was created by the current user. */
export function isOwnedDeck(
  deck: Pick<StudyDeck, 'isOfficial' | 'ownerId'>,
  currentUid?: string | null
): boolean {
  if (deck.isOfficial) return false;
  if (deck.ownerId) return Boolean(currentUid && deck.ownerId === currentUid);
  return true;
}

export type TodayItemReason = 'due' | 'learning' | 'new';

export interface TodayQueueItem {
  queueKey: string;
  card: StudyCard;
  deck: StudyDeck;
  progress?: LocalCardProgress;
  reason: TodayItemReason;
}

export interface DeckTodaySummary {
  deck: StudyDeck;
  dueCount: number;
  newCount: number;
  masteredCount: number;
  totalCount: number;
}

export interface TodayWorkspace {
  myDecks: DeckTodaySummary[];
  dueQueue: TodayQueueItem[];
  upNextQueue: TodayQueueItem[];
  totalDue: number;
  totalNewInMyDecks: number;
  reviewedTodayCount: number;
  nextDueAt: string | null;
  isEmptyDesk: boolean;
  isAllCaughtUp: boolean;
}

function hasCardContent(card: StudyCard): boolean {
  return (
    Array.isArray(card.content) &&
    card.content.some((val) => typeof val === 'string' && val.trim().length > 0)
  );
}

export function isCardDue(progress: LocalCardProgress | undefined, nowMs: number): boolean {
  if (!progress) return false;
  if (progress.state === State.Learning || progress.state === State.Relearning) {
    return true;
  }
  if (!progress.nextReviewAt) return false;
  const dueMs = Date.parse(progress.nextReviewAt);
  return Number.isFinite(dueMs) && dueMs <= nowMs;
}

export function formatNextDueLabel(nextDueAt: string | null, now = new Date()): string {
  if (!nextDueAt) return 'Scheduled';
  const diffMs = Date.parse(nextDueAt) - now.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 'Due now';
  const hours = Math.ceil(diffMs / (1000 * 60 * 60));
  if (hours <= 1) return 'In < 1 hour';
  if (hours < 24) return `In ${hours} hours`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

export function buildTodayWorkspace({
  decks,
  progressMap,
  currentUid,
  now = new Date(),
}: {
  decks: StudyDeck[];
  progressMap: Record<string, LocalCardProgress>;
  currentUid?: string | null;
  now?: Date;
}): TodayWorkspace {
  const nowMs = now.getTime();
  const startOfTodayMs = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();

  let reviewedTodayCount = 0;
  let nextDueAt: string | null = null;
  let nextDueMs = Infinity;

  for (const progress of Object.values(progressMap)) {
    if (progress.lastReviewAt) {
      const revMs = Date.parse(progress.lastReviewAt);
      if (Number.isFinite(revMs) && revMs >= startOfTodayMs) {
        reviewedTodayCount += 1;
      }
    }
    if (!isCardDue(progress, nowMs) && progress.nextReviewAt) {
      const candidateMs = Date.parse(progress.nextReviewAt);
      if (Number.isFinite(candidateMs) && candidateMs > nowMs && candidateMs < nextDueMs) {
        nextDueMs = candidateMs;
        nextDueAt = progress.nextReviewAt;
      }
    }
  }

  const myDecks: DeckTodaySummary[] = [];
  const dueQueue: TodayQueueItem[] = [];
  const upNextQueue: TodayQueueItem[] = [];

  for (const deck of decks) {
    const validCards = deck.cards.filter(hasCardContent);
    const hasProgressInDeck = validCards.some((c) => Boolean(progressMap[c.id]));
    const belongsInMyDecks =
      isOwnedDeck(deck, currentUid) || deck.inMyDecks === true || hasProgressInDeck;

    if (!belongsInMyDecks) continue;

    let dueCount = 0;
    let newCount = 0;
    let masteredCount = 0;

    for (const card of validCards) {
      const progress = progressMap[card.id];
      if (!progress) {
        newCount += 1;
        upNextQueue.push({
          queueKey: `${deck.id}:${card.id}`,
          card,
          deck,
          reason: 'new',
        });
      } else if (isCardDue(progress, nowMs)) {
        dueCount += 1;
        const reason: TodayItemReason =
          progress.state === State.Learning || progress.state === State.Relearning
            ? 'learning'
            : 'due';
        dueQueue.push({
          queueKey: `${deck.id}:${card.id}`,
          card,
          deck,
          progress,
          reason,
        });
      } else {
        masteredCount += 1;
      }
    }

    myDecks.push({
      deck,
      dueCount,
      newCount,
      masteredCount,
      totalCount: validCards.length,
    });
  }

  // Sort decks with due cards first, then unstudied new cards, then mastered decks
  myDecks.sort((a, b) => {
    if (b.dueCount !== a.dueCount) return b.dueCount - a.dueCount;
    if (b.newCount !== a.newCount) return b.newCount - a.newCount;
    return b.totalCount - a.totalCount;
  });

  // Sort dueQueue so learning/relearning cards come right before older due reviews
  dueQueue.sort((a, b) => {
    const aLearning = a.reason === 'learning' ? 0 : 1;
    const bLearning = b.reason === 'learning' ? 0 : 1;
    if (aLearning !== bLearning) return aLearning - bLearning;
    const aTime = a.progress?.nextReviewAt ? Date.parse(a.progress.nextReviewAt) : 0;
    const bTime = b.progress?.nextReviewAt ? Date.parse(b.progress.nextReviewAt) : 0;
    return aTime - bTime;
  });

  const totalDue = dueQueue.length;
  const totalNewInMyDecks = upNextQueue.length;
  const isEmptyDesk = myDecks.length === 0;
  const isAllCaughtUp =
    myDecks.length > 0 && totalDue === 0 && totalNewInMyDecks === 0;

  return {
    myDecks,
    dueQueue,
    upNextQueue,
    totalDue,
    totalNewInMyDecks,
    reviewedTodayCount,
    nextDueAt,
    isEmptyDesk,
    isAllCaughtUp,
  };
}
