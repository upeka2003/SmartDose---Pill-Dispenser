import { useRouter } from 'expo-router';
import { onValue, ref } from 'firebase/database';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Palette, Radius, Shadows } from '../constants/theme';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { rtdb } from '../services/firebase';
import { findDevice, listenDeviceStatus, stopFindDevice } from '../services/medicationService';

// ─── Icons ────────────────────────────────────────────────────────────────────
const BackIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={Palette.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M19 12H5M12 5l-7 7 7 7"/>
  </Svg>
);

const PinIcon = ({ color }: { color: string }) => (
  <Svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <Circle cx="12" cy="10" r="3"/>
  </Svg>
);

// ─── Signal bars component ─────────────────────────────────────────────────────
function SignalBars({ value }: { value: number | null }) {
  // value can be CSQ (0-31) or RSSI dBm (negative, e.g. -55)
  let bars = 0;
  let label = 'N/A';
  let color = Palette.textSoft;

  if (value != null && value !== 99) {
    let rssi: number;
    if (value < 0) {
      rssi = value; // already dBm
    } else {
      rssi = value === 0 ? -113 : -113 + value * 2; // CSQ → dBm
    }

    if (rssi >= -65)       { bars = 4; label = 'Excellent'; color = '#059669'; }
    else if (rssi >= -75)  { bars = 3; label = 'Good';      color = '#16A34A'; }
    else if (rssi >= -85)  { bars = 2; label = 'Fair';      color = '#D97706'; }
    else if (rssi >= -100) { bars = 1; label = 'Weak';      color = '#DC2626'; }
    else                   { bars = 0; label = 'No Signal'; color = '#DC2626'; }
  }

  const heights = [8, 13, 18, 24];

  return (
    <View style={sigStyles.wrap}>
      <View style={sigStyles.bars}>
        {heights.map((h, i) => (
          <View
            key={i}
            style={[
              sigStyles.bar,
              { height: h },
              i < bars
                ? { backgroundColor: color }
                : { backgroundColor: Palette.border },
            ]}
          />
        ))}
      </View>
      <Text style={[sigStyles.label, { color }]}>{label}</Text>
    </View>
  );
}

const sigStyles = StyleSheet.create({
  wrap:  { alignItems: 'center', gap: 4 },
  bars:  { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 26 },
  bar:   { width: 6, borderRadius: 2 },
  label: { fontSize: 11, fontWeight: '700' },
});

// ─── Battery bar component ─────────────────────────────────────────────────────
function BatteryBar({ pct }: { pct: number | null }) {
  if (pct == null) return <Text style={batStyles.na}>N/A</Text>;
  const color = pct > 50 ? '#059669' : pct > 20 ? '#D97706' : '#DC2626';
  return (
    <View style={batStyles.wrap}>
      <View style={batStyles.body}>
        <View style={[batStyles.fill, { width: `${Math.min(pct, 100)}%` as any, backgroundColor: color }]} />
      </View>
      <View style={batStyles.tip} />
      <Text style={[batStyles.pct, { color }]}>{pct}%</Text>
    </View>
  );
}

