/**
 * Story 18.11: Dark Mode Color Palettes
 *
 * Defines both light and dark theme color tokens for the Patient Lite Mobile app.
 * Based on consumer-theme.ts (ui-kit) with dark variants.
 *
 * Design principles:
 * - Material Design 3: tone-mapped surfaces (not pure black) for visual comfort
 * - WCAG AA contrast ratios: 4.5:1 body text, 3:1 large text
 * - Safety-critical colors (allergy red, escalation) are preserved in dark mode
 * - QR code always renders black-on-white regardless of theme
 */

export interface ThemeColors {
  /** Primary brand scale */
  primary: {
    50: string
    100: string
    200: string
    300: string
    400: string
    500: string
    600: string
    700: string
    800: string
    900: string
  }
  /** Secondary (teal) scale */
  secondary: {
    50: string
    100: string
    200: string
    300: string
    400: string
    500: string
    600: string
    700: string
    800: string
    900: string
  }
  /** Background accent */
  accentBg: string
  /** Main screen background */
  surface: string
  /** Elevated card/sheet background */
  surfaceElevated: string
  /** Primary text */
  textPrimary: string
  /** Secondary text */
  textSecondary: string
  /** Muted/caption text */
  textMuted: string
  /** Default border */
  border: string
  /** Focused input border */
  borderFocused: string
  /** Error / badge color */
  error: string
  /** Shadow color (used for elevation) */
  shadow: string
  /** Skeleton loading placeholder */
  skeleton: string
  /** Overlay backdrop */
  overlay: string
  /** "No known allergies" background */
  neutralBg: string
  /** "No known allergies" icon circle */
  neutralIconBg: string
  /** "No known allergies" icon and text color */
  neutralText: string
  /** QR valid / success badge */
  successBg: string
  successBorder: string
  successText: string
  /** QR expired / error badge */
  dangerBg: string
  dangerBorder: string
  dangerText: string
  /** Unverified QR badge */
  warningBg: string
  warningBorder: string
  warningText: string
  /** Active medication badge */
  activeBadgeBg: string
  activeBadgeBorder: string
  activeBadgeText: string
  /** Sensitive item note color */
  sensitiveText: string
  /** Text color for primary-colored button backgrounds (ensures WCAG AA) */
  onPrimary: string
  /** StatusBar style */
  statusBarStyle: 'light-content' | 'dark-content'
}

/**
 * Safety-critical colors that do NOT change between themes.
 * Per CLAUDE.md rule #4: allergy data gets highest display prominence.
 * Per AC #9: allergy banners remain red in dark mode.
 */
export const SAFETY_COLORS = {
  /** Allergy card — light mode */
  allergyBgLight: '#FEE2E2',
  allergyBorderLight: '#FECACA',
  allergyIconLight: '#DC2626',
  /** Allergy card — dark mode (adjusted for dark backgrounds, still clearly red) */
  allergyBgDark: '#7F1D1D',
  allergyBorderDark: '#991B1B',
  allergyIconDark: '#FCA5A5',
  /** Escalation red — always visible */
  escalation: '#EF4444',
  escalationDark: '#F87171',
  /** Urgent badge */
  urgentBg: '#DC2626',
  urgentBgDark: '#991B1B',
  /** Compromised device warning */
  warningCardBg: '#FEF2F2',
  warningCardBgDark: '#450A0A',
  warningCardBorder: '#DC2626',
  warningCardBorderDark: '#EF4444',
  warningReasonsBg: '#FFFFFF',
  warningReasonsBgDark: '#1E1E1E',
  warningReasonsBorder: '#FECACA',
  warningReasonsBorderDark: '#7F1D1D',
  /** Banner (compromised device) */
  bannerBg: '#DC2626',
} as const

/**
 * QR code colors — NEVER change regardless of theme.
 * Per AC #10: QR code remains black-on-white for scannability.
 */
export const QR_COLORS = {
  foreground: '#000000',
  background: '#FFFFFF',
  /** Wrapper border — light mode uses dark border, dark mode uses lighter border for visibility */
  wrapperBorderLight: '#1A1A1A',
  wrapperBorderDark: '#555555',
} as const

