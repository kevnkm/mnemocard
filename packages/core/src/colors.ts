const TAILWIND_BG_COLOR_MAP: Record<string, string> = {
  'bg-orange-500': '#F97316',
  'bg-amber-500': '#F59E0B',
  'bg-emerald-500': '#10B981',
  'bg-blue-500': '#3B82F6',
  'bg-purple-500': '#A855F7',
  'bg-rose-500': '#F43F5E',
  'bg-red-500': '#EF4444',
  'bg-green-500': '#22C55E',
  'bg-indigo-500': '#6366F1',
  'bg-pink-500': '#EC4899',
  'bg-teal-500': '#14B8A6',
  'bg-cyan-500': '#06B6D4',
  'bg-yellow-500': '#EAB308',
  'bg-violet-500': '#8B5CF6',
  'bg-sky-500': '#0EA5E9',
  'bg-lime-500': '#84CC16',
  'bg-fuchsia-500': '#D946EF',
};

const VALID_COLOR_RE =
  /^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\([^)]+\)|hsla?\([^)]+\))$/;

export function resolveDeckColor(color: string | null | undefined, fallback = '#FF7060'): string {
  if (!color) return fallback;
  const trimmed = color.trim();
  if (TAILWIND_BG_COLOR_MAP[trimmed]) return TAILWIND_BG_COLOR_MAP[trimmed];
  if (VALID_COLOR_RE.test(trimmed)) return trimmed;
  return fallback;
}

export function getContrastTextColor(bgColor: string): '#FFFFFF' | '#11181C' {
  const hex = bgColor.trim().replace('#', '');
  const fullHex =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(fullHex)) {
    return '#FFFFFF';
  }
  const channels = [0, 2, 4].map((i) => {
    const v = parseInt(fullHex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  return luminance > 0.45 ? '#11181C' : '#FFFFFF';
}

export function slugify(text: string): string {
  return (text || 'deck')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'deck';
}
