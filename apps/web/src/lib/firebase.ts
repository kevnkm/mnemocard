import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { HybridInferenceMode, type HybridAIClient } from '@mnemocard/ai';
import { createWebHybridAIClient } from '@mnemocard/ai/web';
import { DEFAULT_AI_SETTINGS, fetchRemoteAISettings } from './remote-config';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

const appCheckSiteKey: string | undefined =
  import.meta.env.VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY || undefined;

if (isFirebaseConfigured && !appCheckSiteKey) {
  console.warn(
    '[App Check] VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY is not set, so App Check is off. ' +
      'Firebase AI Logic cloud requests will fail once App Check is enforced.'
  );
}

function readDebugToken(): string | boolean | undefined {
  const raw = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;
  if (!raw) return undefined;
  return raw === 'true' ? true : raw;
}

let cachedApp: FirebaseApp | null = null;
let cachedAIClient: HybridAIClient | null = null;
let aiSettings = DEFAULT_AI_SETTINGS;

/** Remote Config picks the mode; without Firebase credentials there is no cloud to fall back to. */
function getAIMode(): HybridInferenceMode {
  return isFirebaseConfigured ? aiSettings.defaultAIMode : HybridInferenceMode.ONLY_ON_DEVICE;
}

export async function loadRemoteAISettings(): Promise<void> {
  if (!isFirebaseConfigured) return;
  // Creating the client first sets up App Check before any other Firebase request.
  const client = getHybridAIClient();
  aiSettings = await fetchRemoteAISettings(getFirebaseApp());
  client.setMode(getAIMode());
}

export function getFirebaseApp(): FirebaseApp {
  if (cachedApp) return cachedApp;
  if (getApps().length > 0) {
    cachedApp = getApp();
    return cachedApp;
  }

  // Fallback placeholder config allows local ONLY_ON_DEVICE Chrome Prompt API bootstrapping
  // even before a user supplies their Firebase project credentials in .env.local.
  cachedApp = initializeApp(
    isFirebaseConfigured
      ? firebaseConfig
      : {
          apiKey: 'local-demo-api-key',
          projectId: 'mnemocard-local-demo',
          appId: '1:000000000000:web:localdemo',
        }
  );
  return cachedApp;
}

export function getHybridAIClient(): HybridAIClient {
  if (cachedAIClient) return cachedAIClient;
  cachedAIClient = createWebHybridAIClient({
    firebaseApp: getFirebaseApp(),
    cloudModel: () => aiSettings.cloudModel,
    initialMode: getAIMode(),
    reCaptchaEnterpriseSiteKey: appCheckSiteKey,
    // Debug tokens are for local development only and never ship in a production build.
    appCheckDebugToken: import.meta.env.DEV ? readDebugToken() : undefined,
  });
  return cachedAIClient;
}
