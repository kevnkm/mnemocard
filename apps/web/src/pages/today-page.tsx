import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Plus, Trash2 } from 'lucide-react';
import {
  buildTodayWorkspace,
  isOwnedDeck,
  resolveDeckColor,
} from '@mnemocard/core';

import { Footer } from '@/components/footer';
import { Navbar } from '@/components/navbar';
import { formatNextDue, useI18n } from '@/i18n';
import { toggleWebDeckInMyDecks, useWebStore } from '@/lib/local-store';

export default function TodayPage() {
  const { t, locale } = useI18n();
  const { decks, progressMap, currentUid } = useWebStore();
  const [scrollMargin, setScrollMargin] = useState(0);

  const workspace = useMemo(
    () => buildTodayWorkspace({ decks, progressMap, currentUid }),
    [decks, progressMap, currentUid]
  );

  const { myDecks, totalDue, totalNewInMyDecks, nextDueAt, isEmptyDesk, isAllCaughtUp } =
    workspace;

  const virtualizer = useWindowVirtualizer({
    count: myDecks.length,
    estimateSize: () => 65,
    overscan: 8,
    scrollMargin,
    getItemKey: (index) => myDecks[index]!.deck.id,
  });

  const summary = isAllCaughtUp
    ? t('home.caught_up', { when: formatNextDue(nextDueAt, locale, t) })
    : totalDue > 0
      ? t('home.due', { count: totalDue })
      : t('home.new_cards', { count: totalNewInMyDecks });

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 pt-8 pb-16 space-y-6">
        {isEmptyDesk ? (
          <div className="space-y-6">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">{t('home.empty_title')}</h1>
              <p className="text-sm text-muted-foreground text-balance">
                {t('home.empty_hint')}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                to="/create"
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> {t('home.new_deck')}
              </Link>
              <Link
                to="/explore"
                className="h-9 px-4 rounded-md border border-border text-sm font-medium flex items-center hover:bg-muted"
              >
                {t('home.browse_library')}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-xl font-semibold">{summary}</h1>
              {(totalDue > 0 || totalNewInMyDecks > 0) && (
                <Link
                  to={totalDue > 0 ? '/review?mode=due' : '/review?mode=new'}
                  className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center shrink-0"
                >
                  {totalDue > 0 ? t('home.review') : t('home.start')}
                </Link>
              )}
            </div>

            <div
              ref={(el) => {
                if (!el) return;
                const margin = Math.round(el.getBoundingClientRect().top + window.scrollY);
                if (margin !== scrollMargin) setScrollMargin(margin);
              }}
              style={{ height: virtualizer.getTotalSize() }}
              className="relative w-full border-y border-border"
            >
              {virtualizer.getVirtualItems().map((item) => {
                const { deck, dueCount, newCount, totalCount } = myDecks[item.index]!;
                const color = resolveDeckColor(deck.color);
                const status =
                  dueCount > 0
                    ? t('home.status_due', { count: dueCount })
                    : newCount > 0
                      ? t('home.status_new', { count: newCount })
                      : t('home.status_done');

                return (
                  <div
                    key={item.key}
                    data-index={item.index}
                    ref={virtualizer.measureElement}
                    style={{ transform: `translateY(${item.start - scrollMargin}px)` }}
                    className="absolute top-0 left-0 w-full flex items-center gap-3 py-3 border-b border-border last:border-b-0"
                  >
                    <Link
                      to={`/deck/${deck.id}`}
                      className="flex items-center gap-3 min-w-0 flex-1 group"
                    >
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
                        <div className="text-xs text-muted-foreground">
                          {t('common.cards_count', { count: totalCount })} · {status}
                        </div>
                      </div>
                    </Link>

                    <div className="flex items-center gap-1 shrink-0 text-xs font-medium">
                      <Link
                        to={`/study/${deck.id}`}
                        className="h-8 px-3 rounded-md flex items-center hover:bg-muted"
                      >
                        {t('common.study')}
                      </Link>
                      <Link
                        to={`/test/${deck.id}`}
                        className="h-8 px-3 rounded-md flex items-center text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        {t('common.test')}
                      </Link>
                      {!isOwnedDeck(deck, currentUid) && (
                        <button
                          type="button"
                          onClick={() => toggleWebDeckInMyDecks(deck.id, false)}
                          title={t('home.remove')}
                          aria-label={t('home.remove')}
                          className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
