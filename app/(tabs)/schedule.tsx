import { useNotifications } from '@/contexts/NotificationContext';
import { useFocusEffect, useRouter } from 'expo-router';
import { Bell, CheckCircle2, Clock, Moon, MoveRight, Sun, Sunset } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Animated, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Palette, Radius, Shadows, Space, Type } from '../../constants/theme';
import { useAccessibility } from '../../contexts/AccessibilityContext';
import { listenMedications, logMedicationDose, markMedicationTaken, Medication } from '../../services/medicationService';

const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const SECTIONS: { key: string; label: string; range: [number, number] }[] = [
  { key: 'Morning',   label: 'Morning',   range: [0,  11] },
  { key: 'Afternoon', label: 'Afternoon', range: [12, 16] },
  { key: 'Evening',   label: 'Evening',   range: [17, 20] },
  { key: 'Night',     label: 'Night',     range: [21, 23] },
];

const SectionIcon = ({ label }: { label: string }) => {
  const { palette } = useAccessibility();
  const props = { size: 16, color: palette.textMuted };
  if (label === 'Morning')   return <Sun     {...props} />;
  if (label === 'Afternoon') return <MoveRight {...props} />;
  if (label === 'Evening')   return <Sunset  {...props} />;
  return                            <Moon    {...props} />;
};

function getSection(time: string) {
  const h = parseInt(time.split(':')[0]);
  return SECTIONS.find(s => h >= s.range[0] && h <= s.range[1])?.key ?? 'Morning';
}

