# MnemoCard

[![CI](https://github.com/kevnkm/mnemocard/actions/workflows/ci.yml/badge.svg)](https://github.com/kevnkm/mnemocard/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

**MnemoCard** is an open-source, local-first flashcard and mnemonic study companion powered by **Firebase AI Logic** hybrid inference.

It generates decks on your device with **Gemini Nano** (Chrome and Android) or **Apple Foundation Models** (iOS), and falls back to **Gemini in the cloud** through Firebase AI Logic, protected by **Firebase App Check**, when no on-device model is available.

## Platform Status

| Platform | On-device model | Cloud fallback | Status |
| --- | --- | --- | --- |
| Web (Chrome) | Gemini Nano (Prompt API) | Gemini via Firebase AI Logic | Full app |
| iOS (SwiftUI) | Apple Foundation Models | Gemini via Firebase AI Logic | Deck generation and flashcards |
| Android (Compose) | Gemini Nano (ML Kit / AICore) | Gemini via Firebase AI Logic | Deck generation and flashcards |

The web app has the full study experience (FSRS scheduling, AI semantic grading, unified Firestore deck library). The native apps currently cover hybrid deck generation and flashcard study.

## How MnemoCard Uses Firebase

| Product | Where | What it does |
| --- | --- | --- |
| Firebase AI Logic (hybrid inference) | [`packages/ai/src/web.ts`](packages/ai/src/web.ts) | Powers deck generation, per-card mnemonic generation, and semantic recall grading in `PREFER_ON_DEVICE`, `ONLY_ON_DEVICE`, or `ONLY_IN_CLOUD` mode. Streams thought summaries and reports telemetry (`on_device` vs `in_cloud`, latency, tokens, App Check). |
| App Check | [`packages/ai/src/web.ts`](packages/ai/src/web.ts), [`apps/web/src/lib/firebase.ts`](apps/web/src/lib/firebase.ts) | Protects cloud requests with reCAPTCHA Enterprise |
| Remote Config | [`apps/web/src/lib/remote-config.ts`](apps/web/src/lib/remote-config.ts) | Sets the cloud model and default inference mode without a redeploy |
| Authentication (Google) | [`apps/web/src/lib/cloud-decks.ts`](apps/web/src/lib/cloud-decks.ts) | Anyone can browse and study decks; Google Sign-In is required to create, edit, or delete decks |
| Cloud Firestore | [`apps/web/src/lib/cloud-decks.ts`](apps/web/src/lib/cloud-decks.ts), [`firestore.rules`](firestore.rules) | Stores all decks in a unified `decks/{deckId}` collection with an offline cache. Anyone can browse and study decks; security rules ensure only each deck's owner can edit or delete it. |
| Hosting | [`firebase.json`](firebase.json) | Serves the web app, deployed by [CI](.github/workflows/ci.yml) |
| AI Logic, App Check, Remote Config (iOS) | [`apps/ios/MnemoCard/HybridAI.swift`](apps/ios/MnemoCard/HybridAI.swift) | Apple Foundation Models on-device, Gemini fallback; App Attest |
| AI Logic, App Check, Remote Config (Android) | [`apps/android/app/src/main/java/com/mnemocard/app/HybridAI.kt`](apps/android/app/src/main/java/com/mnemocard/app/HybridAI.kt) | `PREFER_ON_DEVICE` with Gemini Nano; Play Integrity |
| Authentication, Firestore (iOS, Android) | [`DeckStore.swift`](apps/ios/MnemoCard/DeckStore.swift), [`DeckStore.kt`](apps/android/app/src/main/java/com/mnemocard/app/DeckStore.kt) | Same deck format and sync rules as the web app ([`deck-sync.ts`](packages/core/src/deck-sync.ts)) |

The deck generator is in [`apps/web/src/pages/editor-page.tsx`](apps/web/src/pages/editor-page.tsx). After each generation it shows how long the request took and whether it ran on-device or in the cloud.

## Why Hybrid AI

Flashcards are personal and often private, such as study notes, exam material and learning goals. MnemoCard tries the on-device model first, so that text stays on your device, answers are instant and it works offline. It goes to the cloud only when the local model is unavailable or the task needs more capability. Every result reports whether it came from `on_device` or `in_cloud`, so the app can show you where your data went.

## Highlights

- **Hybrid & On-Device AI (`@mnemocard/ai`)**: Switch between **Hybrid** (`PREFER_ON_DEVICE`), **On-Device** (`ONLY_ON_DEVICE`), and **Cloud** (`ONLY_IN_CLOUD`) modes for deck generation, per-card mnemonics, and AI semantic recall grading, with live `inferenceSource`, latency, token, and App Check telemetry.
- **Science-Backed Spaced Repetition (`@mnemocard/core`)**: Zero-dependency **FSRS v4.5** scheduler, multi-face study decks, and interactive testing (including AI semantic grading for written recall).
- **Remote Config**: The web app's cloud model and default inference mode can change without a redeploy.
- **Local-first, backed up**: Decks sync from a unified `decks/{deckId}` Firestore collection with offline persistence, virtualized lists, and paginated server-side search. Review progress stays on the device.
- **Personalized Mnemonics**: Turn abstract concepts into stories, acronyms, etymology breakdowns, formulas, or analogies tailored to your interests.

## Workspace Layout

```
mnemocard/
├── apps/
│   ├── web/        → React 19 + Vite + Tailwind CSS + Firebase AI Logic Web SDK (@mnemocard/web)
│   ├── ios/        → SwiftUI app (Xcode project, Swift Package Manager)
│   └── android/    → Jetpack Compose app (Android Studio, Gradle)
├── packages/
│   ├── core/       → Domain models, FSRS v4.5 scheduler, study & quiz engines (@mnemocard/core)
│   └── ai/         → Firebase AI Logic hybrid/on-device prompt & schema layer (@mnemocard/ai)
├── assets/         → Brand icons and sounds shared by the apps
├── firebase.json   → Firebase Hosting configuration
└── turbo.json      → Turborepo pipeline
```

## Getting Started

```sh
npm install
```

### Web App

The app runs without any setup, but then it can only use the on-device model. For cloud fallback, connect a Firebase project:

1. **Create a project** in the [Firebase console](https://console.firebase.google.com/) and add a **Web app**.
2. **Copy the config:** copy `apps/web/.env.example` to `apps/web/.env.local` and fill in the `VITE_FIREBASE_*` values from the web app's config.
3. **Turn on Firebase AI Logic:** open **AI Logic** in the console, click **Get started**, and choose the **Gemini Developer API**.
4. **Turn on Authentication and Firestore:**
   - In **Authentication → Sign-in method**, enable **Google** (and **Anonymous** for native apps if needed).
   - In **Firestore Database**, create a database in production mode. The location can't be changed later.
   - Deploy the security rules: `firebase deploy --only firestore --project <your-project-id>`.

   Without these, the apps keep decks on the device only.
5. **Set up App Check:**
   - Create a **reCAPTCHA Enterprise** key for your domains (include `localhost` for development), and register it for the web app under **App Check**.
   - Put the key in `VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY`.
   - For local development, keep `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN=true`. Run the app, copy the debug token printed in the browser console, and register it under **App Check → Manage debug tokens**. Debug tokens are only used in development builds.
   - Turn on **enforcement** for Firebase AI Logic and Cloud Firestore.
6. **Run it:**

   ```sh
   npm run dev:web
   ```

To deploy by hand, use the [Firebase CLI](https://firebase.google.com/docs/cli):

```sh
npm --workspace=@mnemocard/web run build
firebase deploy --only hosting,firestore --project <your-project-id>
```

#### Automatic deploys

On every push to `main`, [CI](.github/workflows/ci.yml) runs the checks and then deploys Hosting and the Firestore rules. To turn it on, add these in the GitHub repository settings under **Secrets and variables → Actions**:

- **Secret** `FIREBASE_SERVICE_ACCOUNT`: a JSON key for a Google Cloud service account with the **Firebase Admin** role.
- **Variables**: `FIREBASE_PROJECT_ID`, plus the `VITE_FIREBASE_*` values from `.env.example`, except the debug token. These ship in the public web bundle anyway, so they don't need to be secrets.

Without `FIREBASE_PROJECT_ID`, for example in forks, the deploy job is skipped.

### iOS App

Requirements: Xcode 26.2 or later. On-device generation needs iOS 26 or later on a device with Apple Intelligence turned on.

1. In the Firebase console, add an **iOS app** with the bundle ID `com.mnemocard.app` (or change `PRODUCT_BUNDLE_IDENTIFIER` to your own).
2. Download `GoogleService-Info.plist` into [`apps/ios/MnemoCard/`](apps/ios/MnemoCard). It's ignored by git. Without it, the app runs with the on-device model only.
3. Open [`apps/ios/MnemoCard.xcodeproj`](apps/ios/MnemoCard.xcodeproj), choose your team under **Signing & Capabilities**, and run.
4. **App Check:** debug builds print a debug token in the Xcode console; register it under **App Check → Manage debug tokens**. Release builds use **App Attest**, which you register for the iOS app in the console.
5. **Remote Config (optional):** `ios_cloud_model` sets the cloud model.

How cloud requests are made depends on your Xcode version:

- **Xcode 27 or later (iOS 27):** Gemini runs through Apple's Foundation Models `LanguageModelSession` using Firebase's `GeminiLanguageModel`, the same API as the on-device model.
- **Xcode 26:** the cloud fallback uses Firebase AI Logic's `GenerativeModel` API.

### Android App

Requirements: Android Studio with JDK 17 or later. On-device generation needs a device supported by the [ML Kit Prompt API](https://developers.google.com/ml-kit/genai#prompt-device).

1. In the Firebase console, add an **Android app** with the package name `com.mnemocard.app`.
2. Download `google-services.json` into [`apps/android/app/`](apps/android/app). It's ignored by git. Without it the app builds, but AI features are off.
3. Open [`apps/android`](apps/android) in Android Studio and run.
4. **App Check:** debug builds log a debug token to Logcat; register it under **App Check → Manage debug tokens**. Release builds use **Play Integrity**.
5. **Remote Config (optional):** `android_cloud_model` sets the cloud model.

The on-device model isn't downloaded automatically. When it's downloadable, the deck generator shows a **Download Gemini Nano** button. Until then, requests go to the cloud. On-device output is limited, so larger decks are more likely to come from the cloud.

Command-line build:

```sh
cd apps/android
./gradlew assembleDebug
```

### On-Device AI in Chrome

Gemini Nano runs through Chrome's built-in [Prompt API](https://developer.chrome.com/docs/ai/prompt-api) on desktop. See that page for hardware requirements and how to enable it. If Chrome reports the model as downloadable, the deck generator shows a button to download it. With Firebase credentials, the web app defaults to `PREFER_ON_DEVICE` and falls back to the cloud when the on-device model can't be used. With no credentials, the app still runs with a placeholder config in `ONLY_ON_DEVICE` mode.

### Remote Config (optional)

The web app reads these parameters from Firebase Remote Config. If they're missing or the fetch fails, it uses cached values or the defaults in [`remote-config.ts`](apps/web/src/lib/remote-config.ts).

| Parameter | Default | Values |
| --- | --- | --- |
| `web_cloud_model` | `gemini-3-flash-preview` | A Gemini model ID supported by Firebase AI Logic |
| `web_default_ai_mode` | `prefer_on_device` | `prefer_on_device` or `only_on_device` |

The app fetches these when it loads. Cloud-first modes can't be set remotely.

### Test, Typecheck, Lint & Build

```sh
npm test
npm run check-types
npm run lint
npm run build
```

Unit tests (Vitest) cover the FSRS scheduler, answer grading, skim gestures, deck sync merging and the AI prompt and response normalizers. CI runs the same checks on every push and pull request.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
