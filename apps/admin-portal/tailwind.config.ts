import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ["'Manrope'", 'system-ui', '-apple-system', 'sans-serif'],
        heading: ["'Public Sans'", 'system-ui', '-apple-system', 'sans-serif'],
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

export default config
