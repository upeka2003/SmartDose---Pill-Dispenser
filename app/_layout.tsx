import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { AccessibilityProvider } from '../contexts/AccessibilityContext';
import { NotificationProvider } from '../contexts/NotificationContext';
import { auth } from '../services/firebase';
import { registerForPushNotifications } from '../services/notificationService';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (Platform.OS === 'web') {
      document.title = 'SmartDose';
    }
  }, [pathname]);

  useEffect(() => {
    SplashScreen.hideAsync();
    registerForPushNotifications();

    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        router.replace('/(tabs)');
      } else {
        router.replace('/login');
      }
    });
    return () => unsub();
  }, []);

  return (
    <AccessibilityProvider>
      <NotificationProvider>
        <Stack screenOptions={{ headerShown: false, title: 'SmartDose' }}>
          <Stack.Screen name="login" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="accessibility" />
        </Stack>
      </NotificationProvider>
    </AccessibilityProvider>
  );
}