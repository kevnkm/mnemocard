import {
  DEFAULT_FIELD_LANG,
  effectiveFieldLang,
  FIELD_LANGUAGES,
  normalizeLang,
  type FieldConfig,
} from '@mnemocard/core';
import { HybridInferenceMode } from './types';

/** Output languages Chrome's Prompt API accepts. */
const ON_DEVICE_OUTPUT_LANGS: ReadonlySet<string> = new Set(['de', 'en', 'es', 'fr', 'ja']);

/** Takes a tag ("ko", "fr-FR") or an English name ("French"). */
export function toLangCode(language: string | undefined): string {
  const name = language?.trim().toLowerCase();
  const named = FIELD_LANGUAGES.find((l) => l.english.toLowerCase() === name);
  return named?.code ?? normalizeLang(language);
}

/** Languages the model writes for a deck's fields. Media and notation fields have none. */
export function fieldOutputLangs(fields: readonly FieldConfig[]): string[] {
  return fields.flatMap((f) => effectiveFieldLang(f) ?? []);
}

export interface InferencePlan {
  mode: HybridInferenceMode;
  /** Declared to the on-device model as `expectedOutputs`. */
  onDeviceLangs: string[];
}

/**
 * Picks where a request may run, given the languages it has to write. If the
 * on-device model doesn't support one of them, the request goes to the cloud.
 * ONLY_ON_DEVICE is never overridden, so text stays on the device and the model
 * does its best with the languages it can be told about.
 */
export function planInference(
  mode: HybridInferenceMode,
  outputLangs: readonly string[]
): InferencePlan {
  const requested = [...new Set(outputLangs)];
  const supported = requested.filter((lang) => ON_DEVICE_OUTPUT_LANGS.has(lang));
  const onDeviceLangs = supported.length > 0 ? supported : [DEFAULT_FIELD_LANG];
  const needsCloud =
    supported.length < requested.length && mode !== HybridInferenceMode.ONLY_ON_DEVICE;
  return { mode: needsCloud ? HybridInferenceMode.ONLY_IN_CLOUD : mode, onDeviceLangs };
}
