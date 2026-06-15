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
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@ultranos/sync-engine': path.resolve(__dirname, '../../packages/sync-engine/src/index.ts'),
      '@ultranos/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      '@ultranos/audit-logger/client': path.resolve(__dirname, '../../packages/audit-logger/dist/client.js'),
      '@ultranos/audit-logger/adapters/dexie': path.resolve(__dirname, '../../packages/audit-logger/dist/adapters/dexie-adapter.js'),
      '@ultranos/audit-logger/drain': path.resolve(__dirname, '../../packages/audit-logger/dist/drain.js'),
      '@ultranos/audit-logger': path.resolve(__dirname, '../../packages/audit-logger/dist/index.js'),
      '@ultranos/ui-kit/icons': path.resolve(__dirname, '../../packages/ui-kit/src/icons.ts'),
      '@ultranos/ui-kit': path.resolve(__dirname, '../../packages/ui-kit/src/index.ts'),
    },
  },
})
