import type { Config } from 'tailwindcss'
import preset from '@ultranos/ui-kit/tailwind.preset'

const config: Config = {
  presets: [preset],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui-kit/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ["'Manrope'", 'system-ui', '-apple-system', 'sans-serif'],
        heading: ["'Public Sans'", 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
