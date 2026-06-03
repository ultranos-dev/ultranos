# Story 49.3: Bluetooth Peer-to-Peer Sync with OPD-Lite

Status: review

## Story

As a lab technician in a facility with no internet,
I want to sync results directly to the doctor's OPD-Lite device over Bluetooth or local WiFi,
So that results reach the physician across the hallway without needing cloud connectivity.

## Context

In facilities where internet connectivity is completely unavailable, Lab-Lite and OPD-Lite may be running on devices within the same building — but with no way to communicate. Results sit in Lab-Lite's upload queue indefinitely while the physician in the next room has no visibility. This story enables direct device-to-device transfer of released lab results as signed FHIR DiagnosticReport bundles, using Bluetooth Low Energy (BLE) or local WiFi Direct as the transport layer.

This is a zero-cloud-dependency feature. No Hub, no internet, no relay server. Two devices in proximity discover each other, negotiate a secure channel, and transfer data with cryptographic verification on both ends.

**PWA Limitations:** The Web Bluetooth API exists but is limited — it supports BLE central role (scanning/connecting) but NOT peripheral role (advertising) in most browsers. This means a PWA cannot advertise itself as a BLE peripheral for discovery. Two options exist: (1) use Web Bluetooth for one side and require manual pairing, or (2) use a WebRTC-based local network discovery as the primary mechanism with BLE as a secondary option. This story explores both and recommends the pragmatic path.

**Existing infrastructure:**
- Upload queue: `apps/lab-lite/src/lib/upload-queue-worker.ts` — current cloud-only drain
- Offline verification: `apps/lab-lite/src/lib/offline-verify.ts` — Ed25519 signature verification
- HLC timestamps: `apps/lab-lite/src/lib/hlc.ts` — causal ordering
- Audit client: `apps/lab-lite/src/lib/audit-client.ts` — dual audit trail requirement
- Practitioner key cache: `apps/lab-lite/src/lib/db.ts` — `practitioner_keys` table with Ed25519 public keys

**PRD Requirements:** FR49 (Offline Resilience & Communication), NFR2 (High-availability offline mode)
**Dependencies:** Story 42.6 (Write-Once Distribute-Many — defines DiagnosticReport bundle format), Story 7.3b (Mandatory Encryption Wiring — encryption primitives)

## Acceptance Criteria

1. [ ] A device discovery mechanism allows Lab-Lite to find nearby OPD-Lite devices on the same local network or within Bluetooth range, without requiring internet connectivity.
2. [ ] The technician can tap "Send to [Doctor Name]" on a released result, see discovered nearby OPD-Lite devices, and select a recipient.
3. [ ] The result is transmitted as a signed FHIR DiagnosticReport bundle. The signature uses the lab technician's Ed25519 key (from the practitioner key infrastructure in Story 7.4).
4. [ ] The receiving OPD-Lite device verifies the Ed25519 signature against its cached practitioner keys before accepting the result.
5. [ ] The transfer is encrypted in transit using AES-256-GCM with a session key derived from ECDH key exchange during the connection handshake.
6. [ ] The transfer is logged in BOTH apps' audit trails: Lab-Lite logs `P2P_RESULT_SENT` and OPD-Lite logs `P2P_RESULT_RECEIVED`.
7. [ ] No internet or Hub connectivity is required at any point in the discovery, transfer, or verification flow.
8. [ ] Transfer progress is shown to both sender and receiver with a progress indicator and success/failure confirmation.
9. [ ] The system handles transfer failures gracefully: if the connection drops mid-transfer, the partial data is discarded and the user is prompted to retry.
10. [ ] A pairing mechanism prevents unauthorized devices from receiving results: the first connection between two devices requires a visual confirmation code (6-digit, displayed on both screens).
11. [ ] Previously paired devices reconnect without re-pairing (trusted device list persisted in Dexie).
12. [ ] Tests cover: bundle signing and verification, encryption/decryption round-trip, pairing code generation and matching, transfer failure handling, audit event emission on both sides, and PHI guard validation.

