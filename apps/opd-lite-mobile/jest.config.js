/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    '<rootDir>/../../node_modules/(?!(.pnpm/.+/node_modules/(react-native|@react-native|expo|@expo|@ultranos)/))',
    '<rootDir>/node_modules/(?!(react-native|@react-native|expo|@expo|@ultranos)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@ultranos/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
    '^@ultranos/ui-kit$': '<rootDir>/../../packages/ui-kit/src/index.ts',
    '^@ultranos/sync-engine$': '<rootDir>/../../packages/sync-engine/src/index.ts',
    '^@ultranos/audit-logger$': '<rootDir>/../../packages/audit-logger/src/index.ts',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  resolver: '<rootDir>/jest.resolver.js',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
}
