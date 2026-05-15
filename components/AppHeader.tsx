import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Palette, Radius } from '../constants/theme';

const BellIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={Palette.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <Path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    <Circle cx="18" cy="6" r="4" fill="#ef4444" stroke="none"/>
  </Svg>
);

export default function AppHeader() {
  const router = useRouter();

  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.appName}>SmartDose</Text>
        <Text style={styles.appSubtitle}>Automated Pill Dispenser</Text>
      </View>
      <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/notifications')}>
        <BellIcon />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 14,
    backgroundColor: Palette.background,
  },
  appName: { fontSize: 24, fontWeight: '800', color: Palette.text },
  appSubtitle: { fontSize: 13, color: Palette.textMuted, marginTop: 2 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Palette.border,
  },
});
