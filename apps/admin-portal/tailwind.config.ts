import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Inter'", 'system-ui', '-apple-system', "'Segoe UI'", 'Roboto', 'sans-serif'],
      },
      colors: {
        canvas: 'var(--color-canvas)',
        surface: 'var(--color-surface)',
        'surface-raised': 'var(--color-surface-raised)',
        sidebar: 'var(--color-sidebar)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-on-dark': 'var(--color-text-on-dark)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        'accent-subtle': 'var(--color-accent-subtle)',
        border: 'var(--color-border)',
        danger: 'var(--color-danger)',
        'danger-subtle': 'var(--color-danger-subtle)',
        warning: 'var(--color-warning)',
        'warning-subtle': 'var(--color-warning-subtle)',
        success: 'var(--color-success)',
        'success-subtle': 'var(--color-success-subtle)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}

export default config
