import { useSyncExternalStore } from 'react';
import {
  STARTER_STUDY_DECKS,
  createInitialSRSItem,
  isOwnedDeck,
  schedule,
  type AnswerSide,
  type FieldConfig,
  type LocalCardProgress,
  type Rating,
  type SRSItem,
  type StudyCard,
  type StudyDeck,
  type UserPreferences,
} from '@mnemocard/core';
import type { AuthUser, CloudDecks, CloudProfile } from './cloud-decks';
import { getFirebaseApp, getHybridAIClient, isFirebaseConfigured } from './firebase';

const STORAGE_KEYS = {
  DECKS: 'mnemocard_web_decks_v1',
  LEGACY_SETS: 'mnemocard_web_sets_v1',
  PROGRESS: 'mnemocard_web_progress_v1',
  PREFS: 'mnemocard_web_prefs_v1',
  PINNED: 'mnemocard_web_pinned_v1',
} as const;

export type DecksStatus = 'loading' | 'ready';
/** 'loading' until auth resolves and (for signed-in users) the synced profile is merged. */
export type ProfileStatus = 'loading' | 'ready';

export interface WebStoreSnapshot {
  decks: StudyDeck[];
  /** Ordered ids of the paginated public feed shown on the Explore home. */
  feedDeckIds: string[];
  /** Decks recommended from the user's onboarding subjects, keyed by `recommendedFor`. */
  recommendedDeckIds: string[];
  recommendedFor: string;
  recommendedStatus: DecksStatus;
  profileStatus: ProfileStatus;
  progressMap: Record<string, LocalCardProgress>;
  preferences: UserPreferences;
  authUser: AuthUser | null;
  currentUid: string | null;
  decksStatus: DecksStatus;
  hasMoreDecks: boolean;
  loadingMoreDecks: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  subjectIds: [],
  motivation: '',
  interests: [],
  dailyGoalMinutes: 15,
  answerSide: 'term',
  autoPlayAudio: true,
  preferredLanguage: 'en',
  onboardingCompleted: false,
  xp: 0,
  streakDays: 1,
  lastActiveDate: null,
};

function hasLegacyHardcodedInterests(parsed: Partial<UserPreferences>): boolean {
  return (
    parsed.onboardingCompleted === undefined &&
    Array.isArray(parsed.interests) &&
    parsed.interests.length === 3 &&
    parsed.interests[0] === 'RPGs' &&
    parsed.interests[1] === 'Anime' &&
    parsed.interests[2] === 'Space'
  );
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota errors
  }
}

function readPinnedSet(): Set<string> {
  const raw = readJson<string[]>(STORAGE_KEYS.PINNED, []);
  return new Set(Array.isArray(raw) ? raw : []);
}

function writePinnedSet(pinned: Set<string>): void {
  writeJson(STORAGE_KEYS.PINNED, Array.from(pinned));
}

function applyPinnedFlags(decks: StudyDeck[], pinned: Set<string>, uid: string | null): StudyDeck[] {
  return decks.map((deck) => ({
    ...deck,
    inMyDecks: isOwnedDeck(deck, uid) || pinned.has(deck.id),
  }));
}

function mergeWithStarterDecks(decks: StudyDeck[], pinned: Set<string>, uid: string | null): StudyDeck[] {
  const byId = new Map<string, StudyDeck>();
  for (const deck of decks) {
    byId.set(deck.id, deck);
  }
  // Only fall back to bundled starter decks when Firebase is unconfigured.
  if (!isFirebaseConfigured) {
    for (const starter of STARTER_STUDY_DECKS) {
      if (!byId.has(starter.id)) {
        byId.set(starter.id, starter);
      }
    }
  }
  return applyPinnedFlags(Array.from(byId.values()), pinned, uid);
}

let pinnedDeckIds: Set<string> = readPinnedSet();

