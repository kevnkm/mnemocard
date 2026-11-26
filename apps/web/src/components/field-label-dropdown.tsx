import { useMemo } from 'react';
import { FIELD_LABEL_CATEGORIES, toFieldLabelId } from '@mnemocard/core';

import { TwoPaneDropdown } from '@/components/two-pane-dropdown';
import { fieldLabel, useI18n } from '@/i18n';

/** Picker for a field's predefined label, grouped by category. */
export function FieldLabelDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useI18n();
  const groups = useMemo(
    () =>
      FIELD_LABEL_CATEGORIES.map((c) => ({
        id: c.id,
        label: t(`fieldCategories.${c.id}`),
        items: c.labels.map((id) => ({ id, label: fieldLabel(t, id) })),
      })),
    [t]
  );
  return (
    <TwoPaneDropdown
      groups={groups}
      triggerLabel={fieldLabel(t, value)}
      selectedItemId={toFieldLabelId(value) ?? undefined}
      onSelect={(_, id) => onChange(id)}
    />
  );
}
