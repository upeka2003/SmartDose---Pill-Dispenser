import { useRouter } from 'expo-router';
import { onValue, ref } from 'firebase/database';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Palette, Radius, Shadows } from '../constants/theme';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { rtdb } from '../services/firebase';
import { findDevice, listenDeviceStatus, stopFindDevice } from '../services/medicationService';

const BackIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={Palette.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M19 12H5M12 5l-7 7 7 7"/>
  </Svg>
);

const MapPinIcon = ({ color }: { color: string }) => (
  <Svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <Circle cx="12" cy="10" r="3"/>
  </Svg>
);

const RING_DURATION = 30;

function ago(ts: any): string {
  if (!ts) return 'Never';
  const ms = typeof ts === 'number' ? ts : Date.parse(String(ts));
  if (!ms || isNaN(ms)) return 'Unknown';
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 5)  return 'Just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function diagnoseProblem(rawDevice: any): { icon: string; text: string; color: string }[] {
  if (!rawDevice) {
    return [{ icon: '⚠️', text: 'No data in Firebase — device has never connected', color: '#92400E' }];
  }
  const issues: { icon: string; text: string; color: string }[] = [];
  const now = Date.now();
  const lastSyncMs = Number(rawDevice.lastSyncMs ?? 0);
  const ageMs = now - lastSyncMs;
  const TWO_YEARS = 2 * 365 * 24 * 60 * 60 * 1000;

  if (!rawDevice.connected) {
    issues.push({ icon: '🔴', text: 'Device set connected=false — firmware reported offline', color: '#991B1B' });
  }
  if (lastSyncMs && Math.abs(ageMs) > TWO_YEARS) {
    issues.push({ icon: '🕐', text: 'Device RTC clock is wrong — firmware timestamp very old (clock not synced from GSM)', color: '#92400E' });
  } else if (lastSyncMs && ageMs > 10 * 60 * 1000) {
    issues.push({ icon: '🕐', text: `No heartbeat for ${Math.floor(ageMs / 60000)}m — device may have lost GSM`, color: '#92400E' });
  }
  if (!lastSyncMs) {
    issues.push({ icon: '📡', text: 'lastSyncMs missing — firmware may not have written status yet', color: '#1E40AF' });
  }
  if (issues.length === 0 && rawDevice.connected) {
    issues.push({ icon: '✅', text: 'Firebase data looks correct — device should be online', color: '#065F46' });
  }
  return issues;
}

