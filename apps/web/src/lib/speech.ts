import { speechLang } from '@mnemocard/core';

export function detectSpeechLang(text: string, hintLang?: string): string {
  if (hintLang) return speechLang(hintLang)!;
  if (/[\u3040-\u30ff]/.test(text)) return 'ja-JP';
  if (/[\uac00-\ud7af]/.test(text)) return 'ko-KR';
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh-CN';
  if (/[àâæçéèêëîïôœùûüÿ]/i.test(text)) return 'fr-FR';
  if (/[áéíóúüñ¿¡]/i.test(text)) return 'es-ES';
  return 'en-US';
}

export function stopWebSpeech(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
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
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = detectSpeechLang(text, hintLang);
  utterance.rate = 0.94;
  utterance.onend = () => callbacks?.onEnd?.();
  utterance.onerror = () => callbacks?.onEnd?.();
  window.speechSynthesis.speak(utterance);
}
