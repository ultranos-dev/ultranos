/**
 * Consumer Theme Tokens — Health Passport (Patient App)
 *
 * Warm purples/teals, soft surfaces, large touch targets.
 * Ref: UX spec — "Welcoming, utilizing Background Cyan accents and larger Light Surface cards."
 */

export const consumerColors = {
  /** Primary — warm purple */
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
  /** Secondary — teal */
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
  /** Background accent — from UX spec */
  accentBg: 'rgba(56, 200, 255, 0.10)',
  /** Soft card surface */
  surface: 'hsl(270, 20%, 98%)',
  surfaceElevated: 'hsl(0, 0%, 100%)',
  textPrimary: 'hsl(270, 30%, 15%)',
  textSecondary: 'hsl(270, 10%, 45%)',
  textMuted: 'hsl(270, 8%, 60%)',
  border: 'hsl(270, 15%, 88%)',
  borderFocused: 'hsl(270, 45%, 58%)',
} as const

export const consumerSpacing = {
  /** Large touch targets for patient-facing UI */
  touchTarget: 48,
  cardPadding: 20,
  sectionGap: 24,
  screenPadding: 20,
} as const

export const consumerTypography = {
  /** Headers use larger sizes for low-literacy accessibility */
  headerSize: 28,
  subheaderSize: 20,
  bodySize: 16,
  captionSize: 13,
  fontWeightHeader: '700' as const,
  fontWeightBody: '400' as const,
  fontWeightLabel: '600' as const,
} as const

export const consumerBorderRadius = {
  card: 16,
  button: 12,
  badge: 8,
  qrContainer: 20,
} as const
