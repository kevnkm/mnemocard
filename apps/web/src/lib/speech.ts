import { pickVoice, speechForField, speechLang, type SpeakableField } from '@mnemocard/core';

/** Short enough to feel instant, long enough to skip cards flipped past. */
export const AUTO_PLAY_DELAY_MS = 60;

/** Set this localStorage key to "local" to use only installed voices. */
const VOICE_PREFERENCE_KEY = 'mnemocard.voice';

/** Errors an online voice can hit that an installed one may not. */
const VOICE_FAILURES: ReadonlySet<SpeechSynthesisErrorCode> = new Set([
  'network',
  'synthesis-failed',
  'synthesis-unavailable',
  'voice-unavailable',
]);

// The first call starts loading the voice list, so it's ready by the first playback.
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.getVoices();
}

export function detectSpeechLang(text: string, hintLang?: string): string {
  if (hintLang) return speechLang(hintLang)!;
  if (/[぀-ヿ]/.test(text)) return 'ja-JP';
  if (/[가-힯]/.test(text)) return 'ko-KR';
  if (/[一-鿿]/.test(text)) return 'zh-CN';
  if (/[àâæçéèêëîïôœùûüÿ]/i.test(text)) return 'fr-FR';
  if (/[áéíóúüñ¿¡]/i.test(text)) return 'es-ES';
  return 'en-US';
}

export function stopWebSpeech(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
}

function prefersLocalVoice(): boolean {
  if (!navigator.onLine) return true;
  try {
    return localStorage.getItem(VOICE_PREFERENCE_KEY) === 'local';
  } catch {
    return false;
  }
}

export function speakWebText(
  text: string,
  hintLang?: string,
  callbacks?: { onEnd?: () => void }
): void {
  if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    callbacks?.onEnd?.();
    return;
  }

  window.speechSynthesis.cancel();
  const lang = detectSpeechLang(text, hintLang);

  const speak = (localOnly: boolean) => {
    const utterance = new SpeechSynthesisUtterance(text);
    // English keeps the browser's own choice of voice.
    const voice = /^en\b/i.test(lang)
      ? undefined
      : pickVoice(window.speechSynthesis.getVoices(), lang, { localOnly });
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? lang;
    utterance.rate = 0.94;
    utterance.onend = () => callbacks?.onEnd?.();
    utterance.onerror = (event) => {
      if (voice && !voice.localService && VOICE_FAILURES.has(event.error)) {
        speak(true);
        return;
      }
      callbacks?.onEnd?.();
    };
    window.speechSynthesis.speak(utterance);
  };

  speak(prefersLocalVoice());
}

/** Whether a card field has anything worth reading aloud. */
export function canSpeakField(field: SpeakableField, card: readonly SpeakableField[]): boolean {
  return speechForField(field, card) !== null;
}

/**
 * Speaks a card field the way a learner wants to hear it: the word for a
 * pinyin or IPA field, words for a formula, and nothing for code.
 */
export function speakField(
  field: SpeakableField,
  card: readonly SpeakableField[],
  callbacks?: { onEnd?: () => void }
): void {
  const speech = speechForField(field, card);
  if (!speech) {
    stopWebSpeech();
    callbacks?.onEnd?.();
    return;
  }
  speakWebText(speech.text, speech.lang, callbacks);
}
