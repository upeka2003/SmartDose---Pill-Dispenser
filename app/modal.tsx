import { useRouter } from 'expo-router';
import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Palette } from '../constants/theme';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { db } from '../services/firebase';

// REST helpers — avoids the browser WebSocket block that affects Firebase SDK RTDB writes
const RTDB_BASE = 'https://smartdose-dcd88-default-rtdb.firebaseio.com';
const RTDB_AUTH = 'CZnwewbitQSo2RY8CvP6nf0lHbX4fAgwS7dZAKMi';

const rtdbPut = async (path: string, data: any) => {
  const url = `${RTDB_BASE}/${path}.json?auth=${RTDB_AUTH}`;
  console.log('[Save] RTDB PUT', path, JSON.stringify(data));
  const res    = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await res.json();
  console.log('[Save] RTDB response', path, JSON.stringify(result));
  return result;
};

const rtdbDel = async (path: string) => {
  const res = await fetch(`${RTDB_BASE}/${path}.json?auth=${RTDB_AUTH}`, { method: 'DELETE' });
  return res.json();
};

const PILL_COUNTS = ['1', '2', '3'];

// Day arrays: index 0 = Sunday … 6 = Saturday (matches DS3231 dayOfTheWeek())
const ALL_DAYS   = [true,  true,  true,  true,  true,  true,  true];
const WEEKDAYS   = [false, true,  true,  true,  true,  true,  false];
const WEEKENDS   = [true,  false, false, false, false, false, true];
const DAY_LABELS = ['Su',  'Mo',  'Tu',  'We',  'Th',  'Fr',  'Sa'];

const padNum = (n: number) => String(n).padStart(2, '0');

