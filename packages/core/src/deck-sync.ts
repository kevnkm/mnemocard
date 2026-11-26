import type { StudyDeck } from './types';

/**
 * Builds normalized lowercase search tokens (words + prefixes >= 2 chars) for
 * Firestore `array-contains` queries without needing an external search index.
 */
export function buildDeckSearchKeywords(
  deck: Pick<StudyDeck, 'title' | 'category' | 'subject' | 'tags'>,
  maxTokens = 40
): string[] {
  const tokens = new Set<string>();
  const addWord = (raw: string, withPrefixes: boolean) => {
    const clean = raw.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    if (clean.length < 2) return;
    tokens.add(clean);
    if (withPrefixes) {
      const cap = Math.min(clean.length, 12);
      for (let len = 2; len <= cap; len += 1) {
        tokens.add(clean.slice(0, len));
      }
    }
  };

  for (const word of deck.title.split(/\s+/)) {
    addWord(word, true);
  }
  if (deck.category) addWord(deck.category, true);
  if (deck.subject) addWord(deck.subject, true);
  for (const tag of deck.tags ?? []) {
    addWord(tag, true);
  }

  return Array.from(tokens).slice(0, maxTokens);
}

/** Decks the user created (as opposed to official seeded decks). */
export const isUserDeck = (deck: StudyDeck): boolean => !deck.isOfficial;

export interface DeckSyncResult {
  /** The merged deck list for the store. */
  decks: StudyDeck[];
  /** Local decks to upload: new or newer than the stored copy. */
  uploads: StudyDeck[];
  /** Whether a server snapshot has been merged yet. */
  serverSynced: boolean;
}

/**
 * Merges a snapshot of the user's synced decks into the local list.
 *
 * - Until the first server snapshot, local decks are never dropped, because a cache-only
 *   snapshot may be incomplete.
 * - On the first server snapshot, local decks that are missing remotely or have a newer
 *   `updatedAt` are kept and returned as uploads.
 * - After that, a user deck missing remotely was deleted elsewhere (such as another tab).
 * - Remote decks not yet known locally are added at the front.
 */
export function mergeRemoteDecks(
  local: StudyDeck[],
  remote: StudyDeck[],
  options: { fromServer: boolean; serverSynced: boolean }
): DeckSyncResult {
  const remoteById = new Map(remote.map((d) => [d.id, d]));
  const uploads: StudyDeck[] = [];
  let serverSynced = options.serverSynced;

  if (options.fromServer && !serverSynced) {
    serverSynced = true;
    for (const deck of local) {
      if (!isUserDeck(deck)) continue;
      const stored = remoteById.get(deck.id);
      if (!stored || deck.updatedAt > stored.updatedAt) uploads.push(deck);
    }
  }

  const keepLocal = new Set(uploads.map((d) => d.id));
  const localIds = new Set(local.map((d) => d.id));
  const merged = local.flatMap((deck) => {
    if (!isUserDeck(deck) || keepLocal.has(deck.id)) return [deck];
    const stored = remoteById.get(deck.id);
    if (stored) return [stored];
    return serverSynced ? [] : [deck];
  });

  return {
    decks: [...remote.filter((d) => !localIds.has(d.id)), ...merged],
    uploads,
    serverSynced,
  };
}
