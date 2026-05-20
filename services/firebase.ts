import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { Platform } from 'react-native';

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

// Track whether this is the first initialization to guard initializeAuth from
// being called twice on module re-evaluation (e.g., hot reload in Expo Go).
const isFirstInit = getApps().length === 0;
const app = isFirstInit ? initializeApp(firebaseConfig) : getApps()[0];

// Web uses default localStorage persistence via getAuth.
// Mobile uses AsyncStorage persistence so sessions survive app restarts.
export const auth = Platform.OS === 'web'
  ? getAuth(app)
  : isFirstInit
    ? initializeAuth(app, { persistence: getReactNativePersistence(ReactNativeAsyncStorage) })
    : getAuth(app);

export const db      = getFirestore(app);
export const rtdb    = getDatabase(app);
export const storage = getStorage(app);
export default app;
