/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    '<rootDir>/../../node_modules/(?!(.pnpm/.+/node_modules/(react-native|@react-native|expo|@expo|react-native-svg|react-native-qrcode-svg|react-native-iap|@ultranos)/))',
    '<rootDir>/node_modules/(?!(react-native|@react-native|expo|@expo|react-native-svg|react-native-qrcode-svg|react-native-iap|@ultranos)/)',
  ],
  moduleNameMapper: {
    // Specific @/ overrides must come BEFORE the generic @/ catch-all
    // Mock supabase to avoid needing real env vars in tests
    '^@/lib/supabase$': '<rootDir>/__mocks__/supabase.js',
    // Generic @/ path alias
    '^@/(.*)$': '<rootDir>/src/$1',
    // Map workspace packages to their source (handles .js → .ts resolution)
    '^@ultranos/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
    '^@ultranos/ui-kit$': '<rootDir>/../../packages/ui-kit/src/index.ts',
    '^@ultranos/ui-kit/utils/format$': '<rootDir>/../../packages/ui-kit/src/utils/format.ts',
    '^@ultranos/ui-kit/native/NumericText$': '<rootDir>/__mocks__/@ultranos/ui-kit/native/NumericText.js',
    '^@ultranos/sync-engine$': '<rootDir>/../../packages/sync-engine/src/index.ts',
    '^@ultranos/audit-logger$': '<rootDir>/../../packages/audit-logger/src/index.ts',
    '^@ultranos/crypto$': '<rootDir>/../../packages/crypto/src/index.ts',
    '^@ultranos/crypto/mobile$': '<rootDir>/../../packages/crypto/src/mobile-ecdsa-keystore.ts',
    '^@react-native-async-storage/async-storage$': '<rootDir>/__mocks__/@react-native-async-storage/async-storage.js',
    '^react-native-iap$': '<rootDir>/__mocks__/react-native-iap.js',
    // Manual node_module mocks aren't auto-applied under pnpm (app __mocks__ isn't
    // adjacent to the hoisted node_modules), so wire them explicitly.
    '^jail-monkey$': '<rootDir>/__mocks__/jail-monkey.js',
    // Fixes jest-expo@52 setup trying to doMock expo-modules-core/src/* under pnpm
    '^expo-modules-core/src/Refs$': '<rootDir>/../../node_modules/.pnpm/expo-modules-core@2.2.3/node_modules/expo-modules-core/src/Refs.ts',
    '^expo-modules-core/src/web/index\\.web$': '<rootDir>/../../node_modules/.pnpm/expo-modules-core@2.2.3/node_modules/expo-modules-core/src/web/index.web.ts',
  },
  // Resolve .js imports to .ts files (TypeScript NodeNext convention)
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  resolver: '<rootDir>/jest.resolver.js',
  // rtl-helpers.ts is a shared test helper (no test blocks) — don't run it as a suite.
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/__tests__/rtl-helpers\\.ts$'],
}
