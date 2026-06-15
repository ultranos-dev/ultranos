/**
 * Ultranos Native Design Tokens
 *
 * React Native equivalent of tokens.css — use these in StyleSheet.create() and
 * inline styles across all RN/Expo apps (pharmopedia, opd-lite-mobile, patient-lite-mobile).
 *
 * Colors are converted from the CSS token values in tokens.css:
 *   - Primary: hsl(156, 55%, 40%) scale  [Wise Green]
 *   - Neutral: hsl(210, *%, *%) scale    [warm grays]
 *   - Semantic: matches --color-danger/warning/success/info
 */

// ── Colors ────────────────────────────────────────────────────────────────────

export const Colors = {
  // Primary — Wise Green (hsl(156, 55%, 40%) at 500)
  primary50:  '#edfaf4',
  primary100: '#d0f3e5',
  primary200: '#a3e6cc',
  primary300: '#6dd1ae',
  primary400: '#3db88e',
  primary500: '#2e9e71',  // canonical primary — matches hsl(156,55%,40%) in tokens.css
  primary600: '#237d5a',
  primary700: '#1c6248',
  primary800: '#154c37',
  primary900: '#0e3326',

  // Neutral — warm grays (hsl(210, *, *) scale)
  neutral0:   '#ffffff',
  neutral50:  '#f7f9fb',  // hsl(210, 20%, 98%)
  neutral100: '#eef1f5',  // hsl(210, 16%, 94%)
  neutral200: '#d8dde6',  // hsl(210, 12%, 87%)
  neutral300: '#b0b8c7',  // hsl(210, 10%, 73%)
  neutral400: '#838e9d',  // hsl(210, 8%,  55%)
  neutral500: '#627080',  // hsl(210, 8%,  42%)
  neutral600: '#4a5568',  // hsl(210, 10%, 33%)
  neutral700: '#374052',  // hsl(210, 12%, 25%)
  neutral800: '#242d3b',  // hsl(210, 14%, 17%)
  neutral900: '#141c28',  // hsl(210, 16%, 10%)

  // Semantic — clinical alerts (matches tokens.css --color-danger/warning/success/info)
  danger:      '#dc2626',  // hsl(0,   72%, 51%)
  dangerLight: '#fef2f2',
  dangerDark:  '#991b1b',

  warning:      '#d97706',  // hsl(38,  92%, 50%) darkened for readability on white
  warningLight: '#fffbeb',
  warningDark:  '#92400e',

  success:      '#16a34a',  // hsl(142, 71%, 45%)
  successLight: '#f0fdf4',
  successDark:  '#14532d',

  info:      '#2563eb',  // hsl(207, 90%, 54%)
  infoLight: '#eff6ff',
  infoDark:  '#1d4ed8',

  // Allergy — highest clinical prominence (CLAUDE.md safety rule §4)
  allergy:       '#b91c1c',  // hsl(0, 84%, 44%)
  allergyBg:     '#fef2f2',
  allergyBorder: '#f87171',

  // Convenience
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',

  // ── Semantic — theme-aware aliases (light mode defaults) ──
  surface:         '#ffffff',
  surfaceElevated: '#ffffff',
  surfaceSubtle:   '#f5f5f5',
  textPrimary:     '#141c28',  // neutral900
  textSecondary:   '#4a5568',  // neutral600
  textMuted:       '#838e9d',  // neutral400
  border:          '#d8dde6',  // neutral200
  borderSubtle:    '#eef1f5',  // neutral100
  overlay:         'rgba(0,0,0,0.5)',
} as const

// ── Dark palette ──────────────────────────────────────────────────────────────

