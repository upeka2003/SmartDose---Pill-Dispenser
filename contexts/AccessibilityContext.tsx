import React, {
  createContext, useCallback, useContext, useState,
} from 'react';
import { AccessibilityInfo, Platform, useColorScheme } from 'react-native';
import { DarkPalette, Palette, PaletteColors } from '../constants/theme';

export type FontSizeLevel = 'Small' | 'Medium' | 'Large' | 'Extra Large';

const FONT_SCALE: Record<FontSizeLevel, number> = {
  'Small':       0.85,
  'Medium':      1.0,
  'Large':       1.18,
  'Extra Large': 1.38,
};

// Color blind safe palette: blue replaces green, orange replaces rose/red
const CB_COLORS = {
  success:     '#2563EB',
  successSoft: '#DBEAFE',
  danger:      '#C2410C',
  dangerSoft:  '#FFF7ED',
  warning:     '#D97706',
  warningSoft: '#FEF3C7',
};

const DEFAULT_COLORS = {
  success:     '#059669',
  successSoft: '#D1FAE5',
  danger:      '#E11D48',
  dangerSoft:  '#FFE4E6',
  warning:     '#D97706',
  warningSoft: '#FEF3C7',
};

export type CbColors = typeof DEFAULT_COLORS;

export interface AccessibilityState {
  fontSizeLevel:     FontSizeLevel;
  fontScale:         number;
  boldText:          boolean;
  highContrast:      boolean;
  colorBlindMode:    boolean;
  reduceMotion:      boolean;
  voiceEnabled:      boolean;
  darkMode:          boolean;
  cbColors:          CbColors;
  palette:           PaletteColors;
  setFontSize:       (level: FontSizeLevel) => void;
  setBoldText:       (v: boolean) => void;
  setHighContrast:   (v: boolean) => void;
  setColorBlindMode: (v: boolean) => void;
  setReduceMotion:   (v: boolean) => void;
  setVoiceEnabled:   (v: boolean) => void;
  toggleDarkMode:    (v: boolean) => void;
  speak:             (text: string) => void;
  fs:                (base: number) => number;
  fw:                (normal?: string) => string;
}

const AccessibilityContext = createContext<AccessibilityState>({
  fontSizeLevel:     'Medium',
  fontScale:          1.0,
  boldText:           false,
  highContrast:       false,
  colorBlindMode:     false,
  reduceMotion:       false,
  voiceEnabled:       false,
  darkMode:           false,
  cbColors:           DEFAULT_COLORS,
  palette:            Palette,
  setFontSize:        () => {},
  setBoldText:        () => {},
  setHighContrast:    () => {},
  setColorBlindMode:  () => {},
  setReduceMotion:    () => {},
  setVoiceEnabled:    () => {},
  toggleDarkMode:     () => {},
  speak:              () => {},
  fs:                 (b) => b,
  fw:                 () => '600',
});

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [fontSizeLevel,  setFontSizeLevel]  = useState<FontSizeLevel>('Medium');
  const [boldText,       setBoldText]       = useState(false);
  const [highContrast,   setHighContrast]   = useState(false);
  const [colorBlindMode, setColorBlindMode] = useState(false);
  const [reduceMotion,   setReduceMotion]   = useState(false);
  const [voiceEnabled,   setVoiceEnabled]   = useState(false);
  const [darkModeOverride, setDarkModeOverride] = useState<boolean | null>(null);

  const fontScale = FONT_SCALE[fontSizeLevel];
  const setFontSize = (level: FontSizeLevel) => setFontSizeLevel(level);
  const cbColors = colorBlindMode ? CB_COLORS : DEFAULT_COLORS;
  const darkMode = darkModeOverride !== null ? darkModeOverride : systemScheme === 'dark';
  const palette: PaletteColors = darkMode ? DarkPalette : Palette;
  const toggleDarkMode = (v: boolean) => setDarkModeOverride(v);

  const speak = useCallback((text: string) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang  = 'en-US';
        u.rate  = 0.9;
        u.pitch = 1.0;
        window.speechSynthesis.speak(u);
      }
    } else {
      AccessibilityInfo.announceForAccessibility(text);
      try {
        const Speech = require('expo-speech');
        Speech.speak(text, { language: 'en-US', rate: 0.9 });
      } catch { /* expo-speech not installed */ }
    }
  }, []);

  const fs = useCallback((base: number) => Math.round(base * fontScale), [fontScale]);
  const fw = useCallback((normal = '600') => boldText ? '900' : normal, [boldText]);

  return (
    <AccessibilityContext.Provider value={{
      fontSizeLevel, fontScale,
      boldText, highContrast, colorBlindMode, reduceMotion, voiceEnabled,
      darkMode, cbColors, palette,
      setFontSize, setBoldText, setHighContrast, setColorBlindMode,
      setReduceMotion, setVoiceEnabled, toggleDarkMode,
      speak, fs, fw,
    }}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export const useAccessibility = () => useContext(AccessibilityContext);
