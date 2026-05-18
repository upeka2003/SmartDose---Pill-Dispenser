import { useNotifications } from '@/contexts/NotificationContext';
import { useFocusEffect, useRouter } from 'expo-router';
import { Bell, CheckCircle2, Clock, Plus, Trash2, Zap } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, Platform, ScrollView, StatusBar, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { Palette, Radius, Shadows, Space, StatusStyle, Type } from '../../constants/theme';
import { useAccessibility } from '../../contexts/AccessibilityContext';
import {
  deleteMedication, dispenseNow, listenESP32History,
  listenMedications, markMedicationTaken, Medication,
} from '../../services/medicationService';
import { cancelAllReminders, scheduleMedicationReminder } from '../../services/notificationService';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
};

function MedCard({ med, onTaken }: { med: Medication; onTaken: (id: string) => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const { cbColors, palette } = useAccessibility();
  const s = useMemo(() => makeCardStyles(palette), [palette]);

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 50 }),
      Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 20 }),
    ]).start();
    onTaken(med.id);
  };

  const handleDelete = async () => {
    if (Platform.OS === 'web') {
      if (!window.confirm(`Remove "${med.name}"?`)) return;
      try {
        await deleteMedication(med.id);
      } catch (e: any) {
        window.alert('Error: ' + (e?.message ?? 'Could not delete'));
      }
      return;
    }
    Alert.alert(
      'Delete Medication',
      `Remove "${med.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await deleteMedication(med.id);
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Could not delete');
            }
          },
        },
      ]
    );
  };

  return (
    <Animated.View style={[s.medCard, { transform: [{ scale }] }]}>
      <View style={[s.medStrip, { backgroundColor: med.color }]} />
      <View style={[s.medIconWrap, { backgroundColor: med.color + '18' }]}>
        <View style={[s.medColorDot, { backgroundColor: med.color }]} />
      </View>
      <View style={s.medBody}>
        <Text style={s.medName} numberOfLines={1}>{med.name}</Text>
        <Text style={s.medDosage}>{med.dosage}</Text>
        <View style={s.medMeta}>
          <Clock size={11} color={palette.textSoft} />
          <Text style={s.medMetaTxt}>{med.time}</Text>
          <View style={s.metaDot} />
          <Text style={s.medMetaTxt}>C{med.compartment}</Text>
        </View>
      </View>
      <TouchableOpacity style={s.deleteBtn} onPress={handleDelete} activeOpacity={0.7}>
        <Trash2 size={16} color="#ef4444" />
      </TouchableOpacity>
      {med.taken ? (
        <View style={[s.takenBadge, { backgroundColor: cbColors.successSoft }]}>
          <CheckCircle2 size={14} color={cbColors.success} />
          <Text style={[s.takenTxt, { color: cbColors.success }]}>Taken</Text>
        </View>
      ) : (
        <TouchableOpacity style={s.markBtn} onPress={handlePress} activeOpacity={0.75}>
          <Text style={s.markBtnTxt}>Mark{'\n'}Taken</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const STATUS_MAP: Record<string, { label: string; icon: string; st: keyof typeof StatusStyle }> = {
  taken:          { label: 'Taken',  icon: '✓', st: 'taken'  },
  missed:         { label: 'Missed', icon: '✕', st: 'missed' },
  'auto-dispensed':{ label: 'Auto',  icon: '⟳', st: 'auto'   },
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
        <Text style={h.sub}>
          {item.time || '—'}  ·  Compartment {Number(item.compartment) + 1}
        </Text>
      </View>
      <View style={[h.badge, { backgroundColor: style.bg }]}>
        <Text style={[h.badgeTxt, { color: style.fg }]}>{s2.label}</Text>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [history, setHistory]         = useState<any[]>([]);
  const router = useRouter();
  const { hasUnread } = useNotifications();
  const { speak, voiceEnabled, cbColors, palette, darkMode } = useAccessibility();
  const s = useMemo(() => makeStyles(palette), [palette]);

  const medsRef             = useRef<Medication[]>([]);
  const processedIds        = useRef<Set<string>>(new Set());
  const historyInitialized  = useRef(false);

  useEffect(() => {
    const u1 = listenMedications((meds) => {
      medsRef.current = meds;
      setMedications(meds);
      scheduleReminders(meds);
    });
    const u2 = listenESP32History((h) => {
      const filtered = [...h].filter(item => item.medication).reverse();

      if (!historyInitialized.current) {
        filtered.forEach(item => { if (item.id) processedIds.current.add(item.id); });
        historyInitialized.current = true;
      } else {
        filtered.forEach(async (item) => {
          if (!item.id || processedIds.current.has(item.id)) return;
          processedIds.current.add(item.id);
          if (item.status === 'taken' || item.status === 'auto-dispensed') {
            const med =
              medsRef.current.find(m => m.name.toLowerCase() === (item.medication ?? '').toLowerCase() && !m.taken) ??
              medsRef.current.find(m => Number(m.compartment) === Number(item.compartment) + 1 && !m.taken);
            if (med) {
              try { await markMedicationTaken(med.id); } catch {}
            }
          }
        });
      }

      setHistory(filtered.slice(0, 8));
    });
    return () => { u1(); u2(); };
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

  const handleTaken = async (id: string) => {
    await markMedicationTaken(id);
  };

  const handleDispenseNow = async (comp: number) => {
    Alert.alert(
      `Dispense from C${comp}?`,
      'This will immediately dispense 1 pill from that compartment.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dispense',
          onPress: async () => {
            try {
              await dispenseNow(comp);
            } catch {
              Alert.alert('Error', 'Could not send dispense command.');
            }
          },
        },
      ]
    );
  };

  const taken   = medications.filter(m => m.taken);
  const pending = medications.filter(m => !m.taken);
  const total   = medications.length;
  const adherence = total > 0 ? Math.round((taken.length / total) * 100) : 0;
  const nextDose  = pending[0];

  useFocusEffect(
    React.useCallback(() => {
      if (voiceEnabled) speak('Home. Welcome to SmartDose.');
      return () => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
        try {
          const Speech = require('expo-speech');
          Speech.stop && Speech.stop();
        } catch {}
      };
    }, [voiceEnabled])
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} backgroundColor={palette.surface} />

      <View style={s.header}>
        <View style={s.headerTop}>
          <View>
            <Text style={s.greetingTxt}>{greeting()}</Text>
            <Text style={s.appName}>SmartDose</Text>
          </View>
          <TouchableOpacity
            style={s.bellBtn}
            onPress={() => router.push('/notifications')}
            activeOpacity={0.7}
          >
            <Bell size={21} color={palette.text} />
            {hasUnread && <View style={s.bellDot} />}
          </TouchableOpacity>
        </View>

      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {total === 0 ? (
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
                <Text style={[s.statBig, { color: palette.primary }]}>{taken.length}</Text>
                <Text style={s.statSlash}>/{total}</Text>
              </View>
              <View style={s.progTrack}>
                <View style={[s.progFill, {
                  width: `${(taken.length / total) * 100}%`,
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
              <Text style={s.nextMeta}>{nextDose.dosage}  ·  {nextDose.time}  ·  C{nextDose.compartment}</Text>
            </View>
          </View>
        )}

        {/* ── Dispense Now card ─────────────────────────────────────── */}
        <View style={s.dispenseCard}>
          <View style={s.dispenseHeader}>
            <Zap size={15} color={palette.primary} />
            <Text style={s.dispenseTitle}>Dispense Now</Text>
          </View>
          <Text style={s.dispenseSub}>Manually dispense from a compartment immediately</Text>
          <View style={s.dispenseRow}>
            {[1, 2, 3].map(comp => (
              <TouchableOpacity
                key={comp}
                style={s.dispenseBtn}
                onPress={() => handleDispenseNow(comp)}
                activeOpacity={0.75}
              >
                <Text style={s.dispenseBtnLabel}>C{comp}</Text>
                <Text style={s.dispenseBtnSub}>Comp {comp}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.section}>
          <View style={s.sectionRow}>
            <Text style={s.sectionTitle}>Upcoming Doses</Text>
            <View style={s.sectionPill}>
              <Text style={s.sectionPillTxt}>Next 6 hrs</Text>
            </View>
          </View>

          {pending.length === 0 ? (
            <View style={s.emptyCard}>
              <CheckCircle2 size={32} color={palette.green} />
              <Text style={s.emptyTitle}>All caught up!</Text>
              <Text style={s.emptySub}>No pending doses for today</Text>
            </View>
          ) : (
            pending.map(m => (
              <MedCard key={m.id} med={m} onTaken={handleTaken} />
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

      <TouchableOpacity
        style={s.fab}
        onPress={() => router.push('/modal')}
        activeOpacity={0.85}
      >
        <Plus size={26} color="#fff" strokeWidth={2.5} />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (P: typeof Palette) => StyleSheet.create({
  root:  { flex: 1, backgroundColor: P.background },

  header: {
    backgroundColor: P.surface,
    paddingTop: 52,
    paddingHorizontal: Space.xl,
    paddingBottom: Space.md,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
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
    borderWidth: 1, borderColor: P.border,
    ...Shadows.card,
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
  statsRow:  { flexDirection: 'row', gap: Space.md, marginBottom: Space.md },
  statCard: {
    flex: 1,
    backgroundColor: P.surface,
    borderRadius: Radius.lg,
    padding: Space.lg,
    borderTopWidth: 3,
    borderWidth: 1,
    borderColor: P.border,
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
    backgroundColor: P.primaryDark,
    borderRadius: Radius.lg, padding: Space.lg,
    marginBottom: Space.md,
    gap: Space.md,
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

  section:    { marginBottom: Space.xl },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Space.md },
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

  // Dispense Now card
  dispenseCard: {
    backgroundColor: P.surface, borderRadius: Radius.lg,
    padding: Space.lg, marginBottom: Space.md,
    borderWidth: 1, borderColor: P.border,
    ...Shadows.card,
  },
  dispenseHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  dispenseTitle:  { fontSize: 15, fontWeight: '800', color: P.text },
  dispenseSub:    { fontSize: 12, color: P.textSoft, marginBottom: 14 },
  dispenseRow:    { flexDirection: 'row', gap: 10 },
  dispenseBtn:    {
    flex: 1, paddingVertical: 16, borderRadius: 12,
    backgroundColor: P.primarySoft, alignItems: 'center',
    borderWidth: 1.5, borderColor: P.primary + '40',
  },
  dispenseBtnLabel: { fontSize: 18, fontWeight: '900', color: P.primary },
  dispenseBtnSub:   { fontSize: 11, fontWeight: '600', color: P.primary, marginTop: 2, opacity: 0.75 },
});

const makeCardStyles = (P: typeof Palette) => StyleSheet.create({
  medCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: P.surface,
    borderRadius: Radius.lg,
    marginBottom: Space.sm,
    borderWidth: 1, borderColor: P.border,
    overflow: 'hidden',
    ...Shadows.card,
  },
  medStrip:    { width: 4, alignSelf: 'stretch' },
  medIconWrap: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginHorizontal: Space.sm },
  medColorDot: { width: 16, height: 16, borderRadius: 8 },
  medBody:     { flex: 1, paddingVertical: Space.md },
  medName:     { ...Type.label, color: P.text, fontSize: 15 },
  medDosage:   { ...Type.caption, color: P.textMuted, marginTop: 2 },
  medMeta:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  medMetaTxt:  { ...Type.caption, color: P.textSoft },
  metaDot:     { width: 3, height: 3, borderRadius: 2, backgroundColor: P.textSoft },
  holdHint:    { fontSize: 10, color: P.textSoft, marginTop: 3, opacity: 0.6 },
  deleteBtn:   { padding: 10, marginLeft: 4 },
  markBtn: {
    backgroundColor: P.primary,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.sm,
    marginRight: Space.md,
    alignItems: 'center',
    ...Shadows.button,
  },
  markBtnTxt:  { color: '#fff', fontWeight: '700', fontSize: 12, textAlign: 'center' },
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
