import { useRouter } from 'expo-router';
import { ref, set } from 'firebase/database';
import { addDoc, collection } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Modal, Pressable, ScrollView, StatusBar, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Palette } from '../constants/theme';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { db, rtdb } from '../services/firebase';
import { listenDeviceStatus } from '../services/medicationService';

const COLORS    = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
const CB_COLORS = ['#2563EB', '#0891B2', '#D97706', '#C2410C', '#7C3AED', '#DB2777'];
const FREQUENCIES = ['Once daily', 'Twice daily', '3x daily', '4x daily', 'Weekly'];
const MEAL_OPTIONS = ['Before meal', 'After meal', 'With meal', 'No preference'];
const PILL_COUNTS = ['1', '2', '3'];

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

          {/* Big clock display */}
          <View style={ps.clockRow}>
            <Text style={ps.clockTime}>{padNum(hour)}:{padNum(minute)}</Text>
            <View style={[ps.ampmBadge, { backgroundColor: palette.primarySoft }]}>
              <Text style={[ps.ampmTxt, { color: palette.primary }]}>{ampm}</Text>
            </View>
          </View>

          {/* +/- controls */}
          <View style={ps.controls}>
            {/* Hour */}
            <View style={ps.col}>
              <Text style={ps.colLabel}>Hour</Text>
              <TouchableOpacity style={ps.btn} onPress={() => setHour(h => (h + 1) % 24)} activeOpacity={0.7}>
                <Text style={ps.btnTxt}>＋</Text>
              </TouchableOpacity>
              <View style={ps.valueBox}>
                <Text style={ps.valueNum}>{padNum(hour)}</Text>
              </View>
              <TouchableOpacity style={ps.btn} onPress={() => setHour(h => (h - 1 + 24) % 24)} activeOpacity={0.7}>
                <Text style={ps.btnTxt}>－</Text>
              </TouchableOpacity>
            </View>

            <Text style={ps.colon}>:</Text>

            {/* Minute */}
            <View style={ps.col}>
              <Text style={ps.colLabel}>Min</Text>
              <TouchableOpacity style={ps.btn} onPress={() => setMinute(m => (m + 5) % 60)} activeOpacity={0.7}>
                <Text style={ps.btnTxt}>＋</Text>
              </TouchableOpacity>
              <View style={ps.valueBox}>
                <Text style={ps.valueNum}>{padNum(minute)}</Text>
              </View>
              <TouchableOpacity style={ps.btn} onPress={() => setMinute(m => (m - 5 + 60) % 60)} activeOpacity={0.7}>
                <Text style={ps.btnTxt}>－</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick presets */}
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

          {/* Buttons */}
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

