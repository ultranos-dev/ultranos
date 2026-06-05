import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/__tests__/setup.ts'],
  },
  resolve: {
    alias: [
      {
        find: '@',
        replacement: path.resolve(__dirname, 'src'),
      },
      {
        find: '@ultranos/shared-types',
        replacement: path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      },
      {
        find: '@ultranos/ui-kit/icons',
        replacement: path.resolve(__dirname, '../../packages/ui-kit/src/icons.ts'),
      },
      {
        find: /^@ultranos\/ui-kit\/(.+)$/,
        replacement: path.resolve(__dirname, '../../packages/ui-kit/src/$1'),
      },
      {
        find: '@ultranos/ui-kit',
        replacement: path.resolve(__dirname, '../../packages/ui-kit/src/index.ts'),
      },
    ],
  },
})
