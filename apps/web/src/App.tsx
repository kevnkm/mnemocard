import { lazy, Suspense, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router';
import { LIBRARY_CATEGORIES } from '@mnemocard/core';

import { useI18n } from '@/i18n';
import { useWebStore } from '@/lib/local-store';

const LegalPage = lazy(() => import('@/pages/legal-page'));
const EditorPage = lazy(() => import('@/pages/editor-page'));
const ExplorePage = lazy(() => import('@/pages/explore-page'));
const DeckDetailPage = lazy(() => import('@/pages/deck-detail-page'));
const SettingsPage = lazy(() => import('@/pages/settings-page'));
const StudyPage = lazy(() => import('@/pages/study-page'));
const TestPage = lazy(() => import('@/pages/test-page'));
const TodayPage = lazy(() => import('@/pages/today-page'));
const TodayReviewPage = lazy(() => import('@/pages/today-review-page'));
const OnboardingPage = lazy(() => import('@/pages/onboarding-page'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

/**
 * Sends brand-new users (onboarding not done, nothing on their Home yet) to /welcome.
 * Waits for auth + the synced profile so a user who onboarded on another device
 * isn't bounced into onboarding. Deep links (/deck, /explore, …) are never gated.
 */
function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { preferences, profileStatus, libraryStatus, decks } = useWebStore();
  if (preferences.onboardingCompleted) return <>{children}</>;
  if (profileStatus === 'loading' || libraryStatus === 'loading') return null;
  const hasLibrary = decks.some((d) => d.inMyDecks);
  if (hasLibrary) return <>{children}</>;
  return <Navigate to="/welcome" replace />;
}

function SkimRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/study/${id}`} replace />;
}

const STATIC_TITLE_KEYS: Record<string, string> = {
  '/': 'nav.home',
  '/review': 'titles.review',
  '/welcome': 'titles.welcome',
  '/explore': 'nav.explore',
  '/create': 'nav.create',
  '/settings': 'nav.settings',
  '/terms': 'titles.terms',
  '/privacy': 'titles.privacy',
};

/** Sets the browser tab title to "MnemoCard | <page>" for the current route. */
function PageTitle() {
  const { pathname } = useLocation();
  const { decks } = useWebStore();
  const { t } = useI18n();

  useEffect(() => {
    const [, section, id, sub] = pathname.split('/');
    const deckTitle =
      id && ['deck', 'editor', 'study', 'test', 'skim'].includes(section ?? '')
        ? decks.find((d) => d.id === id)?.title
        : undefined;
    const exploreTitle =
      section === 'explore' && id
        ? sub
          ? sub.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
          : LIBRARY_CATEGORIES.find((c) => c.id === id)?.label
        : undefined;
    const staticKey = STATIC_TITLE_KEYS[pathname];
    const page = (staticKey ? t(staticKey) : undefined) ?? deckTitle ?? exploreTitle;
    document.title = page ? `MnemoCard | ${page}` : 'MnemoCard';
  }, [pathname, decks, t]);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <PageTitle />
        <Suspense fallback={null}>
          <Routes>
            <Route
              path="/"
              element={
                <OnboardingGate>
                  <TodayPage />
                </OnboardingGate>
              }
            />
            <Route path="/welcome" element={<OnboardingPage />} />
            <Route path="/review" element={<TodayReviewPage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/explore/:category" element={<ExplorePage />} />
            <Route path="/explore/:category/:subject" element={<ExplorePage />} />
            <Route path="/create" element={<EditorPage />} />
            <Route path="/editor/:id" element={<EditorPage />} />
            <Route path="/deck/:id" element={<DeckDetailPage />} />
            <Route path="/study/:id" element={<StudyPage />} />
            <Route path="/skim/:id" element={<SkimRedirect />} />
            <Route path="/test/:id" element={<TestPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/terms" element={<LegalPage kind="terms" />} />
            <Route path="/privacy" element={<LegalPage kind="privacy" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
