# MnemoCard Web (`@mnemocard/web`)

Browser client for MnemoCard built with React 19, Vite, Tailwind CSS, and the Firebase AI Logic Web SDK (`firebase/ai`, `firebase/app-check` and `firebase/remote-config`).

## Environment Setup

```sh
cp .env.example .env.local
```

Populate your Firebase configuration values in `.env.local`. With credentials, the app defaults to `PREFER_ON_DEVICE` (on-device first, cloud fallback). Without them it runs in `ONLY_ON_DEVICE` mode, which needs Chrome with Gemini Nano / Prompt API enabled. See the root [README](../../README.md#remote-config-optional) for the Remote Config parameters.

## Commands

```sh
npm run dev
npm run build
npm run lint
npm run check-types
```
