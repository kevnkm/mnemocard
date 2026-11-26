import type { FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  getDocsFromServer,
  initializeFirestore,
  limit,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  setDoc,
  startAfter,
  where,
  type Query,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from 'firebase/firestore';
import { buildDeckSearchKeywords, type StudyDeck } from '@mnemocard/core';

export const DECK_PAGE_SIZE = 20;

export interface AuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

/** Onboarding answers synced to `users/{uid}` so they follow a signed-in user across devices. */
export interface CloudProfile {
  subjectIds: string[];
  motivation: string;
  interests: string[];
  dailyGoalMinutes: number;
  onboardingCompleted: boolean;
}

export interface CloudDecks {
  save(deck: StudyDeck): void;
  remove(deckId: string): void;
  loadMore(): Promise<void>;
  searchDecks(queryText: string): Promise<StudyDeck[]>;
  fetchByFilter(filter: { category?: string; subject?: string }): Promise<StudyDeck[]>;
  fetchDeck(deckId: string): Promise<StudyDeck | null>;
  fetchOwnedDecks(uid: string): Promise<StudyDeck[]>;
  fetchBySubjects(subjectIds: string[]): Promise<StudyDeck[]>;
  fetchProfile(uid: string): Promise<CloudProfile | null>;
  saveProfile(uid: string, profile: CloudProfile): Promise<void>;
  signInWithGoogle(): Promise<AuthUser | null>;
  signOut(): Promise<void>;
  getAuthUser(): AuthUser | null;
}

function toAuthUser(user: User | null): AuthUser | null {
  if (!user || user.isAnonymous) return null;
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
  };
}

/**
 * Connects to the unified `decks/{deckId}` collection in Cloud Firestore.
 * - Reads are paginated (20 decks per load) to match Firestore's query limit rules.
 * - Writes require Google Auth (anonymous users can browse/study, not create/edit).
 */