/** Light theme colors */
export const lightColors: ThemeColors = {
  primary: {
    50: 'hsl(270, 50%, 97%)',
    100: 'hsl(270, 48%, 92%)',
    200: 'hsl(270, 45%, 82%)',
    300: 'hsl(270, 42%, 70%)',
    400: 'hsl(270, 40%, 58%)',
    500: 'hsl(270, 45%, 48%)',
    600: 'hsl(270, 48%, 38%)',
    700: 'hsl(270, 50%, 30%)',
    800: 'hsl(270, 52%, 22%)',
    900: 'hsl(270, 55%, 15%)',
  },
  secondary: {
    50: 'hsl(180, 50%, 96%)',
    100: 'hsl(180, 48%, 90%)',
    200: 'hsl(180, 45%, 78%)',
    300: 'hsl(180, 42%, 64%)',
    400: 'hsl(180, 40%, 50%)',
    500: 'hsl(180, 45%, 40%)',
    600: 'hsl(180, 48%, 32%)',
    700: 'hsl(180, 50%, 25%)',
    800: 'hsl(180, 52%, 18%)',
    900: 'hsl(180, 55%, 12%)',
  },
  accentBg: 'rgba(56, 200, 255, 0.10)',
  surface: 'hsl(270, 20%, 98%)',
  surfaceElevated: 'hsl(0, 0%, 100%)',
  textPrimary: 'hsl(270, 30%, 15%)',
  textSecondary: 'hsl(270, 10%, 45%)',
  textMuted: 'hsl(270, 8%, 60%)',
  border: 'hsl(270, 15%, 88%)',
  borderFocused: 'hsl(270, 45%, 58%)',
  error: 'hsl(0, 84%, 44%)',
  shadow: '#000000',
  skeleton: '#E5E7EB',
  overlay: 'rgba(0, 0, 0, 0.3)',
  neutralBg: '#F3F4F6',
  neutralIconBg: '#D1D5DB',
  neutralText: '#6B7280',
  successBg: '#D1FAE5',
  successBorder: '#A7F3D0',
  successText: '#065F46',
  dangerBg: '#FEE2E2',
  dangerBorder: '#FECACA',
  dangerText: '#991B1B',
  warningBg: 'hsl(45, 100%, 90%)',
  warningBorder: 'hsl(45, 80%, 60%)',
  warningText: 'hsl(30, 80%, 30%)',
  activeBadgeBg: 'hsl(160, 60%, 90%)',
  activeBadgeBorder: 'hsl(160, 50%, 70%)',
  activeBadgeText: 'hsl(160, 60%, 25%)',
  sensitiveText: 'hsl(30, 80%, 40%)',
  onPrimary: '#FFFFFF',
  statusBarStyle: 'dark-content',
}