## Tasks / Subtasks

- [ ] **Task 1: Transport Layer Abstraction** (AC: 1, 7)
  - [ ] Create `apps/lab-lite/src/lib/p2p/transport.ts`.
  - [ ] Define transport interface:
    ```typescript
    interface P2PTransport {
      startDiscovery(): Promise<DiscoveredDevice[]>
      stopDiscovery(): void
      connect(device: DiscoveredDevice): Promise<P2PConnection>
      advertise(serviceInfo: ServiceInfo): Promise<void>
      onIncomingConnection(handler: (conn: P2PConnection) => void): void
    }
    
    interface P2PConnection {
      deviceId: string
      deviceName: string
      send(data: ArrayBuffer): Promise<void>
      onReceive(handler: (data: ArrayBuffer) => void): void
      close(): void
      onDisconnect(handler: () => void): void
    }
    
    interface DiscoveredDevice {
      id: string
      name: string
      type: 'ble' | 'wifi-direct' | 'local-network'
      signalStrength?: number
    }
    ```
  - [ ] Implement `LocalNetworkTransport` (primary) in `apps/lab-lite/src/lib/p2p/local-network-transport.ts`:
    - Uses `BroadcastChannel` API for same-device testing and development.
    - Uses WebRTC data channels with mDNS/manual IP for local network discovery.
    - Devices on the same WiFi network can discover each other via a lightweight UDP broadcast (via a thin WebSocket relay running on one of the devices — see Dev Notes).
  - [ ] Implement `BleTransport` (secondary) in `apps/lab-lite/src/lib/p2p/ble-transport.ts`:
    - Uses Web Bluetooth API for BLE central role (scanning/connecting).
    - Limited to cases where OPD-Lite runs as a native app or uses a BLE peripheral wrapper.
    - Feature-detect: `navigator.bluetooth?.getAvailability()`.

- [ ] **Task 2: Secure Channel Handshake** (AC: 5, 10, 11)
  - [ ] Create `apps/lab-lite/src/lib/p2p/handshake.ts`.
  - [ ] Implement ECDH key exchange for session key derivation:
    - Both devices generate ephemeral ECDH key pairs (P-256) using Web Crypto API.
    - Exchange public keys over the raw P2P connection.
    - Derive shared secret via `crypto.subtle.deriveBits()`.
    - Derive AES-256-GCM session key from shared secret via HKDF.
  - [ ] First-time pairing verification:
    - Compute a 6-digit visual confirmation code from the shared secret (SHA-256 hash, first 6 decimal digits).
    - Both devices display the code; user confirms they match.
    - On confirmation, save device to trusted list in Dexie.
  - [ ] Trusted device reconnection:
    - Check `trustedDevices` Dexie table for the remote device ID.
    - If trusted, skip visual confirmation (ECDH still happens for forward secrecy).
  - [ ] Add `trustedDevices` table to Dexie schema (version increment):
    ```typescript
    interface TrustedDevice {
      deviceId: string
      deviceName: string
      firstPairedAt: string
      lastConnectedAt: string
      appType: 'opd-lite' | 'lab-lite'
    }
    ```

- [ ] **Task 3: FHIR DiagnosticReport Bundle Signing** (AC: 3, 4)
  - [ ] Create `apps/lab-lite/src/lib/p2p/bundle-signer.ts`.
  - [ ] Export `signDiagnosticReportBundle(report, privateKey)`:
    - Serializes the FHIR DiagnosticReport to canonical JSON (sorted keys, no whitespace).
    - Signs with Ed25519 using the technician's private key (from practitioner key infrastructure).
    - Returns `{ bundle: string; signature: string; signerPractitionerId: string; signedAt: string }`.
  - [ ] Export `verifyDiagnosticReportBundle(signedBundle, publicKey)`:
    - Verifies the Ed25519 signature against the provided public key.
    - Returns `{ valid: boolean; practitionerId: string; signedAt: string }`.
  - [ ] The signing/verification uses the same key infrastructure as Story 7.4 (Practitioner Key Lifecycle Management).
  - [ ] Keys are retrieved from the `practitioner_keys` Dexie table on the receiving side.

