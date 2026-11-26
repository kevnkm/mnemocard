export type FieldType = 'text' | 'image' | 'audio' | 'video';
export type MnemonicRole = 'subject' | 'target' | 'none';
export type AnswerSide = 'term' | 'definition';

export const FIELD_LABEL_IDS = [
  'term',
  'definition',
  'translation',
  'example',
  'formula',
  'equation',
  'code',
  'mnemonics',
  'story',
  'acronym',
  'analogy',
  'character',
  'pinyin',
  'kanji',
  'romaji',
  'grammar',
  'conjugation',
  'syntax',
  'variable',
  'symbol',
  'diagram',
  'timeline',
  'date',
  'rule',
  'law',
  'key_takeaway',
  'pronunciation',
  'note',
  'context',
  'hint',
  'synonym',
  'antonym',
  'question',
  'answer',
  'reading',
  'image',
  'audio',
  'etymology',
  'latex',
  'other',
] as const;

export type FieldLabelId = (typeof FIELD_LABEL_IDS)[number];

/** Maps a stored label ("Term", "key takeaway", "key_takeaway") to its predefined id, or null if custom. */
export function toFieldLabelId(label: string): FieldLabelId | null {
  const id = label.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return (FIELD_LABEL_IDS as readonly string[]).includes(id) ? (id as FieldLabelId) : null;
}

/** Field type implied by a label ("image" -> image), or null when the label doesn't imply one. */
export function fieldTypeForLabel(label: string): FieldType | null {
  const id = toFieldLabelId(label);
  return id === 'image' || id === 'audio' ? id : null;
}

/** Groups of field labels for pickers; every FIELD_LABEL_IDS entry appears in exactly one group. */
export const FIELD_LABEL_CATEGORIES = [
  { id: 'general', icon: '📝', labels: ['term', 'definition', 'note', 'other'] },
  {
    id: 'study',
    icon: '🧠',
    labels: ['mnemonics', 'story', 'acronym', 'analogy', 'hint', 'context', 'example'],
  },
  {
    id: 'languages',
    icon: '🗣️',
    labels: [
      'translation',
      'pronunciation',
      'character',
      'pinyin',
      'kanji',
      'romaji',
      'grammar',
      'conjugation',
      'reading',
      'etymology',
      'synonym',
      'antonym',
    ],
  },
  {
    id: 'stem',
    icon: '🔬',
    labels: ['formula', 'equation', 'latex', 'code', 'syntax', 'variable', 'symbol', 'diagram'],
  },
  {
    id: 'humanities',
    icon: '⚖️',
    labels: ['timeline', 'date', 'rule', 'law', 'key_takeaway', 'question', 'answer'],
  },
  { id: 'media', icon: '🖼️', labels: ['image', 'audio'] },
] as const satisfies readonly {
  id: string;
  icon: string;
  labels: readonly FieldLabelId[];
}[];

export type FieldConfig = {
  label: string;
  type: FieldType;
  lang: string;
  role: MnemonicRole;
};

export type MnemonicType =
  | 'story'
  | 'acronym'
  | 'root'
  | 'formula'
  | 'analogy';

export type StoryMnemonic = {
  kind: 'story';
  text: string;
  keywords: string[];
  visualCue?: string;
};

export type AcronymMnemonic = {
  kind: 'acronym';
  word: string;
  items: string[];
};

export type RootMnemonic = {
  kind: 'root';
  root: string;
  meaning: string;
  origin: string;
  examples: string[];
};

export type FormulaMnemonic = {
  kind: 'formula';
  formula: string;
  explanation: string;
};

export type AnalogyMnemonic = {
  kind: 'analogy';
  comparison: string;
  explanation: string;
};

export type MnemonicPayload =
  | StoryMnemonic
  | AcronymMnemonic
  | RootMnemonic
  | FormulaMnemonic
  | AnalogyMnemonic;

export type StudyCard = {
  id: string;
  deckId: string;
  content: string[];
  orderIndex: number;
  mnemonic?: MnemonicPayload | null;
  createdAt: string;
  updatedAt: string;
};

export type StudyDeck = {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  subject: string;
  tags: string[];
  fieldConfigs: FieldConfig[];
  cards: StudyCard[];
  isOfficial?: boolean;
  ownerId?: string;
  inMyDecks?: boolean;
  isPublicSynced?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LocalCardProgress = {
  cardId: string;
  deckId: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3;
  lastReviewAt: string | null;
  nextReviewAt: string | null;
};

export type UserPreferences = {
  subjectIds?: string[];
  motivation?: string;
  interests: string[];
  dailyGoalMinutes: number;
  answerSide: AnswerSide;
  autoPlayAudio: boolean;
  preferredLanguage: string;
  onboardingCompleted?: boolean;
  xp: number;
  streakDays: number;
  lastActiveDate: string | null;
};
