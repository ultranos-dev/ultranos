/**
 * Story 61.2 — Encryption key-derivation hardening (vNext, dual-wrapped DEK).
 *
 * Establishes the spoke's at-rest encryption key using the hardened scheme:
 * a random Data Encryption Key (DEK) wrapped under BOTH a hub-issued, memory-only
 * server secret AND a device PIN (Decision #6b, dual-wrap). This replaces the
 * legacy PBKDF2(sub, deviceSalt) derivation whose inputs were both recoverable
 * from disk (P-CRYPTO-2 / H-OPD-2).
 *
 * Interaction with the existing key store / rotation machinery (Story 28.5):
 *   - The DEK is registered as the CURRENT WRITE version 'v2'; new writes use v2.
 *   - The LEGACY deriveSessionKey(sub, salt) key is registered as decrypt-only 'v1'
 *     so pre-existing local data still reads until the migration re-encrypts it.
 *   - Migration (encryption-migration-vnext) re-encrypts v1 → v2 records.
 *
 * The dual-wrapped DEK bundle is persisted in localStorage. It is NOT PHI and is
 * inert to a disk-only attacker: neither wrapping key's material lives on disk
 * (server secret = memory-only; PIN = user knowledge). The device salt alone is
 * no longer sufficient to derive the key.
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

/** Payload version the vNext DEK writes under (legacy data stays 'v1'). */
export const VNEXT_WRITE_VERSION = 'v2'
/** Payload version legacy (pre-61.2) data was written under. */
export const LEGACY_WRITE_VERSION = 'v1'

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
    // localStorage unavailable — the DEK will not survive a refresh; the next
    // online login will re-establish it. Never fall back to plaintext.
    console.error('[crypto] DEK bundle could not be persisted — key will not survive refresh.')
  }
}

/** True once a dual-wrapped DEK bundle exists on this device. */
export function hasDekBundle(): boolean {
  return readStoredBundle() !== null
}

/**
 * Register the legacy PBKDF2(sub, salt) key in the key map as decrypt-only 'v1'
 * so any pre-61.2 encrypted local data remains readable during/after migration.
 * The DEK working key must already be set (rotateKey requires a current key).
 */
async function registerLegacyDecryptKey(sub: string): Promise<void> {
  try {
    const legacyKey = await deriveSessionKey(sub, getOrCreateDeviceSalt())
    encryptionKeyStore.addDecryptKey(LEGACY_WRITE_VERSION, legacyKey)
  } catch {
    // SubtleCrypto unavailable or salt error — legacy reads will surface as
    // decrypt failures handled by the Dexie proxy (clearPhiTables), never plaintext.
    console.error('[crypto] Legacy decrypt-key registration failed.')
  }
}

/**
 * Establish the vNext at-rest key after authentication (ONLINE path).
 *
 * Fetches the hub-issued wrapping secret (held in memory only), then either:
 *   - opens the existing dual-wrapped DEK bundle via the server-secret arm, or
 *   - on first run, mints a random DEK, dual-wraps it (server + PIN), persists it.
 *
 * On success the DEK is installed as the current write key ('v2') and the legacy
 * key is registered decrypt-only ('v1'). Returns true if a NEW bundle was created
 * (caller should prompt to confirm/refresh the device PIN and run migration).
 *
 * @param sub        Supabase auth user id (JWT sub).
 * @param getPin     Returns the device PIN to (re)wrap the PIN arm with. Only used
 *                   when a NEW bundle is minted. Provide a deterministic device PIN
 *                   or a user-entered one per your enrollment UX.
 */
export async function establishKeyOnline(params: {
  sub: string
  getPin: () => Promise<string> | string
}): Promise<{ created: boolean }> {
  const { sub, getPin } = params

  // The hub-issued per-user secret — memory only, never persisted.
  const serverSecret = await fetchKeyWrappingSecret()
  if (!serverSecret) {
    throw new Error('Key-wrapping secret unavailable')
  }

  const existing = readStoredBundle()
  if (existing) {
    // Re-open with the server-secret arm (normal online unlock).
    const dek = await unwrapDekWithServerSecret(existing, serverSecret, sub)
    encryptionKeyStore.installWriteKey(VNEXT_WRITE_VERSION, dek)
    await registerLegacyDecryptKey(sub)
    return { created: false }
  }

  // First run on this device (or bundle lost): mint + dual-wrap a fresh DEK.
  const pin = await getPin()
  const { bundle, dek: extractableDek } = await dualWrapDek({
    serverSecret,
    sub,
    pin,
    salt: getOrCreateDeviceSalt(),
  })
  persistBundle(bundle)
  // Re-open non-extractable for use (never hand the extractable DEK to the app).
  const dek = await unwrapDekWithServerSecret(bundle, serverSecret, sub)
  void extractableDek // discard the extractable handle
  encryptionKeyStore.installWriteKey(VNEXT_WRITE_VERSION, dek)
  await registerLegacyDecryptKey(sub)
  return { created: true }
}

