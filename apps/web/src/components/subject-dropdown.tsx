import { useMemo } from 'react';
import { LIBRARY_CATEGORIES, formatSubjectLabel } from '@mnemocard/core';

import { TwoPaneDropdown } from '@/components/two-pane-dropdown';

/** Category > subject picker for a deck. */
export function SubjectDropdown({
  category,
  subject,
  onChange,
}: {
  category: string;
  subject: string;
  onChange: (category: string, subject: string) => void;
}) {
  const groups = useMemo(
    () =>
      LIBRARY_CATEGORIES.map((c) => ({
        id: c.id,
        label: c.label,
        items: c.subjects.map((s) => ({ id: s, label: formatSubjectLabel(s) })),
      })),
    []
  );
  const categoryLabel = LIBRARY_CATEGORIES.find((c) => c.id === category)?.label ?? category;
  const triggerLabel = subject ? `${categoryLabel} › ${formatSubjectLabel(subject)}` : categoryLabel;
  return (
    <div className="h-7 w-fit rounded-md border border-border px-2.5 flex items-center">
      <TwoPaneDropdown
        groups={groups}
        triggerLabel={triggerLabel}
        selectedGroupId={category}
        selectedItemId={subject}
        onSelect={onChange}
        compact
      />
    </div>
  );
}
