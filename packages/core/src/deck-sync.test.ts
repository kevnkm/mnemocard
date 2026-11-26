import { describe, expect, it } from 'vitest';
import { buildDeckSearchKeywords, isUserDeck, mergeRemoteDecks } from './deck-sync';
import type { StudyDeck } from './types';

function deck(id: string, updatedAt = '2026-11-01T00:00:00.000Z', extra: Partial<StudyDeck> = {}): StudyDeck {
  return {
    id,
    title: id,
    description: '',
    icon: '🧠',
    color: '#FF7060',
    category: 'other',
    subject: 'general',
    tags: [],
    fieldConfigs: [],
    cards: [],
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt,
    ...extra,
  };
}

const official = deck('official', undefined, { isOfficial: true });

describe('isUserDeck', () => {
  it('distinguishes user-created decks from official seeded decks', () => {
    expect(isUserDeck(official)).toBe(false);
    expect(isUserDeck(deck('mine'))).toBe(true);
  });
});

describe('buildDeckSearchKeywords', () => {
  it('generates lowercase words and prefix tokens for title, category, subject, and tags', () => {
    const tokens = buildDeckSearchKeywords({
      title: 'Neurobiology Basics',
      category: 'science',
      subject: 'neuroscience',
      tags: ['MCAT'],
    });
    expect(tokens).toContain('ne');
    expect(tokens).toContain('neuro');
    expect(tokens).toContain('neurobiology');
    expect(tokens).toContain('science');
    expect(tokens).toContain('mcat');
  });
});

describe('mergeRemoteDecks', () => {
  it('keeps local-only decks when only the cache has answered', () => {
    const result = mergeRemoteDecks([deck('a'), official], [], { fromServer: false, serverSynced: false });
    expect(result.decks.map((d) => d.id)).toEqual(['a', 'official']);
    expect(result.uploads).toEqual([]);
    expect(result.serverSynced).toBe(false);
  });

  it('uploads local-only and locally newer decks on the first server snapshot', () => {
    const localNewer = deck('edited', '2026-11-03T00:00:00.000Z');
    const localOlder = deck('stale', '2026-11-01T00:00:00.000Z');
    const remoteOlder = deck('edited', '2026-11-02T00:00:00.000Z');
    const remoteNewer = { ...deck('stale', '2026-11-05T00:00:00.000Z'), title: 'from server' };

    const result = mergeRemoteDecks(
      [deck('local-only'), localNewer, localOlder, official],
      [remoteOlder, remoteNewer],
      { fromServer: true, serverSynced: false }
    );

    expect(result.serverSynced).toBe(true);
    expect(result.uploads.map((d) => d.id)).toEqual(['local-only', 'edited']);
    expect(result.decks.find((d) => d.id === 'edited')).toBe(localNewer);
    expect(result.decks.find((d) => d.id === 'stale')?.title).toBe('from server');
    expect(result.decks.map((d) => d.id)).toContain('official');
  });

  it('removes user decks deleted elsewhere once synced, but never official decks', () => {
    const result = mergeRemoteDecks([deck('deleted'), deck('kept'), official], [deck('kept')], {
      fromServer: true,
      serverSynced: true,
    });
    expect(result.decks.map((d) => d.id)).toEqual(['kept', 'official']);
    expect(result.uploads).toEqual([]);
  });

  it('adds decks that only exist remotely at the front', () => {
    const result = mergeRemoteDecks([deck('a')], [deck('new'), deck('a')], {
      fromServer: true,
      serverSynced: true,
    });
    expect(result.decks.map((d) => d.id)).toEqual(['new', 'a']);
  });
});
