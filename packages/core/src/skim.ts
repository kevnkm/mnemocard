import type { AnswerSide, FieldConfig, FieldType, MnemonicRole } from './types';
import { Rating } from './srs';

export type SkimMediaKind = 'video' | 'image' | 'audio' | 'text';

export interface SkimFace {
  idx: number;
  label: string;
  type: FieldType;
  mediaKind: SkimMediaKind;
  lang?: string;
  content: string;
  role: MnemonicRole;
  isPrompt?: boolean;
  isAnswer?: boolean;
  isMnemonic?: boolean;
}

export interface SkimCardInput {
  id: string;
  content?: (string | null)[] | null;
}

export const SKIM_CANCEL_THRESHOLD_PX = 64;
export const SKIM_FLICK_MIN_PULL_PX = 20;

/**
 * Minimum time a card must be on screen before an unrated flick-past counts as
 * a review (Again). Faster than this is just scrolling by and records nothing.
 */
export const SKIM_MIN_DWELL_MS = 2000;
export const SKIM_FLICK_VELOCITY_PX_S = 500;
export const SKIM_CLASSIC_ADVANCE_PX = 72;

export interface SkimPullThresholds {
  cancel: number;
  hard: number;
  good: number;
  easy: number;
  maxPull: number;
}

export function getSkimPullThresholds(viewportHeight: number): SkimPullThresholds {
  const maxPull = Math.min(Math.max(viewportHeight * 0.44, 240), 340);
  return {
    cancel: Math.max(SKIM_CANCEL_THRESHOLD_PX, Math.round(maxPull * 0.25)),
    hard: Math.round(maxPull * 0.48),
    good: Math.round(maxPull * 0.7),
    easy: Math.round(maxPull * 0.9),
    maxPull,
  };
}

export function resolvePullRating(pullUpPx: number, thresholds: SkimPullThresholds): Rating | 0 {
  if (pullUpPx < thresholds.cancel) return 0;
  if (pullUpPx >= thresholds.easy) return Rating.Easy;
  if (pullUpPx >= thresholds.good) return Rating.Good;
  if (pullUpPx >= thresholds.hard) return Rating.Hard;
  return Rating.Again;
}

export function resolveReleaseRating(
  pullUpPx: number,
  upwardVelocityPxPerSec: number,
  thresholds: SkimPullThresholds
): Rating | 0 {
  const live = resolvePullRating(pullUpPx, thresholds);
  if (live !== 0) return live;
  if (upwardVelocityPxPerSec >= SKIM_FLICK_VELOCITY_PX_S && pullUpPx >= SKIM_FLICK_MIN_PULL_PX) {
    return Rating.Again;
  }
  return 0;
}

const MNEMONIC_LABEL_KEYWORDS = ['mnemonic', 'story', 'acronym', 'analogy', 'root'];

function isMnemonicLabel(rawLabel: string | undefined): boolean {
  if (!rawLabel) return false;
  const lower = rawLabel.toLowerCase();
  return MNEMONIC_LABEL_KEYWORDS.some((kw) => lower.includes(kw));
}

function defaultResolveLabel(rawLabel: string | undefined, idx: number): string {
  if (rawLabel && rawLabel.trim()) return rawLabel;
  if (idx === 0) return 'Term';
  if (idx === 1) return 'Definition';
  return `Field ${idx + 1}`;
}

export function detectMediaKind(type: FieldType | string | undefined, content: string): SkimMediaKind {
  if (type === 'video' || type === 'image' || type === 'audio') return type;
  const trimmed = content.trim();
  if (/^(https?:\/\/|data:|\/)/i.test(trimmed)) {
    if (/\.(mp4|webm|mov)(\?.*)?$/i.test(trimmed)) return 'video';
    if (/\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(trimmed)) return 'image';
    if (/\.(mp3|wav|m4a|aac|ogg|opus)(\?.*)?$/i.test(trimmed)) return 'audio';
  }
  return 'text';
}

export function buildSkimFaces(
  card: SkimCardInput | null | undefined,
  fieldConfigs?: FieldConfig[] | null,
  answerSide: AnswerSide = 'term',
  resolveLabel: (rawLabel: string | undefined, idx: number) => string = defaultResolveLabel
): SkimFace[] {
  if (!card) return [];

  const contentList = Array.isArray(card.content) ? card.content : [];
  const configs = Array.isArray(fieldConfigs) ? fieldConfigs : [];
  const totalSlots = Math.max(configs.length, contentList.length, 2);

  const allFaces: SkimFace[] = [];
  for (let idx = 0; idx < totalSlots; idx++) {
    const cfg = configs[idx];
    const rawContent = contentList[idx] ?? '';
    const trimmed = typeof rawContent === 'string' ? rawContent : String(rawContent ?? '');
    const fieldType = cfg?.type ?? 'text';
    allFaces.push({
      idx,
      label: resolveLabel(cfg?.label, idx),
      type: fieldType,
      mediaKind: detectMediaKind(fieldType, trimmed),
      lang: cfg?.lang,
      content: trimmed,
      role: cfg?.role ?? (idx === 0 ? 'subject' : idx === 1 ? 'target' : 'none'),
      isMnemonic: isMnemonicLabel(cfg?.label),
    });
  }

  const subjectIdx = Math.max(0, allFaces.findIndex((f) => f.role === 'subject'));
  const targetFound = allFaces.findIndex((f, i) => i !== subjectIdx && f.role === 'target');
  const targetIdx = targetFound !== -1 ? targetFound : allFaces.length > 1 ? (subjectIdx === 0 ? 1 : 0) : 0;

  let promptIdx = answerSide === 'term' ? targetIdx : subjectIdx;
  let answerIdx = answerSide === 'term' ? subjectIdx : targetIdx;

  const hasContent = (f: SkimFace | undefined) => Boolean(f && f.content.trim().length > 0);
  if (!hasContent(allFaces[promptIdx]) && hasContent(allFaces[answerIdx])) {
    [promptIdx, answerIdx] = [answerIdx, promptIdx];
  }

  const tagged = allFaces.map((f) => ({
    ...f,
    isPrompt: f.idx === promptIdx,
    isAnswer: f.idx === answerIdx && f.idx !== promptIdx,
  }));

  const populated = tagged.filter(hasContent);
  if (populated.length === 0) {
    return tagged[promptIdx] ? [tagged[promptIdx]!] : [];
  }

  const ordered: SkimFace[] = [];
  const seen = new Set<number>();
  const pushUnique = (face: SkimFace | undefined) => {
    if (!face || seen.has(face.idx) || !hasContent(face)) return;
    ordered.push(face);
    seen.add(face.idx);
  };

  pushUnique(tagged[promptIdx]);
  pushUnique(tagged[answerIdx]);
  for (const face of populated) pushUnique(face);
  return ordered;
}

export function getPreferredAudioFace(
  faces: SkimFace[],
  activeFaceIndex: number
): SkimFace | undefined {
  const current = faces[activeFaceIndex];
  if (current && (current.mediaKind === 'audio' || current.mediaKind === 'text')) {
    return current;
  }
  const audioFace = faces.find((f) => f.mediaKind === 'audio' && !f.isAnswer);
  if (audioFace) return audioFace;
  const anyAudio = faces.find((f) => f.mediaKind === 'audio');
  if (anyAudio) return anyAudio;
  const promptText = faces.find((f) => f.isPrompt && f.mediaKind === 'text');
  if (promptText) return promptText;
  return faces.find((f) => f.mediaKind === 'text' && !f.isAnswer) ?? current;
}
