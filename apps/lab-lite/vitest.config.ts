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
    // Array form so the bare `@ultranos/ui-kit` alias can be an EXACT-match regex.
    // As a plain string it prefix-matched deep subpaths (e.g.
    // `@ultranos/ui-kit/components/ui/button`) and rewrote them to
    // `.../src/index.ts/components/ui/button` — an invalid path — breaking every
    // ui-kit component import. The regex matches only the bare specifier; deep
    // subpaths fall through to the package `exports` map (which maps them to source).
    alias: [
      { find: '@ultranos/crypto', replacement: path.resolve(__dirname, '../../packages/crypto/src/index.ts') },
      { find: '@ultranos/sync-engine', replacement: path.resolve(__dirname, '../../packages/sync-engine/src/index.ts') },
      { find: '@ultranos/shared-types', replacement: path.resolve(__dirname, '../../packages/shared-types/src/index.ts') },
      { find: '@ultranos/audit-logger/client', replacement: path.resolve(__dirname, '../../packages/audit-logger/dist/client.js') },
      { find: '@ultranos/audit-logger/adapters/dexie', replacement: path.resolve(__dirname, '../../packages/audit-logger/dist/adapters/dexie-adapter.js') },
      { find: '@ultranos/audit-logger/drain', replacement: path.resolve(__dirname, '../../packages/audit-logger/dist/drain.js') },
      { find: '@ultranos/audit-logger', replacement: path.resolve(__dirname, '../../packages/audit-logger/dist/index.js') },
      { find: '@ultranos/ui-kit/icons', replacement: path.resolve(__dirname, '../../packages/ui-kit/src/icons.ts') },
      { find: /^@ultranos\/ui-kit$/, replacement: path.resolve(__dirname, '../../packages/ui-kit/src/index.ts') },
      { find: /^@\//, replacement: path.resolve(__dirname, 'src') + '/' },
    ],
  },
})
