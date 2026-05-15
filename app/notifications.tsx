import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Palette, Shadows } from '../constants/theme';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useNotifications } from '../contexts/NotificationContext';
import { AppNotification, listenAppNotifications, markAllNotificationsRead, markNotificationRead } from '../services/medicationService';

const BackIcon = () => {
  const { palette } = useAccessibility();
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={palette.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 12H5M12 5l-7 7 7 7"/>
    </Svg>
  );
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { setHasUnread } = useNotifications();
  const { voiceEnabled, speak, palette, darkMode } = useAccessibility();
  const [items, setItems] = useState<AppNotification[]>([]);
  const styles = useMemo(() => makeStyles(palette), [palette]);

  React.useEffect(() => {
    const unsub = listenAppNotifications((notifs) => {
      setItems(notifs);
      setHasUnread(notifs.some(n => n.unread));
    });
    return () => unsub();
  }, []);

  React.useEffect(() => {
    if (voiceEnabled) {
      if (items.length === 0) {
        speak('No notifications yet');
      } else {
        speak(`You have ${items.length} notifications. Latest: ${items[0].title}. ${items[0].message}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled, items.length]);

  const markAllRead = () => {
    markAllNotificationsRead(items);
  };

  const markOneRead = (id: string) => {
    markNotificationRead(id);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} backgroundColor={palette.surface} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <BackIcon />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity onPress={markAllRead}>
          <Text style={styles.markAll}>Mark all read</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {items.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptySub}>Dose reminders and device alerts will appear here.</Text>
          </View>
        ) : (
          items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.notifCard, item.unread && styles.unreadCard]}
            onPress={() => markOneRead(item.id)}
          >
            <View style={styles.notifLeft}>
              {item.unread ? <View style={styles.dot} /> : <View style={styles.dotEmpty} />}
              <View style={styles.notifText}>
                <Text style={[styles.notifTitle, item.unread && styles.boldText]}>{item.title}</Text>
                <Text style={styles.notifMessage}>{item.message}</Text>
                <Text style={styles.notifTime}>{item.time}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )))}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (P: typeof Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: P.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: P.surface, borderBottomWidth: 1, borderBottomColor: P.border },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: P.text },
  markAll: { fontSize: 13, color: P.textMuted, fontWeight: '500' },
  notifCard: { backgroundColor: P.surface, marginHorizontal: 16, marginTop: 10, borderRadius: 14, padding: 16, ...Shadows.card },
  unreadCard: { backgroundColor: P.primarySoft, borderLeftWidth: 3, borderLeftColor: P.primary },
  notifLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: P.primary, marginTop: 5 },
  dotEmpty: { width: 10, height: 10, marginTop: 5 },
  notifText: { flex: 1 },
  notifTitle: { fontSize: 15, color: P.text, marginBottom: 3 },
  boldText: { fontWeight: '700' },
  notifMessage: { fontSize: 13, color: P.textMuted, lineHeight: 18 },
  notifTime: { fontSize: 12, color: P.textSoft, marginTop: 6 },
  emptyBox:  { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 10 },
  emptyIcon:  { fontSize: 48 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: P.text },
  emptySub:   { fontSize: 14, color: P.textSoft, textAlign: 'center', lineHeight: 20 },
});
