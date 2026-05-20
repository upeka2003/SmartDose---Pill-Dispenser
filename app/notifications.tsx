import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { Palette, Radius, Shadows } from '../constants/theme';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useNotifications } from '../contexts/NotificationContext';

const RTDB_BASE = 'https://smartdose-dcd88-default-rtdb.firebaseio.com';
const RTDB_AUTH = 'CZnwewbitQSo2RY8CvP6nf0lHbX4fAgwS7dZAKMi';
const NOTIF_URL = `${RTDB_BASE}/smartdose/notifications.json?auth=${RTDB_AUTH}`;

// Firebase PATCH = partial update (only updates specified fields, preserves others)
const rtdbPatch = (path: string, value: object) =>
  fetch(`${RTDB_BASE}/${path}.json?auth=${RTDB_AUTH}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });

// Firebase push IDs: first 8 chars encode millisecond timestamp in base-64
const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
function pushIdToDate(id: string): string {
  try {
    let ms = 0;
    for (let i = 0; i < 8; i++) ms = ms * 64 + PUSH_CHARS.indexOf(id.charAt(i));
    const d = new Date(ms);
    if (d.getFullYear() < 2020 || d.getFullYear() > 2035) return '';
    return d.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

type NotifItem = {
  id: string;
  medication: string;
  status: string;
  time: string;
  read: boolean;
  date: string;
};

const BackIcon = ({ color }: { color: string }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M19 12H5M12 5l-7 7 7 7" />
  </Svg>
);

const TakenIcon = () => (
  <Svg width="22" height="22" viewBox="0 0 22 22">
    <Circle cx="11" cy="11" r="11" fill="#22c55e" />
    <Path d="M7 11.5l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const MissedIcon = () => (
  <Svg width="22" height="22" viewBox="0 0 22 22">
    <Circle cx="11" cy="11" r="11" fill="#ef4444" />
    <Path d="M7.5 7.5l7 7M14.5 7.5l-7 7" stroke="white" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export default function NotificationsScreen() {
  const router = useRouter();
  const { setHasUnread } = useNotifications();
  const { palette, darkMode, voiceEnabled, speak } = useAccessibility();
  const [items, setItems] = useState<NotifItem[]>([]);
  const s = useMemo(() => makeStyles(palette), [palette]);

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await fetch(NOTIF_URL);
      const data = await res.json();
      if (!data || typeof data !== 'object') { setItems([]); setHasUnread(false); return; }

      const today = new Date().toISOString().slice(0, 10);
      const parsed: NotifItem[] = Object.entries(data as Record<string, any>)
        .map(([id, raw]: [string, any]) => {
          if (!raw || typeof raw !== 'object') return null;
          // Unwrap push-key wrapper if the top-level value has no 'medication'/'status' field
          const val = (!raw.medication && !raw.status)
            ? (Object.values(raw)[0] as any)
            : raw;
          if (!val || typeof val !== 'object') return null;
          return {
            id,
            medication: String(val.medication ?? ''),
            status: String(val.status ?? 'dispensed').toLowerCase(),
            time: String(val.time ?? ''),
            read: !!val.read,
            date: pushIdToDate(id) || today,
          };
        })
        .filter((x): x is NotifItem => x !== null && x.medication !== '')
        .sort((a, b) => b.id.localeCompare(a.id));

      setItems(parsed);
      setHasUnread(parsed.some(n => !n.read));
    } catch (e) {
      console.error('[Notifications] fetch error:', e);
    }
  }, [setHasUnread]);

  React.useEffect(() => {
    fetchNotifs();
    const timer = setInterval(fetchNotifs, 10_000);
    return () => clearInterval(timer);
  }, [fetchNotifs]);

  useFocusEffect(useCallback(() => { fetchNotifs(); }, [fetchNotifs]));

  React.useEffect(() => {
    if (voiceEnabled && items.length > 0) {
      speak(`You have ${items.filter(n => !n.read).length} unread notifications.`);
    }
  }, [voiceEnabled, items.length]);

  const markOneRead = async (item: NotifItem) => {
    if (item.read) return;
    setItems(prev => prev.map(n => n.id === item.id ? { ...n, read: true } : n));
    setHasUnread(items.some(n => n.id !== item.id && !n.read));
    await rtdbPatch(`smartdose/notifications/${item.id}`, { read: true });
  };

  const markAllRead = async () => {
    const unread = items.filter(n => !n.read);
    if (unread.length === 0) return;
    setItems(prev => prev.map(n => ({ ...n, read: true })));
    setHasUnread(false);
    await Promise.all(
      unread.map(n => rtdbPatch(`smartdose/notifications/${n.id}`, { read: true }))
    );
  };

  const today = new Date().toISOString().slice(0, 10);
  const todayItems   = items.filter(n => n.date === today);
  const earlierItems = items.filter(n => n.date !== today);

  const renderItem = (item: NotifItem) => {
    const isTaken = ['taken', 'dispensed', 'auto-dispensed'].includes(item.status);
    const title   = isTaken ? 'Dispensed' : 'Missed';
    const message = isTaken
      ? `${item.medication} was dispensed${item.time ? ` at ${item.time}` : ''}`
      : `${item.medication} dose was missed${item.time ? ` at ${item.time}` : ''}`;

    return (
      <TouchableOpacity
        key={item.id}
        style={[s.card, !item.read && s.cardUnread]}
        onPress={() => markOneRead(item)}
        activeOpacity={0.8}
      >
        <View style={s.cardIcon}>
          {isTaken ? <TakenIcon /> : <MissedIcon />}
        </View>
        <View style={s.cardBody}>
          <View style={s.titleRow}>
            <Text style={[s.cardTitle, isTaken ? s.titleTaken : s.titleMissed]}>
              {title}
            </Text>
            {!item.read && <View style={s.unreadDot} />}
          </View>
          <Text style={s.cardMed} numberOfLines={1}>{item.medication}</Text>
          <Text style={s.cardMsg}>{message}</Text>
          {!!item.time && <Text style={s.cardTime}>{item.time}</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} backgroundColor={palette.surface} />

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <BackIcon color={palette.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Notifications</Text>
        <TouchableOpacity onPress={markAllRead}>
          <Text style={s.markAll}>Mark all read</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {items.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyIcon}>🔔</Text>
            <Text style={s.emptyTitle}>No notifications yet</Text>
            <Text style={s.emptySub}>Dose reminders and device alerts will appear here.</Text>
          </View>
        ) : (
          <>
            {todayItems.length > 0 && (
              <>
                <Text style={s.groupLabel}>Today</Text>
                {todayItems.map(renderItem)}
              </>
            )}
            {earlierItems.length > 0 && (
              <>
                <Text style={s.groupLabel}>Earlier</Text>
                {earlierItems.map(renderItem)}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (P: typeof Palette) => StyleSheet.create({
  container:   { flex: 1, backgroundColor: P.background },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: P.surface, borderBottomWidth: 1, borderBottomColor: P.border },
  backBtn:     { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: P.text },
  markAll:     { fontSize: 13, color: P.textMuted, fontWeight: '500' },

  groupLabel:  { fontSize: 11, fontWeight: '700', color: P.textSoft, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6, letterSpacing: 1, textTransform: 'uppercase' },

  card:        { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: P.surface, marginHorizontal: 16, marginTop: 8, borderRadius: Radius.lg, padding: 14, borderWidth: 1, borderColor: P.border, ...Shadows.card },
  cardUnread:  { borderLeftWidth: 3, borderLeftColor: P.primary, backgroundColor: P.primarySoft },
  cardIcon:    { marginTop: 1 },
  cardBody:    { flex: 1 },
  titleRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  cardTitle:   { fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  titleTaken:  { color: '#22c55e' },
  titleMissed: { color: '#ef4444' },
  unreadDot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: P.primary },
  cardMed:     { fontSize: 15, fontWeight: '800', color: P.text, marginBottom: 3 },
  cardMsg:     { fontSize: 13, color: P.textMuted, lineHeight: 18 },
  cardTime:    { fontSize: 11, color: P.textSoft, marginTop: 5 },

  emptyBox:    { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 10 },
  emptyIcon:   { fontSize: 48 },
  emptyTitle:  { fontSize: 17, fontWeight: '800', color: P.text },
  emptySub:    { fontSize: 14, color: P.textSoft, textAlign: 'center', lineHeight: 20 },
});