export default function FindDeviceScreen() {
  const router = useRouter();
  const { speak, voiceEnabled, cbColors } = useAccessibility();
  const [device, setDevice]       = useState<any>(null);
  const [rawDevice, setRawDevice] = useState<any>(null);
  const [ringing, setRinging]     = useState(false);
  const [countdown, setCountdown] = useState(RING_DURATION);
  const [showDiag, setShowDiag]   = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseRef  = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    // Processed status (clock-drift aware)
    const unsub1 = listenDeviceStatus(setDevice);
    // Raw RTDB value for diagnostics
    const rawRef = ref(rtdb, 'smartdose/device');
    const unsub2 = onValue(rawRef, snap => setRawDevice(snap.exists() ? snap.val() : null));
    return () => { unsub1(); unsub2(); };
  }, []);

  useEffect(() => {
    if (ringing) {
      pulseRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.18, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 600, useNativeDriver: true }),
        ])
      );
      pulseRef.current.start();
      setCountdown(RING_DURATION);
      timerRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) { handleStop(); return 0; }
          return prev - 1;
        });
      }, 1000);
    } else {
      pulseRef.current?.stop();
      pulseAnim.setValue(1);
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [ringing]);

  useEffect(() => {
    if (voiceEnabled) speak('Find my device. Check device status and connection here.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled]);

  const handleRing = async () => { setRinging(true); await findDevice(); };
  const handleStop = async () => { setRinging(false); await stopFindDevice(); };

  const connected  = !!device?.connected;
  const connStyle  = connected
    ? { bg: cbColors.successSoft, fg: cbColors.success }
    : { bg: cbColors.dangerSoft,  fg: cbColors.danger  };

  const diagnoses = diagnoseProblem(rawDevice);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <BackIcon />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Device Connection</Text>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* ── Status card ───────────────────────────────────────────── */}
        <View style={styles.statusCard}>
          <Text style={styles.sectionLabel}>DEVICE STATUS</Text>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Connection</Text>
            <View style={[styles.badge, { backgroundColor: connStyle.bg }]}>
              <View style={[styles.statusDot, { backgroundColor: connStyle.fg }]} />
              <Text style={[styles.badgeText, { color: connStyle.fg }]}>
                {connected ? 'Connected' : 'Offline'}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Battery</Text>
            <Text style={styles.statusValue}>{rawDevice?.battery != null ? `${rawDevice.battery}%` : 'N/A'}</Text>
          </View>

          <View style={styles.divider} />
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Last Heartbeat</Text>
            <Text style={styles.statusValue}>{ago(rawDevice?.lastSyncMs ?? rawDevice?.lastSync)}</Text>
          </View>

          <View style={styles.divider} />
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Signal</Text>
            <Text style={styles.statusValue}>{rawDevice?.signalStrength != null ? `${rawDevice.signalStrength} dBm` : 'N/A'}</Text>
          </View>

          <View style={styles.divider} />
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Firmware</Text>
            <Text style={styles.statusValue}>{rawDevice?.firmware ?? 'Unknown'}</Text>
          </View>
        </View>

        {/* ── Diagnosis section ─────────────────────────────────────── */}
        <TouchableOpacity style={styles.diagToggle} onPress={() => setShowDiag(v => !v)} activeOpacity={0.75}>
          <Text style={styles.diagToggleTxt}>
            {showDiag ? '▲ Hide Diagnosis' : '▼ Why is it offline? (Diagnosis)'}
          </Text>
        </TouchableOpacity>

        {showDiag && (
          <View style={styles.diagCard}>
            <Text style={styles.sectionLabel}>DIAGNOSIS</Text>
            {diagnoses.map((d, i) => (
              <View key={i} style={[styles.diagRow, { backgroundColor: d.color + '18' }]}>
                <Text style={styles.diagIcon}>{d.icon}</Text>
                <Text style={[styles.diagTxt, { color: d.color }]}>{d.text}</Text>
              </View>
            ))}

            {!rawDevice && (
              <View style={styles.checkList}>
                <Text style={styles.checkTitle}>What to check:</Text>
                <Text style={styles.checkItem}>1. Device power on?</Text>
                <Text style={styles.checkItem}>2. SIM card inserted?</Text>
                <Text style={styles.checkItem}>3. GSM signal available?</Text>
                <Text style={styles.checkItem}>4. Correct firmware uploaded?{'\n'}   (SmartDose_Full.ino, not pill.ino)</Text>
                <Text style={styles.checkItem}>5. APN correct? (currently: "dialogbb")</Text>
              </View>
            )}

            {rawDevice && !connected && (
              <View style={styles.checkList}>
                <Text style={styles.checkTitle}>Try these steps:</Text>
                <Text style={styles.checkItem}>1. Restart the device (power off/on)</Text>
                <Text style={styles.checkItem}>2. Wait 2 minutes for GSM to connect</Text>
                <Text style={styles.checkItem}>3. Device LCD should show "Firebase OK!"</Text>
                <Text style={styles.checkItem}>4. If LCD shows "Auth ERR" → check Firebase secret in firmware</Text>
              </View>
            )}

            {/* Raw RTDB data */}
            <Text style={[styles.checkTitle, { marginTop: 12 }]}>Raw Firebase data:</Text>
            <View style={styles.rawBox}>
              <Text style={styles.rawTxt}>
                {rawDevice
                  ? JSON.stringify(rawDevice, null, 2)
                  : '(no data in /smartdose/device)'}
              </Text>
            </View>
          </View>
        )}

        {/* ── Ring area ─────────────────────────────────────────────── */}
        <View style={styles.ringArea}>
          <Animated.View style={[styles.ringOuter, { transform: [{ scale: pulseAnim }] }]}>
            <View style={[styles.ringInner, ringing && styles.ringInnerActive]}>
              <MapPinIcon color={ringing ? '#fff' : Palette.primary} />
            </View>
          </Animated.View>
          <Text style={styles.ringLabel}>
            {ringing ? `Ringing... (${countdown}s)` : 'Ring your SmartDose device'}
          </Text>
          <Text style={styles.ringSub}>
            {ringing
              ? 'Device is buzzing and flashing.'
              : 'Sends a buzz and LED flash to locate your device.'}
          </Text>
        </View>

        {ringing ? (
          <TouchableOpacity style={styles.stopBtn} onPress={handleStop}>
            <Text style={styles.stopBtnText}>Stop Ringing</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.ringBtn, !connected && styles.ringBtnDisabled]}
            onPress={handleRing}
            disabled={!connected}
          >
            <Text style={styles.ringBtnText}>Ring Device</Text>
          </TouchableOpacity>
        )}

        {!connected && (
          <Text style={styles.offlineNote}>
            Device must be connected to ring it.{'\n'}
            Tap "Why is it offline?" above for help.
          </Text>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Palette.background },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16, backgroundColor: Palette.surface, borderBottomWidth: 1, borderBottomColor: Palette.border },
  backBtn:      { flexDirection: 'row', alignItems: 'center', width: 70 },
  backText:     { color: Palette.textMuted, fontSize: 16, marginLeft: 4 },
  title:        { fontSize: 18, fontWeight: '800', color: Palette.text },
  content:      { padding: 20, paddingBottom: 60 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: Palette.textMuted, marginBottom: 14, letterSpacing: 0.5, textTransform: 'uppercase' },

  statusCard:   { backgroundColor: Palette.surface, borderRadius: Radius.lg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Palette.border, ...Shadows.card },
  statusRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  statusLabel:  { fontSize: 14, color: Palette.textMuted, fontWeight: '700' },
  statusValue:  { fontSize: 14, fontWeight: '800', color: Palette.text },
  badge:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusDot:    { width: 7, height: 7, borderRadius: 4 },
  badgeText:    { fontSize: 13, fontWeight: '700' },
  divider:      { height: 1, backgroundColor: Palette.border },

  diagToggle:   { backgroundColor: Palette.surface, borderRadius: Radius.md, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Palette.border, alignItems: 'center' },
  diagToggleTxt:{ fontSize: 13, fontWeight: '700', color: Palette.primary },

  diagCard:     { backgroundColor: Palette.surface, borderRadius: Radius.lg, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: Palette.border },
  diagRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 8, marginBottom: 8 },
  diagIcon:     { fontSize: 16, lineHeight: 20 },
  diagTxt:      { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  checkList:    { marginTop: 12, padding: 12, backgroundColor: Palette.background, borderRadius: 10 },
  checkTitle:   { fontSize: 13, fontWeight: '800', color: Palette.text, marginBottom: 6 },
  checkItem:    { fontSize: 13, color: Palette.textMuted, marginBottom: 4, lineHeight: 18 },
  rawBox:       { backgroundColor: '#0F172A', borderRadius: 8, padding: 10, marginTop: 4 },
  rawTxt:       { fontFamily: 'monospace' as any, fontSize: 11, color: '#7DD3FC', lineHeight: 16 },

  ringArea:       { alignItems: 'center', paddingVertical: 28 },
  ringOuter:      { width: 120, height: 120, borderRadius: 60, backgroundColor: Palette.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  ringInner:      { width: 88, height: 88, borderRadius: 44, backgroundColor: Palette.surface, borderWidth: 2, borderColor: Palette.primary, alignItems: 'center', justifyContent: 'center' },
  ringInnerActive:{ backgroundColor: Palette.primary, borderColor: Palette.primary },
  ringLabel:      { fontSize: 18, fontWeight: '900', color: Palette.text, marginBottom: 8, textAlign: 'center' },
  ringSub:        { fontSize: 14, color: Palette.textMuted, textAlign: 'center', lineHeight: 20, paddingHorizontal: 16 },
  ringBtn:        { backgroundColor: Palette.primary, borderRadius: Radius.sm, padding: 16, alignItems: 'center', ...Shadows.button },
  ringBtnDisabled:{ opacity: 0.4 },
  ringBtnText:    { color: '#fff', fontSize: 16, fontWeight: '800' },
  stopBtn:        { backgroundColor: Palette.roseSoft, borderRadius: Radius.sm, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#FFC4D1' },
  stopBtnText:    { color: Palette.rose, fontSize: 16, fontWeight: '800' },
  offlineNote:    { textAlign: 'center', color: Palette.textMuted, fontSize: 13, marginTop: 12, lineHeight: 20 },
});
