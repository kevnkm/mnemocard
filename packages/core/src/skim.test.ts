import { describe, expect, it } from 'vitest';
import {
  SKIM_FLICK_MIN_PULL_PX,
  SKIM_FLICK_VELOCITY_PX_S,
  SKIM_WHEEL_DISCRETE_GAP_MS,
  SKIM_WHEEL_DOUBLE_GAP_MS,
  detectMediaKind,
  getSkimPullThresholds,
  resolvePullRating,
  resolveReleaseRating,
  resolveSkimWheelSettle,
  stepSkimWheelDown,
  type SkimWheelState,
} from './skim';
import { Rating } from './srs';

describe('getSkimPullThresholds', () => {
  it('clamps maxPull between 240 and 340', () => {
    expect(getSkimPullThresholds(100).maxPull).toBe(240);
    expect(getSkimPullThresholds(5000).maxPull).toBe(340);
  });

  it('orders thresholds cancel < hard < good < easy <= maxPull', () => {
    const t = getSkimPullThresholds(800);
    expect(t.cancel).toBeLessThan(t.hard);
    expect(t.hard).toBeLessThan(t.good);
    expect(t.good).toBeLessThan(t.easy);
    expect(t.easy).toBeLessThanOrEqual(t.maxPull);
  });
});

describe('resolvePullRating', () => {
  const t = getSkimPullThresholds(800);

  it('maps pull distance to ratings', () => {
    expect(resolvePullRating(0, t)).toBe(0);
    expect(resolvePullRating(t.cancel, t)).toBe(Rating.Again);
    expect(resolvePullRating(t.hard, t)).toBe(Rating.Hard);
    expect(resolvePullRating(t.good, t)).toBe(Rating.Good);
    expect(resolvePullRating(t.easy, t)).toBe(Rating.Easy);
  });
});

describe('resolveReleaseRating', () => {
  const t = getSkimPullThresholds(800);

  it('turns a fast short flick into Again', () => {
    expect(
      resolveReleaseRating(SKIM_FLICK_MIN_PULL_PX, SKIM_FLICK_VELOCITY_PX_S, t)
    ).toBe(Rating.Again);
  });

  it('ignores slow or tiny pulls', () => {
    expect(resolveReleaseRating(SKIM_FLICK_MIN_PULL_PX, 10, t)).toBe(0);
    expect(resolveReleaseRating(1, SKIM_FLICK_VELOCITY_PX_S, t)).toBe(0);
  });

  it('prefers the live pull rating when past the cancel zone', () => {
    expect(resolveReleaseRating(t.good, 0, t)).toBe(Rating.Good);
  });
});

describe('detectMediaKind', () => {
  it('honors an explicit field type', () => {
    expect(detectMediaKind('video', 'whatever')).toBe('video');
  });

  it('detects media from URL extensions', () => {
    expect(detectMediaKind(undefined, 'https://x.io/a.mp4?t=1')).toBe('video');
    expect(detectMediaKind(undefined, 'https://x.io/a.PNG')).toBe('image');
    expect(detectMediaKind(undefined, '/audio/a.mp3')).toBe('audio');
  });

  it('falls back to text', () => {
    expect(detectMediaKind(undefined, 'plain text')).toBe('text');
    expect(detectMediaKind(undefined, 'https://x.io/page')).toBe('text');
  });
});

describe('stepSkimWheelDown & resolveSkimWheelSettle', () => {
  const t = getSkimPullThresholds(600);
  const initial: SkimWheelState = { pull: 0, lastEventMs: 0, evalActive: false };

  it('keeps brief single scroll unrated (null eval) and commits null on settle', () => {
    const s1 = stepSkimWheelDown(initial, 100, 1000, t, false);
    expect(s1.rating).toBe(0);
    expect(s1.next.evalActive).toBe(false);

    // Continuous trackpad frames (< 40ms apart) stay in the same brief scroll
    const s2 = stepSkimWheelDown(s1.next, 80, 1016, t, false);
    expect(s2.rating).toBe(0);
    expect(s2.next.evalActive).toBe(false);

    expect(resolveSkimWheelSettle(s2.next, t, false)).toEqual({
      shouldCommit: true,
      rating: null,
    });
  });

  it('ignores tiny accidental scroll brushes', () => {
    const s1 = stepSkimWheelDown(initial, 20, 1000, t, false);
    expect(resolveSkimWheelSettle(s1.next, t, false)).toEqual({
      shouldCommit: false,
      rating: null,
    });
  });

  it('starts evaluation gauge only on double (consecutive) scroll and progresses less sensitively', () => {
    const first = stepSkimWheelDown(initial, 100, 1000, t, false);
    expect(first.rating).toBe(0);

    // Second scroll after gesture gap starts evaluation at Again
    const second = stepSkimWheelDown(
      first.next,
      100,
      1000 + SKIM_WHEEL_DOUBLE_GAP_MS,
      t,
      false
    );
    expect(second.next.evalActive).toBe(true);
    expect(second.rating).toBe(Rating.Again);

    // Further scrolling advances through Hard -> Good -> Easy with reduced sensitivity
    const third = stepSkimWheelDown(second.next, 550, 1200, t, false);
    expect(third.rating).toBe(Rating.Hard);

    const fourth = stepSkimWheelDown(third.next, 550, 1250, t, false);
    expect(fourth.rating).toBe(Rating.Good);

    const fifth = stepSkimWheelDown(fourth.next, 550, 1300, t, false);
    expect(fifth.rating).toBe(Rating.Easy);

    expect(resolveSkimWheelSettle(fifth.next, t, false)).toEqual({
      shouldCommit: true,
      rating: Rating.Easy,
    });
  });

  it('activates evaluation on fast consecutive discrete mouse wheel ticks', () => {
    const first = stepSkimWheelDown(initial, 100, 1000, t, false);
    const second = stepSkimWheelDown(
      first.next,
      100,
      1000 + SKIM_WHEEL_DISCRETE_GAP_MS,
      t,
      false
    );
    expect(second.next.evalActive).toBe(true);
    expect(second.rating).toBe(Rating.Again);
  });

  it('never activates evaluation gauge when viewing history', () => {
    const first = stepSkimWheelDown(initial, 100, 1000, t, true);
    const second = stepSkimWheelDown(
      first.next,
      100,
      1000 + SKIM_WHEEL_DOUBLE_GAP_MS,
      t,
      true
    );
    expect(second.next.evalActive).toBe(false);
    expect(second.rating).toBe(0);
    expect(resolveSkimWheelSettle(second.next, t, true)).toEqual({
      shouldCommit: true,
      rating: null,
    });
  });
});
