import type { FirebaseOptions } from "firebase/app";

export const SHOP_ID = process.env.NEXT_PUBLIC_SHOP_ID || "shop-114";
export const USE_EMULATORS = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";

/** Emulators accept any values; a demo-* project ID guarantees nothing reaches production. */
const emulatorDefaults = USE_EMULATORS
  ? { apiKey: "demo-key", authDomain: "localhost", projectId: "demo-114-shop", appId: "demo-app" }
  : {};

/** Public client config. Next.js only inlines NEXT_PUBLIC_* when read statically. */
const env = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || emulatorDefaults.apiKey,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || emulatorDefaults.authDomain,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || emulatorDefaults.projectId,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || emulatorDefaults.appId,
};

const REQUIRED: (keyof typeof env)[] = ["apiKey", "authDomain", "projectId", "appId"];

export function missingFirebaseConfig(): string[] {
  const names: Record<keyof typeof env, string> = {
    apiKey: "NEXT_PUBLIC_FIREBASE_API_KEY",
    authDomain: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    projectId: "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    storageBucket: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    messagingSenderId: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    appId: "NEXT_PUBLIC_FIREBASE_APP_ID",
  };
  return REQUIRED.filter((k) => !env[k]).map((k) => names[k]);
}

export function firebaseOptions(): FirebaseOptions {
  return env as FirebaseOptions;
}
