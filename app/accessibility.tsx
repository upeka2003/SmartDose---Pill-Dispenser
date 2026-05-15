import { useRouter } from 'expo-router';
import {
  Eye, Minus, Mic, MicOff, Plus,
  Type, Volume2, VolumeX, Wind, Zap,
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  Platform, ScrollView, StatusBar, StyleSheet, Switch,
  Text, TouchableOpacity, View,
} from 'react-native';
import { Palette, Radius, Shadows, Space } from '../constants/theme';
import { FontSizeLevel, useAccessibility } from '../contexts/AccessibilityContext';

const FONT_LEVELS: FontSizeLevel[] = ['Small', 'Medium', 'Large', 'Extra Large'];

function ToggleRow({
  icon, title, subtitle, value, onToggle, tint,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  tint: string;
}) {
  const { palette } = useAccessibility();
  return (
    <View style={tr.row} accessible accessibilityRole="switch" accessibilityLabel={`${title}: ${value ? 'on' : 'off'}`}>
      <View style={[tr.iconBox, { backgroundColor: tint + '18' }]}>{icon}</View>
      <View style={tr.rowBody}>
        <Text style={[tr.rowTitle, { color: palette.text }]}>{title}</Text>
        <Text style={[tr.rowSub, { color: palette.textMuted }]}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#D7DEE8', true: tint }}
        thumbColor="#fff"
        accessibilityLabel={`Toggle ${title}`}
      />
    </View>
  );
}

const tr = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', padding: Space.lg, gap: 14 },
  iconBox: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1 },
  rowTitle:{ fontSize: 15, fontWeight: '800' },
  rowSub:  { fontSize: 13, marginTop: 2 },
});

