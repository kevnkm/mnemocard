import type { FirebaseApp } from 'firebase/app';
import {
  ensureInitialized,
  fetchAndActivate,
  getRemoteConfig,
  getString,
  isSupported,
} from 'firebase/remote-config';
import { HybridInferenceMode } from '@mnemocard/ai';

export interface RemoteAISettings {
  cloudModel: string;
  defaultAIMode: HybridInferenceMode;
}

export const DEFAULT_AI_SETTINGS: RemoteAISettings = {
  cloudModel: 'gemini-3-flash-preview',
  defaultAIMode: HybridInferenceMode.PREFER_ON_DEVICE,
};

const KEYS = {
  CLOUD_MODEL: 'web_cloud_model',
  DEFAULT_AI_MODE: 'web_default_ai_mode',
} as const;

const HOUR_MS = 60 * 60 * 1000;

// Cloud-first modes are left out on purpose: a remote change must not send text
// off the device when the on-device model can handle it.
function parseAIMode(value: string | null): HybridInferenceMode | null {
  return value === HybridInferenceMode.PREFER_ON_DEVICE ||
    value === HybridInferenceMode.ONLY_ON_DEVICE
    ? value
    : null;
}

/** Fetches and activates Remote Config, falling back to cached values, then to the defaults. */
export async function fetchRemoteAISettings(app: FirebaseApp): Promise<RemoteAISettings> {
  try {
    if (!(await isSupported())) return DEFAULT_AI_SETTINGS;

    const remoteConfig = getRemoteConfig(app);
    remoteConfig.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 0 : HOUR_MS;
    remoteConfig.settings.fetchTimeoutMillis = 10_000;
    remoteConfig.defaultConfig = {
      [KEYS.CLOUD_MODEL]: DEFAULT_AI_SETTINGS.cloudModel,
      [KEYS.DEFAULT_AI_MODE]: DEFAULT_AI_SETTINGS.defaultAIMode,
    };

    await ensureInitialized(remoteConfig);
    try {
      await fetchAndActivate(remoteConfig);
    } catch (err) {
      console.warn('[Remote Config] Fetch failed, using cached or default values', err);
    }

    return {
      cloudModel:
        getString(remoteConfig, KEYS.CLOUD_MODEL).trim() || DEFAULT_AI_SETTINGS.cloudModel,
      defaultAIMode:
        parseAIMode(getString(remoteConfig, KEYS.DEFAULT_AI_MODE).trim()) ??
        DEFAULT_AI_SETTINGS.defaultAIMode,
    };
  } catch (err) {
    console.warn('[Remote Config] Unavailable, using default values', err);
    return DEFAULT_AI_SETTINGS;
  }
}
