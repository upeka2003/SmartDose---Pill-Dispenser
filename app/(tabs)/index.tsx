import { useNotifications } from '@/contexts/NotificationContext';
import { useFocusEffect, useRouter } from 'expo-router';
import { Bell, CheckCircle2, Circle, Clock, Plus, Trash2, XCircle, Zap } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, Platform, ScrollView, StatusBar, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { Palette, Radius, Shadows, Space, StatusStyle, Type } from '../../constants/theme';
import { useAccessibility } from '../../contexts/AccessibilityContext';
import {
  deleteMedication,
  listenMedications, Medication,
} from '../../services/medicationService';
import { cancelAllReminders, scheduleMedicationReminder } from '../../services/notificationService';

const RTDB_URL    = process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL ?? '';
const RTDB_SECRET = process.env.EXPO_PUBLIC_FIREBASE_DATABASE_SECRET ?? '';
const rtdbUrl = (path: string) =>
  `${RTDB_URL}/${path}.json${RTDB_SECRET ? `?auth=${RTDB_SECRET}` : ''}`;

const COMP_COLORS = ['#6366f1', '#10b981', '#f59e0b'];

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
};

type DoseStatus = 'pending' | 'taken' | 'missed';

type DoseSlot = {
  slotKey: string;    // e.g. "abc123_0"
  medId: string;      // Firestore doc ID
  name: string;
  time: string;       // "HH:MM"
  compartment: number;
  color: string;
  status: DoseStatus;
};

