import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useAccessibility } from '../contexts/AccessibilityContext';

const BackIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M19 12H5M12 5l-7 7 7 7"/>
  </Svg>
);

export default function CellularSettingsScreen() {
  const router = useRouter();
  const { speak, voiceEnabled } = useAccessibility();

  React.useEffect(() => {
    if (voiceEnabled) {
      speak('Cellular settings. Check your device network and SIM status.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <BackIcon />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Cellular Settings</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>DEVICE NETWORK</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Carrier</Text>
            <Text style={styles.value}>Dialog</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Network Type</Text>
            <Text style={styles.value}>GPRS / 2G</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>APN</Text>
            <Text style={styles.value}>dialogbb</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>SIM STATUS</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Signal Strength</Text>
            <Text style={styles.valueGood}>Strong (-75 dBm)</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Data Usage</Text>
            <Text style={styles.value}>1.2 MB / 50 MB</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Status</Text>
            <Text style={styles.valueGood}>Connected</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.button}>
          <Text style={styles.btnText}>Refresh Connection</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 48, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 70 },
  backText: { color: '#64748b', fontSize: 16, marginLeft: 4 },
  title: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  content: { padding: 16 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#64748b', marginTop: 16, marginBottom: 8, paddingLeft: 12, letterSpacing: 0.5 },
  card: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, elevation: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16 },
  divider: { height: 1, backgroundColor: '#e2e8f0' },
  label: { fontSize: 15, color: '#1e293b', fontWeight: '500' },
  value: { fontSize: 15, color: '#64748b' },
  valueGood: { fontSize: 15, color: '#10b981', fontWeight: '600' },
  button: { backgroundColor: '#3b82f6', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 30, elevation: 2 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