/** Dark theme colors — tone-mapped surfaces per Material Design 3 */
export const darkColors: ThemeColors = {
  primary: {
    50: 'hsl(270, 30%, 18%)',
    100: 'hsl(270, 32%, 22%)',
    200: 'hsl(270, 35%, 30%)',
    300: 'hsl(270, 38%, 42%)',
    400: 'hsl(270, 40%, 55%)',
    500: 'hsl(270, 45%, 65%)',
    600: 'hsl(270, 48%, 72%)',
    700: 'hsl(270, 50%, 80%)',
    800: 'hsl(270, 48%, 88%)',
    900: 'hsl(270, 45%, 94%)',
  },
  secondary: {
    50: 'hsl(180, 30%, 14%)',
    100: 'hsl(180, 32%, 18%)',
    200: 'hsl(180, 35%, 26%)',
    300: 'hsl(180, 38%, 38%)',
    400: 'hsl(180, 40%, 50%)',
    500: 'hsl(180, 45%, 58%)',
    600: 'hsl(180, 48%, 65%)',
    700: 'hsl(180, 50%, 75%)',
    800: 'hsl(180, 48%, 85%)',
    900: 'hsl(180, 45%, 92%)',
  },
  accentBg: 'rgba(56, 200, 255, 0.08)',
  surface: '#121212',
  surfaceElevated: '#1E1E1E',
  textPrimary: '#E8E8E8',
  textSecondary: '#9CA3AF',
  textMuted: '#8B919A',
  border: 'hsl(270, 10%, 25%)',
  borderFocused: 'hsl(270, 45%, 55%)',
  error: 'hsl(0, 84%, 60%)',
  shadow: '#000000',
  skeleton: '#2A2A2A',
  overlay: 'rgba(0, 0, 0, 0.6)',
  neutralBg: '#1E1E1E',
  neutralIconBg: '#374151',
  neutralText: '#9CA3AF',
  successBg: '#064E3B',
  successBorder: '#065F46',
  successText: '#6EE7B7',
  dangerBg: '#7F1D1D',
  dangerBorder: '#991B1B',
  dangerText: '#FCA5A5',
  warningBg: 'hsl(45, 40%, 18%)',
  warningBorder: 'hsl(45, 50%, 35%)',
  warningText: 'hsl(45, 80%, 70%)',
  activeBadgeBg: 'hsl(160, 40%, 18%)',
  activeBadgeBorder: 'hsl(160, 40%, 30%)',
  activeBadgeText: 'hsl(160, 50%, 70%)',
  sensitiveText: 'hsl(30, 60%, 60%)',
  onPrimary: '#1A1A2E',
  statusBarStyle: 'light-content',
}

/** Notification type-specific colors for each theme */
export const notificationTypeColors = {
  light: {
    LAB_RESULT_AVAILABLE: { bg: '#DBEAFE' },
    LAB_RESULT_ESCALATION: { bg: '#FEE2E2', borderColor: '#EF4444' },
    PRESCRIPTION_READY: { bg: '#D1FAE5' },
    CONSENT_CHANGE: { bg: '#EDE9FE' },
  },
  dark: {
    LAB_RESULT_AVAILABLE: { bg: 'hsl(220, 40%, 20%)' },
    LAB_RESULT_ESCALATION: { bg: '#450A0A', borderColor: '#F87171' },
    PRESCRIPTION_READY: { bg: 'hsl(160, 40%, 15%)' },
    CONSENT_CHANGE: { bg: 'hsl(270, 30%, 18%)' },
  },
} as const

/**
 * Health card colors for each theme.
 * Allergy variant uses safety colors that maintain visibility in both themes.
 * Medication and consent variants adapt to theme.
 */
export const healthCardColors = {
  light: {
    allergy: {
      backgroundColor: SAFETY_COLORS.allergyBgLight,
      borderColor: SAFETY_COLORS.allergyBorderLight,
      iconColor: SAFETY_COLORS.allergyIconLight,
      iconBgColor: 'rgba(220, 38, 38, 0.12)',
    },
    medication: {
      backgroundColor: '#DBEAFE',
      borderColor: '#BFDBFE',
      iconColor: '#2563EB',
      iconBgColor: 'rgba(37, 99, 235, 0.12)',
    },
    consent: {
      backgroundColor: '#D1FAE5',
      borderColor: '#A7F3D0',
      iconColor: '#059669',
      iconBgColor: 'rgba(5, 150, 105, 0.12)',
    },
  },
  dark: {
    allergy: {
      backgroundColor: SAFETY_COLORS.allergyBgDark,
      borderColor: SAFETY_COLORS.allergyBorderDark,
      iconColor: SAFETY_COLORS.allergyIconDark,
      iconBgColor: 'rgba(252, 165, 165, 0.12)',
    },
    medication: {
      backgroundColor: 'hsl(220, 40%, 20%)',
      borderColor: 'hsl(220, 35%, 30%)',
      iconColor: '#93C5FD',
      iconBgColor: 'rgba(147, 197, 253, 0.12)',
    },
    consent: {
      backgroundColor: 'hsl(160, 40%, 15%)',
      borderColor: 'hsl(160, 35%, 25%)',
      iconColor: '#6EE7B7',
      iconBgColor: 'rgba(110, 231, 183, 0.12)',
    },
  },
} as const
