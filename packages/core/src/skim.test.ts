import { describe, expect, it } from 'vitest';
import {
  SKIM_FLICK_MIN_PULL_PX,
  SKIM_FLICK_VELOCITY_PX_S,
  detectMediaKind,
  getSkimPullThresholds,
  resolvePullRating,
  resolveReleaseRating,
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
