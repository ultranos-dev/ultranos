import { initializeEcdsaKeyPair, retryPendingKeyRegistration } from '@/lib/ecdsa-key-init'

// Mock @ultranos/crypto
const mockGenerateEcdsaKeyPair = jest.fn()
jest.mock('@ultranos/crypto', () => ({
  generateEcdsaKeyPair: () => mockGenerateEcdsaKeyPair(),
}))

// Mock @ultranos/crypto/mobile
const mockHasEcdsaKeyPair = jest.fn()
const mockStoreEcdsaPrivateKey = jest.fn()
const mockStoreEcdsaPublicKey = jest.fn()
const mockGetEcdsaPublicKey = jest.fn()
const mockDeleteEcdsaKeyPair = jest.fn()
jest.mock('@ultranos/crypto/mobile', () => ({
  hasEcdsaKeyPair: () => mockHasEcdsaKeyPair(),
  storeEcdsaPrivateKey: (k: string) => mockStoreEcdsaPrivateKey(k),
  storeEcdsaPublicKey: (k: string) => mockStoreEcdsaPublicKey(k),
  getEcdsaPublicKey: () => mockGetEcdsaPublicKey(),
  deleteEcdsaKeyPair: () => mockDeleteEcdsaKeyPair(),
}))

// Mock expo-secure-store (used for registration status persistence)
const secureStoreData: Record<string, string> = {}
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((key: string) => Promise.resolve(secureStoreData[key] ?? null)),
  setItemAsync: jest.fn((key: string, value: string) => {
    secureStoreData[key] = value
    return Promise.resolve()
  }),
  deleteItemAsync: jest.fn((key: string) => {
    delete secureStoreData[key]
    return Promise.resolve()
  }),
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 'WHEN_PASSCODE_SET_THIS_DEVICE_ONLY',
}))

// Mock fetch for Hub API calls
const mockFetch = jest.fn()

const PATIENT_ID = '550e8400-e29b-41d4-a716-446655440000'
const AUTH_TOKEN = 'test-jwt-token'
const MOCK_KEY_PAIR = {
  publicKey: 'mock-public-key-base64',
  privateKey: 'mock-private-key-base64',
}

