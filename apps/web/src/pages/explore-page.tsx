import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import {
  ChevronRight,
  FlaskConical,
  Globe,
  GraduationCap,
  Landmark,
  LayoutGrid,
  Search,
  Sigma,
} from 'lucide-react';
import {
  LIBRARY_CATEGORIES,
  isOwnedDeck,
  resolveDeckColor,
  type AppIconName,
  type StudyDeck,
} from '@mnemocard/core';

import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { DeckListSkeleton } from '@/components/skeleton';
import { useI18n } from '@/i18n';
import { isFirebaseConfigured } from '@/lib/firebase';
import {
  fetchWebDecksByFilter,
  loadMoreWebDecks,
  loadRecommendedDecks,
  searchWebDecks,
  toggleWebDeckInMyDecks,
  useWebStore,
} from '@/lib/local-store';

const ESTIMATED_ROW_HEIGHT = 65;
const FOR_YOU_LIMIT = 8;

const CATEGORY_ICONS: Partial<Record<AppIconName, React.ComponentType<{ className?: string }>>> = {
  globe: Globe,
  'flask-conical': FlaskConical,
  'graduation-cap': GraduationCap,
  sigma: Sigma,
  landmark: Landmark,
  'layout-grid': LayoutGrid,
};

function formatSubjectLabel(subject: string): string {
  const UPPER = new Set(['gre', 'sat', 'mcat', 'ielts', 'toefl', 'jlpt']);
  if (UPPER.has(subject.toLowerCase())) return subject.toUpperCase();
  return subject
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** One Explore list row; shared by the plain and virtualized lists. */
function DeckRow({ deck, owned }: { deck: StudyDeck; owned: boolean }) {
  const { t } = useI18n();
  const color = resolveDeckColor(deck.color);
  return (
    <>
      <Link to={`/deck/${deck.id}`} className="flex items-center gap-3 min-w-0 flex-1 group">
        <div
          style={{ backgroundColor: `${color}1A` }}
          className="w-9 h-9 rounded-md flex items-center justify-center text-lg shrink-0"
        >
          {deck.icon || '📚'}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate group-hover:underline">
            {deck.title}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {t('common.cards_count', { count: deck.cards.length })}
            {deck.description ? ` · ${deck.description}` : ''}
          </div>
        </div>
      </Link>
      {!owned && (
        <button
          type="button"
          onClick={() => toggleWebDeckInMyDecks(deck.id)}
          className={`h-8 px-3 rounded-md border border-border text-xs font-medium cursor-pointer shrink-0 ${
            deck.inMyDecks ? 'text-muted-foreground' : 'hover:bg-muted'
          }`}
        >
          {deck.inMyDecks ? t('common.added') : t('common.add')}
        </button>
      )}
    </>
  );
}

export default function ExplorePage() {
  const { t } = useI18n();
  const { category: categoryParam, subject: subjectParam } = useParams<{
    category?: string;
    subject?: string;
  }>();
  const {
    decks,
    feedDeckIds,
    currentUid,
    decksStatus,
    hasMoreDecks,
    loadingMoreDecks,
    preferences,
    profileStatus,
    recommendedDeckIds,
    recommendedStatus,
  } = useWebStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scrollMargin, setScrollMargin] = useState(0);
  const [completedQuery, setCompletedQuery] = useState('');
  const [completedFilterKey, setCompletedFilterKey] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const activeCategory = categoryParam
    ? LIBRARY_CATEGORIES.find((c) => c.id === categoryParam) ?? null
    : null;
  const activeSubject =
    activeCategory && subjectParam && activeCategory.subjects.includes(subjectParam)
      ? subjectParam
      : null;

  const filterKey = activeCategory ? `${activeCategory.id}/${activeSubject ?? ''}` : '';
  const loadingFilter = Boolean(isFirebaseConfigured && filterKey && completedFilterKey !== filterKey);

  // Fetch matching decks from Firestore whenever entering a category or subject route.
  useEffect(() => {
    if (!isFirebaseConfigured || !filterKey || !activeCategory) return;
    let active = true;
    void fetchWebDecksByFilter({
      category: activeCategory.id,
      subject: activeSubject ?? undefined,
    }).finally(() => {
      if (active) setCompletedFilterKey(filterKey);
    });
    return () => {
      active = false;
    };
  }, [filterKey, activeCategory, activeSubject]);

  const urlQuery = (searchParams.get('q') ?? '').trim().toLowerCase();
  const searching = isFirebaseConfigured && urlQuery.length >= 2 && completedQuery !== urlQuery;

  // Debounced server-side Firestore search when a query >= 2 chars is entered.
  useEffect(() => {
    if (!isFirebaseConfigured || urlQuery.length < 2) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void searchWebDecks(urlQuery).finally(() => {
        if (active) setCompletedQuery(urlQuery);
      });
    }, 280);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [urlQuery]);

  const isHome = !activeCategory && !urlQuery;
  const subjectIds = preferences.subjectIds ?? [];
  const subjectsKey = subjectIds.join(',');

  // "For you": one query for decks in the user's onboarding subjects.
  useEffect(() => {
    if (profileStatus !== 'ready' || !subjectsKey) return;
    void loadRecommendedDecks(subjectsKey.split(','));
  }, [profileStatus, subjectsKey]);

  const recommendedDecks = useMemo(() => {
    if (!isHome || !subjectsKey) return [];
    const byId = new Map(decks.map((d) => [d.id, d]));
    return recommendedDeckIds
      .flatMap((id) => byId.get(id) ?? [])
      .filter((d) => !isOwnedDeck(d, currentUid))
      .slice(0, FOR_YOU_LIMIT);
  }, [isHome, subjectsKey, decks, recommendedDeckIds, currentUid]);

  const filteredDecks = useMemo(() => {
    // Explore home shows the paginated public feed only; the deck cache also holds the
    // user's library and anything fetched by search/category/detail pages. The user's own
    // decks live on Home, and anything already under "For you" isn't repeated.
    if (isFirebaseConfigured && isHome) {
      const byId = new Map(decks.map((d) => [d.id, d]));
      const shown = new Set(recommendedDecks.map((d) => d.id));
      return feedDeckIds
        .flatMap((id) => byId.get(id) ?? [])
        .filter((d) => !shown.has(d.id) && !isOwnedDeck(d, currentUid));
    }
    let base = decks;
    if (activeCategory) {
      base = base.filter((d) => d.category.toLowerCase() === activeCategory.id);
    }
    if (activeSubject) {
      base = base.filter((d) => d.subject.toLowerCase() === activeSubject);
    }
    if (!urlQuery) return base;
    return base.filter((d) => {
      const text = `${d.title} ${d.description} ${d.category} ${d.subject} ${d.tags.join(' ')}`.toLowerCase();
      return (
        text.includes(urlQuery) ||
        d.cards.some((c) => c.content.some((val) => val.toLowerCase().includes(urlQuery)))
      );
    });
  }, [decks, feedDeckIds, recommendedDecks, currentUid, isHome, activeCategory, activeSubject, urlQuery]);

  const useVirtual = filteredDecks.length > 50;

  const virtualizer = useWindowVirtualizer({
    count: useVirtual ? filteredDecks.length : 0,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 8,
    scrollMargin,
    getItemKey: (index) => filteredDecks[index]!.id,
  });

  useLayoutEffect(() => {
    if (!useVirtual) return;
    const el = listRef.current;
    if (!el) return;
    const update = () => {
      const margin = Math.round(el.getBoundingClientRect().top + window.scrollY);
      setScrollMargin((prev) => (prev === margin ? prev : margin));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [useVirtual, activeCategory?.id, activeSubject, filteredDecks.length]);

  // Infinite scroll on unfiltered Explore home. Only auto-load after the user has scrolled
  // since the last load; otherwise a tall viewport (sentinel visible on arrival) would
  // chain-load every page. Without a scroll, the "Load more" button is the trigger.
  const scrolledSinceLoadRef = useRef(false);
  useEffect(() => {
    const onScroll = () => {
      scrolledSinceLoadRef.current = true;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMoreDecks || urlQuery || activeCategory) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && scrolledSinceLoadRef.current) {
          scrolledSinceLoadRef.current = false;
          void loadMoreWebDecks();
        }
      },
      { rootMargin: '240px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMoreDecks, urlQuery, activeCategory]);

  const ActiveIcon = activeCategory
    ? (CATEGORY_ICONS[activeCategory.icon] ?? LayoutGrid)
    : LayoutGrid;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 pt-8 pb-16 space-y-6">
        {activeCategory ? (
          <div className="space-y-4">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Link to="/explore" className="hover:text-foreground hover:underline">
                {t('nav.explore')}
              </Link>
              <ChevronRight className="w-3.5 h-3.5" />
              {activeSubject ? (
                <>
                  <Link
                    to={`/explore/${activeCategory.id}`}
                    className="hover:text-foreground hover:underline"
                  >
                    {activeCategory.label}
                  </Link>
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span className="text-foreground font-medium">
                    {formatSubjectLabel(activeSubject)}
                  </span>
                </>
              ) : (
                <span className="text-foreground font-medium">{activeCategory.label}</span>
              )}
            </nav>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <ActiveIcon className="w-5 h-5 text-foreground" />
              </div>
              <h1 className="text-xl font-semibold">
                {activeSubject ? formatSubjectLabel(activeSubject) : activeCategory.label}
              </h1>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Link
                to={`/explore/${activeCategory.id}`}
                className={`h-7 px-3 rounded-full text-xs font-medium inline-flex items-center border transition-colors ${
                  !activeSubject
                    ? 'border-foreground/40 bg-muted text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                {t('explore.all_in_category', { category: activeCategory.label })}
              </Link>
              {activeCategory.subjects.map((sub) => {
                const isSelected = activeSubject === sub;
                return (
                  <Link
                    key={sub}
                    to={`/explore/${activeCategory.id}/${sub}`}
                    className={`h-7 px-3 rounded-full text-xs font-medium inline-flex items-center border transition-colors ${
                      isSelected
                        ? 'border-foreground/40 bg-muted text-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    }`}
                  >
                    {formatSubjectLabel(sub)}
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {LIBRARY_CATEGORIES.map((cat) => {
              const Icon = CATEGORY_ICONS[cat.icon] ?? LayoutGrid;
              return (
                <Link
                  key={cat.id}
                  to={`/explore/${cat.id}`}
                  className="p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors flex items-center gap-3 group"
                >
                  <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0 text-muted-foreground group-hover:text-foreground transition-colors">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{cat.label}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {t('explore.subjects_count', { count: cat.subjects.length })}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <div className="relative">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchParams.get('q') ?? ''}
            onChange={(e) =>
              setSearchParams(e.target.value ? { q: e.target.value } : {}, { replace: true })
            }
            placeholder={t('explore.search')}
            className="w-full h-9 pl-9 pr-3 rounded-md bg-card border border-border focus:border-foreground/30 text-sm outline-none"
          />
        </div>

        {isHome && profileStatus === 'ready' && !subjectsKey && (
          <div className="p-4 rounded-lg border border-border bg-card flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="space-y-0.5">
              <div className="text-sm font-medium">{t('explore.personalize_title')}</div>
              <p className="text-xs text-muted-foreground text-balance">
                {t('explore.personalize_hint')}
              </p>
            </div>
            <Link
              to="/welcome"
              className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium inline-flex items-center justify-center shrink-0"
            >
              {t('explore.personalize_cta')}
            </Link>
          </div>
        )}

        {isHome && subjectsKey && (recommendedStatus === 'loading' || recommendedDecks.length > 0) && (
          <section className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">{t('explore.for_you')}</h2>
              <Link
                to="/settings"
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {t('explore.edit_subjects')}
              </Link>
            </div>
            {recommendedStatus === 'loading' ? (
              <DeckListSkeleton rows={3} />
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {recommendedDecks.map((deck) => (
                  <li key={deck.id} className="flex items-center gap-3 py-3">
                    <DeckRow deck={deck} owned={false} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="space-y-2">
          {isHome && isFirebaseConfigured && (
            <h2 className="text-sm font-medium">{t('explore.newest')}</h2>
          )}

          {decksStatus === 'loading' ||
          (isHome && profileStatus === 'loading') ||
          (filteredDecks.length === 0 && (searching || loadingFilter)) ? (
            <DeckListSkeleton />
          ) : filteredDecks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center text-balance">
              {urlQuery || activeCategory ? t('explore.no_match') : t('explore.empty')}
            </p>
          ) : !useVirtual ? (
            <ul className="divide-y divide-border border-y border-border">
              {filteredDecks.map((deck) => (
                <li key={deck.id} className="flex items-center gap-3 py-3">
                  <DeckRow deck={deck} owned={isOwnedDeck(deck, currentUid)} />
                </li>
              ))}
            </ul>
          ) : (
            <div
              ref={listRef}
              style={{ height: virtualizer.getTotalSize() }}
              className="relative w-full border-y border-border"
            >
              {virtualizer.getVirtualItems().map((item) => {
                const deck = filteredDecks[item.index]!;
                return (
                  <div
                    key={item.key}
                    data-index={item.index}
                    ref={virtualizer.measureElement}
                    style={{ transform: `translateY(${item.start - scrollMargin}px)` }}
                    className="absolute top-0 left-0 w-full flex items-center gap-3 py-3 border-b border-border last:border-b-0"
                  >
                    <DeckRow deck={deck} owned={isOwnedDeck(deck, currentUid)} />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {hasMoreDecks && !urlQuery && !activeCategory && (
          <div ref={sentinelRef} className="flex justify-center pt-2">
            <button
              type="button"
              disabled={loadingMoreDecks}
              onClick={() => void loadMoreWebDecks()}
              className="h-9 px-4 rounded-md border border-border text-sm font-medium hover:bg-muted cursor-pointer disabled:opacity-60"
            >
              {loadingMoreDecks ? t('common.loading_decks') : t('explore.load_more')}
            </button>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