- [ ] **Task 4: P2P Transfer Protocol** (AC: 3, 8, 9)
  - [ ] Create `apps/lab-lite/src/lib/p2p/transfer-protocol.ts`.
  - [ ] Define the transfer message protocol:
    ```typescript
    type P2PMessage =
      | { type: 'HANDSHAKE_INIT'; publicKey: string; deviceInfo: DeviceInfo }
      | { type: 'HANDSHAKE_ACK'; publicKey: string; deviceInfo: DeviceInfo }
      | { type: 'PAIRING_CONFIRM'; confirmed: boolean }
      | { type: 'TRANSFER_OFFER'; reportId: string; sizeBytes: number; patientIdShort: string }
      | { type: 'TRANSFER_ACCEPT' }
      | { type: 'TRANSFER_REJECT'; reason: string }
      | { type: 'TRANSFER_CHUNK'; chunkIndex: number; totalChunks: number; data: string }
      | { type: 'TRANSFER_COMPLETE'; signature: string; signerPractitionerId: string }
      | { type: 'TRANSFER_VERIFY_OK' }
      | { type: 'TRANSFER_VERIFY_FAIL'; reason: string }
    ```
  - [ ] Chunked transfer: split the encrypted bundle into 16KB chunks for BLE compatibility (BLE MTU is typically 20-512 bytes; chunks are reassembled on the receiver).
  - [ ] Progress tracking: emit progress events as chunks are sent/received.
  - [ ] Failure handling: if connection drops mid-transfer, discard partial data, notify user, and allow retry.

- [ ] **Task 5: Sender UI (Lab-Lite)** (AC: 2, 8)
  - [ ] Create `apps/lab-lite/src/components/p2p/P2PSendDialog.tsx`.
  - [ ] Trigger: "Send to Doctor" button on released result detail view.
  - [ ] Flow:
    1. Dialog opens, starts device discovery. Shows spinner: "Searching for nearby devices..."
    2. Discovered devices appear as a list with device name, type (BLE/WiFi), and signal indicator.
    3. Tech selects a device. If first-time pairing, both screens show the 6-digit code.
    4. Transfer begins. Progress bar shows chunk progress.
    5. On success: green checkmark, "Result sent to Dr. [Name]".
    6. On failure: red X with retry button.
  - [ ] RTL support via logical CSS properties.
  - [ ] i18n: add keys to all locale files (en, ar, prs, ps).

- [ ] **Task 6: Receiver Handler (OPD-Lite Side)** (AC: 4, 6)
  - [ ] Document the OPD-Lite receiver interface that must be implemented in the OPD-Lite app:
    - OPD-Lite needs a `P2PReceiveService` that listens for incoming connections.
    - On incoming transfer offer: display a notification "Lab result incoming from [Lab Name]".
    - Verify the Ed25519 signature against cached practitioner keys.
    - On successful verification: import the DiagnosticReport into the patient's encounter.
    - Emit `P2P_RESULT_RECEIVED` audit event.
  - [ ] Create `packages/shared-types/src/p2p/` with shared type definitions used by both apps.
  - [ ] The Lab-Lite side of this story focuses on the SENDER implementation. The OPD-Lite receiver is a separate implementation task but the protocol and types are defined here.

- [ ] **Task 7: Dual Audit Trail** (AC: 6)
  - [ ] Add `reportP2PAuditEvent()` to `audit-client.ts`:
    ```typescript
    interface P2PAuditPayload {
      action: 'P2P_DISCOVERY_STARTED' | 'P2P_DEVICE_PAIRED' | 'P2P_RESULT_SENT' | 'P2P_TRANSFER_FAILED'
      remoteDeviceId: string
      diagnosticReportRef?: string
      transferMethod: 'ble' | 'wifi-direct' | 'local-network'
      transferSizeBytes?: number
      durationMs?: number
      // NEVER include patient data in audit metadata
    }
    ```
  - [ ] Emit on: discovery start, pairing confirmation, successful send, failed send.
  - [ ] The OPD-Lite side emits its own audit events (`P2P_RESULT_RECEIVED`, `P2P_VERIFY_SUCCESS`, `P2P_VERIFY_FAILED`).

