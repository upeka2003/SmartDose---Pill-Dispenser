import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    Animated, ScrollView, StyleSheet, Text,
    TouchableOpacity, View
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Palette, Radius, Shadows } from '../constants/theme';
import { useAccessibility } from '../contexts/AccessibilityContext';
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

export default function FindDeviceScreen() {
  const router = useRouter();
  const { speak, voiceEnabled, cbColors } = useAccessibility();
  const [device, setDevice] = useState<any>(null);
  const [ringing, setRinging] = useState(false);
  const [countdown, setCountdown] = useState(RING_DURATION);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const unsub = listenDeviceStatus(setDevice);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (ringing) {
      pulseRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.18, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulseRef.current.start();

      setCountdown(RING_DURATION);
      timerRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            handleStop();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      pulseRef.current?.stop();
      pulseAnim.setValue(1);
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [ringing]);

  useEffect(() => {
    if (voiceEnabled) {
      speak('Find my device. You can ring your device or check its status here.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled]);

  const handleRing = async () => {
    setRinging(true);
    await findDevice();
  };

  const handleStop = async () => {
    setRinging(false);
    await stopFindDevice();
  };

  const getLastSync = (lastSync: string) => {
    if (!lastSync) return 'Never';
    try {
      const diff = Math.floor((Date.now() - new Date(lastSync).getTime()) / 60000);
      if (diff < 1) return 'Just now';
      if (diff < 60) return `${diff}m ago`;
      return `${Math.floor(diff / 60)}h ago`;
    } catch { return lastSync; }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <BackIcon />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Find My Device</Text>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status card */}
        <View style={styles.statusCard}>
          <Text style={styles.sectionLabel}>DEVICE STATUS</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Connection</Text>
            <View style={[styles.badge, { backgroundColor: device?.connected ? cbColors.successSoft : cbColors.dangerSoft }]}>
              <Text style={[styles.badgeText, { color: device?.connected ? cbColors.success : cbColors.danger }]}>
                {device?.connected ? 'Connected' : 'Disconnected'}
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Battery</Text>
            <Text style={styles.statusValue}>{device?.battery ? `${device.battery}%` : 'N/A'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Last Sync</Text>
            <Text style={styles.statusValue}>{device?.lastSync ? getLastSync(device.lastSync) : 'Never'}</Text>
          </View>
        </View>

        {/* Ring area */}
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
              ? 'Your device is buzzing and flashing to help you locate it.'
              : 'Sends a buzz and LED flash to your device so you can find it nearby.'}
          </Text>
        </View>

        {ringing ? (
          <TouchableOpacity style={styles.stopBtn} onPress={handleStop}>
            <Text style={styles.stopBtnText}>Stop Ringing</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.ringBtn, !device?.connected && styles.ringBtnDisabled]}
            onPress={handleRing}
            disabled={!device?.connected}
          >
            <Text style={styles.ringBtnText}>Ring Device</Text>
          </TouchableOpacity>
        )}

        {!device?.connected && (
          <Text style={styles.offlineNote}>Device must be connected to use Find My Device.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16, backgroundColor: Palette.surface, borderBottomWidth: 1, borderBottomColor: Palette.border },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 70 },
  backText: { color: Palette.textMuted, fontSize: 16, marginLeft: 4 },
  title: { fontSize: 18, fontWeight: '800', color: Palette.text },
  content: { padding: 20, paddingBottom: 60 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: Palette.textMuted, marginBottom: 14, letterSpacing: 0.5, textTransform: 'uppercase' },
  statusCard: { backgroundColor: Palette.surface, borderRadius: Radius.lg, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: Palette.border, ...Shadows.card },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  statusLabel: { fontSize: 14, color: Palette.textMuted, fontWeight: '700' },
  statusValue: { fontSize: 14, fontWeight: '800', color: Palette.text },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 13, fontWeight: '700' },
  divider: { height: 1, backgroundColor: Palette.border },
  ringArea: { alignItems: 'center', paddingVertical: 32 },
  ringOuter: { width: 120, height: 120, borderRadius: 60, backgroundColor: Palette.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  ringInner: { width: 88, height: 88, borderRadius: 44, backgroundColor: Palette.surface, borderWidth: 2, borderColor: Palette.primary, alignItems: 'center', justifyContent: 'center' },
  ringInnerActive: { backgroundColor: Palette.primary, borderColor: Palette.primary },
  ringLabel: { fontSize: 18, fontWeight: '900', color: Palette.text, marginBottom: 8, textAlign: 'center' },
  ringSub: { fontSize: 14, color: Palette.textMuted, textAlign: 'center', lineHeight: 20, paddingHorizontal: 16 },
  ringBtn: { backgroundColor: Palette.primary, borderRadius: Radius.sm, padding: 16, alignItems: 'center', ...Shadows.button },
  ringBtnDisabled: { opacity: 0.4 },
  ringBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  stopBtn: { backgroundColor: Palette.roseSoft, borderRadius: Radius.sm, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#FFC4D1' },
  stopBtnText: { color: Palette.rose, fontSize: 16, fontWeight: '800' },
  offlineNote: { textAlign: 'center', color: Palette.textMuted, fontSize: 13, marginTop: 12 },
});