export default function AccessibilityScreen() {
  const router = useRouter();
  const {
    fontSizeLevel,   setFontSize,
    boldText,        setBoldText,
    highContrast,    setHighContrast,
    colorBlindMode,  setColorBlindMode,
    reduceMotion,    setReduceMotion,
    voiceEnabled,    setVoiceEnabled,
    darkMode,        palette,
    speak, fs, fw,
  } = useAccessibility();
  const s = useMemo(() => makeStyles(palette), [palette]);

  const [speaking, setSpeaking] = useState(false);

  const handleVoiceTest = () => {
    setSpeaking(true);
    speak(
      'SmartDose accessibility is active. ' +
      'Your current font size is ' + fontSizeLevel + '. ' +
      (boldText ? 'Bold text is on. ' : '') +
      (highContrast ? 'High contrast is on. ' : '') +
      'You have ' + (voiceEnabled ? '' : 'no ') + 'voice readout enabled.'
    );
    setTimeout(() => setSpeaking(false), 4000);
  };

  const handleStop = () => {
    if (Platform.OS === 'web' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  };

  // High-contrast surface overrides
  const hcBg   = highContrast ? '#000'    : palette.background;
  const hcSurf = highContrast ? '#111'    : palette.surface;
  const hcText = highContrast ? '#fff'    : palette.text;
  const hcMute = highContrast ? '#aaa'    : palette.textMuted;
  const hcBdr  = highContrast ? '#444'    : palette.border;
  const hcPrim = highContrast ? '#FACC15' : palette.primary;

  return (
    <View style={[s.root, { backgroundColor: hcBg }]}>
      <StatusBar barStyle={darkMode || highContrast ? 'light-content' : 'dark-content'} backgroundColor={hcBg} />

      <View style={[s.header, { backgroundColor: hcSurf, borderBottomColor: hcBdr }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}
          accessible accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={[s.backTxt, { color: hcPrim }]}>‹  Back</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: hcText }]}>Accessibility</Text>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <Text style={[s.sectionLabel, { color: hcMute }]}>TEXT SIZE</Text>
        <View style={[s.card, { backgroundColor: hcSurf, borderColor: hcBdr }]}>
          <View style={s.fontRow}>
            <Text style={[s.fontSmSample, { color: hcMute }]}>A</Text>
            <View style={s.fontSteps}>
              {FONT_LEVELS.map(level => (
                <TouchableOpacity
                  key={level}
                  style={[
                    s.fontChip,
                    { borderColor: hcBdr },
                    fontSizeLevel === level && { backgroundColor: hcPrim, borderColor: hcPrim },
                  ]}
                  onPress={() => setFontSize(level)}
                  activeOpacity={0.75}
                  accessible accessibilityRole="button"
                  accessibilityLabel={`Set text size to ${level}`}
                  accessibilityState={{ selected: fontSizeLevel === level }}
                >
                  <Text style={[s.fontChipTxt, { color: fontSizeLevel === level ? '#fff' : hcMute }]}>
                    {level === 'Extra Large' ? 'XL' : level[0]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[s.fontLgSample, { color: hcMute }]}>A</Text>
          </View>
          <Text style={[s.fontLevelLabel, { color: hcPrim }]}>{fontSizeLevel}</Text>

          <View style={s.fontQuickRow}>
            <TouchableOpacity
              style={[s.fontQuickBtn, { borderColor: hcBdr }]}
              activeOpacity={0.75}
              accessible accessibilityRole="button" accessibilityLabel="Decrease text size"
              onPress={() => { const i = FONT_LEVELS.indexOf(fontSizeLevel); if (i > 0) setFontSize(FONT_LEVELS[i - 1]); }}
            >
              <Minus size={18} color={hcMute} />
              <Text style={[s.fontQuickTxt, { color: hcMute }]}>Decrease</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.fontQuickBtn, { borderColor: hcBdr, backgroundColor: hcPrim + '14' }]}
              activeOpacity={0.75}
              accessible accessibilityRole="button" accessibilityLabel="Increase text size"
              onPress={() => { const i = FONT_LEVELS.indexOf(fontSizeLevel); if (i < FONT_LEVELS.length - 1) setFontSize(FONT_LEVELS[i + 1]); }}
            >
              <Plus size={18} color={hcPrim} />
              <Text style={[s.fontQuickTxt, { color: hcPrim }]}>Increase</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[s.sectionLabel, { color: hcMute }]}>TEXT OPTIONS</Text>
        <View style={[s.card, { backgroundColor: hcSurf, borderColor: hcBdr }]}>
          <ToggleRow
            icon={<Type size={18} color={palette.blue} />}
            title="Bold Text"
            subtitle="Make all text heavier and easier to read"
            value={boldText}
            onToggle={setBoldText}
            tint={palette.blue}
          />
        </View>

        <Text style={[s.sectionLabel, { color: hcMute }]}>VISION</Text>
        <View style={[s.card, { backgroundColor: hcSurf, borderColor: hcBdr }]}>
          <ToggleRow
            icon={<Eye size={18} color={palette.purple} />}
            title="High Contrast"
            subtitle="Dark background with bright text for low vision"
            value={highContrast}
            onToggle={setHighContrast}
            tint={palette.purple}
          />
          <View style={[s.divider, { backgroundColor: hcBdr }]} />
          <ToggleRow
            icon={<Eye size={18} color="#C2410C" />}
            title="Color Blind Mode"
            subtitle="Replaces red/green with blue/orange — safe for deuteranopia & protanopia"
            value={colorBlindMode}
            onToggle={setColorBlindMode}
            tint="#C2410C"
          />
        </View>

        <Text style={[s.sectionLabel, { color: hcMute }]}>VOICE READOUT</Text>
        <View style={[s.card, { backgroundColor: hcSurf, borderColor: hcBdr }]}>
          <ToggleRow
            icon={voiceEnabled
              ? <Volume2 size={18} color={palette.green} />
              : <VolumeX  size={18} color={palette.textMuted} />}
            title="Voice Readout"
            subtitle="Reads screen content aloud for visually impaired users"
            value={voiceEnabled}
            onToggle={setVoiceEnabled}
            tint={palette.green}
          />
          <View style={[s.divider, { backgroundColor: hcBdr }]} />
          <View style={s.infoRow}>
            <Mic size={14} color={hcMute} />
            <Text style={[s.infoTxt, { color: hcMute }]}>
              Language: English (en-US)  ·  Speed: Normal
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            s.testBtn,
            speaking ? [s.testBtn, { backgroundColor: palette.rose }] : { backgroundColor: hcPrim },
          ]}
          onPress={speaking ? handleStop : handleVoiceTest}
          activeOpacity={0.8}
          accessible accessibilityRole="button"
          accessibilityLabel={speaking ? 'Stop voice readout' : 'Test voice readout'}
          disabled={!voiceEnabled}
        >
          {speaking
            ? <><VolumeX size={18} color="#fff" /><Text style={s.testBtnTxt}>Stop</Text></>
            : <><Volume2 size={18} color={voiceEnabled ? '#fff' : palette.textSoft} />
                <Text style={[s.testBtnTxt, !voiceEnabled && { color: palette.textSoft }]}>
                  Test Voice
                </Text></>
          }
        </TouchableOpacity>
        {!voiceEnabled && (
          <Text style={[s.hintTxt, { color: hcMute }]}>Enable Voice Readout above to test</Text>
        )}

        <Text style={[s.sectionLabel, { color: hcMute }]}>MOTION</Text>
        <View style={[s.card, { backgroundColor: hcSurf, borderColor: hcBdr }]}>
          <ToggleRow
            icon={reduceMotion
              ? <Wind size={18} color={palette.amber} />
              : <Zap  size={18} color={palette.amber} />}
            title="Reduce Motion"
            subtitle="Minimise animations and transitions"
            value={reduceMotion}
            onToggle={setReduceMotion}
            tint={palette.amber}
          />
        </View>

        <Text style={[s.sectionLabel, { color: hcMute }]}>PREVIEW</Text>
        <View style={[s.previewCard, { backgroundColor: hcSurf, borderColor: hcBdr }]}>
          <Text style={[s.previewLabel, { color: hcMute }]}>
            This is how your text will appear:
          </Text>
          <Text style={[s.previewTitle, { fontSize: fs(20), fontWeight: fw('800') as any, color: hcText }]}>
            SmartDose — Medication Reminder
          </Text>
          <Text style={[s.previewBody, { fontSize: fs(15), fontWeight: fw('500') as any, color: hcMute }]}>
            Your next dose is Metformin 500mg at 08:00 AM. Tap "Mark Taken" after taking your medication.
          </Text>
          <View style={[s.previewBadge, { backgroundColor: hcPrim + '20', borderColor: hcPrim + '40' }]}>
            <Text style={[{ fontSize: fs(13), fontWeight: fw('700') as any, color: hcPrim }]}>
              Compartment 1  ·  08:00 AM  ·  1 pill
            </Text>
          </View>
          <Text style={[{ fontSize: fs(12), fontWeight: fw('600') as any, color: hcMute, opacity: 0.7 }]}>
            Font: {fontSizeLevel}{boldText ? '  ·  Bold' : ''}{highContrast ? '  ·  High Contrast' : ''}
          </Text>
        </View>

        <View style={[s.noteCard, { borderColor: palette.blue + '40', backgroundColor: palette.blueSoft }]}>
          <MicOff size={16} color={palette.blue} />
          <Text style={[s.noteTxt, { color: palette.blue }]}>
            SmartDose also works with your device's built-in screen reader (VoiceOver on iOS, TalkBack on Android). All interactive elements include accessibility labels.
          </Text>
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (P: typeof Palette) => StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Space.lg, paddingTop: 50, paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn:     { width: 70 },
  backTxt:     { fontSize: 17, fontWeight: '700' },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  scroll: { padding: Space.lg, paddingBottom: 60 },
  sectionLabel: {
    fontSize: 12, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginTop: 20, marginBottom: 8, paddingLeft: 2,
  },
  card: {
    borderRadius: Radius.lg, borderWidth: 1,
    overflow: 'hidden', marginBottom: 6,
    ...Shadows.card,
  },
  divider: { height: 1, marginLeft: 64 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: Space.lg, paddingVertical: 10 },
  infoTxt: { fontSize: 12, fontWeight: '600' },
  fontRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, padding: Space.lg, paddingBottom: 4 },
  fontSmSample: { fontSize: 13, fontWeight: '700' },
  fontLgSample: { fontSize: 24, fontWeight: '900' },
  fontSteps:    { flex: 1, flexDirection: 'row', gap: 6 },
  fontChip: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: Radius.sm, borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  fontChipTxt:    { fontSize: 14, fontWeight: '800' },
  fontLevelLabel: { textAlign: 'center', fontSize: 13, fontWeight: '700', paddingBottom: 12 },
  fontQuickRow:   { flexDirection: 'row', gap: 8, paddingHorizontal: Space.lg, paddingBottom: Space.lg },
  fontQuickBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: Radius.sm, borderWidth: 1 },
  fontQuickTxt:   { fontSize: 13, fontWeight: '700' },
  testBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: Radius.md, paddingVertical: 14,
    marginTop: 4, marginBottom: 4,
    ...Shadows.button,
  },
  testBtnTxt:  { color: '#fff', fontSize: 15, fontWeight: '800' },
  hintTxt:     { textAlign: 'center', fontSize: 12, fontWeight: '600', marginBottom: 8, color: P.textMuted },
  previewCard: {
    borderRadius: Radius.lg, borderWidth: 1, padding: Space.lg,
    gap: 12, marginBottom: 6,
    ...Shadows.card,
  },
  previewLabel:    { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  previewTitle:    { lineHeight: 28 },
  previewBody:     { lineHeight: 22 },
  previewBadge:    { borderRadius: Radius.sm, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  noteCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    borderRadius: Radius.md, borderWidth: 1, padding: Space.md, marginTop: 8,
  },
  noteTxt: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 20 },
});