// ── SlotCard ────────────────────────────────────────────────────────────────
function SlotCard({ slot }: { slot: DoseSlot }) {
  const scale = useRef(new Animated.Value(1)).current;
  const { cbColors, palette } = useAccessibility();
  const s = useMemo(() => makeCardStyles(palette), [palette]);

  const handleDelete = async () => {
    if (Platform.OS === 'web') {
      if (!window.confirm(`Delete all doses for "${slot.name}"?`)) return;
      try { await deleteMedication(slot.medId); } catch (e: any) {
        window.alert('Error: ' + (e?.message ?? 'Could not delete'));
      }
      return;
    }
    Alert.alert(
      'Delete Medication',
      `Delete all doses for "${slot.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try { await deleteMedication(slot.medId); } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Could not delete');
            }
          },
        },
      ]
    );
  };

  return (
    <Animated.View style={[s.medCard, { transform: [{ scale }] }]}>
      <View style={[s.medStrip, { backgroundColor: slot.color }]} />
      <View style={[s.medIconWrap, { backgroundColor: slot.color + '18' }]}>
        <View style={[s.medColorDot, { backgroundColor: slot.color }]} />
      </View>
      <View style={s.medBody}>
        <Text style={s.medName} numberOfLines={1}>{slot.name}</Text>
        <View style={s.medMeta}>
          <Clock size={11} color={palette.textSoft} />
          <Text style={s.medMetaTxt}>{slot.time}</Text>
          <View style={s.metaDot} />
          <Text style={s.medMetaTxt}>C{slot.compartment}</Text>
        </View>
      </View>
      <TouchableOpacity style={s.deleteBtn} onPress={handleDelete} activeOpacity={0.7}>
        <Trash2 size={16} color="#ef4444" />
      </TouchableOpacity>
      {slot.status === 'taken' ? (
        <View style={[s.takenBadge, { backgroundColor: cbColors.successSoft }]}>
          <CheckCircle2 size={14} color={cbColors.success} />
          <Text style={[s.takenTxt, { color: cbColors.success }]}>Taken</Text>
        </View>
      ) : slot.status === 'missed' ? (
        <View style={[s.takenBadge, { backgroundColor: cbColors.dangerSoft }]}>
          <XCircle size={14} color={cbColors.danger} />
          <Text style={[s.takenTxt, { color: cbColors.danger }]}>Missed</Text>
        </View>
      ) : (
        <View style={[s.takenBadge, { backgroundColor: palette.background }]}>
          <Circle size={14} color={palette.textSoft} />
          <Text style={[s.takenTxt, { color: palette.textMuted }]}>Pending</Text>
        </View>
      )}
    </Animated.View>
  );
}

// ── History row ─────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; icon: string; st: keyof typeof StatusStyle }> = {
  taken:           { label: 'Taken',  icon: '✓', st: 'taken'  },
  missed:          { label: 'Missed', icon: '✕', st: 'missed' },
  'auto-dispensed':{ label: 'Auto',   icon: '⟳', st: 'auto'   },
  dispensed:       { label: 'Auto',   icon: '↓', st: 'auto'   },
};

function HistoryItem({ item }: { item: any }) {
  const { cbColors, colorBlindMode, palette } = useAccessibility();
  const h = useMemo(() => makeHistStyles(palette), [palette]);
  const s2 = STATUS_MAP[item.status] ?? { label: 'Manual', icon: '↓', st: 'auto' as const };
  const rawStyle = StatusStyle[s2.st];
  const style = colorBlindMode && s2.st === 'taken'  ? { bg: cbColors.successSoft, fg: cbColors.success }
              : colorBlindMode && s2.st === 'missed' ? { bg: cbColors.dangerSoft,  fg: cbColors.danger  }
              : rawStyle;
  return (
    <View style={h.row}>
      <View style={[h.icon, { backgroundColor: style.bg }]}>
        <Text style={[h.iconTxt, { color: style.fg }]}>{s2.icon}</Text>
      </View>
      <View style={h.body}>
        <Text style={h.name}>{item.medication || 'Unknown'}</Text>
        <Text style={h.sub}>{item.time || '—'}  ·  Compartment {Number(item.compartment) + 1}</Text>
      </View>
      <View style={[h.badge, { backgroundColor: style.bg }]}>
        <Text style={[h.badgeTxt, { color: style.fg }]}>{s2.label}</Text>
      </View>
    </View>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const normalizeDoseStatus = (status?: string): DoseStatus | null => {
  const s = String(status ?? '').toLowerCase();
  if (['taken', 'dispensed', 'auto-dispensed'].includes(s)) return 'taken';
  if (s === 'missed') return 'missed';
  return null;
};

// Finds lastStatus inside a slot node, handling three Firebase layouts:
//   1. Direct:          slot.lastStatus = "taken"
//   2. Push-key field:  slot.lastStatus = { "-Abc": "taken" }
//   3. Push-key child:  slot["-Abc"]    = { lastStatus: "taken" }
const findLastStatusInSlot = (slot: any): string | null => {
  if (!slot || typeof slot !== 'object') return null;
  if (slot.lastStatus !== undefined) {
    if (typeof slot.lastStatus === 'string') return slot.lastStatus;
    if (typeof slot.lastStatus === 'object') {
      const v = Object.values(slot.lastStatus)[0];
      if (typeof v === 'string') return v;
    }
  }
  for (const [k, v] of Object.entries(slot)) {
    if (k.startsWith('-') && v && typeof v === 'object') {
      const nested = (v as any).lastStatus;
      if (typeof nested === 'string') return nested;
    }
  }
  return null;
};

const getHistoryTime = (item: any) => {
  const idSec = Number(item.id);
  if (Number.isFinite(idSec)) return idSec * 1000;
  const parsed = Date.parse(String(item.timestamp ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

// ── Screen ──────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [rtdbSlots,   setRtdbSlots]   = useState<Record<string, any>>({});
  const [rtdbStatuses, setRtdbStatuses] = useState<Record<string, string>>({});
  const [history,     setHistory]     = useState<any[]>([]);
  const router = useRouter();
  const { hasUnread } = useNotifications();
  const { speak, voiceEnabled, cbColors, palette, darkMode } = useAccessibility();
  const s = useMemo(() => makeStyles(palette), [palette]);

  useEffect(() => {
    const u1 = listenMedications((meds) => {
      setMedications(meds);
      scheduleReminders(meds);
    });

    let cancelled = false;

    const pollMedications = async () => {
      if (cancelled) return;
      try {
        const res  = await fetch(rtdbUrl('smartdose/medications'));
        const data = await res.json();
        if (cancelled || !data || typeof data !== 'object') {
          setRtdbSlots({});
          setRtdbStatuses({});
          return;
        }
        setRtdbSlots(data);
        // Build a flattened status map for any Firestore-based fallbacks
        const statuses: Record<string, string> = {};
        for (const [slotKey, val] of Object.entries(data as Record<string, any>)) {
          const st = findLastStatusInSlot(val);
          if (!st) continue;
          const baseId = slotKey.replace(/_\d+$/, '');
          if (!statuses[baseId]) statuses[baseId] = st;
          if ((val as any).name)           statuses['name:' + String((val as any).name).trim().toLowerCase()] = st;
          if ((val as any).compartment != null) statuses['comp:' + String((val as any).compartment)] = st;
        }
        setRtdbStatuses(statuses);
      } catch (e) { console.error('[SmartDose] Meds poll error:', e); }
    };

    const pollHistory = async () => {
      if (cancelled) return;
      try {
        const res  = await fetch(rtdbUrl('smartdose/history'));
        const data = await res.json();
        if (cancelled || !data || typeof data !== 'object') { setHistory([]); return; }
        const list = Object.entries(data as Record<string, any>)
          .map(([id, val]) => ({ id, ...(val as any) }))
          .filter(item => item.medication)
          .sort((a, b) => getHistoryTime(b) - getHistoryTime(a));
        setHistory(list.slice(0, 8));
      } catch (e) { console.error('[SmartDose] History poll error:', e); }
    };

    pollMedications();
    pollHistory();
    const medsTimer = setInterval(pollMedications, 10_000);
    const histTimer = setInterval(pollHistory, 15_000);
    return () => { cancelled = true; clearInterval(medsTimer); clearInterval(histTimer); u1(); };
  }, []);

  const scheduleReminders = async (meds: Medication[]) => {
    await cancelAllReminders();
    for (const m of meds.filter(x => x.active)) {
      for (const t of (m.times || [m.time])) {
        const [hr, mn] = t.split(':');
        await scheduleMedicationReminder(m.name, m.dosage, +hr, +mn);
      }
    }
  };

  // Build one DoseSlot per RTDB slot key (_0, _1, _2…).
  // Falls back to one slot per Firestore medication when RTDB has no data yet.
  const doseSlots = useMemo((): DoseSlot[] => {
    const validKeys = Object.keys(rtdbSlots).filter(k => {
      const v = rtdbSlots[k];
      return v && typeof v === 'object' && String(v.name ?? '').trim();
    });

    if (validKeys.length > 0) {
      const slots: DoseSlot[] = validKeys.map(slotKey => {
        const val   = rtdbSlots[slotKey];
        const medId = String(val.medicationId ?? slotKey.replace(/_\d+$/, '')).trim();
        const name  = String(val.name ?? '').trim();
        const time  = String(val.time ?? '00:00');
        const compartment = Number(val.compartment ?? 1);
        const med   = medications.find(m => m.id === medId);
        const color = med?.color ?? COMP_COLORS[(compartment - 1) % 3];
        const status = normalizeDoseStatus(findLastStatusInSlot(val)) ?? 'pending';
        return { slotKey, medId, name, time, compartment, color, status };
      });
      slots.sort((a, b) => a.time.localeCompare(b.time));
      return slots;
    }

    // Firestore fallback — one row per medication, status from rtdbStatuses
    return medications.map(m => ({
      slotKey: m.id,
      medId:   m.id,
      name:    m.name,
      time:    m.time ?? '00:00',
      compartment: m.compartment,
      color:   m.color,
      status:  normalizeDoseStatus(rtdbStatuses[m.id]) ??
               normalizeDoseStatus(rtdbStatuses['name:' + m.name.trim().toLowerCase()]) ??
               normalizeDoseStatus(rtdbStatuses['comp:' + m.compartment]) ??
               (m.taken ? 'taken' : 'pending'),
    }));
  }, [rtdbSlots, medications, rtdbStatuses]);

  const takenSlots   = doseSlots.filter(s => s.status === 'taken');
  const missedSlots  = doseSlots.filter(s => s.status === 'missed');
  const pendingSlots = doseSlots.filter(s => s.status === 'pending');
  const totalSlots   = doseSlots.length;
  const adherence    = totalSlots > 0 ? Math.round((takenSlots.length / totalSlots) * 100) : 0;
  const nextDose     = pendingSlots[0];

  useFocusEffect(
    React.useCallback(() => {
      if (voiceEnabled) speak('Home. Welcome to SmartDose.');
      return () => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
        try { const S = require('expo-speech'); S.stop?.(); } catch {}
      };
    }, [voiceEnabled])
  );

  const hasAnyMeds = medications.length > 0 || doseSlots.length > 0;

  return (
    <View style={s.root}>
      <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} backgroundColor={palette.surface} />

      <View style={s.header}>
        <View style={s.headerTop}>
          <View>
            <Text style={s.greetingTxt}>{greeting()}</Text>
            <Text style={s.appName}>SmartDose</Text>
          </View>
          <TouchableOpacity style={s.bellBtn} onPress={() => router.push('/notifications')} activeOpacity={0.7}>
            <Bell size={21} color={palette.text} />
            {hasUnread && <View style={s.bellDot} />}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} bounces={false}>

        {!hasAnyMeds ? (
          <View style={s.welcomeCard}>
            <Text style={s.welcomeIcon}>💊</Text>
            <Text style={s.welcomeTitle}>Welcome to SmartDose</Text>
            <Text style={s.welcomeSub}>Tap the + button below to add your first medication.</Text>
          </View>
        ) : (
          <View style={s.statsRow}>
            <View style={[s.statCard, { borderTopColor: palette.primary }]}>
              <Text style={s.statLabel}>Today's Doses</Text>
              <View style={s.statValueRow}>
                <Text style={[s.statBig, { color: palette.primary }]}>{takenSlots.length}</Text>
                <Text style={s.statSlash}>/{totalSlots}</Text>
              </View>
              <View style={s.progTrack}>
                <View style={[s.progFill, {
                  width: `${totalSlots > 0 ? (takenSlots.length / totalSlots) * 100 : 0}%`,
                  backgroundColor: palette.primary,
                }]} />
              </View>
            </View>
            <View style={[s.statCard, {
              borderTopColor: adherence >= 80 ? cbColors.success : adherence >= 50 ? cbColors.warning : cbColors.danger,
            }]}>
              <Text style={s.statLabel}>Adherence</Text>
              <View style={s.statValueRow}>
                <Text style={[s.statBig, {
                  color: adherence >= 80 ? cbColors.success : adherence >= 50 ? cbColors.warning : cbColors.danger,
                }]}>{adherence}</Text>
                <Text style={s.statSlash}>%</Text>
              </View>
              <Text style={s.statNote}>7-day average</Text>
            </View>
          </View>
        )}

        {nextDose && (
          <View style={s.nextCard}>
            <View style={s.nextIconWrap}>
              <Zap size={18} color="#fff" />
            </View>
            <View style={s.nextBody}>
              <Text style={s.nextLabel}>Next Scheduled Dose</Text>
              <Text style={s.nextName}>{nextDose.name}</Text>
              <Text style={s.nextMeta}>{nextDose.time}  ·  C{nextDose.compartment}</Text>
            </View>
          </View>
        )}

        <View style={s.section}>
          <View style={s.sectionRow}>
            <Text style={s.sectionTitle}>Today's Doses</Text>
            <View style={s.sectionPill}>
              <Text style={s.sectionPillTxt}>{takenSlots.length} taken · {missedSlots.length} missed</Text>
            </View>
          </View>

          {doseSlots.length === 0 ? (
            <View style={s.emptyCard}>
              <CheckCircle2 size={32} color={palette.green} />
              <Text style={s.emptyTitle}>No doses scheduled</Text>
              <Text style={s.emptySub}>Add medications to see automatic dose status.</Text>
            </View>
          ) : (
            doseSlots.map(slot => (
              <SlotCard key={slot.slotKey} slot={slot} />
            ))
          )}
        </View>

        {history.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Recent History</Text>
            <View style={s.historyCard}>
              {history.map((item, i) => (
                <View key={i}>
                  <HistoryItem item={item} />
                  {i < history.length - 1 && <View style={s.divider} />}
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <TouchableOpacity style={s.fab} onPress={() => router.push('/modal')} activeOpacity={0.85}>
        <Plus size={26} color="#fff" strokeWidth={2.5} />
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const makeStyles = (P: typeof Palette) => StyleSheet.create({
  root:  { flex: 1, backgroundColor: P.background },

  header: {
    backgroundColor: P.surface,
    paddingTop: 52, paddingHorizontal: Space.xl, paddingBottom: Space.md,
    borderBottomWidth: 1, borderBottomColor: P.border,
    ...Shadows.card,
  },
  headerTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: Space.md,
  },
  greetingTxt: { ...Type.caption, color: P.textMuted, marginBottom: 2 },
  appName:     { ...Type.hero, color: P.text },
  bellBtn: {
    width: 44, height: 44, borderRadius: Radius.md,
    backgroundColor: P.background,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: P.border, ...Shadows.card,
  },
  bellDot: {
    position: 'absolute', top: 9, right: 9,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: P.rose, borderWidth: 1.5, borderColor: P.surface,
  },

  scroll: { paddingTop: Space.lg, paddingHorizontal: Space.lg, paddingBottom: 40 },

  welcomeCard: {
    backgroundColor: P.primarySoft, borderRadius: Radius.lg,
    padding: 28, alignItems: 'center', gap: Space.sm,
    marginBottom: Space.md, borderWidth: 1, borderColor: P.primary + '30',
  },
  welcomeIcon:  { fontSize: 40 },
  welcomeTitle: { ...Type.heading, color: P.text, textAlign: 'center' },
  welcomeSub:   { ...Type.label, color: P.textMuted, textAlign: 'center', fontWeight: '500', lineHeight: 20 },

  statsRow: { flexDirection: 'row', gap: Space.md, marginBottom: Space.md },
  statCard: {
    flex: 1, backgroundColor: P.surface, borderRadius: Radius.lg,
    padding: Space.lg, borderTopWidth: 3, borderWidth: 1, borderColor: P.border,
    ...Shadows.card,
  },
  statLabel:    { ...Type.caption, color: P.textMuted, marginBottom: 6 },
  statValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginBottom: 8 },
  statBig:      { fontSize: 34, fontWeight: '900', lineHeight: 38 },
  statSlash:    { fontSize: 16, color: P.textSoft, marginBottom: 4 },
  statNote:     { ...Type.caption, color: P.textSoft },
  progTrack:    { height: 6, backgroundColor: P.background, borderRadius: Radius.full },
  progFill:     { height: 6, borderRadius: Radius.full },

  nextCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: P.primaryDark, borderRadius: Radius.lg,
    padding: Space.lg, marginBottom: Space.md, gap: Space.md,
    ...Shadows.button,
  },
  nextIconWrap: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  nextBody:  { flex: 1 },
  nextLabel: { ...Type.caption, color: 'rgba(209,250,229,0.85)', marginBottom: 4 },
  nextName:  { ...Type.heading, color: '#fff', marginBottom: 2 },
  nextMeta:  { ...Type.caption, color: 'rgba(255,255,255,0.65)' },

  section:      { marginBottom: Space.xl },
  sectionRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Space.md },
  sectionTitle: { ...Type.heading, color: P.text },
  sectionPill:  { backgroundColor: P.primarySoft, paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.full },
  sectionPillTxt: { ...Type.caption, color: P.primary },

  emptyCard: {
    backgroundColor: P.greenSoft, borderRadius: Radius.lg,
    padding: 32, alignItems: 'center', gap: Space.sm,
    borderWidth: 1, borderColor: P.green + '30',
  },
  emptyTitle: { ...Type.heading, color: P.green },
  emptySub:   { ...Type.label, color: P.green, fontWeight: '500', opacity: 0.75 },

  historyCard: {
    backgroundColor: P.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: P.border, overflow: 'hidden',
    ...Shadows.card,
  },
  divider: { height: 1, backgroundColor: P.border, marginLeft: 60 },

  fab: {
    position: 'absolute', bottom: 88, right: Space.xl,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: P.primary,
    alignItems: 'center', justifyContent: 'center',
    ...Shadows.button,
  },
});

const makeCardStyles = (P: typeof Palette) => StyleSheet.create({
  medCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: P.surface, borderRadius: Radius.lg,
    marginBottom: Space.sm, borderWidth: 1, borderColor: P.border,
    overflow: 'hidden', ...Shadows.card,
  },
  medStrip:    { width: 4, alignSelf: 'stretch' },
  medIconWrap: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginHorizontal: Space.sm },
  medColorDot: { width: 16, height: 16, borderRadius: 8 },
  medBody:     { flex: 1, paddingVertical: Space.md },
  medName:     { ...Type.label, color: P.text, fontSize: 15 },
  medMeta:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  medMetaTxt:  { ...Type.caption, color: P.textSoft },
  metaDot:     { width: 3, height: 3, borderRadius: 2, backgroundColor: P.textSoft },
  deleteBtn:   { padding: 10, marginLeft: 4 },
  takenBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: Space.md, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.sm },
  takenTxt:    { ...Type.caption },
});

const makeHistStyles = (P: typeof Palette) => StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', padding: Space.md, gap: Space.md },
  icon:     { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  iconTxt:  { fontSize: 15, fontWeight: '900' },
  body:     { flex: 1 },
  name:     { ...Type.label, color: P.text, fontSize: 14 },
  sub:      { ...Type.caption, color: P.textMuted, marginTop: 2 },
  badge:    { paddingHorizontal: 9, paddingVertical: 4, borderRadius: Radius.full },
  badgeTxt: { ...Type.caption },
});