// ─── Main Add Medication Screen ────────────────────────────────────────────────
export default function ModalScreen() {
  const router = useRouter();
  const { speak, voiceEnabled, colorBlindMode, palette, darkMode } = useAccessibility();
  const colors = colorBlindMode ? CB_COLORS : COLORS;
  const s = useMemo(() => makeStyles(palette), [palette]);

  const [name, setName]           = useState('');
  const [dosage, setDosage]       = useState('');
  const [compartment, setComp]    = useState('1');
  const [color, setColor]         = useState(colors[0]);
  const [frequency, setFrequency] = useState('Once daily');
  const [times, setTimes]         = useState(['08:00']);
  const [mealPref, setMealPref]   = useState('No preference');
  const [totalPills, setTotal]    = useState('30');
  const [pillCount, setPillCount] = useState('1');
  const [notes, setNotes]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [device, setDevice]       = useState<any>(null);

  // Time picker state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerIndex, setPickerIndex]     = useState(0);

  useEffect(() => {
    if (voiceEnabled) speak('Add or edit medication details.');
    const unsub = listenDeviceStatus(setDevice);
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connected = !!device?.connected;

  const updateFrequency = (freq: string) => {
    setFrequency(freq);
    const count = freq === 'Once daily' ? 1 : freq === 'Twice daily' ? 2 : freq === '3x daily' ? 3 : freq === '4x daily' ? 4 : 1;
    const defaultTimes = ['08:00', '12:00', '18:00', '22:00'];
    setTimes(defaultTimes.slice(0, count));
  };

  const openPicker = (index: number) => {
    setPickerIndex(index);
    setPickerVisible(true);
  };

  const handlePickerDone = (time: string) => {
    const newTimes = [...times];
    newTimes[pickerIndex] = time;
    setTimes(newTimes);
    setPickerVisible(false);
  };

  const handleSave = async () => {
    if (!name.trim() || !dosage.trim()) {
      Alert.alert('Missing Info', 'Medicine name and dosage are required.');
      return;
    }
    const compNum = parseInt(compartment);
    if (isNaN(compNum) || compNum < 1 || compNum > 3) {
      Alert.alert('Invalid Compartment', 'Please select compartment 1, 2, or 3.');
      return;
    }

    setLoading(true);
    try {
      const docRef = await addDoc(collection(db, 'medications'), {
        name: name.trim(), dosage: dosage.trim(),
        compartment: compNum, color, frequency, times,
        time: times[0], mealPreference: mealPref,
        totalPills: parseInt(totalPills) || 30,
        currentPills: parseInt(totalPills) || 30,
        pillCount: parseInt(pillCount) || 1,
        notes: notes.trim(), active: true, taken: false,
      });

      for (let i = 0; i < times.length; i++) {
        const [hourStr, minuteStr] = times[i].split(':');
        await set(ref(rtdb, `medications/${docRef.id}_${i}`), {
          name: name.trim(), time: times[i],
          hour: parseInt(hourStr) || 0,
          minute: parseInt(minuteStr) || 0,
          compartment: compNum,
          pillCount: parseInt(pillCount) || 1,
          active: true, taken: false,
        });
      }

      const syncMsg = connected
        ? 'Device will sync in up to 5 minutes.'
        : 'Device is offline — it will sync when it reconnects.';
      Alert.alert('Saved!', `${name.trim()} scheduled. ${syncMsg}`);
      router.back();
    } catch (e) {
      Alert.alert('Error', 'Failed to save. Please try again.');
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={s.safeArea}>
      <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} backgroundColor={palette.surface} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.headerBtn} onPress={() => router.back()} activeOpacity={0.6}>
          <Text style={s.cancel}>Cancel</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.title}>Add Medicine</Text>
          {/* Device status chip */}
          <View style={[s.deviceChip, { backgroundColor: connected ? '#D1FAE5' : '#FEE2E2' }]}>
            <View style={[s.deviceDot, { backgroundColor: connected ? '#059669' : '#EF4444' }]} />
            <Text style={[s.deviceTxt, { color: connected ? '#059669' : '#EF4444' }]}>
              {connected ? 'Device Online' : 'Device Offline'}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={s.headerBtn} onPress={handleSave} disabled={loading} activeOpacity={0.6}>
          <Text style={s.save}>{loading ? '...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      {/* Offline warning banner */}
      {!connected && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineTxt}>
            ⚠️  Device is offline. The schedule will sync once it reconnects.
          </Text>
        </View>
      )}

      <ScrollView style={s.container} showsVerticalScrollIndicator={false}>

        {/* Basic Info */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>BASIC INFO</Text>
          <TextInput
            style={s.input}
            placeholder="Medicine name (e.g. Metformin)"
            value={name}
            onChangeText={setName}
            placeholderTextColor={palette.textSoft}
          />
          <TextInput
            style={s.input}
            placeholder="Dosage (e.g. 500mg)"
            value={dosage}
            onChangeText={setDosage}
            placeholderTextColor={palette.textSoft}
          />
        </View>

        {/* Compartment */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>COMPARTMENT</Text>
          <Text style={s.sectionHint}>Which physical compartment holds this medicine?</Text>
          <View style={s.compRow}>
            {['1', '2', '3'].map(c => (
              <TouchableOpacity
                key={c}
                style={[s.compBtn, compartment === c && s.compSelected]}
                onPress={() => setComp(c)}
                activeOpacity={0.75}
              >
                <Text style={[s.compNum, compartment === c && s.compNumSelected]}>C{c}</Text>
                <Text style={[s.compLabel, compartment === c && s.compLabelSelected]}>Compartment {c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Pills Per Dose */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>PILLS PER DOSE</Text>
          <Text style={s.sectionHint}>How many pills should the motor dispense each time?</Text>
          <View style={s.pillRow}>
            {PILL_COUNTS.map(p => (
              <TouchableOpacity
                key={p}
                style={[s.pillBtn, pillCount === p && s.pillSelected]}
                onPress={() => setPillCount(p)}
                activeOpacity={0.75}
              >
                <Text style={[s.pillText, pillCount === p && s.pillTextSelected]}>
                  {p} {p === '1' ? 'pill' : 'pills'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Color */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>COLOR LABEL</Text>
          <View style={s.colorRow}>
            {colors.map(c => (
              <TouchableOpacity
                key={c}
                style={[s.colorDot, { backgroundColor: c }, color === c && s.colorSelected]}
                onPress={() => setColor(c)}
                activeOpacity={0.8}
              />
            ))}
          </View>
        </View>

        {/* Frequency */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>FREQUENCY</Text>
          <View style={s.optionRow}>
            {FREQUENCIES.map(f => (
              <TouchableOpacity
                key={f}
                style={[s.optionBtn, frequency === f && s.optionSelected]}
                onPress={() => updateFrequency(f)}
                activeOpacity={0.75}
              >
                <Text style={[s.optionText, frequency === f && s.optionTextSelected]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Dose Times — tap to open picker */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>DOSE TIMES</Text>
          <Text style={s.sectionHint}>Tap a time to change it. Device will dispense at these exact times.</Text>
          {times.map((t, i) => (
            <TouchableOpacity
              key={i}
              style={s.timeBtn}
              onPress={() => openPicker(i)}
              activeOpacity={0.75}
            >
              <View>
                <Text style={s.timeBtnLabel}>Dose {i + 1}</Text>
                <Text style={s.timeBtnSub}>Tap to change</Text>
              </View>
              <View style={s.timeBtnRight}>
                <Text style={s.timeBtnValue}>{t}</Text>
                <Text style={s.timeBtnAmPm}>{parseInt(t.split(':')[0]) < 12 ? 'AM' : 'PM'}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Meal Preference */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>MEAL PREFERENCE</Text>
          <View style={s.optionRow}>
            {MEAL_OPTIONS.map(m => (
              <TouchableOpacity
                key={m}
                style={[s.optionBtn, mealPref === m && s.optionSelected]}
                onPress={() => setMealPref(m)}
                activeOpacity={0.75}
              >
                <Text style={[s.optionText, mealPref === m && s.optionTextSelected]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Total pills */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>TOTAL PILLS IN COMPARTMENT</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. 30"
            value={totalPills}
            onChangeText={setTotal}
            keyboardType="numeric"
            placeholderTextColor={palette.textSoft}
          />
        </View>

        {/* Notes */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>NOTES</Text>
          <TextInput
            style={[s.input, { height: 80 }]}
            placeholder="Special instructions..."
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholderTextColor={palette.textSoft}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Time Picker Modal */}
      <TimePickerModal
        visible={pickerVisible}
        value={times[pickerIndex] ?? '08:00'}
        onDone={handlePickerDone}
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
  headerCenter:{ alignItems: 'center', gap: 4 },
  cancel:      { color: '#ef4444', fontSize: 16 },
  title:       { fontSize: 17, fontWeight: '800', color: P.text },
  save:        { color: P.primary, fontSize: 16, fontWeight: '700', textAlign: 'right' },
  deviceChip:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  deviceDot:   { width: 6, height: 6, borderRadius: 3 },
  deviceTxt:   { fontSize: 11, fontWeight: '700' },
  offlineBanner:{ backgroundColor: '#FEF3C7', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#FDE68A' },
  offlineTxt:  { fontSize: 13, color: '#92400E', fontWeight: '600' },
  section:     { margin: 16, marginBottom: 0, backgroundColor: P.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: P.border },
  sectionTitle:{ fontSize: 12, fontWeight: '700', color: P.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionHint: { fontSize: 12, color: P.textSoft, marginBottom: 12 },
  input:       { backgroundColor: P.background, borderWidth: 1, borderColor: P.border, borderRadius: 10, padding: 12, fontSize: 15, color: P.text, marginBottom: 10 },
  colorRow:    { flexDirection: 'row', gap: 12 },
  colorDot:    { width: 36, height: 36, borderRadius: 18 },
  colorSelected:{ borderWidth: 3, borderColor: P.text },
  optionRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn:   { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: P.background, borderWidth: 1, borderColor: P.border },
  optionSelected:{ backgroundColor: P.primary, borderColor: P.primary },
  optionText:  { fontSize: 13, color: P.textMuted },
  optionTextSelected:{ color: '#fff', fontWeight: '600' },
  // Time button
  timeBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: P.background, borderWidth: 1.5, borderColor: P.border, borderRadius: 12, padding: 14, marginBottom: 10 },
  timeBtnLabel:{ fontSize: 14, fontWeight: '700', color: P.text },
  timeBtnSub:  { fontSize: 11, color: P.textSoft, marginTop: 2 },
  timeBtnRight:{ alignItems: 'flex-end' },
  timeBtnValue:{ fontSize: 24, fontWeight: '900', color: P.primary },
  timeBtnAmPm: { fontSize: 12, fontWeight: '700', color: P.textMuted },
  // Compartment
  compRow:     { flexDirection: 'row', gap: 10 },
  compBtn:     { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: P.background, alignItems: 'center', borderWidth: 1, borderColor: P.border },
  compSelected:{ backgroundColor: P.primary, borderColor: P.primary },
  compNum:     { fontSize: 20, fontWeight: '800', color: P.textMuted },
  compNumSelected:{ color: '#fff' },
  compLabel:   { fontSize: 11, color: P.textSoft, marginTop: 2 },
  compLabelSelected:{ color: 'rgba(255,255,255,0.85)' },
  // Pills
  pillRow:     { flexDirection: 'row', gap: 12 },
  pillBtn:     { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: P.background, alignItems: 'center', borderWidth: 1, borderColor: P.border },
  pillSelected:{ backgroundColor: '#059669', borderColor: '#059669' },
  pillText:    { fontSize: 15, color: P.textMuted, fontWeight: '600' },
  pillTextSelected:{ color: '#fff' },
});