// ─── Time Picker Modal ─────────────────────────────────────────────────────────
function TimePickerModal({
  visible, value, onDone, onCancel, palette,
}: {
  visible: boolean;
  value: string;
  onDone: (time: string) => void;
  onCancel: () => void;
  palette: typeof Palette;
}) {
  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState(0);

  useEffect(() => {
    if (visible && value) {
      const parts = value.split(':');
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      setHour(isNaN(h) ? 8 : h % 24);
      setMinute(isNaN(m) ? 0 : m % 60);
    }
  }, [visible, value]);

  const ampm = hour < 12 ? 'AM' : 'PM';
  const PRESETS = ['06:00', '08:00', '12:00', '14:00', '18:00', '22:00'];
  const ps = useMemo(() => makePickerStyles(palette), [palette]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <Pressable style={ps.overlay} onPress={onCancel}>
        <Pressable style={ps.sheet} onPress={() => {}}>
          <Text style={ps.title}>Set Dose Time</Text>

          <View style={ps.clockRow}>
            <Text style={ps.clockTime}>{padNum(hour)}:{padNum(minute)}</Text>
            <View style={[ps.ampmBadge, { backgroundColor: palette.primarySoft }]}>
              <Text style={[ps.ampmTxt, { color: palette.primary }]}>{ampm}</Text>
            </View>
          </View>

          <View style={ps.controls}>
            <View style={ps.col}>
              <Text style={ps.colLabel}>Hour</Text>
              <TouchableOpacity style={ps.btn} onPress={() => setHour(h => (h + 1) % 24)} activeOpacity={0.7}>
                <Text style={ps.btnTxt}>＋</Text>
              </TouchableOpacity>
              <View style={ps.valueBox}><Text style={ps.valueNum}>{padNum(hour)}</Text></View>
              <TouchableOpacity style={ps.btn} onPress={() => setHour(h => (h - 1 + 24) % 24)} activeOpacity={0.7}>
                <Text style={ps.btnTxt}>－</Text>
              </TouchableOpacity>
            </View>

            <Text style={ps.colon}>:</Text>

            <View style={ps.col}>
              <Text style={ps.colLabel}>Min</Text>
              <TouchableOpacity style={ps.btn} onPress={() => setMinute(m => (m + 5) % 60)} activeOpacity={0.7}>
                <Text style={ps.btnTxt}>＋</Text>
              </TouchableOpacity>
              <View style={ps.valueBox}><Text style={ps.valueNum}>{padNum(minute)}</Text></View>
              <TouchableOpacity style={ps.btn} onPress={() => setMinute(m => (m - 5 + 60) % 60)} activeOpacity={0.7}>
                <Text style={ps.btnTxt}>－</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={ps.presetsLabel}>Quick Select</Text>
          <View style={ps.presets}>
            {PRESETS.map(t => {
              const [th, tm] = t.split(':').map(Number);
              const active = th === hour && tm === minute;
              return (
                <TouchableOpacity
                  key={t}
                  style={[ps.preset, active && { backgroundColor: palette.primary, borderColor: palette.primary }]}
                  onPress={() => { setHour(th); setMinute(tm); }}
                  activeOpacity={0.75}
                >
                  <Text style={[ps.presetTxt, active && { color: '#fff' }]}>{t}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={ps.actions}>
            <TouchableOpacity style={ps.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
              <Text style={ps.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ps.doneBtn, { backgroundColor: palette.primary }]}
              onPress={() => onDone(`${padNum(hour)}:${padNum(minute)}`)}
              activeOpacity={0.8}
            >
              <Text style={ps.doneTxt}>Set Time</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makePickerStyles = (P: typeof Palette) => StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet:        { width: '100%', backgroundColor: P.surface, borderRadius: 20, padding: 24 },
  title:        { fontSize: 18, fontWeight: '800', color: P.text, textAlign: 'center', marginBottom: 16 },
  clockRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24, gap: 12 },
  clockTime:    { fontSize: 56, fontWeight: '900', color: P.text, letterSpacing: 2 },
  ampmBadge:    { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  ampmTxt:      { fontSize: 16, fontWeight: '800' },
  controls:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 },
  col:          { alignItems: 'center', gap: 8 },
  colLabel:     { fontSize: 12, fontWeight: '700', color: P.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  btn:          { width: 56, height: 44, borderRadius: 12, backgroundColor: P.background, borderWidth: 1, borderColor: P.border, alignItems: 'center', justifyContent: 'center' },
  btnTxt:       { fontSize: 22, color: P.primary, fontWeight: '700', lineHeight: 26 },
  valueBox:     { width: 72, height: 56, borderRadius: 14, backgroundColor: P.primarySoft, alignItems: 'center', justifyContent: 'center' },
  valueNum:     { fontSize: 32, fontWeight: '900', color: P.primary },
  colon:        { fontSize: 40, fontWeight: '900', color: P.textMuted, marginTop: 16, lineHeight: 48 },
  presetsLabel: { fontSize: 12, fontWeight: '700', color: P.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  presets:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  preset:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: P.background, borderWidth: 1.5, borderColor: P.border },
  presetTxt:    { fontSize: 13, fontWeight: '700', color: P.textMuted },
  actions:      { flexDirection: 'row', gap: 12 },
  cancelBtn:    { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: P.background, borderWidth: 1, borderColor: P.border, alignItems: 'center' },
  cancelTxt:    { fontSize: 15, fontWeight: '700', color: P.textMuted },
  doneBtn:      { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  doneTxt:      { fontSize: 15, fontWeight: '800', color: '#fff' },
});

// ─── Main Screen ───────────────────────────────────────────────────────────────
type CompState = {
  name: string;
  totalPills: number;
  times: string[];
  counts: string[];
  days: boolean[][];   // days[slotIndex][dayIndex]  0=Sun … 6=Sat
};

const defaultComp = (): CompState => ({
  name: '',
  totalPills: 30,
  times: ['08:00'],
  counts: ['1'],
  days: [[...ALL_DAYS]],
});

export default function ModalScreen() {
  const router = useRouter();
  const { speak, voiceEnabled, palette, darkMode } = useAccessibility();
  const s = useMemo(() => makeStyles(palette), [palette]);

  const [compartments, setCompartments] = useState<CompState[]>([
    defaultComp(), defaultComp(), defaultComp(),
  ]);
  const [loading, setLoading]       = useState(false);
  const [pickerComp, setPickerComp] = useState(0);
  const [pickerSlot, setPickerSlot] = useState(0);
  const [pickerVisible, setPickerVisible] = useState(false);

  // Load all 3 compartments from Firestore on mount
  useEffect(() => {
    if (voiceEnabled) speak('Set up compartment medications.');
    getDocs(collection(db, 'medications')).then(snap => {
      setCompartments(prev => {
        const updated: CompState[] = prev.map(c => ({ ...c }));
        snap.docs.forEach(d => {
          const data = d.data() as any;
          const ci = (data.compartment ?? 1) - 1;
          if (ci < 0 || ci > 2) return;

          const loadedTimes = Array.isArray(data.times) && data.times.length > 0
            ? data.times : [data.time ?? '08:00'];
          const loadedCounts = Array.isArray(data.dosePillCounts) && data.dosePillCounts.length > 0
            ? data.dosePillCounts.map((v: any) => String(v))
            : loadedTimes.map(() => String(data.pillCount ?? 1));
          // doseDays is stored as number[] (bitmasks) in Firestore — nested arrays are not supported.
          const loadedDays: boolean[][] = Array.isArray(data.doseDays) && data.doseDays.length === loadedTimes.length
            ? data.doseDays.map((v: any) => {
                if (Array.isArray(v)) return v.map(Boolean);  // backwards compat
                const n = typeof v === 'number' ? v : 127;
                return Array.from({ length: 7 }, (_, i) => !!(n & (1 << i)));
              })
            : loadedTimes.map(() => [...ALL_DAYS]);

          updated[ci] = {
            name: data.name ?? '',
            totalPills: data.totalPills ?? data.currentPills ?? 30,
            times: loadedTimes,
            counts: loadedCounts,
            days: loadedDays,
          };
        });
        return updated;
      });
    }).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const updateComp = (ci: number, field: keyof CompState, value: any) => {
    setCompartments(prev => {
      const next: CompState[] = prev.map(c => ({ ...c }));
      (next[ci] as any)[field] = value;
      return next;
    });
  };

  const addTimeSlot = (ci: number) => {
    setCompartments(prev => {
      const comp = prev[ci];
      if (comp.times.length >= 4) return prev;
      const defaults = ['08:00', '12:00', '18:00', '22:00'];
      const newTime  = defaults[comp.times.length] ?? '12:00';
      const next: CompState[] = prev.map(c => ({
        ...c, times: [...c.times], counts: [...c.counts],
        days: c.days.map(d => [...d]),
      }));
      next[ci].times  = [...next[ci].times, newTime];
      next[ci].counts = [...next[ci].counts, '1'];
      next[ci].days   = [...next[ci].days, [...ALL_DAYS]];
      return next;
    });
  };

  const removeTimeSlot = (ci: number) => {
    setCompartments(prev => {
      if (prev[ci].times.length <= 1) return prev;
      const next: CompState[] = prev.map(c => ({
        ...c, times: [...c.times], counts: [...c.counts],
        days: c.days.map(d => [...d]),
      }));
      next[ci].times  = next[ci].times.slice(0, -1);
      next[ci].counts = next[ci].counts.slice(0, -1);
      next[ci].days   = next[ci].days.slice(0, -1);
      return next;
    });
  };

  const updateTimeSlot = (ci: number, si: number, time: string) => {
    const times = [...compartments[ci].times];
    times[si] = time;
    updateComp(ci, 'times', times);
  };

  const updateCountSlot = (ci: number, si: number, count: string) => {
    const counts = [...compartments[ci].counts];
    counts[si] = count;
    updateComp(ci, 'counts', counts);
  };

  const toggleDay = (ci: number, si: number, di: number) => {
    setCompartments(prev => {
      const next: CompState[] = prev.map(c => ({
        ...c, days: c.days.map(d => [...d]),
      }));
      if (!next[ci].days[si]) next[ci].days[si] = [...ALL_DAYS];
      next[ci].days[si][di] = !next[ci].days[si][di];
      return next;
    });
  };

  const applyDayPreset = (ci: number, si: number, preset: boolean[]) => {
    setCompartments(prev => {
      const next: CompState[] = prev.map(c => ({
        ...c, days: c.days.map(d => [...d]),
      }));
      next[ci].days[si] = [...preset];
      return next;
    });
  };

  // ── Save ─────────────────────────────────────────────────────────────────────
  const COMP_COLORS = ['#6366f1', '#10b981', '#f59e0b'];

  const daysToBitmask = (days: boolean[]) =>
    (days ?? ALL_DAYS).reduce((mask, on, i) => mask | (on ? (1 << i) : 0), 0);

  const handleSave = async () => {
    const filled = compartments.filter(c => c.name.trim());
    if (filled.length === 0) {
      Alert.alert('Missing Info', 'Enter a pill name for at least one compartment.');
      return;
    }
    setLoading(true);
    try {
      for (let ci = 0; ci < 3; ci++) {
        const comp    = compartments[ci];
        const compNum = ci + 1;

        // ── Empty compartment: delete existing docs and RTDB slots ──────────
        if (!comp.name.trim()) {
          const existing = await getDocs(query(collection(db, 'medications'), where('compartment', '==', compNum)));
          for (const d of existing.docs) {
            await deleteDoc(doc(db, 'medications', d.id));
            for (let i = 0; i < 8; i++) await rtdbDel(`smartdose/medications/${d.id}_${i}`);
          }
          continue;
        }

        // ── Build Firestore payload ──────────────────────────────────────────
        const doseCounts    = comp.times.map((_, i) => parseInt(comp.counts[i]) || 1);
        const doseDaysMasks = comp.days.map(daysToBitmask);

        const payload = {
          name:          comp.name.trim(),
          dosage:        `${doseCounts[0]} pill${doseCounts[0] > 1 ? 's' : ''}`,
          compartment:   compNum,
          color:         COMP_COLORS[ci],
          times:         comp.times,
          time:          comp.times[0],
          dosePillCounts: doseCounts,
          pillCount:     doseCounts[0],
          doseDays:      doseDaysMasks,
          totalPills:    comp.totalPills,
          currentPills:  comp.totalPills,
          active:        true,
          taken:         false,
        };
        console.log(`[Save] Firestore payload C${compNum}:`, JSON.stringify(payload));

        // ── Firestore: update or create ──────────────────────────────────────
        const existing    = await getDocs(query(collection(db, 'medications'), where('compartment', '==', compNum)));
        const existingDoc = existing.docs[0];

        for (const oldDoc of existing.docs.slice(1)) {
          await deleteDoc(doc(db, 'medications', oldDoc.id));
          for (let i = 0; i < 8; i++) await rtdbDel(`smartdose/medications/${oldDoc.id}_${i}`);
        }

        const docId = existingDoc?.id;
        if (docId) {
          await updateDoc(doc(db, 'medications', docId), payload);
          console.log(`[Save] Firestore updated doc ${docId}`);
        }
        const savedId = docId ?? (await addDoc(collection(db, 'medications'), payload)).id;
        if (!docId) console.log(`[Save] Firestore created doc ${savedId}`);

        // ── RTDB: clear old slots then write one slot per dose time ─────────
        console.log(`[Save] Clearing RTDB slots for ${savedId}`);
        for (let i = 0; i < 8; i++) await rtdbDel(`smartdose/medications/${savedId}_${i}`);

        for (let i = 0; i < comp.times.length; i++) {
          const [h, m] = comp.times[i].split(':');
          const slotData = {
            medicationId: savedId,
            name:         comp.name.trim(),
            time:         comp.times[i],
            hour:         parseInt(h) || 0,
            minute:       parseInt(m) || 0,
            days:         daysToBitmask(comp.days[i] ?? ALL_DAYS),  // uint8 bitmask the firmware expects
            compartment:  compNum,
            pillCount:    doseCounts[i],
            active:       true,
            taken:        false,
          };
          await rtdbPut(`smartdose/medications/${savedId}_${i}`, slotData);
        }
        console.log(`[Save] C${compNum} done — ${comp.times.length} slot(s) written`);
      }

      if (Platform.OS === 'web') {
        window.alert('Saved! All compartments updated. Device will sync within 5 minutes.');
      } else {
        Alert.alert('Saved!', 'All compartments updated. Device will sync within 5 minutes.');
      }
      router.back();
    } catch (e: any) {
      console.error('[Save] ERROR:', e?.message ?? e);
      if (Platform.OS === 'web') {
        window.alert('Error: ' + (e?.message ?? 'Failed to save. Please try again.'));
      } else {
        Alert.alert('Error', e?.message ?? 'Failed to save. Please try again.');
      }
    }
    setLoading(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safeArea}>
      <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} backgroundColor={palette.surface} />

      <View style={s.header}>
        <TouchableOpacity style={s.headerBtn} onPress={() => router.back()} activeOpacity={0.6}>
          <Text style={s.cancel}>Cancel</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.title}>Set Compartments</Text>
        </View>
        <TouchableOpacity style={s.headerBtn} onPress={handleSave} disabled={loading} activeOpacity={0.6}>
          <Text style={s.save}>{loading ? '...' : 'Save All'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
        <Text style={s.pageHint}>Fill in each compartment and set dose days, then tap Save All.</Text>

        {compartments.map((comp, ci) => (
          <View key={ci} style={s.compCard}>
            {/* Card header */}
            <View style={s.compCardHeader}>
              <View style={[s.compBadge, { backgroundColor: palette.primary }]}>
                <Text style={s.compBadgeTxt}>C{ci + 1}</Text>
              </View>
              <Text style={s.compCardTitle}>Compartment {ci + 1}</Text>
              {comp.name.trim() ? (
                <View style={s.setChip}>
                  <Text style={s.setChipTxt}>Set ✓</Text>
                </View>
              ) : null}
            </View>

            {/* Pill Name */}
            <Text style={s.fieldLabel}>PILL NAME</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Panadol"
              value={comp.name}
              onChangeText={v => updateComp(ci, 'name', v)}
              placeholderTextColor={palette.textSoft}
            />

            {/* Total pills counter */}
            <Text style={s.fieldLabel}>TOTAL PILLS</Text>
            <View style={s.counter}>
              <TouchableOpacity style={s.counterBtn} onPress={() => updateComp(ci, 'totalPills', Math.max(1, comp.totalPills - 1))} activeOpacity={0.7}>
                <Text style={s.counterBtnTxt}>－</Text>
              </TouchableOpacity>
              <Text style={s.counterVal}>{comp.totalPills}</Text>
              <TouchableOpacity style={s.counterBtn} onPress={() => updateComp(ci, 'totalPills', comp.totalPills + 1)} activeOpacity={0.7}>
                <Text style={s.counterBtnTxt}>＋</Text>
              </TouchableOpacity>
            </View>

            {/* Dose Times */}
            <View style={s.doseHeader}>
              <View>
                <Text style={s.fieldLabel}>DOSE TIMES & DAYS</Text>
                <Text style={s.sectionHint}>Tap time to change. Select days and pills per dose.</Text>
              </View>
              <View style={s.doseHeaderBtns}>
                {comp.times.length > 1 && (
                  <TouchableOpacity style={s.slotBtn} onPress={() => removeTimeSlot(ci)} activeOpacity={0.7}>
                    <Text style={s.slotBtnTxt}>－</Text>
                  </TouchableOpacity>
                )}
                {comp.times.length < 4 && (
                  <TouchableOpacity style={[s.slotBtn, s.slotBtnAdd]} onPress={() => addTimeSlot(ci)} activeOpacity={0.7}>
                    <Text style={[s.slotBtnTxt, { color: palette.primary }]}>＋ Add</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {comp.times.map((t, si) => {
              const slotDays = comp.days[si] ?? [...ALL_DAYS];
              const isEvery    = slotDays.every(Boolean);
              const isWeekdays = slotDays.every((v, i) => v === WEEKDAYS[i]);
              const isWeekends = slotDays.every((v, i) => v === WEEKENDS[i]);

              return (
                <View key={si} style={s.doseBlock}>
                  {/* Time + Pills row */}
                  <View style={s.doseRow}>
                    <TouchableOpacity
                      style={[s.timeBtn, { flex: 1, marginBottom: 0 }]}
                      onPress={() => { setPickerComp(ci); setPickerSlot(si); setPickerVisible(true); }}
                      activeOpacity={0.75}
                    >
                      <View>
                        <Text style={s.timeBtnLabel}>Dose {si + 1}</Text>
                        <Text style={s.timeBtnSub}>Tap to change</Text>
                      </View>
                      <View style={s.timeBtnRight}>
                        <Text style={s.timeBtnValue}>{t}</Text>
                        <Text style={s.timeBtnAmPm}>{parseInt(t.split(':')[0]) < 12 ? 'AM' : 'PM'}</Text>
                      </View>
                    </TouchableOpacity>
                    <View style={s.dosePills}>
                      <Text style={s.dosePillsLabel}>Pills</Text>
                      <View style={s.dosePillBtns}>
                        {PILL_COUNTS.map(p => (
                          <TouchableOpacity
                            key={p}
                            style={[s.dosePillBtn, (comp.counts[si] ?? '1') === p && s.dosePillSelected]}
                            onPress={() => updateCountSlot(ci, si, p)}
                            activeOpacity={0.75}
                          >
                            <Text style={[s.dosePillText, (comp.counts[si] ?? '1') === p && s.dosePillTextSelected]}>{p}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>

                  {/* Day toggles */}
                  <View style={s.dayRow}>
                    {DAY_LABELS.map((label, di) => {
                      const on = slotDays[di] ?? true;
                      return (
                        <TouchableOpacity
                          key={di}
                          style={[s.dayBtn, on && { backgroundColor: palette.primary, borderColor: palette.primary }]}
                          onPress={() => toggleDay(ci, si, di)}
                          activeOpacity={0.75}
                        >
                          <Text style={[s.dayBtnTxt, on && { color: '#fff' }]}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity
                      style={[s.dayPreset, isEvery && { borderColor: palette.primary }]}
                      onPress={() => applyDayPreset(ci, si, [...ALL_DAYS])}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.dayPresetTxt, isEvery && { color: palette.primary }]}>Every</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.dayPreset, isWeekdays && { borderColor: palette.primary }]}
                      onPress={() => applyDayPreset(ci, si, [...WEEKDAYS])}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.dayPresetTxt, isWeekdays && { color: palette.primary }]}>Wkday</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.dayPreset, isWeekends && { borderColor: palette.primary }]}
                      onPress={() => applyDayPreset(ci, si, [...WEEKENDS])}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.dayPresetTxt, isWeekends && { color: palette.primary }]}>Wkend</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>

      <TimePickerModal
        visible={pickerVisible}
        value={compartments[pickerComp]?.times[pickerSlot] ?? '08:00'}
        onDone={time => {
          updateTimeSlot(pickerComp, pickerSlot, time);
          setPickerVisible(false);
        }}
        onCancel={() => setPickerVisible(false)}
        palette={palette}
      />
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const makeStyles = (P: typeof Palette) => StyleSheet.create({
  safeArea:    { flex: 1, backgroundColor: P.background },
  container:   { flex: 1, backgroundColor: P.background },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: P.surface, borderBottomWidth: 1, borderBottomColor: P.border },
  headerBtn:   { padding: 8, minWidth: 60 },
  headerCenter:{ alignItems: 'center' },
  cancel:      { color: '#ef4444', fontSize: 16 },
  title:       { fontSize: 17, fontWeight: '800', color: P.text },
  save:        { color: P.primary, fontSize: 16, fontWeight: '700', textAlign: 'right' },
  pageHint:    { fontSize: 13, color: P.textSoft, textAlign: 'center', marginTop: 16, marginBottom: 4, paddingHorizontal: 24 },

  // Compartment card
  compCard:       { margin: 16, marginBottom: 0, backgroundColor: P.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: P.border },
  compCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  compBadge:      { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  compBadgeTxt:   { fontSize: 15, fontWeight: '900', color: '#fff' },
  compCardTitle:  { fontSize: 16, fontWeight: '800', color: P.text, flex: 1 },
  setChip:        { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: '#D1FAE5' },
  setChipTxt:     { fontSize: 11, fontWeight: '700', color: '#065F46' },

  input:       { backgroundColor: P.background, borderWidth: 1, borderColor: P.border, borderRadius: 10, padding: 12, fontSize: 15, color: P.text, marginBottom: 14 },

  // Total pills counter
  fieldLabel:    { fontSize: 12, fontWeight: '700', color: P.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionHint:   { fontSize: 12, color: P.textSoft, marginBottom: 8 },
  counter:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  counterBtn:    { width: 52, height: 52, borderRadius: 12, backgroundColor: P.background, borderWidth: 1.5, borderColor: P.border, alignItems: 'center', justifyContent: 'center' },
  counterBtnTxt: { fontSize: 24, color: P.primary, fontWeight: '700' },
  counterVal:    { fontSize: 36, fontWeight: '900', color: P.text, minWidth: 80, textAlign: 'center' },

  // Dose times header
  doseHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  doseHeaderBtns: { flexDirection: 'row', gap: 8, marginTop: 2 },
  slotBtn:        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: P.background, borderWidth: 1, borderColor: P.border },
  slotBtnAdd:     { borderColor: P.primary + '60' },
  slotBtnTxt:     { fontSize: 13, fontWeight: '700', color: P.textMuted },

  // Dose block (time row + day row grouped)
  doseBlock:    { marginBottom: 12 },

  // Time button
  timeBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: P.background, borderWidth: 1.5, borderColor: P.border, borderRadius: 12, padding: 14 },
  timeBtnLabel:    { fontSize: 14, fontWeight: '700', color: P.text },
  timeBtnSub:      { fontSize: 11, color: P.textSoft, marginTop: 2 },
  timeBtnRight:    { alignItems: 'flex-end' },
  timeBtnValue:    { fontSize: 24, fontWeight: '900', color: P.primary },
  timeBtnAmPm:     { fontSize: 12, fontWeight: '700', color: P.textMuted },
  doseRow:         { flexDirection: 'row', alignItems: 'stretch', gap: 10, marginBottom: 6 },

  // Pills selector
  dosePills:          { width: 92, backgroundColor: P.background, borderWidth: 1.5, borderColor: P.border, borderRadius: 12, padding: 8, justifyContent: 'center' },
  dosePillsLabel:     { fontSize: 10, fontWeight: '800', color: P.textMuted, textAlign: 'center', marginBottom: 6, textTransform: 'uppercase' },
  dosePillBtns:       { flexDirection: 'row', gap: 4, justifyContent: 'center' },
  dosePillBtn:        { width: 24, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: P.surface, borderWidth: 1, borderColor: P.border },
  dosePillSelected:   { backgroundColor: P.primary, borderColor: P.primary },
  dosePillText:       { fontSize: 12, fontWeight: '800', color: P.textMuted },
  dosePillTextSelected:{ color: '#fff' },

  // Day row
  dayRow:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  dayBtn:       { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: P.background, borderWidth: 1.5, borderColor: P.border },
  dayBtnTxt:    { fontSize: 9, fontWeight: '800', color: P.textMuted },
  dayPreset:    { paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8, backgroundColor: P.background, borderWidth: 1.5, borderColor: P.border },
  dayPresetTxt: { fontSize: 9, fontWeight: '800', color: P.textMuted },
});
