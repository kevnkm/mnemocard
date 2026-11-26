import { StableLabel } from '@/components/stable-label';
import { useI18n } from '@/i18n';

export type StudyMode = 'skim' | 'cards';

const MODES: { id: StudyMode; labelKey: string }[] = [
  { id: 'skim', labelKey: 'common.skim' },
  { id: 'cards', labelKey: 'common.cards' },
];

export function StudyModeToggle({
  mode,
  onChange,
}: {
  mode: StudyMode;
  onChange: (mode: StudyMode) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-0.5 mr-1" role="group" aria-label={t('study.mode')}>
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          aria-pressed={mode === m.id}
          className={`h-8 px-2.5 rounded-md text-xs cursor-pointer transition-colors ${
            mode === m.id
              ? 'bg-muted text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <StableLabel>{t(m.labelKey)}</StableLabel>
        </button>
      ))}
    </div>
  );
}
