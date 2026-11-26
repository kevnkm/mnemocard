import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { isOwnedDeck, resolveDeckColor } from '@mnemocard/core';

import { DeckCardList } from '@/components/deck-card-list';
import { Footer } from '@/components/footer';
import { Navbar } from '@/components/navbar';
import { useI18n } from '@/i18n';
import { isFirebaseConfigured } from '@/lib/firebase';
import {
  deleteWebDeck,
  duplicateWebDeck,
  fetchWebDeckById,
  signInWithGoogle,
  toggleWebDeckInMyDecks,
  useWebStore,
} from '@/lib/local-store';

export default function DeckDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { decks, progressMap, currentUid, authUser } = useWebStore();
  const deck = decks.find((d) => d.id === id) ?? null;

  useEffect(() => {
    if (!deck && id) {
      void fetchWebDeckById(id);
    }
  }, [deck, id]);

  const studiedCount = useMemo(
    () => (deck ? deck.cards.reduce((n, c) => n + (progressMap[c.id] ? 1 : 0), 0) : 0),
    [deck, progressMap]
  );

  if (!deck) {
    return (
      <div className="min-h-dvh flex flex-col bg-background text-foreground overscroll-none">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
          <h1 className="text-lg font-semibold">{t('common.deck_not_found')}</h1>
          <Link to="/explore" className="text-sm text-muted-foreground underline">
            {t('common.back_to_library')}
          </Link>
        </div>
      </div>
    );
  }

  const color = resolveDeckColor(deck.color);
  const isOwner = isOwnedDeck(deck, currentUid);

  const handleDuplicate = async () => {
    if (isFirebaseConfigured && !authUser) {
      const signedIn = await signInWithGoogle();
      if (!signedIn) return;
    }
    const copy = duplicateWebDeck(deck.id);
    if (copy) {
      void navigate(`/deck/${copy.id}`);
    }
  };

  const handleDelete = () => {
    if (window.confirm(t('deck.confirm_delete', { title: deck.title }))) {
      deleteWebDeck(deck.id);
      void navigate('/explore');
    }
  };

  const linkBtn =
    'h-8 px-3 rounded-md border border-border text-sm font-medium flex items-center hover:bg-muted';
  const textBtn =
    'h-8 px-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted flex items-center cursor-pointer';

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      <Navbar />

      <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 pt-8 pb-16 space-y-6">
        <header className="space-y-4">
          <div className="flex items-center gap-3">
            <div
              style={{ backgroundColor: `${color}1A` }}
              className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl shrink-0"
            >
              {deck.icon || '📚'}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold truncate">{deck.title}</h1>
              <p className="text-xs text-muted-foreground">
                {t('common.cards_count', { count: deck.cards.length })} · {t('deck.studied', { count: studiedCount })}
              </p>
            </div>
          </div>

          {deck.description && (
            <p className="text-sm text-muted-foreground text-balance">{deck.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/study/${deck.id}`}
              className="h-8 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center"
            >
              {t('common.study')}
            </Link>
            <Link to={`/test/${deck.id}`} className={linkBtn}>
              {t('common.test')}
            </Link>
            {!isOwner && (
              <button
                type="button"
                onClick={() => toggleWebDeckInMyDecks(deck.id)}
                className={`${linkBtn} cursor-pointer ${deck.inMyDecks ? 'text-muted-foreground' : ''}`}
              >
                {deck.inMyDecks ? t('common.added') : t('common.add')}
              </button>
            )}
            <div className="flex items-center gap-1 ml-auto">
              {isOwner && (
                <Link to={`/editor/${deck.id}`} className={textBtn}>
                  {t('common.edit')}
                </Link>
              )}
              <button type="button" onClick={() => void handleDuplicate()} className={textBtn}>
                {t('common.duplicate')}
              </button>
              {isOwner && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className={`${textBtn} hover:!text-red-600`}
                >
                  {t('common.delete')}
                </button>
              )}
            </div>
          </div>
        </header>

        <DeckCardList deck={deck} />
      </main>

      <Footer />
    </div>
  );
}
