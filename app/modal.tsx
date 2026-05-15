import { useRouter } from 'expo-router';
import { ref, set } from 'firebase/database';
import { addDoc, collection } from 'firebase/firestore';
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Palette } from '../constants/theme';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { db, rtdb } from '../services/firebase';

const COLORS    = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
const CB_COLORS = ['#2563EB', '#0891B2', '#D97706', '#C2410C', '#7C3AED', '#DB2777'];
const FREQUENCIES = ['Once daily', 'Twice daily', '3x daily', '4x daily', 'Weekly'];
const MEAL_OPTIONS = ['Before meal', 'After meal', 'With meal', 'No preference'];
const PILL_COUNTS = ['1', '2', '3'];

export default function ModalScreen() {
  const router = useRouter();
  const { speak, voiceEnabled, colorBlindMode, palette, darkMode } = useAccessibility();
  const colors = colorBlindMode ? CB_COLORS : COLORS;
  const s = useMemo(() => makeStyles(palette), [palette]);

  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [compartment, setCompartment] = useState('1');
  const [color, setColor] = useState(colors[0]);
  const [frequency, setFrequency] = useState('Once daily');
  const [times, setTimes] = useState(['08:00']);
  const [mealPref, setMealPref] = useState('No preference');
  const [totalPills, setTotalPills] = useState('30');
  const [pillCount, setPillCount] = useState('1');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (voiceEnabled) {
      speak('Add or edit medication details.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled]);

  const updateFrequency = (freq: string) => {
    setFrequency(freq);
    const count = freq === 'Once daily' ? 1 : freq === 'Twice daily' ? 2 : freq === '3x daily' ? 3 : freq === '4x daily' ? 4 : 1;
    const defaultTimes = ['08:00', '12:00', '18:00', '22:00'];
    setTimes(defaultTimes.slice(0, count));
  };

  const updateTime = (index: number, value: string) => {
    const newTimes = [...times];
    newTimes[index] = value;
    setTimes(newTimes);
  };

  const handleSave = async () => {
    if (!name || !dosage) {
      Alert.alert('Error', 'Name and dosage required!');
      return;
    }
    const compNum = parseInt(compartment);
    if (isNaN(compNum) || compNum < 1 || compNum > 3) {
      Alert.alert('Error', 'Invalid compartment! Please enter 1, 2, or 3.');
      return;
    }

    setLoading(true);
    try {
      const docRef = await addDoc(collection(db, 'medications'), {
        name, dosage, compartment: compNum, color, frequency, times,
        time: times[0], mealPreference: mealPref,
        totalPills: parseInt(totalPills), currentPills: parseInt(totalPills),
        pillCount: parseInt(pillCount), notes, active: true, taken: false,
      });

      for (let i = 0; i < times.length; i++) {
        const [hourStr, minuteStr] = times[i].split(':');
        await set(ref(rtdb, `medications/${docRef.id}_${i}`), {
          name, time: times[i],
          hour: parseInt(hourStr), minute: parseInt(minuteStr),
          compartment: compNum, pillCount: parseInt(pillCount),
          active: true, taken: false,
        });
      }

      Alert.alert('Success!', `${name} added! ESP32 will sync in 5 minutes.`);
      router.back();
    } catch (e) {
      Alert.alert('Error', 'Failed to save!');
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={s.safeArea}>
      <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} backgroundColor={palette.surface} />
      <View style={s.header}>
        <TouchableOpacity style={s.headerBtn} onPress={() => router.back()} activeOpacity={0.6}>
          <Text style={s.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={s.title}>Add Medicine 💊</Text>
        <TouchableOpacity style={s.headerBtn} onPress={handleSave} disabled={loading} activeOpacity={0.6}>
          <Text style={s.save}>{loading ? '...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={s.container} showsVerticalScrollIndicator={false}>

        <View style={s.section}>
          <Text style={s.sectionTitle}>BASIC INFO</Text>
          <TextInput style={s.input} placeholder="Medicine name" value={name} onChangeText={setName} placeholderTextColor={palette.textSoft} />
          <TextInput style={s.input} placeholder="Dosage (e.g. 500mg)" value={dosage} onChangeText={setDosage} placeholderTextColor={palette.textSoft} />
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>COMPARTMENT</Text>
          <Text style={s.sectionHint}>Select which compartment holds this medicine</Text>
          <View style={s.compRow}>
            {['1', '2', '3'].map(c => (
              <TouchableOpacity
                key={c}
                style={[s.compBtn, compartment === c && s.compSelected]}
                onPress={() => setCompartment(c)}
              >
                <Text style={[s.compNum, compartment === c && s.compNumSelected]}>C{c}</Text>
                <Text style={[s.compLabel, compartment === c && s.compLabelSelected]}>Compartment {c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>PILLS PER DOSE</Text>
          <Text style={s.sectionHint}>Motor rotations = pill count</Text>
          <View style={s.pillRow}>
            {PILL_COUNTS.map(p => (
              <TouchableOpacity
                key={p}
                style={[s.pillBtn, pillCount === p && s.pillSelected]}
                onPress={() => setPillCount(p)}
              >
                <Text style={[s.pillText, pillCount === p && s.pillTextSelected]}>
                  {p} {p === '1' ? 'pill' : 'pills'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>COLOR</Text>
          <View style={s.colorRow}>
            {colors.map(c => (
              <TouchableOpacity key={c} style={[s.colorDot, { backgroundColor: c }, color === c && s.colorSelected]} onPress={() => setColor(c)} />
            ))}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>FREQUENCY</Text>
          <View style={s.optionRow}>
            {FREQUENCIES.map(f => (
              <TouchableOpacity key={f} style={[s.optionBtn, frequency === f && s.optionSelected]} onPress={() => updateFrequency(f)}>
                <Text style={[s.optionText, frequency === f && s.optionTextSelected]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>DOSE TIMES</Text>
          {times.map((t, i) => (
            <View key={i} style={s.timeRow}>
              <Text style={s.timeLabel}>Dose {i + 1}</Text>
              <TextInput style={s.timeInput} value={t} onChangeText={v => updateTime(i, v)} placeholder="HH:MM" placeholderTextColor={palette.textSoft} />
            </View>
          ))}
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>MEAL PREFERENCE</Text>
          <View style={s.optionRow}>
            {MEAL_OPTIONS.map(m => (
              <TouchableOpacity key={m} style={[s.optionBtn, mealPref === m && s.optionSelected]} onPress={() => setMealPref(m)}>
                <Text style={[s.optionText, mealPref === m && s.optionTextSelected]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>TOTAL PILLS IN COMPARTMENT</Text>
          <TextInput style={s.input} placeholder="Total pills (e.g. 30)" value={totalPills} onChangeText={setTotalPills} keyboardType="numeric" placeholderTextColor={palette.textSoft} />
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>NOTES</Text>
          <TextInput style={[s.input, { height: 80 }]} placeholder="Special instructions..." value={notes} onChangeText={setNotes} multiline placeholderTextColor={palette.textSoft} />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (P: typeof Palette) => StyleSheet.create({
  safeArea:  { flex: 1, backgroundColor: P.background },
  container: { flex: 1, backgroundColor: P.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: P.surface, borderBottomWidth: 1, borderBottomColor: P.border },
  headerBtn: { padding: 8, minWidth: 60 },
  cancel: { color: '#ef4444', fontSize: 16 },
  title: { fontSize: 18, fontWeight: 'bold', color: P.text },
  save: { color: P.primary, fontSize: 16, fontWeight: '600', textAlign: 'right' },
  section: { margin: 16, marginBottom: 0, backgroundColor: P.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: P.border },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: P.textMuted, marginBottom: 4, textTransform: 'uppercase' },
  sectionHint: { fontSize: 12, color: P.textSoft, marginBottom: 12 },
  input: { backgroundColor: P.background, borderWidth: 1, borderColor: P.border, borderRadius: 10, padding: 12, fontSize: 15, color: P.text, marginBottom: 10 },
  colorRow: { flexDirection: 'row', gap: 12 },
  colorDot: { width: 36, height: 36, borderRadius: 18 },
  colorSelected: { borderWidth: 3, borderColor: P.text },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: P.background, borderWidth: 1, borderColor: P.border },
  optionSelected: { backgroundColor: P.primary, borderColor: P.primary },
  optionText: { fontSize: 13, color: P.textMuted },
  optionTextSelected: { color: '#fff', fontWeight: '600' },
  timeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  timeLabel: { width: 60, fontSize: 14, color: P.textMuted },
  timeInput: { flex: 1, backgroundColor: P.background, borderWidth: 1, borderColor: P.border, borderRadius: 10, padding: 12, fontSize: 15, color: P.text },
  compRow: { flexDirection: 'row', gap: 10 },
  compBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: P.background, alignItems: 'center', borderWidth: 1, borderColor: P.border },
  compSelected: { backgroundColor: P.primary, borderColor: P.primary },
  compNum: { fontSize: 20, fontWeight: '800', color: P.textMuted },
  compNumSelected: { color: '#fff' },
  compLabel: { fontSize: 11, color: P.textSoft, marginTop: 2 },
  compLabelSelected: { color: 'rgba(255,255,255,0.85)' },
  pillRow: { flexDirection: 'row', gap: 12 },
  pillBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: P.background, alignItems: 'center', borderWidth: 1, borderColor: P.border },
  pillSelected: { backgroundColor: '#059669', borderColor: '#059669' },
  pillText: { fontSize: 15, color: P.textMuted, fontWeight: '600' },
  pillTextSelected: { color: '#fff' },
});
