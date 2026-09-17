// Jest setup for patient-lite-mobile tests
// Mock expo-secure-store for testing
jest.mock('expo-secure-store', () => ({
  // Async APIs must return promises — the store calls .catch()/await on these.
  // A bare jest.fn() returns undefined, which crashes the worker on `.catch`.
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 'WHEN_PASSCODE_SET_THIS_DEVICE_ONLY',
}))

// Mock expo-crypto
jest.mock('expo-crypto', () => ({
  digestStringAsync: jest.fn(),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  getRandomBytesAsync: jest.fn().mockResolvedValue(new Uint8Array(32).fill(0xab)),
}))

// Mock expo-local-authentication
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn().mockResolvedValue(true),
  isEnrolledAsync: jest.fn().mockResolvedValue(true),
  authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
  getEnrolledLevelAsync: jest.fn().mockResolvedValue(2),
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC: 2 },
}))

// Mock expo-file-system
jest.mock('expo-file-system', () => ({
  documentDirectory: '/mock/documents/',
  cacheDirectory: '/mock/cache/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  copyAsync: jest.fn().mockResolvedValue(undefined),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: { UTF8: 'utf8' },
}))

// Mock expo-sharing
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}))

// Mock expo-clipboard
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(true),
  getStringAsync: jest.fn().mockResolvedValue(''),
}))

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
}))

// Mock expo-sqlite
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn().mockResolvedValue({
    execAsync: jest.fn().mockResolvedValue(undefined),
    closeAsync: jest.fn().mockResolvedValue(undefined),
    getFirstAsync: jest.fn(),
    runAsync: jest.fn(),
    getAllAsync: jest.fn().mockResolvedValue([]),
  }),
}))

// Note: @/lib/supabase is mocked via moduleNameMapper -> __mocks__/supabase.js
// (which exports both `supabase` and `clearAuthTokens`). No inline mock here —
// an inline jest.mock() factory would override the manual mock and drop exports.

// Default the device-security store to a "checked, not compromised" state so that
// write-path tests (non-GET hubFetch) aren't blocked by the integrity guard, which
// throws while `checked` is still false. Device-security-specific tests override
// this in their own beforeEach (they call useDeviceSecurityStore.setState directly).
const { useDeviceSecurityStore } = require('@/stores/device-security-store')
useDeviceSecurityStore.setState({
  checked: true,
  isCompromised: false,
  reasons: [],
  checkedAt: '2026-01-01T00:00:00.000Z',
})
