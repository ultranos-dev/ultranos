/**
 * Shared P2P types for Lab-Lite ↔ OPD-Lite direct device transfer.
 * Story 49.3: Bluetooth Peer-to-Peer Sync with OPD-Lite.
 *
 * PHI rule (CLAUDE.md Rule #1): No patient name, DOB, or demographics in any
 * P2P message header or audit field. patientIdShort is an opaque truncated ID
 * used only for human-readable confirmation — never a full identifier.
 */

// ---------------------------------------------------------------------------
// Device identity
// ---------------------------------------------------------------------------

export interface DeviceInfo {
  deviceId: string
  deviceName: string
  appType: 'lab-lite' | 'opd-lite'
  version: string
}

// ---------------------------------------------------------------------------
// Signed FHIR DiagnosticReport bundle
// ---------------------------------------------------------------------------

export interface SignedBundle {
  /** Canonical JSON of the FHIR DiagnosticReport */
  bundle: string
  /** Base64-encoded Ed25519 signature over the canonical bundle */
  signature: string
  /** Opaque practitioner ID of the signing technician */
  signerPractitionerId: string
  /** ISO 8601 timestamp of when the bundle was signed */
  signedAt: string
}

// ---------------------------------------------------------------------------
// P2P wire protocol message types
// ---------------------------------------------------------------------------

export type P2PMessage =
  | { type: 'HANDSHAKE_INIT'; publicKey: string; deviceInfo: DeviceInfo }
  | { type: 'HANDSHAKE_ACK'; publicKey: string; deviceInfo: DeviceInfo }
  | { type: 'PAIRING_CONFIRM'; confirmed: boolean }
  | {
      type: 'TRANSFER_OFFER'
      /** Opaque DiagnosticReport UUID */
      reportId: string
      sizeBytes: number
      /**
       * Truncated patient identifier for display only — no demographics.
       * e.g. last 4 chars of patient UUID: "…a3f2"
       * NEVER the full ID, name, or DOB.
       */
      patientIdShort: string
    }
  | { type: 'TRANSFER_ACCEPT' }
  | { type: 'TRANSFER_REJECT'; reason: string }
  | { type: 'TRANSFER_CHUNK'; chunkIndex: number; totalChunks: number; data: string }
  | { type: 'TRANSFER_COMPLETE'; signature: string; signerPractitionerId: string }
  | { type: 'TRANSFER_VERIFY_OK' }
  | { type: 'TRANSFER_VERIFY_FAIL'; reason: string }

// ---------------------------------------------------------------------------
// Transfer result summary (used in audit events — no PHI)
// ---------------------------------------------------------------------------

export interface P2PTransferResult {
  success: boolean
  /** Opaque DiagnosticReport UUID */
  reportId: string
  durationMs: number
  transferSizeBytes: number
  error?: string
}

// ---------------------------------------------------------------------------
// Trusted device record (persisted in Dexie)
// ---------------------------------------------------------------------------

export interface TrustedDevice {
  /** Opaque device identifier (UUID generated on first pairing) */
  deviceId: string
  /** Human-readable display name of the remote device */
  deviceName: string
  /** ISO 8601 — when this device was first paired */
  firstPairedAt: string
  /** ISO 8601 — most recent successful connection */
  lastConnectedAt: string
  appType: 'opd-lite' | 'lab-lite'
}
