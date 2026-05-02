import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@ultranos/audit-logger': path.resolve(__dirname, '../../packages/audit-logger/src/index.ts'),
      '@ultranos/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      '@ultranos/sync-engine': path.resolve(__dirname, '../../packages/sync-engine/src/index.ts'),
    },
  },
})
