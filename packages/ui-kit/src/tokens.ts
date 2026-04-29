/**
 * TypeScript constants mirroring the CSS custom property tokens.
 * Use these in JS/TS contexts (e.g., React Native, dynamic styles).
 */

export const typography = {
  fontFamily: {
    sans: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, 'Cascadia Code', monospace",
  },
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    md: '1.125rem',
    lg: '1.25rem',
    xl: '1.5rem',
    '2xl': '1.875rem',
    '3xl': '2.25rem',
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const

export const colors = {
  primary: {
    50: 'hsl(156, 62%, 96%)',
    100: 'hsl(156, 60%, 90%)',
    200: 'hsl(156, 55%, 78%)',
    300: 'hsl(156, 50%, 64%)',
    400: 'hsl(156, 48%, 50%)',
    500: 'hsl(156, 55%, 40%)',
    600: 'hsl(156, 58%, 32%)',
    700: 'hsl(156, 60%, 25%)',
    800: 'hsl(156, 62%, 18%)',
    900: 'hsl(156, 65%, 12%)',
  },
  neutral: {
    0: 'hsl(0, 0%, 100%)',
    50: 'hsl(210, 20%, 98%)',
    100: 'hsl(210, 16%, 94%)',
    200: 'hsl(210, 12%, 87%)',
    300: 'hsl(210, 10%, 73%)',
    400: 'hsl(210, 8%, 55%)',
    500: 'hsl(210, 8%, 42%)',
    600: 'hsl(210, 10%, 33%)',
    700: 'hsl(210, 12%, 25%)',
    800: 'hsl(210, 14%, 17%)',
    900: 'hsl(210, 16%, 10%)',
  },
  danger: 'hsl(0, 72%, 51%)',
  warning: 'hsl(38, 92%, 50%)',
  success: 'hsl(142, 71%, 45%)',
  info: 'hsl(207, 90%, 54%)',
  allergy: 'hsl(0, 84%, 44%)',
} as const

export const spacing = {
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
} as const

export const letterSpacing = {
  tight: '-0.02em',
  normal: '0',
  wide: '0.025em',
} as const

export const borderRadius = {
  sm: '0.25rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '1rem',
  full: '9999px',
} as const

export const shadows = {
  sm: '0 1px 2px hsl(0 0% 0% / 0.05)',
  md: '0 4px 6px hsl(0 0% 0% / 0.07)',
  lg: '0 10px 15px hsl(0 0% 0% / 0.1)',
} as const

export const transitions = {
  fast: '150ms ease',
  normal: '250ms ease',
} as const
