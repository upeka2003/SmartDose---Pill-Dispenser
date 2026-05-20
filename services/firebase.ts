if (typeof globalThis.fetch === 'undefined') {
  // @ts-ignore
  globalThis.fetch = require('node-fetch');
}

import Constants from 'expo-constants';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Read from app.json extra (works in all build types including standalone APK).
// Fall back to process.env for local web development.
const extra = Constants.expoConfig?.extra ?? {};

const firebaseConfig = {
  apiKey:            extra.firebaseApiKey            || process.env.EXPO_PUBLIC_FIREBASE_API_KEY            || 'missing-api-key',
  authDomain:        extra.firebaseAuthDomain        || process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN        || 'smartdose-local.firebaseapp.com',
  projectId:         extra.firebaseProjectId         || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID         || 'smartdose-local',
  storageBucket:     extra.firebaseStorageBucket     || process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET     || 'smartdose-local.appspot.com',
  messagingSenderId: extra.firebaseMessagingSenderId || process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '000000000000',
  appId:             extra.firebaseAppId             || process.env.EXPO_PUBLIC_FIREBASE_APP_ID             || '1:000000000000:web:smartdose-local',
  databaseURL:       extra.firebaseDatabaseUrl       || process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL       || 'https://smartdose-local-default-rtdb.firebaseio.com',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

console.log('[Firebase] App initialized, config:', {
  apiKey: firebaseConfig.apiKey?.slice(0, 10) + '...',
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
});

export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const rtdb    = getDatabase(app);
export const storage = getStorage(app);
export default app;
