/**
 * Story 61.2 — device PIN provider for the offline cold-start arm of the
 * dual-wrapped DEK.
 *
 * The PIN is the user-knowledge secret that lets a device unlock its at-rest key
 * during a multi-day offline outage with no hub round-trip. It MUST NOT be derived
 * from anything stored on disk (that would defeat the PIN arm) — it is entered by
 * the user during enrollment and held ONLY in memory for the session.
 *
 * Enrollment UX is intentionally decoupled: this module exposes an in-memory
 * provider that a future PIN-entry screen sets via {@link setDevicePin}. Until a
 * PIN is enrolled, {@link getDevicePin} returns null and the key-establishment
 * flow falls back to the hub-secret online arm (or the legacy key). No PIN is ever
 * persisted here.
 */

let inMemoryPin: string | null = null

/** Set the device PIN for this session (called by the PIN-entry UX). Memory only. */
export function setDevicePin(pin: string): void {
  inMemoryPin = pin && pin.length > 0 ? pin : null
}

/** Clear the in-memory PIN (logout / tab close). */
export function clearDevicePin(): void {
  inMemoryPin = null
}

/**
 * Returns the enrolled device PIN if one has been set this session, else null.
 * Returning null makes the key-establishment flow skip the PIN arm and use the
 * hub-secret online arm (or legacy fallback) — never a disk-derived pseudo-PIN.
 */
export function getDevicePin(): string | null {
  return inMemoryPin
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => clearDevicePin())
}
