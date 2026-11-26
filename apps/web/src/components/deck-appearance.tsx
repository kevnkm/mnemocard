import { useEffect, useRef, useState } from 'react';
import { DECK_ICONS, DECK_THEME_COLORS } from '@mnemocard/core';

import { useI18n } from '@/i18n';

/** Icon chip that opens a small popover for choosing the deck icon and color. */
export function DeckAppearance({
  icon,
  color,
  onIconChange,
  onColorChange,
}: {
  icon: string;
  color: string;
  onIconChange: (icon: string) => void;
  onColorChange: (color: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('editor.appearance')}
        aria-expanded={open}
        style={{ backgroundColor: `${color}26` }}
        className="w-12 h-12 rounded-xl text-2xl flex items-center justify-center cursor-pointer outline-none"
      >
        {icon}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 w-64 max-w-[calc(100vw-2rem)] space-y-3 rounded-lg border border-border bg-card p-3">
          <div className="grid grid-cols-5 gap-1">
            {DECK_ICONS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => onIconChange(em)}
                className={`h-9 rounded-md text-lg flex items-center justify-center cursor-pointer hover:bg-muted ${
                  icon === em ? 'bg-muted' : ''
                }`}
              >
                {em}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {DECK_THEME_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onColorChange(c)}
                style={{ backgroundColor: c }}
                aria-label={t('editor.color', { color: c })}
                className={`w-6 h-6 rounded-full cursor-pointer ${
                  color === c ? 'ring-2 ring-offset-2 ring-offset-card ring-foreground' : ''
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
