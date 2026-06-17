import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  define: { __DEV__: 'true' },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@/app': path.resolve(__dirname, 'app'),
      '@': path.resolve(__dirname, 'src'),
      '@ultranos/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      '@ultranos/ui-kit/components/ui/empty-state': path.resolve(__dirname, '../../packages/ui-kit/src/components/ui/empty-state.native.tsx'),
      '@ultranos/ui-kit/tokens.native': path.resolve(__dirname, '../../packages/ui-kit/src/tokens.native.ts'),
      '@ultranos/ui-kit/native': path.resolve(__dirname, '../../packages/ui-kit/src/native/index.ts'),
      // Alias react-native to a node-compatible mock so vitest can load it.
      // The actual Flow-typed react-native/index.js uses `import typeof` syntax
      // which Node cannot parse. Component tests use vi.mock() for component-level
      // overrides; this alias handles the module-resolution layer.
      'react-native': path.resolve(__dirname, 'src/__mocks__/react-native.js'),
      '@testing-library/react-native': path.resolve(__dirname, 'src/__mocks__/@testing-library/react-native.js'),
      'react-native-reanimated': path.resolve(__dirname, 'src/__mocks__/react-native-reanimated.js'),
      'lucide-react-native': path.resolve(__dirname, 'src/__mocks__/lucide-react-native.js'),
      'react-native-safe-area-context': path.resolve(__dirname, 'src/__mocks__/react-native-safe-area-context.js'),
      'expo-secure-store': path.resolve(__dirname, 'src/__mocks__/expo-secure-store.js'),
      'expo-router': path.resolve(__dirname, 'src/__mocks__/expo-router.js'),
      'expo-haptics': path.resolve(__dirname, 'src/__mocks__/expo-haptics.js'),
      'expo-image-picker': path.resolve(__dirname, 'src/__mocks__/expo-image-picker.js'),
      'expo-location': path.resolve(__dirname, 'src/__mocks__/expo-location.js'),
      'expo-updates': path.resolve(__dirname, 'src/__mocks__/expo-updates.js'),
      'expo-status-bar': path.resolve(__dirname, 'src/__mocks__/expo-status-bar.js'),
      'expo-font': path.resolve(__dirname, 'src/__mocks__/expo-font.js'),
      'expo-crypto': path.resolve(__dirname, 'src/__mocks__/expo-crypto.js'),
      '@react-native-community/netinfo': path.resolve(__dirname, 'src/__mocks__/@react-native-community/netinfo.js'),
    },
  },
  server: {
    sourcemapIgnoreList: (sourcePath) => sourcePath.includes('node_modules'),
  },
})
