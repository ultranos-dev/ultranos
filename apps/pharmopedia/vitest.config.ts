import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@/app': path.resolve(__dirname, 'app'),
      '@': path.resolve(__dirname, 'src'),
      '@ultranos/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      '@ultranos/ui-kit/components/ui/empty-state': path.resolve(__dirname, '../../packages/ui-kit/src/components/ui/empty-state.native.tsx'),
      '@ultranos/ui-kit/tokens.native': path.resolve(__dirname, '../../packages/ui-kit/src/tokens.native.ts'),
      // Alias react-native to a node-compatible mock so vitest can load it.
      // The actual Flow-typed react-native/index.js uses `import typeof` syntax
      // which Node cannot parse. Component tests use vi.mock() for component-level
      // overrides; this alias handles the module-resolution layer.
      'react-native': path.resolve(__dirname, 'src/__mocks__/react-native.js'),
      '@testing-library/react-native': path.resolve(__dirname, 'src/__mocks__/@testing-library/react-native.js'),
    },
  },
  server: {
    sourcemapIgnoreList: (sourcePath) => sourcePath.includes('node_modules'),
  },
})
