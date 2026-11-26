import type { CSSProperties, ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

/** Sortable wrapper; children receive the drag handle to place wherever they like. */
export function SortableItem({
  id,
  handleLabel,
  className,
  style,
  children,
}: {
  id: string;
  handleLabel: string;
  className?: string;
  style?: CSSProperties;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      aria-label={handleLabel}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground/40 hover:text-foreground outline-none"
    >
      <GripVertical className="w-4 h-4" />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        transform: CSS.Transform.toString(transform),
        transition,
        position: 'relative',
        zIndex: isDragging ? 10 : undefined,
      }}
      className={`${className ?? ''} ${isDragging ? 'bg-card opacity-90' : ''}`}
    >
      {children(handle)}
    </div>
  );
}
