import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from './firebase';

export interface UserProfile {
  displayName: string;
  bio: string;
  photoURL: string;
  updatedAt: string;
}

export const getProfile = async (userId: string): Promise<UserProfile | null> => {
  const snap = await getDoc(doc(db, 'users', userId));
  return snap.exists() ? (snap.data() as UserProfile) : null;
};

export const saveProfile = async (userId: string, data: Partial<UserProfile>) => {
  await setDoc(
    doc(db, 'users', userId),
    { ...data, updatedAt: new Date().toISOString() },
    { merge: true }
  );
};

export const uploadProfilePhoto = async (userId: string, blob: Blob): Promise<string> => {
  const photoRef = ref(storage, `profiles/${userId}/photo.jpg`);
  await uploadBytes(photoRef, blob, { contentType: 'image/jpeg' });
  return getDownloadURL(photoRef);
};
