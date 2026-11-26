import { useI18n } from '@/i18n';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-foreground/[0.07] ${className}`} />;
}

/** Placeholder matching a deck list row (icon, title, subtitle, action). */
export function DeckRowSkeleton() {
  return (
    <li className="flex items-center gap-3 py-3">
      <Skeleton className="w-9 h-9 shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <Skeleton className="h-8 w-14 shrink-0" />
    </li>
  );
}

export function DeckListSkeleton({ rows = 5 }: { rows?: number }) {
  const { t } = useI18n();
  return (
    <ul
      role="status"
      aria-label={t('common.loading_decks')}
      className="divide-y divide-border border-y border-border"
    >
      {Array.from({ length: rows }, (_, i) => (
        <DeckRowSkeleton key={i} />
      ))}
    </ul>
  );
}
