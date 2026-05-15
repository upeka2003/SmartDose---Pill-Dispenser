import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert, ScrollView, StatusBar, StyleSheet,
    Switch, Text, TouchableOpacity, View
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useAccessibility } from '../contexts/AccessibilityContext';

const BackIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M19 12H5M12 5l-7 7 7 7"/>
  </Svg>
);

export default function PrivacyScreen() {
  const router = useRouter();
  const { speak, voiceEnabled } = useAccessibility();
  const [caregiverAccess, setCaregiverAccess] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(true);
  const [notificationPrivacy, setNotificationPrivacy] = useState(true);
  const [devicePermissions, setDevicePermissions] = useState(true);
  const [dataSharing, setDataSharing] = useState(false);

  React.useEffect(() => {
    if (voiceEnabled) {
      speak('Privacy settings. Your data is protected.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled]);

  const handleChangePassword = () => {
    router.push('/change-password');
  };

  const handleDeleteAccount = () => {
    router.push('/delete-account');
  };

  const handleExportData = () => {
    Alert.alert(
      '📤 Export Health Data',
      'Your medication history and health data will be exported as a PDF report.',
      [
        { text: 'Export', onPress: () => Alert.alert('✅ Exported!', 'Your data has been exported successfully.') },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const ToggleRow = ({ icon, title, subtitle, value, onToggle }: any) => (
    <View style={styles.row}>
      <View style={styles.iconBox}>
        <Text style={styles.iconEmoji}>{icon}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#d1d5db', true: '#1c1c1e' }}
        thumbColor="white"
      />
    </View>
  );

  const ActionRow = ({ icon, title, subtitle, onPress, danger }: any) => (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <View style={[styles.iconBox, danger && styles.iconBoxDanger]}>
        <Text style={styles.iconEmoji}>{icon}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, danger && styles.dangerText]}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <BackIcon />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Settings</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>

        {/* Info Banner */}
        <View style={styles.banner}>
          <Text style={styles.bannerIcon}>🛡️</Text>
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>Your data is protected</Text>
            <Text style={styles.bannerSub}>SmartDose encrypts all your health data and never sells it to third parties.</Text>
          </View>
        </View>

        {/* Health Data */}
        <Text style={styles.sectionLabel}>Health Data</Text>
        <View style={styles.card}>
          <ToggleRow
            icon="🏥"
            title="Share Health Data"
            subtitle="Allow anonymized data for research"
            value={dataSharing}
            onToggle={setDataSharing}
          />
          <View style={styles.divider} />
          <ToggleRow
            icon="📋"
            title="Medication History Visibility"
            subtitle="Show history in app dashboard"
            value={historyVisible}
            onToggle={setHistoryVisible}
          />
          <View style={styles.divider} />
          <ActionRow
            icon="📤"
            title="Export My Data"
            subtitle="Download your health records as PDF"
            onPress={handleExportData}
          />
        </View>

        {/* Caregiver & Access */}
        <Text style={styles.sectionLabel}>Access & Permissions</Text>
        <View style={styles.card}>
          <ToggleRow
            icon="👨‍👩‍👧"
            title="Caregiver Access"
            subtitle="Allow a family member to monitor doses"
            value={caregiverAccess}
            onToggle={setCaregiverAccess}
          />
          <View style={styles.divider} />
          <ToggleRow
            icon="📱"
            title="Device Connection Permissions"
            subtitle="Allow SmartDose device to sync data"
            value={devicePermissions}
            onToggle={setDevicePermissions}
          />
        </View>

        {/* Notifications */}
        <Text style={styles.sectionLabel}>Notification Privacy</Text>
        <View style={styles.card}>
          <ToggleRow
            icon="🔔"
            title="Private Notifications"
            subtitle="Hide medication names on lock screen"
            value={notificationPrivacy}
            onToggle={setNotificationPrivacy}
          />
        </View>

        {/* Account */}
        <Text style={styles.sectionLabel}>Account Security</Text>
        <View style={styles.card}>
          <ActionRow
            icon="🔒"
            title="Change Password"
            subtitle="Update your account password"
            onPress={handleChangePassword}
          />
        </View>

        {/* Danger Zone */}
        <Text style={styles.sectionLabel}>Danger Zone</Text>
        <View style={styles.card}>
          <ActionRow
            icon="🗑️"
            title="Delete Account"
            subtitle="Permanently delete all data"
            onPress={handleDeleteAccount}
            danger
          />
        </View>

        <Text style={styles.footerNote}>
          Last updated: March 2026 · SmartDose Privacy Policy
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 48, paddingBottom: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  banner: { flexDirection: 'row', alignItems: 'flex-start', margin: 16, backgroundColor: '#eff6ff', borderRadius: 14, padding: 14, gap: 12 },
  bannerIcon: { fontSize: 28 },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: '#1e40af', marginBottom: 4 },
  bannerSub: { fontSize: 13, color: '#3b82f6', lineHeight: 18 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 6, marginTop: 12, paddingLeft: 20 },
  card: { backgroundColor: 'white', borderRadius: 14, overflow: 'hidden', marginHorizontal: 16, marginBottom: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, paddingHorizontal: 16 },
  iconBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  iconBoxDanger: { backgroundColor: '#fef2f2' },
  iconEmoji: { fontSize: 18 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  dangerText: { color: '#ef4444' },
  rowSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 1 },
  chevron: { fontSize: 24, color: '#9ca3af' },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginLeft: 70 },
  footerNote: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 16, marginBottom: 8 },
});