/**
 * Zero-regression establishment entry point used by AuthGuard/login.
 *
 * Order of attempts (first that succeeds wins):
 *   1. vNext ONLINE — fetch hub secret, open/mint the dual-wrapped DEK (the
 *      hardened path; AC #1). Requires the hub to be reachable.
 *   2. vNext OFFLINE — if a bundle exists and a PIN is available, unwrap with the
 *      PIN arm (cold-start; multi-day-offline operation).
 *   3. LEGACY fallback — if neither vNext path can run yet (e.g. offline on a
 *      device that never enrolled, or the hub secret endpoint is unavailable),
 *      fall back to the pre-61.2 deterministic key so existing local data still
 *      unlocks. This preserves current behaviour during rollout; the device
 *      upgrades to vNext on its next successful online login.
 *
 * Never falls back to plaintext. Returns which path was taken (for telemetry/tests).
 */
export async function establishSessionKey(params: {
  sub: string
  /** Provides the device PIN when minting a new bundle or unlocking offline. */
  getPin?: () => Promise<string | null> | string | null
}): Promise<'vnext-online' | 'vnext-offline' | 'legacy'> {
  const { sub, getPin } = params

  // 1. vNext online (hardened). Only mint a new bundle if a PIN is available.
  try {
    const existing = readStoredBundle()
    if (existing) {
      const serverSecret = await fetchKeyWrappingSecret()
      if (serverSecret) {
        const dek = await unwrapDekWithServerSecret(existing, serverSecret, sub)
        encryptionKeyStore.installWriteKey(VNEXT_WRITE_VERSION, dek)
        await registerLegacyDecryptKey(sub)
        return 'vnext-online'
      }
      // Hub unreachable but a bundle exists → try the offline PIN arm below.
    } else {
      // No bundle yet — mint one if we can reach the hub AND have a PIN.
      const pin = getPin ? await getPin() : null
      if (pin) {
        const serverSecret = await fetchKeyWrappingSecret()
        if (serverSecret) {
          await establishKeyOnline({ sub, getPin: () => pin })
          return 'vnext-online'
        }
      }
    }
  } catch {
    // Fall through to offline / legacy.
  }

  // 2. vNext offline (PIN cold-start) — only if a bundle exists and a PIN is given.
  try {
    const bundle = readStoredBundle()
    const pin = getPin ? await getPin() : null
    if (bundle && pin) {
      await unlockOfflineWithPin({ sub, pin })
      return 'vnext-offline'
    }
  } catch {
    // Wrong PIN or unwrap failure — fall through to legacy.
  }

  // 3. Legacy fallback (backward compatibility; upgrades on next online login).
  const legacyKey = await deriveSessionKey(sub, getOrCreateDeviceSalt())
  encryptionKeyStore.setKey(legacyKey)
  return 'legacy'
}

/**
 * Offline cold-start unlock (multi-day outage, no hub reachable).
 * Unwraps the persisted DEK with the device PIN arm — no hub round-trip.
 * Throws if no bundle exists (device never completed an online enrollment) or the
 * PIN is wrong. Installs the DEK as the current write key and registers the legacy
 * decrypt key. Reuses the existing 'awaiting-key' gate: callers show the PIN prompt
 * while the store reports not-ready.
 */
export async function unlockOfflineWithPin(params: {
  sub: string
  pin: string
}): Promise<void> {
  const bundle = readStoredBundle()
  if (!bundle) {
    throw new Error('No wrapped key on this device — online login required first')
  }
  const dek = await unwrapDekWithPin(bundle, params.pin)
  encryptionKeyStore.installWriteKey(VNEXT_WRITE_VERSION, dek)
  await registerLegacyDecryptKey(params.sub)
}