const batStyles = StyleSheet.create({
  na:   { fontSize: 14, fontWeight: '800', color: Palette.textMuted },
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  body: { width: 44, height: 20, borderRadius: 4, borderWidth: 2, borderColor: Palette.textMuted, overflow: 'hidden', padding: 2 },
  fill: { height: '100%', borderRadius: 2 },
  tip:  { width: 4, height: 10, backgroundColor: Palette.textMuted, borderRadius: 1 },
  pct:  { fontSize: 13, fontWeight: '800' },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ago(ts: any): string {
  if (!ts) return 'Never';
  const ms = typeof ts === 'number' ? ts : Date.parse(String(ts));
  if (!ms || isNaN(ms)) return 'Unknown';
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 5)   return 'Just now';
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const RING_DURATION = 30;

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function FindDeviceScreen() {
  const router = useRouter();
  const { speak, voiceEnabled, cbColors } = useAccessibility();
  const [device, setDevice]       = useState<any>(null);
  const [rawDevice, setRawDevice] = useState<any>(null);
  const [ringing, setRinging]     = useState(false);
  const [countdown, setCountdown] = useState(RING_DURATION);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseRef  = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const unsub1 = listenDeviceStatus(setDevice);
    const rawRef = ref(rtdb, 'smartdose/device');
    const unsub2 = onValue(rawRef, snap => setRawDevice(snap.exists() ? snap.val() : null));
    return () => { unsub1(); unsub2(); };
  }, []);

  useEffect(() => {
    if (ringing) {
      pulseRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2,  duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0,  duration: 600, useNativeDriver: true }),
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
    if (voiceEnabled) speak('Find my device. Check device connection status here.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled]);

  const handleRing = async () => { setRinging(true); await findDevice(); };
  const handleStop = async () => { setRinging(false); await stopFindDevice(); };

  const connected = !!device?.connected;
  const signal    = rawDevice?.signalStrength ?? null;
  const battery   = rawDevice?.battery ?? null;
  const lastSeen  = rawDevice?.serverTime ?? rawDevice?.lastSyncMs ?? rawDevice?.lastSync ?? null;
  const firmware  = rawDevice?.firmware ?? null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <BackIcon />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Device Status</Text>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Connection banner ──────────────────────────────────────── */}
        <View style={[
          styles.banner,
          connected
            ? { backgroundColor: '#ECFDF5', borderColor: '#6EE7B7' }
            : { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
        ]}>
          <View style={[styles.bannerDot, { backgroundColor: connected ? '#059669' : '#DC2626' }]} />
          <View style={styles.bannerText}>
            <Text style={[styles.bannerTitle, { color: connected ? '#065F46' : '#991B1B' }]}>
              {connected ? 'Device Connected' : 'Device Offline'}
            </Text>
            <Text style={[styles.bannerSub, { color: connected ? '#047857' : '#B91C1C' }]}>
              {connected
                ? `Last seen ${ago(lastSeen)}`
                : lastSeen
                  ? `Last seen ${ago(lastSeen)} — device may be off`
                  : 'Never connected to Firebase'}
            </Text>
          </View>
        </View>

        {/* ── Stats row ──────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          {/* Battery */}
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>BATTERY</Text>
            <BatteryBar pct={battery} />
          </View>

          {/* Signal */}
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>4G SIGNAL</Text>
            <SignalBars value={signal} />
          </View>

          {/* Last sync */}
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>LAST SYNC</Text>
            <Text style={styles.statValue}>{ago(lastSeen)}</Text>
          </View>
        </View>

        {/* ── Device info card ───────────────────────────────────────── */}
        <View style={styles.infoCard}>
          <Text style={styles.sectionLabel}>DEVICE INFO</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Model</Text>
            <Text style={styles.infoVal}>{rawDevice?.model ?? 'SmartDose SIM7600'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Firmware</Text>
            <Text style={styles.infoVal}>{firmware ?? '—'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Network</Text>
            <Text style={styles.infoVal}>Dialog 4G LTE</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Heartbeat</Text>
            <Text style={styles.infoVal}>Every 60 seconds</Text>
          </View>
        </View>

        {/* ── Ring area ──────────────────────────────────────────────── */}
        <View style={styles.ringArea}>
          <Animated.View style={[
            styles.ringOuter,
            { transform: [{ scale: pulseAnim }] },
            connected && ringing && { backgroundColor: '#FEE2E2' },
          ]}>
            <View style={[styles.ringInner, ringing && styles.ringInnerActive]}>
              <PinIcon color={ringing ? '#fff' : Palette.primary} />
            </View>
          </Animated.View>

          <Text style={styles.ringLabel}>
            {ringing ? `Ringing... (${countdown}s)` : 'Locate Your Device'}
          </Text>
          <Text style={styles.ringSub}>
            {ringing
              ? 'Device is buzzing and flashing. Press the button on device or tap Stop.'
              : 'Sends a buzzer alert and LED flash to your SmartDose device.'}
          </Text>
        </View>

        {ringing ? (
          <TouchableOpacity style={styles.stopBtn} onPress={handleStop} activeOpacity={0.8}>
            <Text style={styles.stopBtnText}>Stop Ringing</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.ringBtn, !connected && styles.ringBtnDisabled]}
            onPress={handleRing}
            disabled={!connected}
            activeOpacity={0.8}
          >
            <Text style={styles.ringBtnText}>Ring Device</Text>
          </TouchableOpacity>
        )}

        {!connected && rawDevice && (
          <View style={styles.offlineCard}>
            <Text style={styles.offlineTitle}>Troubleshooting</Text>
            <Text style={styles.offlineItem}>• Turn the device on and wait ~2 minutes</Text>
            <Text style={styles.offlineItem}>• Check SIM card is inserted</Text>
            <Text style={styles.offlineItem}>• Verify GSM signal in your area</Text>
            <Text style={styles.offlineItem}>• Device updates status every 60 seconds</Text>
          </View>
        )}

        {!rawDevice && (
          <View style={styles.offlineCard}>
            <Text style={styles.offlineTitle}>Device Not Found</Text>
            <Text style={styles.offlineItem}>• Device has never connected to Firebase</Text>
            <Text style={styles.offlineItem}>• Ensure correct firmware is uploaded</Text>
            <Text style={styles.offlineItem}>• Check Firebase RTDB auth token</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.background },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16, backgroundColor: Palette.surface, borderBottomWidth: 1, borderBottomColor: Palette.border },
  backBtn:   { flexDirection: 'row', alignItems: 'center', width: 70 },
  backText:  { color: Palette.textMuted, fontSize: 16, marginLeft: 4 },
  title:     { fontSize: 18, fontWeight: '800', color: Palette.text },
  content:   { padding: 20, paddingBottom: 60 },

  banner:       { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.lg, padding: 16, marginBottom: 16, borderWidth: 1.5 },
  bannerDot:    { width: 12, height: 12, borderRadius: 6 },
  bannerText:   { flex: 1 },
  bannerTitle:  { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  bannerSub:    { fontSize: 13, fontWeight: '500' },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: Palette.surface, borderRadius: Radius.lg, padding: 14, alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Palette.border, ...Shadows.card },
  statLabel:{ fontSize: 10, fontWeight: '800', color: Palette.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
  statValue:{ fontSize: 13, fontWeight: '800', color: Palette.text },

  sectionLabel: { fontSize: 11, fontWeight: '800', color: Palette.textMuted, marginBottom: 12, letterSpacing: 0.5, textTransform: 'uppercase' },
  infoCard:  { backgroundColor: Palette.surface, borderRadius: Radius.lg, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: Palette.border, ...Shadows.card },
  infoRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  infoKey:   { fontSize: 14, color: Palette.textMuted, fontWeight: '600' },
  infoVal:   { fontSize: 14, fontWeight: '800', color: Palette.text },
  divider:   { height: 1, backgroundColor: Palette.border },

  ringArea:       { alignItems: 'center', paddingVertical: 28 },
  ringOuter:      { width: 120, height: 120, borderRadius: 60, backgroundColor: Palette.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  ringInner:      { width: 88, height: 88, borderRadius: 44, backgroundColor: Palette.surface, borderWidth: 2, borderColor: Palette.primary, alignItems: 'center', justifyContent: 'center' },
  ringInnerActive:{ backgroundColor: Palette.primary, borderColor: Palette.primary },
  ringLabel:      { fontSize: 18, fontWeight: '900', color: Palette.text, marginBottom: 8, textAlign: 'center' },
  ringSub:        { fontSize: 14, color: Palette.textMuted, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },

  ringBtn:        { backgroundColor: Palette.primary, borderRadius: Radius.sm, padding: 16, alignItems: 'center', ...Shadows.button },
  ringBtnDisabled:{ opacity: 0.35 },
  ringBtnText:    { color: '#fff', fontSize: 16, fontWeight: '800' },
  stopBtn:        { backgroundColor: '#FEE2E2', borderRadius: Radius.sm, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#FECACA' },
  stopBtnText:    { color: '#DC2626', fontSize: 16, fontWeight: '800' },

  offlineCard:  { marginTop: 16, backgroundColor: Palette.surface, borderRadius: Radius.lg, padding: 16, borderWidth: 1, borderColor: Palette.border },
  offlineTitle: { fontSize: 14, fontWeight: '800', color: Palette.text, marginBottom: 10 },
  offlineItem:  { fontSize: 13, color: Palette.textMuted, lineHeight: 22 },
});