function loadInitialSnapshot(): WebStoreSnapshot {
  const savedDecks =
    readJson<StudyDeck[] | null>(STORAGE_KEYS.DECKS, null) ??
    readJson<StudyDeck[] | null>(STORAGE_KEYS.LEGACY_SETS, null);
  const storedDecks = Array.isArray(savedDecks) ? savedDecks : [];
  const localDecks = storedDecks;
  const progressMap = readJson<Record<string, LocalCardProgress>>(STORAGE_KEYS.PROGRESS, {});

  for (const d of localDecks) {
    if (d.inMyDecks) pinnedDeckIds.add(d.id);
  }

  const savedPrefs = readJson<Partial<UserPreferences>>(STORAGE_KEYS.PREFS, {});
  const prefs: UserPreferences = {
    ...DEFAULT_PREFERENCES,
    ...savedPrefs,
    interests: hasLegacyHardcodedInterests(savedPrefs)
      ? []
      : Array.isArray(savedPrefs.interests)
        ? savedPrefs.interests
        : [],
  };

  return {
    decks: mergeWithStarterDecks(localDecks, pinnedDeckIds, null),
    feedDeckIds: [],
    recommendedDeckIds: [],
    recommendedFor: '',
    recommendedStatus: 'ready',
    profileStatus: isFirebaseConfigured ? 'loading' : 'ready',
    progressMap,
    preferences: prefs,
    authUser: null,
    currentUid: null,
    decksStatus: isFirebaseConfigured ? 'loading' : 'ready',
    hasMoreDecks: false,
    loadingMoreDecks: false,
  };
}

let snapshot: WebStoreSnapshot = loadInitialSnapshot();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

let cloud: CloudDecks | null = null;
let cloudReadyPromise: Promise<CloudDecks | null> | null = null;

function persistLocalDecks(decks: StudyDeck[], uid: string | null = snapshot.currentUid): void {
  if (!isFirebaseConfigured) {
    const starterIds = new Set(STARTER_STUDY_DECKS.map((d) => d.id));
    writeJson(
      STORAGE_KEYS.DECKS,
      decks.filter((d) => !starterIds.has(d.id) || d.isPublicSynced)
    );
    return;
  }
  // When Firestore is active, let Firestore's IndexedDB cache handle browsed decks;
  // only keep the user's own or pinned decks in localStorage to avoid the 5MB quota.
  writeJson(
    STORAGE_KEYS.DECKS,
    decks.filter(
      (d) =>
        isOwnedDeck(d, uid) ||
        pinnedDeckIds.has(d.id) ||
        // Auth not resolved yet: don't evict the user's own decks.
        (!uid && !d.isOfficial && Boolean(d.ownerId))
    )
  );
}

/**
 * Merges fetched decks into the deck cache. Never drops anything: the cache backs
 * the user's library (Today, study, editor) as well as Explore, which renders its
 * own ordered `feedDeckIds` list instead of the whole cache.
 */
