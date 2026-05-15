import { useNotifications } from '@/contexts/NotificationContext';
import { useFocusEffect, useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import React, { useMemo, useState } from 'react';
import {
  Alert, Platform, ScrollView, StatusBar, StyleSheet,
  Switch, Text, TouchableOpacity, View
} from 'react-native';
import { Moon, Sun } from 'lucide-react-native';
import Svg, { Circle, Line, Path, Polygon, Rect } from 'react-native-svg';
import { Palette, Radius, Shadows } from '../../constants/theme';
import { useAccessibility } from '../../contexts/AccessibilityContext';
import { auth } from '../../services/firebase';
import { dispenseNow, listenDeviceStatus, listenMedications, listenPowerSaving, Medication, setPowerSaving } from '../../services/medicationService';

const BellIcon = ({ showDot }: { showDot: boolean }) => {
  const { palette } = useAccessibility();
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={palette.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <Path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      {showDot && <Circle cx="18" cy="6" r="4" fill="#ef4444" stroke="none"/>}
    </Svg>
  );
};

const BellSmIcon = () => {
  const { palette } = useAccessibility();
  return (
    <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={palette.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <Path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </Svg>
  );
};

const VolumeIcon = () => {
  const { palette } = useAccessibility();
  return (
    <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={palette.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <Path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
    </Svg>
  );
};

const CellularIcon = () => {
  const { palette } = useAccessibility();
  return (
    <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={palette.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M2 20h.01"/>
      <Path d="M7 20v-4"/>
      <Path d="M12 20v-8"/>
      <Path d="M17 20V8"/>
      <Path d="M22 4v16"/>
    </Svg>
  );
};

const PhoneIcon = () => {
  const { palette } = useAccessibility();
  return (
    <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={palette.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
      <Line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="3"/>
    </Svg>
  );
};

const ShieldIcon = () => {
  const { palette } = useAccessibility();
  return (
    <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={palette.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </Svg>
  );
};

const UserIcon = () => {
  const { palette } = useAccessibility();
  return (
    <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={palette.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <Circle cx="12" cy="7" r="4"/>
    </Svg>
  );
};

const AccessibilityIcon = () => {
  const { palette } = useAccessibility();
  return (
    <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={palette.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="4" r="2"/>
      <Path d="M12 8c-4 0-7 1.5-7 3.5V13h4v8h6v-8h4v-1.5C19 9.5 16 8 12 8z"/>
    </Svg>
  );
};

const BatteryIcon = () => {
  const { palette } = useAccessibility();
  return (
    <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={palette.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Rect x="1" y="6" width="18" height="12" rx="2" ry="2"/>
      <Path d="M23 13v-2"/>
      <Line x1="5" y1="12" x2="9" y2="12"/>
    </Svg>
  );
};

const MapPinIcon = () => {
  const { palette } = useAccessibility();
  return (
    <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={palette.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <Circle cx="12" cy="10" r="3"/>
    </Svg>
  );
};

const DarkModeIcon = ({ dark }: { dark: boolean }) => (
  dark
    ? <Moon size={20} color="#60A5FA" />
    : <Sun  size={20} color="#FBBF24" />
);

export default function SettingsScreen() {
  const router = useRouter();
  const { hasUnread } = useNotifications();
  const [doseReminders, setDoseReminders] = useState(true);
  const [soundAlerts, setSoundAlerts] = useState(true);
  const [autoRefill, setAutoRefill] = useState(true);
  const [device, setDevice] = useState<any>(null);
  const [dispensing, setDispensing] = useState(false);
  const [powerSaving, setPowerSavingState] = useState(false);
  const [medications, setMedications] = useState<Medication[]>([]);

  const { speak, voiceEnabled, cbColors, palette, darkMode, toggleDarkMode } = useAccessibility();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  useFocusEffect(
    React.useCallback(() => {
      if (voiceEnabled) speak('Settings. Manage your SmartDose preferences.');
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

  React.useEffect(() => {
    const unsub = listenDeviceStatus(setDevice);
    return () => unsub();
  }, []);

  React.useEffect(() => {
    const unsub = listenMedications(setMedications);
    return () => unsub();
  }, []);

  React.useEffect(() => {
    const unsub = listenPowerSaving(setPowerSavingState);
    return () => unsub();
  }, []);

  const handlePowerSaving = (val: boolean) => {
    setPowerSavingState(val);
    setPowerSaving(val);
  };

  const getLastSync = (lastSync: string) => {
    if (!lastSync) return 'Never';
    try {
      const syncTime = new Date(lastSync);
      const now = new Date();
      const diff = Math.floor((now.getTime() - syncTime.getTime()) / 60000);
      if (diff < 1) return 'Just now';
      if (diff < 60) return `${diff}m ago`;
      return `${Math.floor(diff / 60)}h ago`;
    } catch { return lastSync; }
  };

  const handleManualDispense = (compartment: number) => {
    Alert.alert(
      'Manual Dispense',
      `Dispense from Compartment ${compartment}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dispense',
          onPress: async () => {
            setDispensing(true);
            await dispenseNow(compartment - 1);
            Alert.alert('Command sent', 'ESP32 will dispense shortly.');
            setDispensing(false);
          }
        }
      ]
    );
  };

  const handleSignOut = async () => {
    if (Platform.OS === 'web') {
      if (!window.confirm('Are you sure you want to sign out?')) return;
      await signOut(auth);
      return;
    }
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut(auth);
            router.replace('/login');
          }
        }
      ]
    );
  };

  const ToggleRow = ({ icon, title, subtitle, value, onToggle }: any) => (
    <View style={styles.row}>
      <View style={styles.iconBox}>{icon}</View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#D7DEE8', true: palette.primary }}
        thumbColor="white"
      />
    </View>
  );

  const ChevronRow = ({ icon, title, subtitle, onPress }: any) => (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <View style={styles.iconBox}>{icon}</View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} backgroundColor={palette.background} />

      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>SmartDose</Text>
          <Text style={styles.appSubtitle}>Automated Pill Dispenser</Text>
        </View>
        <TouchableOpacity style={styles.bellBtn} onPress={() => router.push('/notifications')}>
          <BellIcon showDot={hasUnread} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 100 }}>
        <Text style={styles.pageTitle}>Settings</Text>

        {/* Appearance */}
        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={styles.card}>
          <ToggleRow
            icon={<DarkModeIcon dark={darkMode} />}
            title="Dark Mode"
            subtitle={darkMode ? 'Dark theme active' : 'Light theme active'}
            value={darkMode}
            onToggle={toggleDarkMode}
          />
        </View>

        {/* Device Status */}
        <Text style={styles.sectionLabel}>Device Status</Text>
        <View style={styles.deviceCard}>
          <View style={styles.deviceRow}>
            <Text style={styles.deviceLabel}>Status</Text>
            <View style={[styles.statusBadge, { backgroundColor: device?.connected ? cbColors.successSoft : cbColors.dangerSoft }]}>
              <Text style={[styles.statusText, { color: device?.connected ? cbColors.success : cbColors.danger }]}>
                {device?.connected ? 'Connected' : 'Offline'}
              </Text>
            </View>
          </View>
          {device?.battery != null && (
            <View style={styles.deviceRow}>
              <Text style={styles.deviceLabel}>Battery</Text>
              <Text style={styles.deviceValue}>{device.battery}%</Text>
            </View>
          )}
          {device?.lastSync && (
            <View style={styles.deviceRow}>
              <Text style={styles.deviceLabel}>Last Sync</Text>
              <Text style={styles.deviceValue}>{getLastSync(device.lastSync)}</Text>
            </View>
          )}
          {device?.signalStrength != null && (
            <View style={styles.deviceRow}>
              <Text style={styles.deviceLabel}>Signal</Text>
              <Text style={styles.deviceValue}>{device.signalStrength} dBm</Text>
            </View>
          )}
        </View>

        {/* Manual Dispense */}
        <Text style={styles.sectionLabel}>Manual Dispense</Text>
        <View style={styles.dispenseCard}>
          {[1, 2, 3].map(comp => {
            const med = medications.find(m => Number(m.compartment) === comp);
            return (
              <View key={comp} style={styles.compartmentCard}>
                <View style={styles.compartmentHeader}>
                  <View style={styles.compBadge}>
                    <Text style={styles.compBadgeText}>C{comp}</Text>
                  </View>
                  {med && <View style={[styles.compColorDot, { backgroundColor: med.color }]} />}
                </View>
                <Text style={styles.compMedName} numberOfLines={1}>
                  {med ? med.name : 'Empty'}
                </Text>
                <Text style={styles.compMedDose} numberOfLines={1}>
                  {med ? med.dosage : '—'}
                </Text>
                <TouchableOpacity
                  style={[styles.compDispenseBtn, (!med || dispensing) && styles.compDispenseBtnDisabled]}
                  onPress={() => handleManualDispense(comp)}
                  disabled={!med || dispensing}
                  activeOpacity={0.75}
                >
                  <Text style={styles.compDispenseBtnText}>Dispense</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* Notifications */}
        <Text style={styles.sectionLabel}>Notifications</Text>
        <View style={styles.card}>
          <ToggleRow
            icon={<BellSmIcon />}
            title="Dose Reminders"
            subtitle="Get notified before each dose"
            value={doseReminders}
            onToggle={setDoseReminders}
          />
          <View style={styles.divider} />
          <ToggleRow
            icon={<VolumeIcon />}
            title="Sound Alerts"
            subtitle="Play sound with notifications"
            value={soundAlerts}
            onToggle={setSoundAlerts}
          />
        </View>

        {/* Device Settings */}
        <Text style={styles.sectionLabel}>Device Settings</Text>
        <View style={styles.card}>
          <ChevronRow
            icon={<CellularIcon />}
            title="Cellular Settings"
            subtitle="SIM Network Status"
            onPress={() => router.push('/cellular-settings')}
          />
          <View style={styles.divider} />
          <ChevronRow
            icon={<MapPinIcon />}
            title="Find My Device"
            subtitle="Ring device to locate it"
            onPress={() => router.push('/find-device')}
          />
          <View style={styles.divider} />
          <ToggleRow
            icon={<BatteryIcon />}
            title="Power Saving Mode"
            subtitle="Reduce sync frequency to save battery"
            value={powerSaving}
            onToggle={handlePowerSaving}
          />
        </View>

        {/* Medication */}
        <Text style={styles.sectionLabel}>Medication Management</Text>
        <View style={styles.card}>
          <ToggleRow
            icon={<PhoneIcon />}
            title="Auto Refill Alerts"
            subtitle="Notify when inventory is low"
            value={autoRefill}
            onToggle={setAutoRefill}
          />
        </View>

        {/* Account & Privacy */}
        <Text style={styles.sectionLabel}>Account & Privacy</Text>
        <View style={styles.card}>
          <ChevronRow
            icon={<UserIcon />}
            title="My Profile"
            subtitle="Photo, name and bio"
            onPress={() => router.push('/profile')}
          />
          <View style={styles.divider} />
          <ChevronRow
            icon={<AccessibilityIcon />}
            title="Accessibility"
            subtitle="Text size, voice readout, contrast"
            onPress={() => router.push('/accessibility')}
          />
          <View style={styles.divider} />
          <ChevronRow
            icon={<ShieldIcon />}
            title="Privacy Settings"
            subtitle="Manage your data and privacy"
            onPress={() => router.push('/privacy')}
          />
        </View>

        {device?.connected && (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Device Information</Text>
            {device?.model     && <Text style={styles.infoText}>Model: {device.model}</Text>}
            {device?.firmware  && <Text style={styles.infoText}>Firmware: {device.firmware}</Text>}
            {device?.serialNumber && <Text style={styles.infoText}>Serial: {device.serialNumber}</Text>}
            {device?.lastSync  && <Text style={styles.infoText}>Last Sync: {getLastSync(device.lastSync)}</Text>}
          </View>
        )}

        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const makeStyles = (P: typeof Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: P.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 18, backgroundColor: P.background },
  appName: { fontSize: 26, fontWeight: '900', color: P.text },
  appSubtitle: { fontSize: 13, color: P.textMuted, marginTop: 2 },
  bellBtn: { width: 46, height: 46, borderRadius: Radius.md, backgroundColor: P.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: P.border, ...Shadows.card },
  scroll: { flex: 1, paddingHorizontal: 16 },
  pageTitle: { fontSize: 25, fontWeight: '900', color: P.text, marginBottom: 16, marginTop: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: P.textMuted, marginBottom: 6, marginTop: 12, paddingLeft: 4, textTransform: 'uppercase' },
  card: { backgroundColor: P.surface, borderRadius: Radius.lg, overflow: 'hidden', marginBottom: 6, borderWidth: 1, borderColor: P.border, padding: 2, ...Shadows.card },
  deviceCard: { backgroundColor: P.surface, borderRadius: Radius.lg, padding: 16, marginBottom: 6, borderWidth: 1, borderColor: P.border, ...Shadows.card },
  deviceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  deviceLabel: { fontSize: 14, color: P.textMuted, fontWeight: '700' },
  deviceValue: { fontSize: 14, fontWeight: '800', color: P.text },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  iconBox: { width: 38, height: 38, borderRadius: Radius.sm, backgroundColor: P.primarySoft, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '800', color: P.text },
  rowSubtitle: { fontSize: 13, color: P.textMuted, marginTop: 2 },
  chevron: { fontSize: 24, color: P.textSoft },
  divider: { height: 1, backgroundColor: P.border, marginLeft: 68 },
  infoCard: { backgroundColor: P.primarySoft, borderRadius: Radius.lg, padding: 18, marginTop: 12, borderWidth: 1, borderColor: P.primary + '40' },
  infoTitle: { fontWeight: '900', fontSize: 16, color: P.text, marginBottom: 12 },
  infoText: { fontSize: 14, color: P.text, lineHeight: 24, fontWeight: '600' },
  signOutBtn: { backgroundColor: P.roseSoft, borderRadius: Radius.sm, padding: 14, alignItems: 'center', marginTop: 16, borderWidth: 1, borderColor: P.rose + '40' },
  signOutText: { color: P.rose, fontWeight: '800', fontSize: 14 },
  dispenseCard: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  compartmentCard: { flex: 1, backgroundColor: P.surface, borderRadius: Radius.lg, padding: 10, borderWidth: 1, borderColor: P.border, alignItems: 'center', ...Shadows.card },
  compartmentHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6, alignSelf: 'stretch' },
  compBadge: { backgroundColor: P.primarySoft, borderRadius: Radius.xs, paddingHorizontal: 6, paddingVertical: 2 },
  compBadgeText: { fontSize: 11, fontWeight: '900', color: P.primary },
  compColorDot: { width: 8, height: 8, borderRadius: 4 },
  compMedName: { fontSize: 12, fontWeight: '800', color: P.text, textAlign: 'center', marginBottom: 2 },
  compMedDose: { fontSize: 11, color: P.textMuted, textAlign: 'center', marginBottom: 8 },
  compDispenseBtn: { backgroundColor: P.primary, borderRadius: Radius.xs, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'stretch', alignItems: 'center', ...Shadows.button },
  compDispenseBtnDisabled: { opacity: 0.4 },
  compDispenseBtnText: { color: '#fff', fontWeight: '700', fontSize: 11 },
});
