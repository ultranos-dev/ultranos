import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Inter'", 'system-ui', '-apple-system', "'Segoe UI'", 'Roboto', 'sans-serif'],
      },
      colors: {
        brand: {
          lime: '#D4FF00',
        },
        surface: '#F3F4F6',
        border: '#E5E7EB',
        'text-muted': '#6B7280',
        'success-green': '#A3E635',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}

export default config