export const ColorsDark = {
  // Primary — same as light (designed for sufficient contrast on dark surfaces)
  primary50:  Colors.primary50,
  primary100: Colors.primary100,
  primary200: Colors.primary200,
  primary300: Colors.primary300,
  primary400: Colors.primary400,
  primary500: Colors.primary500,
  primary600: Colors.primary600,
  primary700: Colors.primary700,
  primary800: Colors.primary800,
  primary900: Colors.primary900,

  // Neutral — inverted
  neutral0:   '#121212',
  neutral50:  '#1a1a1a',
  neutral100: '#262626',
  neutral200: '#333333',
  neutral300: '#4a4a4a',
  neutral400: '#666666',
  neutral500: '#888888',
  neutral600: '#a0a0a0',
  neutral700: '#bbbbbb',
  neutral800: '#d4d4d4',
  neutral900: '#f0f0f0',

  // Semantic — same as light
  danger:      Colors.danger,
  dangerLight: '#3b1111',
  dangerDark:  '#fca5a5',

  warning:      Colors.warning,
  warningLight: '#3b2506',
  warningDark:  '#fcd34d',

  success:      Colors.success,
  successLight: '#052e16',
  successDark:  '#86efac',

  info:      Colors.info,
  infoLight: '#1e2a4a',
  infoDark:  '#93c5fd',

  // Allergy — same prominence, adjusted for dark
  allergy:       '#f87171',
  allergyBg:     '#3b1111',
  allergyBorder: '#dc2626',

  // Convenience
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',

  // Semantic — dark mode
  surface:         '#121212',
  surfaceElevated: '#1e1e1e',
  surfaceSubtle:   '#2a2a2a',
  textPrimary:     '#f0f0f0',
  textSecondary:   '#a0a0a0',
  textMuted:       '#666666',
  border:          '#333333',
  borderSubtle:    '#262626',
  overlay:         'rgba(0,0,0,0.7)',
} as const

/** Union type for either palette — use in component style factories. */
export type ThemeColors = typeof Colors | typeof ColorsDark

// ── Typography ────────────────────────────────────────────────────────────────

/**
 * Font family names — must match the keys registered in useFonts() inside
 * the app's root _layout.tsx.
 *
 * LTR (en): Manrope (sans) / Public Sans (heading)
 * RTL (ar, prs, ps): NotoNaskhArabic replaces both
 */
export const FontFamily = {
  sans:         'Manrope',
  sansMedium:   'Manrope-Medium',
  sansSemibold: 'Manrope-SemiBold',
  sansBold:     'Manrope-Bold',
  heading:      'PublicSans',
  headingBold:  'PublicSans-Bold',
  arabic:       'NotoNaskhArabic',
} as const

/** Returns the correct font family for the active locale. */
export function fontFamily(
  weight: 'regular' | 'medium' | 'semibold' | 'bold',
  isRtl: boolean,
): string {
  if (isRtl) return FontFamily.arabic
  switch (weight) {
    case 'medium':   return FontFamily.sansMedium
    case 'semibold': return FontFamily.sansSemibold
    case 'bold':     return FontFamily.sansBold
    default:         return FontFamily.sans
  }
}

export const FontSize = {
  xs:    12,
  sm:    14,
  base:  16,
  md:    18,
  lg:    20,
  xl:    24,
  '2xl': 30,
  '3xl': 36,
} as const

export const FontWeight = {
  normal:   '400' as const,
  medium:   '500' as const,
  semibold: '600' as const,
  bold:     '700' as const,
}

export const LineHeight = {
  tight:   20,  // ~1.25 × base
  normal:  24,  // ~1.5  × base
  relaxed: 28,  // ~1.75 × base
} as const

// ── Spacing ───────────────────────────────────────────────────────────────────

export const Spacing = {
  1:  4,
  2:  8,
  3:  12,
  4:  16,
  5:  20,
  6:  24,
  8:  32,
  10: 40,
  12: 48,
  16: 64,
} as const

// ── Border Radius ─────────────────────────────────────────────────────────────

export const Radius = {
  sm:   4,
  md:   8,
  lg:   12,
  xl:   16,
  full: 9999,
} as const

// ── Shadows (iOS shadowProps + Android elevation) ─────────────────────────────

export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 5,
  },
} as const
