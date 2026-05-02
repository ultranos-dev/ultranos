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
      '@ultranos/crypto': path.resolve(__dirname, '../../packages/crypto/src/index.ts'),
      '@ultranos/sync-engine': path.resolve(__dirname, '../../packages/sync-engine/src/index.ts'),
      '@ultranos/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      '@ultranos/audit-logger/client': path.resolve(__dirname, '../../packages/audit-logger/src/client.ts'),
      '@ultranos/audit-logger/adapters/dexie': path.resolve(__dirname, '../../packages/audit-logger/src/adapters/dexie-adapter.ts'),
      '@ultranos/audit-logger/drain': path.resolve(__dirname, '../../packages/audit-logger/src/drain.ts'),
      '@ultranos/audit-logger': path.resolve(__dirname, '../../packages/audit-logger/src/index.ts'),
      // Resolve dexie to prevent Vite's optional-peer-dep virtual module stub from throwing
      // when vi.mock() for any module triggers resolution of the audit-logger module graph.
      // import-wrapper.mjs uses globalThis[Symbol.for("Dexie")] to deduplicate instances.
      'dexie': path.resolve(__dirname, 'node_modules/dexie/import-wrapper.mjs'),
    },
  },
})
