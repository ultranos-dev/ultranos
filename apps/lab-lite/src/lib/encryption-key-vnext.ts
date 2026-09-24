/**
 * Story 61.2 — Encryption key-derivation hardening (vNext, dual-wrapped DEK) for
 * lab-lite.
 *
 * Lab-lite does NOT persist PHI in a local encrypted Dexie store, so there is no
 * field-data migration and no version map — the DEK is simply installed as the
 * session key. The hardening (AC #1) still applies: the at-rest/session key is a
 * random DEK wrapped under a hub-issued memory-only server secret (online arm) and
 * a device PIN (offline cold-start arm), instead of the legacy PBKDF2(sub, salt).
 */

import {
  deriveSessionKey,
  dualWrapDek,
  unwrapDekWithServerSecret,
  unwrapDekWithPin,
  type WrappedDekBundle,
} from '@ultranos/crypto'
import { encryptionKeyStore, getOrCreateDeviceSalt } from './encryption-key-store'
import { fetchKeyWrappingSecret } from './trpc'

const BUNDLE_KEY = 'ultranos:dek-bundle:v2'
export const VNEXT_WRITE_VERSION = 'v2'

export function readStoredBundle(): WrappedDekBundle | null {
  try {
    const raw = localStorage.getItem(BUNDLE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WrappedDekBundle
    if (parsed?.scheme !== 'k2' || !parsed.serverWrapped || !parsed.pinWrapped || !parsed.salt) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function persistBundle(bundle: WrappedDekBundle): void {
  try {
    localStorage.setItem(BUNDLE_KEY, JSON.stringify(bundle))
  } catch {
    console.error('[crypto] DEK bundle could not be persisted — key will not survive refresh.')
  }
}

/** True once a dual-wrapped DEK bundle exists on this device. */
export function hasDekBundle(): boolean {
  return readStoredBundle() !== null
}

/**
 * Zero-regression establishment entry point used by AuthGuard/login.
 * Tries: vNext online (hub secret) → vNext offline (PIN) → legacy fallback.
 * Never falls back to plaintext. Returns which path was taken.
 */
export async function establishSessionKey(params: {
  sub: string
  getPin?: () => Promise<string | null> | string | null
}): Promise<'vnext-online' | 'vnext-offline' | 'legacy'> {
  const { sub, getPin } = params

  // 1. vNext online.
  try {
    const existing = readStoredBundle()
    if (existing) {
      const serverSecret = await fetchKeyWrappingSecret()
      if (serverSecret) {
        const dek = await unwrapDekWithServerSecret(existing, serverSecret, sub)
        encryptionKeyStore.installWriteKey(VNEXT_WRITE_VERSION, dek)
        return 'vnext-online'
      }
    } else {
      const pin = getPin ? await getPin() : null
      if (pin) {
        const serverSecret = await fetchKeyWrappingSecret()
        if (serverSecret) {
          const { bundle } = await dualWrapDek({
            serverSecret,
            sub,
            pin,
            salt: getOrCreateDeviceSalt(),
          })
          persistBundle(bundle)
          const dek = await unwrapDekWithServerSecret(bundle, serverSecret, sub)
          encryptionKeyStore.installWriteKey(VNEXT_WRITE_VERSION, dek)
          return 'vnext-online'
        }
      }
    }
  } catch {
    /* fall through */
  }

  // 2. vNext offline (PIN).
  try {
    const bundle = readStoredBundle()
    const pin = getPin ? await getPin() : null
    if (bundle && pin) {
      const dek = await unwrapDekWithPin(bundle, pin)
      encryptionKeyStore.installWriteKey(VNEXT_WRITE_VERSION, dek)
      return 'vnext-offline'
    }
  } catch {
    /* fall through */
  }

  // 3. Legacy fallback (backward compatibility; upgrades on next online login).
  const legacyKey = await deriveSessionKey(sub, getOrCreateDeviceSalt())
  encryptionKeyStore.setKey(legacyKey)
  return 'legacy'
}

/** Offline cold-start unlock with the device PIN (no hub round-trip). */
export async function unlockOfflineWithPin(params: { sub: string; pin: string }): Promise<void> {
  const bundle = readStoredBundle()
  if (!bundle) {
    throw new Error('No wrapped key on this device — online login required first')
  }
  const dek = await unwrapDekWithPin(bundle, params.pin)
  encryptionKeyStore.installWriteKey(VNEXT_WRITE_VERSION, dek)
}
