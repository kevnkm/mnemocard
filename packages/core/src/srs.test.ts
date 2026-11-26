import { describe, expect, it } from 'vitest';
import { Rating, State, createInitialSRSItem, formatIntervalDays, schedule } from './srs';

const T0 = new Date('2026-01-01T00:00:00Z');
const daysLater = (d: number) => new Date(T0.getTime() + d * 86_400_000);

describe('FSRS schedule', () => {
  it('starts new cards in an empty state', () => {
    const item = createInitialSRSItem();
    expect(item.state).toBe(State.New);
    expect(item.reps).toBe(0);
    expect(item.last_review_at).toBeNull();
  });

  it('moves a new card to Learning on Again and Review otherwise', () => {
    const base = createInitialSRSItem();
    expect(schedule(base, Rating.Again, T0).item.state).toBe(State.Learning);
    for (const r of [Rating.Hard, Rating.Good, Rating.Easy]) {
      expect(schedule(base, r, T0).item.state).toBe(State.Review);
    }
  });

  it('gives higher initial stability for easier ratings', () => {
    const base = createInitialSRSItem();
    const s = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].map(
      (r) => schedule(base, r, T0).item.stability
    );
    expect(s).toEqual([...s].sort((a, b) => a - b));
  });

  it('never schedules sooner than one day and returns a matching due date', () => {
    const { item, next_review_at } = schedule(createInitialSRSItem(), Rating.Again, T0);
    expect(item.scheduled_days).toBeGreaterThanOrEqual(1);
    const diff = Math.round((next_review_at.getTime() - T0.getTime()) / 86_400_000);
    expect(diff).toBe(item.scheduled_days);
  });

  it('does not mutate the input item', () => {
    const base = createInitialSRSItem();
    schedule(base, Rating.Good, T0);
    expect(base).toEqual(createInitialSRSItem());
  });

  it('increments reps and records the review time', () => {
    const first = schedule(createInitialSRSItem(), Rating.Good, T0).item;
    expect(first.reps).toBe(1);
    expect(first.last_review_at).toBe(T0.toISOString());
  });

  it('counts a lapse and enters Relearning when a Review card is forgotten', () => {
    const reviewed = schedule(createInitialSRSItem(), Rating.Good, T0).item;
    const lapsed = schedule(reviewed, Rating.Again, daysLater(reviewed.scheduled_days)).item;
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.state).toBe(State.Relearning);
    expect(lapsed.stability).toBeLessThanOrEqual(reviewed.stability);
  });

  it('grows stability across successful reviews', () => {
    let item = schedule(createInitialSRSItem(), Rating.Good, T0).item;
    let now = T0;
    for (let i = 0; i < 3; i++) {
      now = daysLater((now.getTime() - T0.getTime()) / 86_400_000 + item.scheduled_days);
      const next = schedule(item, Rating.Good, now).item;
      expect(next.stability).toBeGreaterThan(item.stability);
      item = next;
    }
  });

  it('keeps difficulty within [1, 10]', () => {
    let item = createInitialSRSItem();
    let now = T0;
    for (let i = 0; i < 30; i++) {
      item = schedule(item, Rating.Again, now).item;
      now = daysLater(i + 1);
      expect(item.difficulty).toBeGreaterThanOrEqual(1);
      expect(item.difficulty).toBeLessThanOrEqual(10);
    }
  });

  it('gives Easy a longer interval than Hard on a mature card', () => {
    const reviewed = schedule(createInitialSRSItem(), Rating.Good, T0).item;
    const now = daysLater(reviewed.scheduled_days);
    const hard = schedule(reviewed, Rating.Hard, now).item.scheduled_days;
    const easy = schedule(reviewed, Rating.Easy, now).item.scheduled_days;
    expect(easy).toBeGreaterThan(hard);
  });
});

describe('formatIntervalDays', () => {
  it.each([
    [0, '<1d'],
    [1, '1d'],
    [29, '29d'],
    [30, '1mo'],
    [180, '6mo'],
    [400, '1y'],
  ])('formats %d days as %s', (days, label) => {
    expect(formatIntervalDays(days)).toBe(label);
  });
});