function mergeDecksPage(local: StudyDeck[], remote: StudyDeck[], uid: string | null): StudyDeck[] {
  const mergedById = new Map<string, StudyDeck>();
  for (const deck of local) mergedById.set(deck.id, deck);
  for (const deck of remote) mergedById.set(deck.id, deck);

  const sorted = Array.from(mergedById.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  return mergeWithStarterDecks(sorted, pinnedDeckIds, uid);
}

function applyDecksPage(
  remote: StudyDeck[],
  options: { replace: boolean; hasMore: boolean; fromServer: boolean }
): void {
  const uid = snapshot.currentUid;
  const decks = mergeDecksPage(snapshot.decks, remote, uid);
  const pageIds = remote.map((d) => d.id);
  const feedDeckIds = options.replace
    ? pageIds
    : [...snapshot.feedDeckIds, ...pageIds.filter((id) => !snapshot.feedDeckIds.includes(id))];
  persistLocalDecks(decks);
  snapshot = {
    ...snapshot,
    decks,
    feedDeckIds,
    decksStatus: 'ready',
    hasMoreDecks: options.hasMore,
    loadingMoreDecks: false,
  };
  emit();
}

function mergeIntoCache(remote: StudyDeck[]): void {
  if (remote.length === 0) return;
  const decks = mergeDecksPage(snapshot.decks, remote, snapshot.currentUid);
  persistLocalDecks(decks);
  snapshot = { ...snapshot, decks };
  emit();
}

/** Fetches pinned decks that aren't cached locally (e.g. pinned on an older build). */
async function hydratePinnedDecks(client: CloudDecks): Promise<void> {
  const known = new Set(snapshot.decks.map((d) => d.id));
  const missing = Array.from(pinnedDeckIds).filter((id) => !known.has(id));
  if (missing.length === 0) return;
  const fetched = await Promise.all(missing.map((id) => client.fetchDeck(id)));
  mergeIntoCache(fetched.filter((d): d is StudyDeck => d !== null));
}

/** Fetches the signed-in user's own decks directly instead of paging the whole feed. */
let hydratedOwnerUid: string | null = null;
async function hydrateOwnedDecks(client: CloudDecks, uid: string): Promise<void> {
  if (hydratedOwnerUid === uid) return;
  hydratedOwnerUid = uid;
  const owned = await client.fetchOwnedDecks(uid);
  if (snapshot.currentUid === uid) mergeIntoCache(owned);
}

function applyAuthChange(user: AuthUser | null): void {
  const uid = user?.uid ?? null;
  const decks = applyPinnedFlags(snapshot.decks, pinnedDeckIds, uid);
  snapshot = {
    ...snapshot,
    decks,
    authUser: user,
    currentUid: uid,
    profileStatus: uid && cloud ? 'loading' : 'ready',
  };
  emit();
  if (uid && cloud) {
    void hydrateOwnedDecks(cloud, uid);
    void syncProfile(cloud, uid);
  }
}

function toCloudProfile(prefs: UserPreferences): CloudProfile {
  return {
    subjectIds: prefs.subjectIds ?? [],
    motivation: prefs.motivation ?? '',
    interests: prefs.interests,
    dailyGoalMinutes: prefs.dailyGoalMinutes,
    onboardingCompleted: prefs.onboardingCompleted === true,
  };
}

/**
 * On sign-in: if the account already finished onboarding (e.g. on another device),
 * adopt its answers; otherwise upload what this browser has, so onboarding done
 * while anonymous carries over to the account.
 */
async function syncProfile(client: CloudDecks, uid: string): Promise<void> {
  const remote = await client.fetchProfile(uid);
  if (snapshot.currentUid !== uid) return;
  if (remote?.onboardingCompleted) {
    const nextPrefs: UserPreferences = { ...snapshot.preferences, ...remote };
    writeJson(STORAGE_KEYS.PREFS, nextPrefs);
    snapshot = { ...snapshot, preferences: nextPrefs, profileStatus: 'ready' };
  } else {
    if (snapshot.preferences.onboardingCompleted) {
      void client.saveProfile(uid, toCloudProfile(snapshot.preferences));
    }
    snapshot = { ...snapshot, profileStatus: 'ready' };
  }
  emit();
}

const PROFILE_KEYS = [
  'subjectIds',
  'motivation',
  'interests',
  'dailyGoalMinutes',
  'onboardingCompleted',
] as const satisfies readonly (keyof UserPreferences)[];

let profileSaveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleProfileSave(): void {
  if (!cloud || !snapshot.currentUid) return;
  if (profileSaveTimer) clearTimeout(profileSaveTimer);
  profileSaveTimer = setTimeout(() => {
    profileSaveTimer = null;
    const uid = snapshot.currentUid;
    if (cloud && uid) void cloud.saveProfile(uid, toCloudProfile(snapshot.preferences));
  }, 600);
}

if (typeof window !== 'undefined' && isFirebaseConfigured) {
  cloudReadyPromise = import('./cloud-decks')
    .then(({ startCloudDecks }) => {
      getHybridAIClient(); // Sets up App Check before Firestore and Auth make requests.
      cloud = startCloudDecks(getFirebaseApp(), {
        onDecksPage: applyDecksPage,
        onAuthChange: applyAuthChange,
      });
      void hydratePinnedDecks(cloud);
      return cloud;
    })
    .catch((err) => {
      console.warn('[Firestore] Deck sync unavailable', err);
      snapshot = { ...snapshot, decksStatus: 'ready', profileStatus: 'ready' };
      emit();
      return null;
    });
}

export function subscribeWebStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getWebStoreSnapshot(): WebStoreSnapshot {
  return snapshot;
}

export function useWebStore(): WebStoreSnapshot {
  return useSyncExternalStore(subscribeWebStore, getWebStoreSnapshot, getWebStoreSnapshot);
}

export async function signInWithGoogle(): Promise<AuthUser | null> {
  const client = cloud ?? (await cloudReadyPromise);
  if (!client) return null;
  return client.signInWithGoogle();
}

export async function signOutWebUser(): Promise<void> {
  const client = cloud ?? (await cloudReadyPromise);
  if (!client) return;
  await client.signOut();
}

export async function loadMoreWebDecks(): Promise<void> {
  if (!snapshot.hasMoreDecks || snapshot.loadingMoreDecks) return;
  const client = cloud ?? (await cloudReadyPromise);
  if (!client) return;
  snapshot = { ...snapshot, loadingMoreDecks: true };
  emit();
  await client.loadMore();
}

export async function fetchWebDeckById(deckId: string): Promise<StudyDeck | null> {
  const existing = snapshot.decks.find((d) => d.id === deckId);
  if (existing) return existing;
  const client = cloud ?? (await cloudReadyPromise);
  if (!client) return null;
  const fetched = await client.fetchDeck(deckId);
  if (!fetched) return null;
  const decks = mergeDecksPage(snapshot.decks, [fetched], snapshot.currentUid);
  snapshot = { ...snapshot, decks };
  emit();
  return fetched;
}

export async function searchWebDecks(queryText: string): Promise<StudyDeck[]> {
  const client = cloud ?? (await cloudReadyPromise);
  if (!client) return [];
  const results = await client.searchDecks(queryText);
  if (results.length > 0) {
    const decks = mergeDecksPage(snapshot.decks, results, snapshot.currentUid);
    snapshot = { ...snapshot, decks };
    emit();
  }
  return results;
}

export async function fetchWebDecksByFilter(filter: {
  category?: string;
  subject?: string;
}): Promise<StudyDeck[]> {
  const client = cloud ?? (await cloudReadyPromise);
  if (!client) return [];
  const results = await client.fetchByFilter(filter);
  if (results.length > 0) {
    const decks = mergeDecksPage(snapshot.decks, results, snapshot.currentUid);
    snapshot = { ...snapshot, decks };
    emit();
  }
  return results;
}

export interface SaveWebDeckInput {
  id?: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  subject?: string;
  fieldConfigs: FieldConfig[];
  cards: { id?: string; content: string[] }[];
}

export function saveWebDeck(input: SaveWebDeckInput): StudyDeck {
  if (isFirebaseConfigured && !snapshot.authUser) {
    throw new Error('Sign in with Google to create or edit decks.');
  }
  const now = new Date().toISOString();
  const existing = input.id ? snapshot.decks.find((d) => d.id === input.id) : undefined;
  const deckId = existing?.id ?? `deck-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const uid = snapshot.currentUid ?? undefined;

  const cards: StudyCard[] = input.cards.map((c, idx) => ({
    id: c.id && !c.id.startsWith('draft-') ? c.id : `${deckId}-card-${idx}-${Date.now()}`,
    deckId,
    content: c.content,
    orderIndex: idx,
    createdAt: now,
    updatedAt: now,
  }));

  const savedDeck: StudyDeck = {
    id: deckId,
    title: input.title.trim(),
    description: input.description.trim(),
    icon: input.icon || '📚',
    color: input.color || '#FF7060',
    category: input.category || 'other',
    subject: input.subject || input.category || 'general',
    tags: [input.category || 'other'],
    fieldConfigs: input.fieldConfigs,
    cards,
    isOfficial: false,
    ownerId: existing?.ownerId ?? uid,
    inMyDecks: true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  pinnedDeckIds.add(deckId);
  writePinnedSet(pinnedDeckIds);

  const nextDecks = existing
    ? snapshot.decks.map((d) => (d.id === deckId ? savedDeck : d))
    : [savedDeck, ...snapshot.decks];

  persistLocalDecks(nextDecks);
  cloud?.save(savedDeck);
  snapshot = { ...snapshot, decks: nextDecks };
  emit();
  return savedDeck;
}

export function duplicateWebDeck(deckId: string): StudyDeck | null {
  const source = snapshot.decks.find((d) => d.id === deckId);
  if (!source) return null;
  return saveWebDeck({
    title: `${source.title} (Copy)`,
    description: source.description,
    icon: source.icon,
    color: source.color,
    category: source.category,
    subject: source.subject,
    fieldConfigs: source.fieldConfigs,
    cards: source.cards.map((c) => ({ content: [...c.content] })),
  });
}

export function deleteWebDeck(deckId: string): void {
  const target = snapshot.decks.find((d) => d.id === deckId);
  const nextDecks = snapshot.decks.filter((d) => d.id !== deckId);
  const nextProgress = { ...snapshot.progressMap };
  for (const [cardId, prog] of Object.entries(nextProgress)) {
    if (prog.deckId === deckId) delete nextProgress[cardId];
  }
  pinnedDeckIds.delete(deckId);
  writePinnedSet(pinnedDeckIds);
  persistLocalDecks(nextDecks);
  if (target && isOwnedDeck(target, snapshot.currentUid)) {
    cloud?.remove(deckId);
  }
  snapshot = { ...snapshot, decks: nextDecks, progressMap: nextProgress };
  writeJson(STORAGE_KEYS.PROGRESS, nextProgress);
  emit();
}

export function recordWebCardReview(
  deckId: string,
  cardId: string,
  rating: Rating
): LocalCardProgress {
  const existing = snapshot.progressMap[cardId];
  const baseItem: SRSItem = existing
    ? {
        stability: existing.stability,
        difficulty: existing.difficulty,
        elapsed_days: existing.elapsedDays,
        scheduled_days: existing.scheduledDays,
        reps: existing.reps,
        lapses: existing.lapses,
        state: existing.state,
        last_review_at: existing.lastReviewAt,
      }
    : createInitialSRSItem();

  const { item: nextItem, next_review_at } = schedule(baseItem, rating);
  const nextProgress: LocalCardProgress = {
    cardId,
    deckId,
    stability: nextItem.stability,
    difficulty: nextItem.difficulty,
    elapsedDays: nextItem.elapsed_days,
    scheduledDays: nextItem.scheduled_days,
    reps: nextItem.reps,
    lapses: nextItem.lapses,
    state: nextItem.state,
    lastReviewAt: nextItem.last_review_at,
    nextReviewAt: next_review_at.toISOString(),
  };

  const nextMap = { ...snapshot.progressMap, [cardId]: nextProgress };
  const today = new Date().toISOString().slice(0, 10);
  const prevDate = snapshot.preferences.lastActiveDate;
  const streakDays =
    prevDate === today
      ? snapshot.preferences.streakDays
      : snapshot.preferences.streakDays + (prevDate ? 1 : 0);

  const nextPrefs: UserPreferences = {
    ...snapshot.preferences,
    xp: snapshot.preferences.xp + (rating >= 3 ? 15 : 5),
    streakDays,
    lastActiveDate: today,
  };

  snapshot = { ...snapshot, progressMap: nextMap, preferences: nextPrefs };
  writeJson(STORAGE_KEYS.PROGRESS, nextMap);
  writeJson(STORAGE_KEYS.PREFS, nextPrefs);
  emit();
  return nextProgress;
}

export function formatWebInterval(
  progress: LocalCardProgress | undefined,
  rating: Rating
): string {
  const baseItem: SRSItem = progress
    ? {
        stability: progress.stability,
        difficulty: progress.difficulty,
        elapsed_days: progress.elapsedDays,
        scheduled_days: progress.scheduledDays,
        reps: progress.reps,
        lapses: progress.lapses,
        state: progress.state,
        last_review_at: progress.lastReviewAt,
      }
    : createInitialSRSItem();
  const { item } = schedule(baseItem, rating);
  if (rating === 1 && item.scheduled_days <= 0) return '<1d';
  const days = Math.max(1, Math.round(item.stability));
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

export function updateWebPreferences(patch: Partial<UserPreferences>): void {
  const nextPrefs = { ...snapshot.preferences, ...patch };
  snapshot = { ...snapshot, preferences: nextPrefs };
  writeJson(STORAGE_KEYS.PREFS, nextPrefs);
  emit();
  if (PROFILE_KEYS.some((key) => key in patch)) scheduleProfileSave();
}

function subjectsKey(subjectIds: readonly string[]): string {
  return [...subjectIds].sort().join(',');
}

/**
 * Loads decks for the user's chosen subjects (one `in` query) into the cache and
 * records their ids. No-op when the same subject set is already loaded or loading.
 */
export async function loadRecommendedDecks(subjectIds: readonly string[]): Promise<void> {
  const key = subjectsKey(subjectIds);
  if (snapshot.recommendedFor === key) return;
  if (!key) {
    snapshot = { ...snapshot, recommendedFor: '', recommendedDeckIds: [], recommendedStatus: 'ready' };
    emit();
    return;
  }
  snapshot = { ...snapshot, recommendedFor: key, recommendedDeckIds: [], recommendedStatus: 'loading' };
  emit();

  const wanted = new Set(subjectIds.map((s) => s.toLowerCase()));
  let results: StudyDeck[];
  const client = cloud ?? (await cloudReadyPromise);
  if (client) {
    results = await client.fetchBySubjects([...wanted]);
  } else {
    results = snapshot.decks.filter((d) => wanted.has(d.subject.toLowerCase()));
  }
  if (snapshot.recommendedFor !== key) return; // subjects changed meanwhile

  // Official decks first, then newest.
  const ordered = [...results].sort(
    (a, b) =>
      Number(Boolean(b.isOfficial)) - Number(Boolean(a.isOfficial)) ||
      b.createdAt.localeCompare(a.createdAt)
  );
  const decks = mergeDecksPage(snapshot.decks, ordered, snapshot.currentUid);
  snapshot = {
    ...snapshot,
    decks,
    recommendedDeckIds: ordered.map((d) => d.id),
    recommendedStatus: 'ready',
  };
  emit();
}

export function setWebAnswerSide(side: AnswerSide): void {
  updateWebPreferences({ answerSide: side });
}

export function toggleWebDeckInMyDecks(deckId: string, forceState?: boolean): void {
  const currentlyPinned = pinnedDeckIds.has(deckId);
  const nextState = forceState ?? !currentlyPinned;
  if (nextState) {
    pinnedDeckIds.add(deckId);
  } else {
    pinnedDeckIds.delete(deckId);
  }
  writePinnedSet(pinnedDeckIds);

  const nextDecks = applyPinnedFlags(snapshot.decks, pinnedDeckIds, snapshot.currentUid);
  snapshot = { ...snapshot, decks: nextDecks };
  emit();
}

export function resetWebStore(): void {
  for (const deck of snapshot.decks) {
    if (isOwnedDeck(deck, snapshot.currentUid)) {
      cloud?.remove(deck.id);
    }
  }
  pinnedDeckIds = new Set();
  writePinnedSet(pinnedDeckIds);

  const nextDecks = mergeWithStarterDecks([], pinnedDeckIds, snapshot.currentUid);
  const nextPrefs = { ...DEFAULT_PREFERENCES };
  snapshot = {
    decks: nextDecks,
    feedDeckIds: snapshot.feedDeckIds,
    recommendedDeckIds: [],
    recommendedFor: '',
    recommendedStatus: 'ready',
    profileStatus: snapshot.profileStatus,
    progressMap: {},
    preferences: nextPrefs,
    authUser: snapshot.authUser,
    currentUid: snapshot.currentUid,
    decksStatus: 'ready',
    hasMoreDecks: snapshot.hasMoreDecks,
    loadingMoreDecks: false,
  };
  writeJson(STORAGE_KEYS.DECKS, []);
  writeJson(STORAGE_KEYS.PROGRESS, {});
  writeJson(STORAGE_KEYS.PREFS, nextPrefs);
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEYS.LEGACY_SETS);
    window.localStorage.removeItem('mnemocard_web_catalog_v1');
  }
  emit();
}