- [ ] **Task 8: Tests** (AC: 12)
  - [ ] Create `apps/lab-lite/src/__tests__/p2p-sync.test.ts`:
    - Test: bundle signing produces valid Ed25519 signature.
    - Test: bundle verification succeeds with correct key, fails with wrong key.
    - Test: ECDH key exchange produces identical shared secrets on both sides.
    - Test: AES-256-GCM encryption/decryption round-trip preserves data integrity.
    - Test: pairing code is deterministic from shared secret (same input = same code).
    - Test: chunked transfer reassembly produces identical bundle.
    - Test: partial transfer (simulated disconnect) is discarded, not imported.
    - Test: audit events emitted for P2P_RESULT_SENT.
    - Test: trusted device list persists in Dexie and skips re-pairing.
    - Test: PHI guard — no patient name, DOB, or demographics in audit metadata.

### Review Findings

_Code review — 2026-06-03. Layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor. 7 dismissed._

#### Patch

- [x] [Review][Patch] **`trusted_devices` table missing from Dexie schema** — Added v28 schema with `trusted_devices` table. [db.ts]
- [x] [Review][Patch] **`reportP2PAuditEvent` function not implemented** — Added to `audit-client.ts` with P2P_SYNC action enum. [audit-client.ts]
- [x] [Review][Patch] **shared-types barrel export missing P2P re-export** — Added `export * from './p2p/types.js'` to index.ts. [shared-types/src/index.ts]
- [x] [Review][Patch] **i18n keys for `p2p` namespace missing from all locale files** — Added 22 keys to en, ar, prs, ps. [messages/*.json]
- [x] [Review][Patch] **`onReceive` handlers accumulate across protocol phases** — Replaced array with single-handler replacement pattern. [local-network-transport.ts]
- [x] [Review][Patch] **Session key stored on `window` globals** — Replaced with React refs (`pairingSessionKeyRef`, `pairingCallbackRef`). [P2PSendDialog.tsx]
- [x] [Review][Patch] **No timeout on protocol message waits** — Added 30s timeouts to handshake, accept, and verify waits. [P2PSendDialog.tsx]
- [x] [Review][Patch] **`selectTransport()` prefers BLE over local-network** — Swapped: local-network checked first. [transport.ts]
- [x] [Review][Patch] **Race condition in BroadcastChannel connect** — Added `__p2p_ready` readiness handshake with 5s timeout. [local-network-transport.ts]
- [x] [Review][Patch] **`unpackIvAndCiphertext` returns IV as view, not copy** — Changed to `packed.slice(0, 12)`. [transfer-protocol.ts]
- [x] [Review][Patch] **`canonicalJson` includes keys with `undefined` values** — Added `.filter()` to exclude undefined-valued keys. [bundle-signer.ts]
- [x] [Review][Patch] **`btoa(String.fromCharCode(...spread))` may crash on larger buffers** — Replaced with loop-based `uint8ToBase64` helper. [transfer-protocol.ts, handshake.ts, bundle-signer.ts]
- [x] [Review][Patch] **`signDiagnosticReportBundle` no validation for non-32-byte keys** — Added length validation (32 or 64 bytes). [bundle-signer.ts]
- [x] [Review][Patch] **Encrypt full `SignedBundle` instead of only bundle string** — Now encrypts `JSON.stringify(signedBundle)`. TRANSFER_COMPLETE sends `[encrypted]` placeholders. [P2PSendDialog.tsx]
- [x] [Review][Patch] **`verifyBundleWithCachedKeys` should look up by claimed ID first** — Fast path by `signerPractitionerId`, exhaustive fallback. [bundle-signer.ts]

#### Deferred

- [x] [Review][Defer] **Trusted device reconnect skips identity verification** — Accepted risk for local-network clinic scenario. Future story can add device identity binding. [P2PSendDialog.tsx, handshake.ts]
- [x] [Review][Defer] **BLE `connect()` re-prompts user via `requestDevice()`** — BLE is secondary transport, deferred per spec. [ble-transport.ts:116-128]
- [x] [Review][Defer] **`stopDiscovery` method reassignment** — Stale closure after timeout. Low impact, same-device only. [local-network-transport.ts:120-127]
- [x] [Review][Defer] **`P2PSendDialog` hardcodes `LocalNetworkTransport`** — Expected per spec (BLE deferred). [P2PSendDialog.tsx:113]

## Dev Notes

### PWA Bluetooth Limitations — Pragmatic Path

The Web Bluetooth API supports the BLE **central** role (scanning for and connecting to peripherals) but does NOT support the **peripheral** role (advertising as a discoverable service). This means:

- **Lab-Lite (PWA)** can scan for BLE devices but cannot advertise itself.
- **OPD-Lite (PWA)** has the same limitation.
- Two PWAs cannot discover each other via BLE alone.

**Recommendation: Local WiFi as primary, BLE as secondary.**

The pragmatic path is:
1. **Primary: Local network WebRTC data channel.** Both devices on the same WiFi network. Discovery via a lightweight signaling mechanism (manual IP entry, QR code with connection info, or mDNS if available).
2. **Secondary: BLE with manual pairing.** If one device can run a BLE peripheral (native app wrapper or Android "Nearby" API via a thin native bridge), BLE works. Otherwise, BLE is deferred.
3. **Future: Native wrapper.** If P2P sync becomes a high-usage feature, a thin Capacitor/Tauri wrapper can expose full BLE peripheral capabilities and WiFi Direct.

For the initial implementation, the local network approach is the most reliable. The transport abstraction layer ensures BLE can be added later without changing the protocol or UI.

### QR-Based Connection Bootstrap

Since mDNS is unreliable on many networks, the recommended discovery mechanism is QR-based:
1. The sender (Lab-Lite) generates a QR code containing: `{ ip: "192.168.1.x", port: 9999, sessionId: "abc123", publicKey: "..." }`.
2. The receiver (OPD-Lite) scans the QR code and connects directly.
3. This sidesteps all network discovery issues and works on any local network, including mobile hotspots.

### Encryption in Transit

Even though the transfer is local (same building), encryption is mandatory per CLAUDE.md. The ECDH + AES-256-GCM approach provides:
- **Forward secrecy**: ephemeral keys per session.
- **Confidentiality**: data encrypted in transit.
- **Integrity**: GCM authentication tag prevents tampering.

### Bundle Size Estimation

A typical FHIR DiagnosticReport bundle (JSON) for a lab result is 2-10KB. With attached PDF reports (scanned results), this could grow to 500KB-2MB. The chunked transfer protocol handles both cases. For BLE (20-512 byte MTU), a 10KB bundle would require 20-500 chunks — transfer time ~5-30 seconds depending on connection quality.

### Shared Types Package

The P2P message types, signed bundle interface, and device info types should live in `packages/shared-types/src/p2p/` so that both Lab-Lite and OPD-Lite can import them. This ensures protocol compatibility between the two apps.

### References

- Offline signature verification: `apps/lab-lite/src/lib/offline-verify.ts`
- Practitioner key cache: `apps/lab-lite/src/lib/db.ts` (practitioner_keys table)
- Story 7.4: Practitioner Key Lifecycle Management (Ed25519 key infrastructure)
- Story 42.6: Write-Once Distribute-Many (DiagnosticReport bundle format)
- Story 7.3b: Mandatory Encryption Wiring (Web Crypto API primitives)
- Audit client: `apps/lab-lite/src/lib/audit-client.ts`
- Web Bluetooth API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API
- WebRTC Data Channels: https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel
