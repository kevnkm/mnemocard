import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { LogOut, Settings } from 'lucide-react';

import { StableLabel } from '@/components/stable-label';
import { useI18n } from '@/i18n';
import { isFirebaseConfigured } from '@/lib/firebase';
import { signInWithGoogle, signOutWebUser, useWebStore } from '@/lib/local-store';

export function Navbar() {
  const location = useLocation();
  const { t } = useI18n();
  const { authUser } = useWebStore();
  const [authBusy, setAuthBusy] = useState(false);

  const navItems = [
    { to: '/', label: t('nav.home') },
    { to: '/explore', label: t('nav.explore') },
    { to: '/create', label: t('nav.create') },
  ];

  const handleSignIn = async () => {
    setAuthBusy(true);
    try {
      await signInWithGoogle();
    } catch {
      /* popup closed or blocked */
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 glass-panel">
      <div className="mx-auto max-w-5xl px-3 sm:px-6 h-12 flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-5 min-w-0">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight shrink-0">
            <img src="/mnemocard.svg" alt="MnemoCard" className="w-6 h-6 shrink-0" />
            <span className="hidden sm:inline font-display text-lg">MnemoCard</span>
          </Link>

          <nav className="flex items-center gap-0.5 sm:gap-1 min-w-0">
            {navItems.map((item) => {
              const active =
                item.to === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={`px-2 sm:px-2.5 h-8 flex items-center rounded-md text-sm whitespace-nowrap transition-colors ${
                    active
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <StableLabel>{item.label}</StableLabel>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <a
            href="https://github.com/kevnkm/mnemocard"
            target="_blank"
            rel="noreferrer"
            aria-label={t('nav.github')}
            title="GitHub"
            className="hidden min-[400px]:flex w-8 h-8 rounded-md items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
          <Link
            to="/settings"
            aria-label={t('nav.settings')}
            className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
              location.pathname === '/settings'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Settings className="w-4 h-4" />
          </Link>

          {isFirebaseConfigured &&
            (authUser ? (
              <div className="flex items-center gap-1 pl-1">
                {authUser.photoURL ? (
                  <img
                    src={authUser.photoURL}
                    alt={authUser.displayName ?? ''}
                    title={authUser.displayName ?? authUser.email ?? ''}
                    referrerPolicy="no-referrer"
                    className="w-6 h-6 rounded-full border border-border object-cover"
                  />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-muted text-xs font-medium flex items-center justify-center">
                    {(authUser.displayName ?? authUser.email ?? 'U').slice(0, 1).toUpperCase()}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void signOutWebUser()}
                  aria-label={t('auth.sign_out')}
                  title={t('auth.sign_out')}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={authBusy}
                onClick={() => void handleSignIn()}
                className="ml-1 h-7 px-2 sm:px-2.5 rounded-md border border-border text-xs font-medium whitespace-nowrap hover:bg-muted cursor-pointer disabled:opacity-60"
              >
                <StableLabel>{t('auth.sign_in')}</StableLabel>
              </button>
            ))}
        </div>
      </div>
    </header>
  );
}
