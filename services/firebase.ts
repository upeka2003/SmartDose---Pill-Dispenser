import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'missing-api-key',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'smartdose-local.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'smartdose-local',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'smartdose-local.appspot.com',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '000000000000',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:000000000000:web:smartdose-local',
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || 'https://smartdose-local-default-rtdb.firebaseio.com',
};

if (!process.env.EXPO_PUBLIC_FIREBASE_API_KEY) {
  console.warn('Firebase .env values are missing. The app can load, but login and database features need real Firebase config.');
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db      = getFirestore(app);
export const rtdb    = getDatabase(app);
export const auth    = getAuth(app);
export const storage = getStorage(app);
export default app;