export function startCloudDecks(
  app: FirebaseApp,
  callbacks: {
    onDecksPage: (decks: StudyDeck[], options: { replace: boolean; hasMore: boolean; fromServer: boolean }) => void;
    onAuthChange: (user: AuthUser | null) => void;
  }
): CloudDecks {
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  });
  const auth = getAuth(app);
  const googleProvider = new GoogleAuthProvider();

  let currentUser: AuthUser | null = null;
  let lastDoc: QueryDocumentSnapshot | null = null;
  let hasMore = true;
  let loadingMore = false;

  async function fetchInitialPage(): Promise<void> {
    const q = query(
      collection(db, 'decks'),
      orderBy('createdAt', 'desc'),
      limit(DECK_PAGE_SIZE)
    );
    try {
      const snap = await getDocsFromServer(q).catch(() => getDocs(q));
      lastDoc = snap.docs[snap.docs.length - 1] ?? null;
      hasMore = snap.docs.length === DECK_PAGE_SIZE;
      callbacks.onDecksPage(
        snap.docs.map((d) => ({ ...(d.data() as Omit<StudyDeck, 'id'>), id: d.id })),
        { replace: true, hasMore, fromServer: !snap.metadata.fromCache }
      );
    } catch (err) {
      console.warn('[Firestore] Initial deck page load failed', err);
      callbacks.onDecksPage([], { replace: false, hasMore: false, fromServer: false });
    }
  }

  void fetchInitialPage();

  // Always report the first auth event (even signed-out) so the store knows auth resolved.
  let authResolved = false;
  onAuthStateChanged(auth, (user) => {
    const mapped = toAuthUser(user);
    if (authResolved && mapped?.uid === currentUser?.uid) return;
    authResolved = true;
    currentUser = mapped;
    callbacks.onAuthChange(mapped);
  });

  return {
    getAuthUser: () => currentUser,

    async signInWithGoogle() {
      const cred = await signInWithPopup(auth, googleProvider);
      const mapped = toAuthUser(cred.user);
      currentUser = mapped;
      callbacks.onAuthChange(mapped);
      return mapped;
    },

    async signOut() {
      await signOut(auth);
      currentUser = null;
      callbacks.onAuthChange(null);
    },

    async loadMore() {
      if (!hasMore || loadingMore || !lastDoc) return;
      loadingMore = true;
      try {
        const snap = await getDocs(
          query(
            collection(db, 'decks'),
            orderBy('createdAt', 'desc'),
            startAfter(lastDoc),
            limit(DECK_PAGE_SIZE)
          )
        );
        lastDoc = snap.docs[snap.docs.length - 1] ?? lastDoc;
        hasMore = snap.docs.length === DECK_PAGE_SIZE;
        callbacks.onDecksPage(
          snap.docs.map((d) => ({ ...(d.data() as Omit<StudyDeck, 'id'>), id: d.id })),
          { replace: false, hasMore, fromServer: !snap.metadata.fromCache }
        );
      } catch (err) {
        console.warn('[Firestore] Loading more decks failed', err);
      } finally {
        loadingMore = false;
      }
    },

    async searchDecks(queryText) {
      const token = queryText
        .trim()
        .toLowerCase()
        .split(/\s+/)[0]
        ?.replace(/[^\p{L}\p{N}]+/gu, '');
      if (!token || token.length < 2) return [];
      try {
        const snap = await getDocs(
          query(
            collection(db, 'decks'),
            where('searchKeywords', 'array-contains', token.slice(0, 12)),
            limit(DECK_PAGE_SIZE)
          )
        );
        return snap.docs.map((d) => ({ ...(d.data() as Omit<StudyDeck, 'id'>), id: d.id }));
      } catch (err) {
        console.warn('[Firestore] Search query failed', err);
        return [];
      }
    },

    async fetchByFilter(filter) {
      try {
        const q = filter.subject
          ? query(
              collection(db, 'decks'),
              where('subject', '==', filter.subject),
              limit(DECK_PAGE_SIZE)
            )
          : filter.category
            ? query(
                collection(db, 'decks'),
                where('category', '==', filter.category),
                limit(DECK_PAGE_SIZE)
              )
            : query(collection(db, 'decks'), orderBy('createdAt', 'desc'), limit(DECK_PAGE_SIZE));
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({ ...(d.data() as Omit<StudyDeck, 'id'>), id: d.id }));
      } catch (err) {
        console.warn('[Firestore] Filtered deck query failed', err);
        return [];
      }
    },

    async fetchDeck(deckId) {
      try {
        const snap = await getDoc(doc(db, 'decks', deckId));
        if (!snap.exists()) return null;
        return { ...(snap.data() as Omit<StudyDeck, 'id'>), id: snap.id };
      } catch (err) {
        console.warn('[Firestore] Fetching deck failed', err);
        return null;
      }
    },

    async fetchOwnedDecks(uid) {
      // Security rules cap list queries at 25 docs, so page through by document id.
      // Equality + documentId ordering is served by single-field indexes.
      const owned: StudyDeck[] = [];
      let cursor: QueryDocumentSnapshot | null = null;
      try {
        for (;;) {
          const q: Query = cursor
            ? query(
                collection(db, 'decks'),
                where('ownerId', '==', uid),
                orderBy(documentId()),
                startAfter(cursor),
                limit(DECK_PAGE_SIZE)
              )
            : query(
                collection(db, 'decks'),
                where('ownerId', '==', uid),
                orderBy(documentId()),
                limit(DECK_PAGE_SIZE)
              );
          const snap: QuerySnapshot = await getDocs(q);
          owned.push(...snap.docs.map((d) => ({ ...(d.data() as Omit<StudyDeck, 'id'>), id: d.id })));
          if (snap.docs.length < DECK_PAGE_SIZE) break;
          cursor = snap.docs[snap.docs.length - 1]!;
        }
      } catch (err) {
        console.warn('[Firestore] Fetching owned decks failed', err);
      }
      return owned;
    },

    async fetchBySubjects(subjectIds) {
      // Firestore `in` accepts up to 30 values.
      const subjects = subjectIds.slice(0, 30);
      if (subjects.length === 0) return [];
      try {
        const snap = await getDocs(
          query(collection(db, 'decks'), where('subject', 'in', subjects), limit(DECK_PAGE_SIZE))
        );
        return snap.docs.map((d) => ({ ...(d.data() as Omit<StudyDeck, 'id'>), id: d.id }));
      } catch (err) {
        console.warn('[Firestore] Subject query failed', err);
        return [];
      }
    },

    async fetchProfile(uid) {
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (!snap.exists()) return null;
        const data = snap.data() as Partial<CloudProfile>;
        return {
          subjectIds: Array.isArray(data.subjectIds) ? data.subjectIds : [],
          motivation: typeof data.motivation === 'string' ? data.motivation : '',
          interests: Array.isArray(data.interests) ? data.interests : [],
          dailyGoalMinutes: typeof data.dailyGoalMinutes === 'number' ? data.dailyGoalMinutes : 15,
          onboardingCompleted: data.onboardingCompleted === true,
        };
      } catch (err) {
        console.warn('[Firestore] Fetching profile failed', err);
        return null;
      }
    },

    async saveProfile(uid, profile) {
      try {
        await setDoc(
          doc(db, 'users', uid),
          { ...profile, updatedAt: new Date().toISOString() },
          { merge: true }
        );
      } catch (err) {
        console.warn('[Firestore] Saving profile failed', err);
      }
    },

    save(deck) {
      if (!currentUser) return;
      const ref = doc(db, 'decks', deck.id);
      const { id, inMyDecks, ...rest } = deck;
      void id;
      void inMyDecks;
      setDoc(ref, {
        ...rest,
        cardCount: deck.cards.length,
        searchKeywords: buildDeckSearchKeywords(deck),
        ownerId: currentUser.uid,
        isOfficial: false,
        isPublicSynced: true,
      }).catch((err) => console.warn('[Firestore] Saving deck failed', err));
    },

    remove(deckId) {
      if (!currentUser) return;
      deleteDoc(doc(db, 'decks', deckId)).catch((err) =>
        console.warn('[Firestore] Deleting deck failed', err)
      );
    },
  };
}
