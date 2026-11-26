import { describe, expect, it } from 'vitest';

import { pickVoice, type VoiceLike } from './voices';

const voice = (name: string, lang: string, extra: Partial<VoiceLike> = {}): VoiceLike => ({
  name,
  lang,
  voiceURI: name,
  localService: true,
  default: false,
  ...extra,
});

const eddy = voice('Eddy (Korean (South Korea))', 'ko-KR', { default: true });
const yuna = voice('Yuna', 'ko-KR');
const google = voice('Google 한국의', 'ko-KR', { localService: false });
const enhanced = voice('Yuna (Enhanced)', 'ko-KR');

describe('pickVoice', () => {
  it('prefers a high-quality voice over a basic one', () => {
    expect(pickVoice([eddy, yuna, google], 'ko')).toBe(google);
  });

  it('prefers the installed voice when quality is equal', () => {
    expect(pickVoice([google, enhanced], 'ko')).toBe(enhanced);
  });

  it('ranks premium and natural voices highest', () => {
    const natural = voice('Microsoft SunHi Online (Natural)', 'ko-KR', { localService: false });
    expect(pickVoice([enhanced, natural], 'ko')).toBe(natural);
  });

  it('skips online voices when asked for local ones', () => {
    expect(pickVoice([google, yuna], 'ko', { localOnly: true })).toBe(yuna);
  });

  it('never picks a novelty voice', () => {
    expect(pickVoice([eddy, yuna], 'ko')).toBe(yuna);
    expect(pickVoice([eddy], 'ko')).toBeUndefined();
  });

  it('returns nothing when no voice speaks the language', () => {
    expect(pickVoice([yuna], 'th')).toBeUndefined();
  });

  it('prefers the requested or usual region', () => {
    const mexican = voice('Paulina', 'es-MX', { default: true });
    const spanish = voice('Mónica', 'es_ES');
    expect(pickVoice([mexican, spanish], 'es')).toBe(spanish);
    expect(pickVoice([mexican, spanish], 'es-MX')).toBe(mexican);
  });

  it('keeps Chinese regions apart', () => {
    const cantonese = voice('Google 粤語（香港）', 'zh-HK', { localService: false });
    const mandarin = voice('Tingting', 'zh-CN');
    expect(pickVoice([cantonese, mandarin], 'zh-CN')).toBe(mandarin);
    expect(pickVoice([cantonese, mandarin], 'zh-TW')).toBeUndefined();
  });
});
