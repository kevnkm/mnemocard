import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface TwoPaneGroup {
  id: string;
  label: string;
  items: { id: string; label: string }[];
}

/** Two-pane picker: groups on the left, the active group's items on the right. */
const VIEWPORT_MARGIN = 8;

export function TwoPaneDropdown({
  groups,
  triggerLabel,
  selectedGroupId,
  selectedItemId,
  onSelect,
  compact = false,
}: {
  groups: TwoPaneGroup[];
  triggerLabel: string;
  selectedGroupId?: string;
  selectedItemId?: string;
  onSelect: (groupId: string, itemId: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>(groups[0]?.id ?? '');
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Fixed-position the panel under the trigger, then clamp/flip it so it stays inside the viewport.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = rootRef.current?.getBoundingClientRect();
    const panel = panelRef.current?.getBoundingClientRect();
    if (!trigger || !panel) return;
    const maxLeft = window.innerWidth - panel.width - VIEWPORT_MARGIN;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(trigger.left, maxLeft));
    const below = trigger.bottom + 8;
    const fitsBelow = below + panel.height <= window.innerHeight - VIEWPORT_MARGIN;
    const above = trigger.top - 8 - panel.height;
    const top = fitsBelow || above < VIEWPORT_MARGIN ? Math.max(VIEWPORT_MARGIN, Math.min(below, window.innerHeight - panel.height - VIEWPORT_MARGIN)) : above;
    setPos({ top, left });
  }, [open, activeId]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const close = () => setOpen(false);
    const onScroll = (e: Event) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      setPos(null);
      const current =
        groups.find((g) => g.items.some((i) => i.id === selectedItemId)) ??
        groups.find((g) => g.id === selectedGroupId);
      setActiveId(current?.id ?? groups[0]?.id ?? '');
    }
    setOpen((o) => !o);
  };

  const active = groups.find((g) => g.id === activeId) ?? groups[0];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-1.5 cursor-pointer outline-none ${
          compact ? 'text-xs font-medium' : 'text-sm font-semibold'
        }`}
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
          className="fixed z-50 flex w-72 max-w-[calc(100vw-1rem)] rounded-lg border border-border bg-card text-sm"
        >
          <ul className="w-28 shrink-0 border-r border-border p-1">
            {groups.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveId(c.id)}
                  onClick={() => setActiveId(c.id)}
                  className={`w-full rounded-md px-2 py-1.5 text-left cursor-pointer ${
                    c.id === active.id
                      ? 'bg-muted text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
          <ul role="listbox" className="max-h-56 flex-1 overflow-y-auto p-1">
            {active?.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={item.id === selectedItemId}
                  onClick={() => {
                    onSelect(active.id, item.id);
                    setOpen(false);
                  }}
                  className={`w-full rounded-md px-2 py-1.5 text-left cursor-pointer hover:bg-muted ${
                    item.id === selectedItemId ? 'text-primary font-medium' : ''
                  }`}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
