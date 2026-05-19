/**
 * ECDSA key pair initialization flow for Patient Lite Mobile.
 * Story 25.4: Generates key pair on first login, stores private key
 * in SecureStore, registers public key with Hub API.
 *
 * Offline-tolerant: if Hub is unreachable, queues registration for retry.
 */
import { generateEcdsaKeyPair } from '@ultranos/crypto'
import {
  hasEcdsaKeyPair,
  storeEcdsaPrivateKey,
  storeEcdsaPublicKey,
  getEcdsaPublicKey,
  deleteEcdsaKeyPair,
} from '@ultranos/crypto/mobile'
import * as SecureStore from 'expo-secure-store'
import { hubFetch } from '@/lib/hub-fetch'

const REGISTRATION_STATUS_KEY = 'ultranos_ecdsa_key_registered'
const PENDING_PUBLIC_KEY = 'ultranos_ecdsa_pending_public_key'

const STORE_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
} as const

function getHubApiUrl(): string {
  // EXPO_PUBLIC_ vars are inlined at build time by Metro/Babel.
  // In production, this must be set. In dev/test, falls back to localhost.
  return process.env.EXPO_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
}

export interface KeyInitResult {
  generated: boolean
  registered: boolean
  error?: string
}

// Concurrency guard to prevent parallel key generation
let _initInFlight: Promise<KeyInitResult> | null = null

/**
 * Initialize the ECDSA key pair if it doesn't exist.
 * Call this after first successful biometric unlock.
 *
 * Flow:
 * 1. Check if key pair exists in SecureStore
 * 2. If not: generate, store private key, store public key (with rollback on failure)
 * 3. Try to register public key with Hub API
 * 4. If Hub is unreachable: save pending registration flag
 */
export async function initializeEcdsaKeyPair(
  patientId: string,
  authToken: string,
): Promise<KeyInitResult> {
  // Prevent concurrent calls from generating mismatched key pairs
  if (_initInFlight) {
    return _initInFlight
  }

  _initInFlight = _doInitialize(patientId, authToken)
  try {
    return await _initInFlight
  } finally {
    _initInFlight = null
  }
}

async function _doInitialize(
  patientId: string,
  authToken: string,
): Promise<KeyInitResult> {
  const keyExists = await hasEcdsaKeyPair()

  if (!keyExists) {
    const { publicKey, privateKey } = await generateEcdsaKeyPair()
    try {
      await storeEcdsaPrivateKey(privateKey)
      await storeEcdsaPublicKey(publicKey)
    } catch (err) {
      // Rollback: clean up partial storage to avoid orphaned keys
      await deleteEcdsaKeyPair()
      return {
        generated: false,
        registered: false,
        error: err instanceof Error ? err.message : 'Key storage failed',
      }
    }
  }

  // Check if already registered with Hub
  const registered = await SecureStore.getItemAsync(REGISTRATION_STATUS_KEY)
  if (registered === 'true') {
    return { generated: !keyExists, registered: true }
  }

  // Get public key to register
  const publicKey = await getEcdsaPublicKey()
  if (!publicKey) {
    return { generated: !keyExists, registered: false, error: 'No public key available' }
  }

  // Try to register with Hub API
  const result = await registerPublicKeyWithHub(publicKey, patientId, authToken)

  if (result.success) {
    await SecureStore.setItemAsync(REGISTRATION_STATUS_KEY, 'true')
    await SecureStore.deleteItemAsync(PENDING_PUBLIC_KEY)
    return { generated: !keyExists, registered: true }
  }

  // Offline: queue for retry
  await SecureStore.setItemAsync(PENDING_PUBLIC_KEY, publicKey, STORE_OPTIONS)
  return { generated: !keyExists, registered: false, error: result.error }
}

/**
 * Retry pending public key registration. Call on network reconnect or sync.
 */
export async function retryPendingKeyRegistration(
  patientId: string,
  authToken: string,
): Promise<boolean> {
  const pending = await SecureStore.getItemAsync(PENDING_PUBLIC_KEY)
  if (!pending) return true // Nothing to retry

  const registered = await SecureStore.getItemAsync(REGISTRATION_STATUS_KEY)
  if (registered === 'true') {
    await SecureStore.deleteItemAsync(PENDING_PUBLIC_KEY)
    return true
  }

  const result = await registerPublicKeyWithHub(pending, patientId, authToken)
  if (result.success) {
    await SecureStore.setItemAsync(REGISTRATION_STATUS_KEY, 'true')
    await SecureStore.deleteItemAsync(PENDING_PUBLIC_KEY)
    return true
  }

  return false
}

async function registerPublicKeyWithHub(
  publicKeyP256: string,
  patientId: string,
  authToken: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const baseUrl = getHubApiUrl()
    const url = new URL(baseUrl)
    url.pathname = url.pathname.replace(/\/$/, '') + '/patientKey.register'

    const res = await hubFetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ json: { publicKeyP256, patientId } }),
    })

    if (!res.ok) {
      return { success: false, error: `Hub API error: ${res.status}` }
    }

    const body = await res.json() as { result: { data: { json: { registered: boolean } } } }
    return { success: body.result.data.json.registered }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}
