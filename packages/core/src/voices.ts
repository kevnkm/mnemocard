/** The parts of a browser `SpeechSynthesisVoice` used to rank it. */
export interface VoiceLike {
  name: string;
  lang: string;
  voiceURI: string;
  localService: boolean;
  default: boolean;
}

/** Apple's Eloquence and effect voices, which sound robotic or are jokes. */
const NOVELTY_VOICE_NAMES: ReadonlySet<string> = new Set(
  (
    'eddy,flo,grandma,grandpa,reed,rocko,sandy,shelley,albert,bad news,bahh,bells,boing,' +
    'bubbles,cellos,fred,good news,jester,junior,kathy,organ,ralph,superstar,trinoids,' +
    'whisper,wobble,zarvox'
  ).split(',')
);

/** Region to prefer when the requested language doesn't name one. */
const DEFAULT_REGIONS: Readonly<Record<string, string>> = {
  de: 'de',
  es: 'es',
  fr: 'fr',
  it: 'it',
  ja: 'jp',
  ko: 'kr',
  nl: 'nl',
  pt: 'br',
};

function splitTag(tag: string): { base: string; region: string | undefined } {
  const [base = '', ...rest] = tag.toLowerCase().replace(/_/g, '-').split('-');
  return { base, region: rest.at(-1) };
}

function isNovelty(voice: VoiceLike): boolean {
  const name = voice.name.split(' (')[0]!.trim().toLowerCase();
  return NOVELTY_VOICE_NAMES.has(name) || voice.voiceURI.includes('eloquence');
}

/** Browsers don't report voice quality, so it's read from the name. */
function qualityScore(voice: VoiceLike): number {
  const label = `${voice.name} ${voice.voiceURI}`.toLowerCase();
  if (/premium|natural|neural/.test(label)) return 3;
  if (/enhanced/.test(label) || voice.name.startsWith('Google ')) return 2;
  return 1;
}

/**
 * The best voice for a language tag, or undefined to leave the choice to the
 * browser. Quality comes first, then region, then installed voices over online
 * ones because they start sooner. Chinese must match the region exactly, since
 * a Hong Kong voice speaks Cantonese.
 */
export function pickVoice<T extends VoiceLike>(
  voices: readonly T[],
  lang: string,
  options: { localOnly?: boolean } = {}
): T | undefined {
  const wanted = splitTag(lang);
  const region = wanted.region ?? DEFAULT_REGIONS[wanted.base];
  const rank = (v: T): number[] => [
    qualityScore(v),
    Number(splitTag(v.lang).region === region),
    Number(v.localService),
    Number(v.default),
  ];

  return voices
    .filter((v) => {
      const tag = splitTag(v.lang);
      if (tag.base !== wanted.base) return false;
      if (wanted.base === 'zh' && tag.region !== region) return false;
      if (options.localOnly && !v.localService) return false;
      return !isNovelty(v);
    })
    .sort((a, b) => {
      const left = rank(a);
      const right = rank(b);
      const i = left.findIndex((score, index) => score !== right[index]);
      return i === -1 ? 0 : right[i]! - left[i]!;
    })[0];
}
