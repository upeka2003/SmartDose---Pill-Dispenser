import { Platform } from 'react-native';

// ─── Palette ──────────────────────────────────────────────────────────────────
// Each semantic color has a full-saturation and a soft (10–15 % opacity) variant
// for backgrounds, badges, and highlights. This ensures consistent meaning:
//   primary = brand action   green = success   amber = caution   rose = danger   blue = info

export const Palette = {
  // Backgrounds
  background:   '#F0F4F8',   // cool off-white — reduces eye strain
  surface:      '#FFFFFF',
  surfaceMuted: '#EEF6F4',

  // Text hierarchy  (contrast ratios: text ≥ 7:1, textMuted ≥ 4.5:1, textSoft ≥ 3:1)
  text:         '#0F172A',
  textMuted:    '#475569',
  textSoft:     '#94A3B8',

  // Brand / primary
  primary:      '#0F766E',
  primaryDark:  '#0B5F59',
  primarySoft:  '#CCFBF1',   // lighter — better contrast on white

  // Semantic status colours
  green:        '#059669',
  greenSoft:    '#D1FAE5',
  amber:        '#D97706',
  amberSoft:    '#FEF3C7',
  rose:         '#E11D48',
  roseSoft:     '#FFE4E6',
  blue:         '#2563EB',
  blueSoft:     '#DBEAFE',
  purple:       '#7C3AED',
  purpleSoft:   '#EDE9FE',

  // UI chrome
  border:       '#E2EAF2',
  borderStrong: '#CBD5E1',
  overlay:      'rgba(15,23,42,0.45)',
};

export const DarkPalette = {
  background:   '#0F172A',
  surface:      '#1E293B',
  surfaceMuted: '#0C1A2C',
  text:         '#F1F5F9',
  textMuted:    '#94A3B8',
  textSoft:     '#64748B',
  primary:      '#0D9488',
  primaryDark:  '#0F766E',
  primarySoft:  '#0D2926',
  green:        '#34D399',
  greenSoft:    '#064E3B',
  amber:        '#FBBF24',
  amberSoft:    '#451A03',
  rose:         '#FB7185',
  roseSoft:     '#4C0519',
  blue:         '#60A5FA',
  blueSoft:     '#1E3A5F',
  purple:       '#A78BFA',
  purpleSoft:   '#2E1065',
  border:       '#334155',
  borderStrong: '#475569',
  overlay:      'rgba(0,0,0,0.7)',
};

export type PaletteColors = typeof Palette;

// ─── Radius ───────────────────────────────────────────────────────────────────
export const Radius = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  22,
  full: 999,
};

// ─── Spacing ──────────────────────────────────────────────────────────────────
// 4-pt grid. Use these to keep vertical rhythm consistent.
export const Space = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 28,
};

// ─── Typography ───────────────────────────────────────────────────────────────
export const Type = {
  hero:    { fontSize: 30, fontWeight: '900' as const, letterSpacing: -0.5 },
  title:   { fontSize: 22, fontWeight: '900' as const, letterSpacing: -0.3 },
  heading: { fontSize: 18, fontWeight: '800' as const },
  body:    { fontSize: 15, fontWeight: '500' as const },
  label:   { fontSize: 13, fontWeight: '700' as const },
  caption: { fontSize: 12, fontWeight: '600' as const },
  micro:   { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.5, textTransform: 'uppercase' as const },
};

// ─── Shadows ─────────────────────────────────────────────────────────────────
// Three elevation levels for clear depth hierarchy (affordance principle)
export const Shadows = {
  // Level 1 — cards, containers
  card: {
    shadowColor:   '#0F172A',
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius:  8,
    elevation:     2,
  },
  // Level 2 — floating cards, modals
  float: {
    shadowColor:   '#0F172A',
    shadowOffset:  { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius:  16,
    elevation:     4,
  },
  // Level 3 — FABs, primary buttons
  button: {
    shadowColor:   '#0F766E',
    shadowOffset:  { width: 0, height: 6 },
    shadowOpacity: 0.30,
    shadowRadius:  12,
    elevation:     5,
  },
};

// ─── Status helpers ──────────────────────────────────────────────────────────
// Centralised status → { bg, fg } mapping (consistency + visibility principles)
export const StatusStyle = {
  taken:    { bg: Palette.greenSoft,  fg: Palette.green  },
  missed:   { bg: Palette.roseSoft,   fg: Palette.rose   },
  pending:  { bg: Palette.amberSoft,  fg: Palette.amber  },
  auto:     { bg: Palette.blueSoft,   fg: Palette.blue   },
  connected:{ bg: Palette.greenSoft,  fg: Palette.green  },
  offline:  { bg: Palette.roseSoft,   fg: Palette.rose   },
};

// ─── Legacy compat ───────────────────────────────────────────────────────────
export const Colors = {
  light: {
    text:            Palette.text,
    background:      Palette.background,
    tint:            Palette.primary,
    icon:            Palette.textMuted,
    tabIconDefault:  Palette.textSoft,
    tabIconSelected: Palette.primary,
  },
  dark: {
    text:            '#ECEDEE',
    background:      '#151718',
    tint:            '#7DD3FC',
    icon:            '#9BA1A6',
    tabIconDefault:  '#9BA1A6',
    tabIconSelected: '#7DD3FC',
  },
};

export const Fonts = Platform.select({
  ios:     { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal',    serif: 'serif',    rounded: 'normal',     mono: 'monospace'    },
  web: {
    sans:    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif:   "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', sans-serif",
    mono:    "SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
  },
});
