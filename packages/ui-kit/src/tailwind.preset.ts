import type { Config } from 'tailwindcss'

const preset: Partial<Config> = {
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        // CSS vars allow RTL override in tokens.css to take effect:
        // [dir="rtl"] { --font-sans: 'Noto Sans Arabic', ... }
        sans:    ['var(--font-sans)', 'system-ui', 'sans-serif'],
        heading: ['var(--font-heading)', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: { DEFAULT: 'oklch(var(--background) / <alpha-value>)' },
        foreground: { DEFAULT: 'oklch(var(--foreground) / <alpha-value>)' },
        card: {
          DEFAULT:    'oklch(var(--card) / <alpha-value>)',
          foreground: 'oklch(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT:    'oklch(var(--popover) / <alpha-value>)',
          foreground: 'oklch(var(--popover-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT:    'oklch(var(--primary) / <alpha-value>)',
          foreground: 'oklch(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT:    'oklch(var(--secondary) / <alpha-value>)',
          foreground: 'oklch(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT:    'oklch(var(--muted) / <alpha-value>)',
          foreground: 'oklch(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT:    'oklch(var(--accent) / <alpha-value>)',
          foreground: 'oklch(var(--accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'oklch(var(--destructive) / <alpha-value>)',
        },
        border:  { DEFAULT: 'oklch(var(--border) / <alpha-value>)' },
        input:   { DEFAULT: 'oklch(var(--input) / <alpha-value>)' },
        ring:    { DEFAULT: 'oklch(var(--ring) / <alpha-value>)' },
        sidebar: {
          DEFAULT:              'oklch(var(--sidebar) / <alpha-value>)',
          foreground:           'oklch(var(--sidebar-foreground) / <alpha-value>)',
          primary:              'oklch(var(--sidebar-primary) / <alpha-value>)',
          'primary-foreground': 'oklch(var(--sidebar-primary-foreground) / <alpha-value>)',
          accent:               'oklch(var(--sidebar-accent) / <alpha-value>)',
          'accent-foreground':  'oklch(var(--sidebar-accent-foreground) / <alpha-value>)',
          border:               'oklch(var(--sidebar-border) / <alpha-value>)',
          ring:                 'oklch(var(--sidebar-ring) / <alpha-value>)',
        },
        warning: { DEFAULT: 'oklch(var(--warning) / <alpha-value>)' },
        success: { DEFAULT: 'oklch(var(--success) / <alpha-value>)' },
        chart: {
          '1': 'oklch(var(--chart-1) / <alpha-value>)',
          '2': 'oklch(var(--chart-2) / <alpha-value>)',
          '3': 'oklch(var(--chart-3) / <alpha-value>)',
          '4': 'oklch(var(--chart-4) / <alpha-value>)',
          '5': 'oklch(var(--chart-5) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg:    'var(--radius)',
        md:    'calc(var(--radius) - 2px)',
        sm:    'calc(var(--radius) - 4px)',
        '4xl': '2rem',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
    },
  },
  plugins: [],
}

export default preset