describe('ecdsa-key-init', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = mockFetch
    // Clear secure store data
    Object.keys(secureStoreData).forEach(key => delete secureStoreData[key])

    mockGenerateEcdsaKeyPair.mockResolvedValue(MOCK_KEY_PAIR)
    mockHasEcdsaKeyPair.mockResolvedValue(false)
    mockStoreEcdsaPrivateKey.mockResolvedValue(undefined)
    mockStoreEcdsaPublicKey.mockResolvedValue(undefined)
    mockGetEcdsaPublicKey.mockResolvedValue(MOCK_KEY_PAIR.publicKey)
    mockDeleteEcdsaKeyPair.mockResolvedValue(undefined)
  })


  describe('initializeEcdsaKeyPair', () => {
    it('generates and stores key pair on first run', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: { data: { json: { registered: true } } } }),
      })

      const result = await initializeEcdsaKeyPair(PATIENT_ID, AUTH_TOKEN)

      expect(result.generated).toBe(true)
      expect(result.registered).toBe(true)
      expect(mockGenerateEcdsaKeyPair).toHaveBeenCalled()
      expect(mockStoreEcdsaPrivateKey).toHaveBeenCalledWith(MOCK_KEY_PAIR.privateKey)
      expect(mockStoreEcdsaPublicKey).toHaveBeenCalledWith(MOCK_KEY_PAIR.publicKey)
    })

    it('skips generation when key pair already exists', async () => {
      mockHasEcdsaKeyPair.mockResolvedValue(true)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: { data: { json: { registered: true } } } }),
      })

      const result = await initializeEcdsaKeyPair(PATIENT_ID, AUTH_TOKEN)

      expect(result.generated).toBe(false)
      expect(mockGenerateEcdsaKeyPair).not.toHaveBeenCalled()
    })

    it('skips Hub registration when already registered', async () => {
      secureStoreData['ultranos_ecdsa_key_registered'] = 'true'

      const result = await initializeEcdsaKeyPair(PATIENT_ID, AUTH_TOKEN)

      expect(result.registered).toBe(true)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('registers public key with Hub API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: { data: { json: { registered: true } } } }),
      })

      await initializeEcdsaKeyPair(PATIENT_ID, AUTH_TOKEN)

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, opts] = mockFetch.mock.calls[0]!
      expect(url).toContain('patientKey.register')
      expect(opts.method).toBe('POST')
      expect(opts.headers['Authorization']).toBe(`Bearer ${AUTH_TOKEN}`)
      const body = JSON.parse(opts.body)
      expect(body.json.publicKeyP256).toBe(MOCK_KEY_PAIR.publicKey)
      expect(body.json.patientId).toBe(PATIENT_ID)
    })

    it('queues for retry when Hub is unreachable (offline)', async () => {
      mockFetch.mockRejectedValue(new Error('Network request failed'))

      const result = await initializeEcdsaKeyPair(PATIENT_ID, AUTH_TOKEN)

      expect(result.generated).toBe(true)
      expect(result.registered).toBe(false)
      expect(result.error).toBe('Network request failed')
      // Pending key should be stored for retry
      expect(secureStoreData['ultranos_ecdsa_pending_public_key']).toBe(MOCK_KEY_PAIR.publicKey)
    })

    it('queues for retry when Hub returns error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503 })

      const result = await initializeEcdsaKeyPair(PATIENT_ID, AUTH_TOKEN)

      expect(result.registered).toBe(false)
      expect(result.error).toContain('503')
    })

    it('rolls back on partial key storage failure', async () => {
      mockStoreEcdsaPublicKey.mockRejectedValue(new Error('SecureStore write failed'))

      const result = await initializeEcdsaKeyPair(PATIENT_ID, AUTH_TOKEN)

      expect(result.generated).toBe(false)
      expect(result.registered).toBe(false)
      expect(result.error).toBe('SecureStore write failed')
      expect(mockDeleteEcdsaKeyPair).toHaveBeenCalled()
    })

    it('concurrent calls share the same result (concurrency guard)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: { data: { json: { registered: true } } } }),
      })

      const [r1, r2] = await Promise.all([
        initializeEcdsaKeyPair(PATIENT_ID, AUTH_TOKEN),
        initializeEcdsaKeyPair(PATIENT_ID, AUTH_TOKEN),
      ])

      // Both should succeed with same result, but key pair generated only once
      expect(r1.registered).toBe(true)
      expect(r2.registered).toBe(true)
      expect(mockGenerateEcdsaKeyPair).toHaveBeenCalledTimes(1)
    })
  })

  describe('retryPendingKeyRegistration', () => {
    it('returns true when nothing is pending', async () => {
      const result = await retryPendingKeyRegistration(PATIENT_ID, AUTH_TOKEN)
      expect(result).toBe(true)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('retries and succeeds', async () => {
      secureStoreData['ultranos_ecdsa_pending_public_key'] = MOCK_KEY_PAIR.publicKey

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: { data: { json: { registered: true } } } }),
      })

      const result = await retryPendingKeyRegistration(PATIENT_ID, AUTH_TOKEN)

      expect(result).toBe(true)
      expect(secureStoreData['ultranos_ecdsa_key_registered']).toBe('true')
      // Pending key should be cleared
      expect(secureStoreData['ultranos_ecdsa_pending_public_key']).toBeUndefined()
    })

    it('returns false when retry fails', async () => {
      secureStoreData['ultranos_ecdsa_pending_public_key'] = MOCK_KEY_PAIR.publicKey

      mockFetch.mockRejectedValue(new Error('Still offline'))

      const result = await retryPendingKeyRegistration(PATIENT_ID, AUTH_TOKEN)

      expect(result).toBe(false)
    })

    it('skips if already registered', async () => {
      secureStoreData['ultranos_ecdsa_pending_public_key'] = MOCK_KEY_PAIR.publicKey
      secureStoreData['ultranos_ecdsa_key_registered'] = 'true'

      const result = await retryPendingKeyRegistration(PATIENT_ID, AUTH_TOKEN)

      expect(result).toBe(true)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})
