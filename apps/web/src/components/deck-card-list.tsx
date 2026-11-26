import { useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { StudyDeck } from '@mnemocard/core';

import { MathText } from '@/components/math-text';
import { fieldLabel, useI18n } from '@/i18n';

const ESTIMATED_ROW_HEIGHT = 76;

/**
 * Read-only list of a deck's cards under a sticky field header. Rows are
 * windowed (only the visible ones are in the DOM), so decks with thousands of
 * cards render and scroll as smoothly as small ones.
 */
export function DeckCardList({ deck }: { deck: Pick<StudyDeck, 'cards' | 'fieldConfigs'> }) {
  const { t } = useI18n();
  const gridStyle = {
    gridTemplateColumns: `repeat(${deck.fieldConfigs.length}, minmax(0, 1fr))`,
  };

  // Distance from the top of the document to the list; kept current on every render.
  const [scrollMargin, setScrollMargin] = useState(0);

  const virtualizer = useWindowVirtualizer({
    count: deck.cards.length,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 8,
    scrollMargin,
    getItemKey: (index) => deck.cards[index]!.id,
  });

  return (
    <div>
      {/* Sticky field header (below the 48px navbar); columns match the rows. */}
      <div className="hidden sm:flex sticky top-12 z-10 items-center gap-3 h-9 border-y border-border bg-background text-xs font-medium text-muted-foreground">
        <div style={gridStyle} className="flex-1 grid gap-x-6 min-w-0">
          {deck.fieldConfigs.map((cfg, idx) => (
            <div key={idx} className="truncate capitalize">
              {fieldLabel(t, cfg.label)}
            </div>
          ))}
        </div>
      </div>

      <div
        ref={(el) => {
          if (!el) return;
          const margin = Math.round(el.getBoundingClientRect().top + window.scrollY);
          if (margin !== scrollMargin) setScrollMargin(margin);
        }}
        style={{ height: virtualizer.getTotalSize() }}
        className="relative w-full border-b border-border sm:border-t-0 border-t"
      >
        {virtualizer.getVirtualItems().map((item) => {
          const card = deck.cards[item.index]!;
          return (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{ transform: `translateY(${item.start - scrollMargin}px)` }}
              className="absolute top-0 left-0 w-full border-b border-border last:border-b-0 py-3 flex items-start gap-3"
            >
              <div
                style={gridStyle}
                className="flex-1 grid grid-cols-1 sm:[grid-template-columns:inherit] gap-x-6 gap-y-2 sm:gap-y-1 min-w-0"
              >
                {deck.fieldConfigs.map((cfg, idx) => (
                  <div key={idx} className="min-w-0">
                    <div className="sm:hidden text-[11px] text-muted-foreground capitalize mb-0.5">
                      {fieldLabel(t, cfg.label)}
                    </div>
                    {cfg.type === 'image' && card.content[idx] ? (
                      <img
                        src={card.content[idx]}
                        alt={cfg.label}
                        loading="lazy"
                        className="h-16 w-28 rounded-md object-cover border border-border"
                      />
                    ) : (
                      <div
                        className={`break-words ${
                          idx === 0 ? 'text-sm font-medium' : 'text-sm text-muted-foreground'
                        }`}
                      >
                        {card.content[idx] ? (
                          <MathText text={card.content[idx]} label={cfg.label} />
                        ) : (
                          <span className="opacity-30">—</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