function MedRow({ med, onTaken }: { med: Medication; onTaken: () => void }) {
  const opacity = useState(new Animated.Value(1))[0];
  const { cbColors, palette } = useAccessibility();
  const r = useMemo(() => makeRowStyles(palette), [palette]);

  const handlePress = () => {
    Animated.timing(opacity, { toValue: 0.45, duration: 250, useNativeDriver: true }).start();
    onTaken();
  };

  return (
    <Animated.View style={[r.card, { opacity: med.taken ? 0.45 : 1 }]}>
      <View style={[r.strip, { backgroundColor: med.color }]} />
      <View style={[r.iconWrap, { backgroundColor: med.color + '18' }]}>
        <View style={[r.dot, { backgroundColor: med.color }]} />
      </View>
      <View style={r.body}>
        <Text style={[r.name, med.taken && r.nameTaken]} numberOfLines={1}>{med.name}</Text>
        <Text style={r.dosage}>{med.dosage}</Text>
        <View style={r.meta}>
          <Clock size={11} color={palette.textSoft} />
          <Text style={r.metaTxt}>{med.time}</Text>
          <View style={r.sep} />
          <Text style={r.metaTxt}>C{med.compartment}</Text>
        </View>
      </View>
      {med.taken ? (
        <View style={[r.takenBadge, { backgroundColor: cbColors.successSoft }]}>
          <CheckCircle2 size={14} color={cbColors.success} />
          <Text style={[r.takenTxt, { color: cbColors.success }]}>Done</Text>
        </View>
      ) : (
        <TouchableOpacity style={r.btn} onPress={handlePress} activeOpacity={0.75}>
          <Text style={r.btnTxt}>Mark{'\n'}Taken</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

export default function ScheduleScreen() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [view,       setView]         = useState<'Today' | 'Tomorrow' | 'Week'>('Today');
  const [weekDays,   setWeekDays]     = useState<Date[]>([]);
  const [selDate,    setSelDate]      = useState(new Date());
  const router = useRouter();
  const { hasUnread } = useNotifications();
  const { speak, voiceEnabled, cbColors, palette, darkMode } = useAccessibility();
  const s = useMemo(() => makeStyles(palette), [palette]);

  useEffect(() => {
    const unsub = listenMedications(setMedications);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i); days.push(d);
    }
    setWeekDays(days);
    return () => unsub();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      if (voiceEnabled) speak('Schedule. View and manage your medication schedule.');
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

  const handleTaken = async (med: Medication) => {
    await markMedicationTaken(med.id);
    await logMedicationDose(med.id, 'taken', med.time || '08:00', new Date().toISOString().split('T')[0]);
  };

  const grouped: Record<string, Medication[]> = {};
  SECTIONS.forEach(sec => (grouped[sec.key] = []));
  medications.forEach(m => grouped[getSection(m.time || '08:00')].push(m));

  const total  = medications.length;
  const taken  = medications.filter(m => m.taken).length;
  const pct    = total > 0 ? Math.round((taken / total) * 100) : 0;

  const isToday = (d: Date) => d.toDateString() === new Date().toDateString();

  const dateLabel =
    view === 'Today'    ? `Today, ${new Date().getDate()} ${MONTHS[new Date().getMonth()]}`
    : view === 'Tomorrow' ? 'Tomorrow'
    : `${DAYS[selDate.getDay()]}, ${selDate.getDate()} ${MONTHS[selDate.getMonth()]}`;

  return (
    <View style={s.root}>
      <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} backgroundColor={palette.surface} />

      <View style={s.header}>
        <View style={s.headerTop}>
          <View>
            <Text style={s.appName}>SmartDose</Text>
            <Text style={s.appSub}>Medication Schedule</Text>
          </View>
          <TouchableOpacity style={s.bellBtn} onPress={() => router.push('/notifications')} activeOpacity={0.7}>
            <Bell size={21} color={palette.text} />
            {hasUnread && <View style={s.bellDot} />}
          </TouchableOpacity>
        </View>

        {total === 0 ? (
          <View style={s.progressCard}>
            <Text style={s.progEmpty}>Add medications to track your daily schedule</Text>
          </View>
        ) : (
          <View style={s.progressCard}>
            <View style={s.progRow}>
              <Text style={s.progLabel}>Today's Progress</Text>
              <Text style={[s.progCount, { color: pct === 100 ? cbColors.success : palette.primary }]}>
                {taken}/{total} doses
              </Text>
            </View>
            <View style={s.progTrack}>
              <View style={[s.progFill, {
                width: `${pct}%`,
                backgroundColor: pct === 100 ? cbColors.success : palette.primary,
              }]} />
            </View>
            {pct === 100 && (
              <Text style={[s.progComplete, { color: cbColors.success }]}>All doses taken today! 🎉</Text>
            )}
          </View>
        )}
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        {medications.length > 0 && <>
          <View style={s.viewRow}>
            {(['Today', 'Tomorrow', 'Week'] as const).map(v => (
              <TouchableOpacity
                key={v}
                style={[s.viewChip, view === v && s.viewChipActive]}
                onPress={() => {
                  setView(v);
                  if (v === 'Today')    setSelDate(new Date());
                  if (v === 'Tomorrow') { const t = new Date(); t.setDate(t.getDate()+1); setSelDate(t); }
                }}
                activeOpacity={0.7}
              >
                <Text style={[s.viewChipTxt, view === v && s.viewChipTxtActive]}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {view === 'Week' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.weekScroll} contentContainerStyle={{ paddingHorizontal: Space.lg, gap: Space.sm }}>
              {weekDays.map((day, i) => (
                <TouchableOpacity
                  key={i}
                  style={[s.weekDay, isToday(day) && s.weekDayToday, selDate.toDateString() === day.toDateString() && !isToday(day) && s.weekDaySelected]}
                  onPress={() => setSelDate(day)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.weekDayName, (isToday(day) || selDate.toDateString() === day.toDateString()) && { color: '#fff' }]}>
                    {DAYS[day.getDay()]}
                  </Text>
                  <Text style={[s.weekDayNum, (isToday(day) || selDate.toDateString() === day.toDateString()) && { color: '#fff' }]}>
                    {day.getDate()}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <View style={s.dateRow}>
            <View style={s.datePill}>
              <Text style={s.dateTxt}>{dateLabel}</Text>
            </View>
          </View>
        </>}

        {SECTIONS.map(({ key, label }) => (
          grouped[key].length === 0 ? null : (
            <View key={key} style={s.section}>
              <View style={s.sectionHeader}>
                <SectionIcon label={label} />
                <Text style={s.sectionTitle}>{label}</Text>
                <Text style={s.sectionCount}>{grouped[key].filter(m => m.taken).length}/{grouped[key].length}</Text>
              </View>
              {grouped[key].map(med => (
                <MedRow
                  key={med.id}
                  med={med}
                  onTaken={() => handleTaken(med)}
                />
              ))}
            </View>
          )
        ))}

        {medications.length === 0 && (
          <View style={s.emptyBox}>
            <Text style={s.emptyIcon}>💊</Text>
            <Text style={s.emptyTitle}>No medications scheduled</Text>
            <Text style={s.emptySub}>Add medications using the + button on the Home tab</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (P: typeof Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: P.background },

  header: {
    backgroundColor: P.surface,
    paddingTop: 52, paddingHorizontal: Space.xl,
    paddingBottom: Space.md,
    borderBottomWidth: 1, borderBottomColor: P.border,
    ...Shadows.card,
  },
  headerTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: Space.md,
  },
  appName: { ...Type.hero, color: P.text },
  appSub:  { ...Type.caption, color: P.textMuted, marginTop: 2 },
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

  progressCard: { backgroundColor: P.background, borderRadius: Radius.md, padding: Space.md, borderWidth: 1, borderColor: P.border },
  progRow:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progLabel:    { ...Type.label, color: P.textMuted },
  progCount:    { ...Type.label },
  progTrack:    { height: 8, backgroundColor: P.border, borderRadius: Radius.full, overflow: 'hidden' },
  progFill:     { height: 8, borderRadius: Radius.full },
  progComplete: { ...Type.caption, color: P.green, marginTop: 6, textAlign: 'center' },
  progEmpty:    { ...Type.caption, color: P.textSoft, textAlign: 'center', paddingVertical: 4 },

  scroll: { flex: 1 },

  viewRow: { flexDirection: 'row', gap: Space.sm, padding: Space.lg, paddingBottom: Space.sm },
  viewChip: {
    paddingHorizontal: 18, paddingVertical: 9,
    borderRadius: Radius.full, borderWidth: 1,
    borderColor: P.border, backgroundColor: P.surface,
  },
  viewChipActive:    { backgroundColor: P.primary, borderColor: P.primary, ...Shadows.button },
  viewChipTxt:       { ...Type.label, color: P.textMuted },
  viewChipTxtActive: { color: '#fff' },

  weekScroll: { marginBottom: Space.sm },
  weekDay: {
    alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: Radius.md, borderWidth: 1, borderColor: P.border,
    backgroundColor: P.surface, minWidth: 54,
  },
  weekDayToday:    { backgroundColor: P.primary, borderColor: P.primary },
  weekDaySelected: { backgroundColor: P.primaryDark, borderColor: P.primaryDark },
  weekDayName:     { ...Type.caption, color: P.textMuted, marginBottom: 4 },
  weekDayNum:      { fontSize: 18, fontWeight: '900', color: P.text },

  dateRow:  { paddingHorizontal: Space.lg, marginBottom: Space.sm },
  datePill: { alignSelf: 'flex-start', backgroundColor: P.primarySoft, paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full },
  dateTxt:  { ...Type.label, color: P.primary },

  section:       { paddingHorizontal: Space.lg, marginBottom: Space.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginBottom: Space.sm },
  sectionTitle:  { ...Type.micro, color: P.textMuted, flex: 1 },
  sectionCount:  { ...Type.caption, color: P.textMuted },

  emptyBox:  { alignItems: 'center', padding: 48, gap: Space.md },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { ...Type.heading, color: P.text },
  emptySub:   { ...Type.label, color: P.textSoft, textAlign: 'center', fontWeight: '500' },
});

const makeRowStyles = (P: typeof Palette) => StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: P.surface,
    borderRadius: Radius.lg, marginBottom: Space.sm,
    borderWidth: 1, borderColor: P.border,
    overflow: 'hidden', ...Shadows.card,
  },
  strip:    { width: 4, alignSelf: 'stretch' },
  iconWrap: { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', margin: Space.md },
  dot:      { width: 14, height: 14, borderRadius: 7 },
  body:     { flex: 1, paddingVertical: Space.md },
  name:     { ...Type.label, color: P.text, fontSize: 15 },
  nameTaken:{ textDecorationLine: 'line-through', color: P.textSoft },
  dosage:   { ...Type.caption, color: P.textMuted, marginTop: 2 },
  meta:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  metaTxt:  { ...Type.caption, color: P.textSoft },
  sep:      { width: 3, height: 3, borderRadius: 2, backgroundColor: P.textSoft },
  btn: {
    backgroundColor: P.primary,
    paddingHorizontal: Space.md, paddingVertical: Space.sm,
    borderRadius: Radius.sm, marginRight: Space.md,
    alignItems: 'center', ...Shadows.button,
  },
  btnTxt:    { color: '#fff', fontWeight: '700', fontSize: 12, textAlign: 'center' },
  takenBadge:{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: Space.md, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.sm },
  takenTxt:  { ...Type.caption, color: P.green },
});
