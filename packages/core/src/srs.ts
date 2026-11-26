/**
 * Standalone FSRS v4.5 spaced-repetition scheduler.
 * Zero external dependencies so web and React Native run identical scheduling locally.
 */

export const Rating = {
  Again: 1,
  Hard: 2,
  Good: 3,
  Easy: 4,
} as const;
export type Rating = (typeof Rating)[keyof typeof Rating];

export const State = {
  New: 0,
  Learning: 1,
  Review: 2,
  Relearning: 3,
} as const;
export type State = (typeof State)[keyof typeof State];

export interface SRSItem {
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: State;
  last_review_at: string | null;
}

export interface ReviewResult {
  item: SRSItem;
  next_review_at: Date;
}

const DEFAULT_PARAMS = [
  0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34,
  1.26, 0.29, 2.61,
] as const;

export function createInitialSRSItem(): SRSItem {
  return {
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: State.New,
    last_review_at: null,
  };
}

function initStability(rating: Rating): number {
  const val = DEFAULT_PARAMS[rating - 1] ?? 0.4;
  return Math.max(val, 0.1);
}

function initDifficulty(rating: Rating): number {
  const p4 = DEFAULT_PARAMS[4];
  const p5 = DEFAULT_PARAMS[5];
  return Math.min(Math.max(p4 - (rating - 3) * p5, 1), 10);
}

function nextStability(d: number, s: number, r: number, rating: Rating): number {
  const p8 = DEFAULT_PARAMS[8];
  const p9 = DEFAULT_PARAMS[9];
  const p10 = DEFAULT_PARAMS[10];
  const p11 = DEFAULT_PARAMS[11];
  const p12 = DEFAULT_PARAMS[12];
  const p13 = DEFAULT_PARAMS[13];
  const p15 = DEFAULT_PARAMS[15];
  const p16 = DEFAULT_PARAMS[16];

  if (rating === Rating.Again) {
    return Math.min(p11 * Math.pow(s, -p12) * (Math.exp(p13 * (1 - r)) - 1), s);
  }

  const hardPenalty = rating === Rating.Hard ? p15 : 1;
  const easyBonus = rating === Rating.Easy ? p16 : 1;

  return (
    s *
    (1 +
      Math.exp(p8) *
        (11 - d) *
        Math.pow(s, -p9) *
        (Math.exp(p10 * (1 - r)) - 1) *
        hardPenalty *
        easyBonus)
  );
}

function meanReversion(init: number, current: number): number {
  const p7 = DEFAULT_PARAMS[7];
  return p7 * init + (1 - p7) * current;
}

function nextDifficulty(d: number, rating: Rating): number {
  const p6 = DEFAULT_PARAMS[6];
  const p4 = DEFAULT_PARAMS[4];
  const nextD = d - p6 * (rating - 3);
  return Math.min(Math.max(meanReversion(p4, nextD), 1), 10);
}

function forgettingCurve(elapsed: number, stability: number): number {
  return Math.pow(0.9, elapsed / stability);
}

export function schedule(item: SRSItem, rating: Rating, now: Date = new Date()): ReviewResult {
  const nextItem: SRSItem = { ...item };
  const lastReview = item.last_review_at ? new Date(item.last_review_at) : now;
  const elapsedDays =
    item.state === State.New
      ? 0
      : Math.max(0, (now.getTime() - lastReview.getTime()) / (1000 * 60 * 60 * 24));

  const retrievability = forgettingCurve(elapsedDays, item.stability || 0.1);

  if (item.state === State.New) {
    nextItem.stability = initStability(rating);
    nextItem.difficulty = initDifficulty(rating);
    nextItem.state = rating === Rating.Again ? State.Learning : State.Review;
  } else if (item.state === State.Learning || item.state === State.Relearning) {
    if (rating === Rating.Again) {
      nextItem.stability = initStability(Rating.Again);
      nextItem.difficulty = initDifficulty(Rating.Again);
    } else {
      nextItem.stability = nextStability(item.difficulty, item.stability, retrievability, rating);
      nextItem.difficulty = nextDifficulty(item.difficulty, rating);
      nextItem.state = State.Review;
    }
  } else if (rating === Rating.Again) {
    nextItem.lapses += 1;
    nextItem.stability = nextStability(item.difficulty, item.stability, retrievability, Rating.Again);
    nextItem.difficulty = nextDifficulty(item.difficulty, Rating.Again);
    nextItem.state = State.Relearning;
  } else {
    nextItem.stability = nextStability(item.difficulty, item.stability, retrievability, rating);
    nextItem.difficulty = nextDifficulty(item.difficulty, rating);
  }

  nextItem.reps += 1;
  nextItem.elapsed_days = elapsedDays;
  const interval = Math.max(1, Math.round(nextItem.stability));
  nextItem.scheduled_days = interval;
  nextItem.last_review_at = now.toISOString();

  const nextReviewAt = new Date(now);
  nextReviewAt.setDate(nextReviewAt.getDate() + interval);

  return { item: nextItem, next_review_at: nextReviewAt };
}

export function formatIntervalDays(days: number): string {
  if (days < 1) return '<1d';
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.round(months / 12)}y`;
}
