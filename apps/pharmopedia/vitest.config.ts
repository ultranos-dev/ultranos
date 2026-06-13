import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@ultranos/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
    },
  },
})
