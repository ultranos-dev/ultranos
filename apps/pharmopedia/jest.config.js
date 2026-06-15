module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    '<rootDir>/../../node_modules/(?!(.pnpm/.+/node_modules/(react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?|react-native-ssl-pinning|@ultranos)/))',
    '<rootDir>/node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|react-native-ssl-pinning|@ultranos)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@ultranos/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
}
