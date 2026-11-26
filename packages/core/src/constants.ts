/**
 * Icons referenced from shared data (categories, motivations, daily goals), as
 * lucide icon names (https://lucide.dev). Each app maps these to its lucide package.
 */
export type AppIconName =
  | 'book-open'
  | 'brain'
  | 'briefcase'
  | 'flame'
  | 'flask-conical'
  | 'globe'
  | 'graduation-cap'
  | 'heart'
  | 'landmark'
  | 'layout-grid'
  | 'message-circle-more'
  | 'plane'
  | 'sigma'
  | 'target'
  | 'zap';

export interface Category {
  id: string;
  label: string;
  emoji: string;
  icon: AppIconName;
  subjects: string[];
}

export interface InterestCategory {
  id: string;
  label: string;
  emoji: string;
  items: string[];
}

export interface MotivationOption {
  id: string;
  label: string;
  icon: AppIconName;
}

export interface DailyGoal {
  id: string;
  label: string;
  minutes: number;
  icon: AppIconName;
}

export const REQUIRED_INTERESTS = 3;

export const BRAND_CORAL = '#FF7060';
export const BRAND_CORAL_SOFT = '#FE968D';

export const DECK_THEME_COLORS = [
  '#FF7060',
  '#3B82F6',
  '#10B981',
  '#8B5CF6',
  '#F59E0B',
  '#EC4899',
  '#14B8A6',
  '#6366F1',
] as const;

export const DECK_ICONS = [
  '🧠',
  '📚',
  '🗣️',
  '🔬',
  '🌎',
  '⚡',
  '🎯',
  '🧪',
  '🎵',
  '💻',
] as const;

export const LIBRARY_CATEGORIES: Category[] = [
  {
    id: 'languages',
    label: 'Languages',
    emoji: '🗣️',
    icon: 'globe',
    subjects: ['japanese', 'korean', 'spanish', 'french', 'german', 'chinese', 'english'],
  },
  {
    id: 'science',
    label: 'Science',
    emoji: '🔬',
    icon: 'flask-conical',
    subjects: ['biology', 'chemistry', 'physics', 'neuroscience', 'computer-science', 'astronomy'],
  },
  {
    id: 'exams',
    label: 'Exams',
    emoji: '🎓',
    icon: 'graduation-cap',
    subjects: ['gre', 'sat', 'mcat', 'ielts', 'toefl', 'jlpt'],
  },
  {
    id: 'math',
    label: 'Math',
    emoji: '📐',
    icon: 'sigma',
    subjects: ['calculus', 'linear-algebra', 'statistics', 'discrete-math', 'probability'],
  },
  {
    id: 'humanities',
    label: 'Humanities',
    emoji: '🏛️',
    icon: 'landmark',
    subjects: ['history', 'philosophy', 'psychology', 'economics', 'literature'],
  },
  {
    id: 'other',
    label: 'Other',
    emoji: '✨',
    icon: 'layout-grid',
    subjects: ['music-theory', 'cooking', 'business', 'trivia'],
  },
];

export const INTEREST_CATEGORIES: InterestCategory[] = [
  {
    id: 'gaming',
    label: 'Gaming',
    emoji: '🕹️',
    items: ['RPGs', 'Minecraft', 'Valorant', 'Nintendo', 'E-Sports', 'Indie Games', 'PC Gaming'],
  },
  {
    id: 'movies',
    label: 'TV & Movies',
    emoji: '🎬',
    items: ['Anime', 'Sci-Fi', 'Fantasy', 'Documentaries', 'Studio Ghibli', 'Dramas', 'Crime Shows'],
  },
  {
    id: 'music',
    label: 'Music',
    emoji: '🎶',
    items: ['Lo-Fi', 'K-Pop', 'J-Pop', 'Rock', 'Jazz', 'Classical', 'Hip Hop'],
  },
  {
    id: 'sports',
    label: 'Sports & Fitness',
    emoji: '⚽',
    items: ['Soccer', 'Basketball', 'Running', 'Tennis', 'Martial Arts', 'Gym', 'Swimming'],
  },
  {
    id: 'outdoors',
    label: 'Outdoors',
    emoji: '⛺',
    items: ['Hiking', 'Camping', 'Cycling', 'Nature', 'Parks', 'Road Trips'],
  },
  {
    id: 'staying_in',
    label: 'Staying In & Cafes',
    emoji: '☕',
    items: ['Cooking', 'Baking', 'Coffee', 'Ramen', 'Reading', 'Board Games'],
  },
  {
    id: 'science_tech',
    label: 'Science & Tech',
    emoji: '🚀',
    items: ['Space', 'Robotics', 'Dinosaurs', 'Coding', 'Architecture', 'Puzzles'],
  },
  {
    id: 'other',
    label: 'Creative & Culture',
    emoji: '✨',
    items: ['Drawing', 'Photography', 'Podcasts', 'Animals', 'Mythology', 'Superheroes'],
  },
];

export const MOTIVATIONS: MotivationOption[] = [
  { id: 'exam', label: 'Pass an exam', icon: 'graduation-cap' },
  { id: 'career', label: 'Boost my career', icon: 'briefcase' },
  { id: 'travel', label: 'For travel', icon: 'plane' },
  { id: 'personal', label: 'Personal growth', icon: 'heart' },
  { id: 'school', label: 'School studies', icon: 'book-open' },
  { id: 'brain', label: 'Brain training', icon: 'brain' },
  { id: 'culture', label: 'Connect with culture', icon: 'globe' },
  { id: 'other', label: 'Other reasons', icon: 'message-circle-more' },
];

export const DAILY_GOALS: DailyGoal[] = [
  { id: '5', label: 'Casual', minutes: 5, icon: 'target' },
  { id: '15', label: 'Regular', minutes: 15, icon: 'flame' },
  { id: '30', label: 'Serious', minutes: 30, icon: 'graduation-cap' },
  { id: '60', label: 'Intense', minutes: 60, icon: 'zap' },
];

const SUBJECT_ACRONYMS = new Set(['gre', 'sat', 'mcat', 'ielts', 'toefl', 'jlpt']);

/** Format a subject slug like `computer-science` or `jlpt` into a display label. */
export function formatSubjectLabel(subjectId: string): string {
  if (!subjectId) return '';
  if (SUBJECT_ACRONYMS.has(subjectId.toLowerCase())) {
    return subjectId.toUpperCase();
  }
  return subjectId
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Look up the display label for a category id. */
export function getCategoryLabel(categoryId: string): string {
  return LIBRARY_CATEGORIES.find((c) => c.id === categoryId)?.label ?? categoryId;
}

/** Look up the display label for an onboarding motivation id. */
export function getMotivationLabel(motivationId: string): string {
  return MOTIVATIONS.find((m) => m.id === motivationId)?.label ?? motivationId;
}
