'use client'

/**
 * Story 49.3: P2P Send Dialog — Sender UI (Lab-Lite)
 *
 * Renders the full flow for sending a released DiagnosticReport to a nearby OPD-Lite device:
 *   1. Discovery — spinner + device list
 *   2. Pairing  — 6-digit visual confirmation code (first-time only)
 *   3. Transfer — progress bar, chunk count
 *   4. Success / Failure — confirmation or retry
 *
 * RTL: uses logical CSS properties (margin-inline-start, padding-inline-end).
 * i18n: all strings via next-intl useTranslations('p2p').
 *
 * AC #2, #8 from Story 49.3.
 * PHI: report content is never displayed — only the opaque reportId is passed through.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CheckCircle, Loader2, WifiOff, X } from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { ChevronRight } from '@ultranos/ui-kit/icons'
import { LocalNetworkTransport } from '@/lib/p2p/local-network-transport'
import {
  generateEcdhKeyPair,
  exportEcdhPublicKey,
  importEcdhPublicKey,
  deriveSharedSecret,
  deriveSessionKey,
  computePairingCode,
  saveTrustedDevice,
  isTrustedDevice,
  touchTrustedDevice,
} from '@/lib/p2p/handshake'
import { signDiagnosticReportBundle } from '@/lib/p2p/bundle-signer'
import {
  encryptBundle,
  packIvAndCiphertext,
  chunkArrayBuffer,
  sendChunks,
  encodeMessage,
  decodeMessage,
} from '@/lib/p2p/transfer-protocol'
import { reportP2PAuditEvent } from '@/lib/audit-client'
import type { DiscoveredDevice, P2PConnection } from '@/lib/p2p/transport'
import type { P2PMessage, DeviceInfo } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DialogPhase =
  | 'discovering'
  | 'device-select'
  | 'pairing'
  | 'transferring'
  | 'success'
  | 'failure'

interface P2PSendDialogProps {
  /** Opaque DiagnosticReport UUID (no PHI) */
  reportId: string
  /** Serialized FHIR DiagnosticReport for signing */
  reportPayload: unknown
  /** Truncated patient identifier for display only — never full ID or name */
  patientIdShort: string
  /** Technician's Ed25519 private key seed (32 bytes) */
  privateKey: Uint8Array
  /** Practitioner ID of the signing technician */
  practitionerId: string
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function P2PSendDialog({
  reportId,
  reportPayload,
  patientIdShort,
  privateKey,
  practitionerId,
  onClose,
}: P2PSendDialogProps) {
  const t = useTranslations('p2p')
  const session = useAuthSessionStore((s) => s.session)

  const [phase, setPhase] = useState<DialogPhase>('discovering')
  const [devices, setDevices] = useState<DiscoveredDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState<DiscoveredDevice | null>(null)
  const [pairingCode, setPairingCode] = useState<string>('')
  const [progress, setProgress] = useState({ sent: 0, total: 0 })
  const [errorMsg, setErrorMsg] = useState<string>('')

  const transportRef = useRef<LocalNetworkTransport | null>(null)
  const connRef = useRef<P2PConnection | null>(null)
  const startTimeRef = useRef<number>(0)
  const pairingSessionKeyRef = useRef<CryptoKey | null>(null)
  const pairingCallbackRef = useRef<((key: CryptoKey) => void) | null>(null)

  // ---------------------------------------------------------------------------
  // Discovery
  // ---------------------------------------------------------------------------

  const startDiscovery = useCallback(async () => {
    setPhase('discovering')
    setDevices([])
    const transport = new LocalNetworkTransport()
    transportRef.current = transport

    reportP2PAuditEvent({
      action: 'P2P_DISCOVERY_STARTED',
      remoteDeviceId: 'broadcast',
      transferMethod: 'local-network',
    })

    const found = await transport.startDiscovery()
    setDevices(found)
    setPhase('device-select')
  }, [])

  useEffect(() => {
    void startDiscovery()
    return () => {
      connRef.current?.close()
    }
  }, [startDiscovery])

  // ---------------------------------------------------------------------------
  // Connect & handshake
  // ---------------------------------------------------------------------------

  const handleDeviceSelect = useCallback(
    async (device: DiscoveredDevice) => {
      setSelectedDevice(device)
      startTimeRef.current = Date.now()

      const transport = transportRef.current
      if (!transport) return

      try {
        const conn = await transport.connect(device)
        connRef.current = conn

        // ECDH handshake
        const myKeyPair = await generateEcdhKeyPair()
        const myPublicKeyB64 = await exportEcdhPublicKey(myKeyPair)
        const deviceInfo: DeviceInfo = {
          deviceId: session?.userId ?? crypto.randomUUID(),
          deviceName: 'Lab-Lite',
          appType: 'lab-lite',
          version: '1.0',
        }

        // Send HANDSHAKE_INIT
        const initMsg: P2PMessage = {
          type: 'HANDSHAKE_INIT',
          publicKey: myPublicKeyB64,
          deviceInfo,
        }
        await conn.send(encodeMessage(initMsg))

        // Wait for HANDSHAKE_ACK (30s timeout)
        const ackData = await Promise.race([
          new Promise<ArrayBuffer>((resolve) => {
            conn.onReceive((data) => resolve(data))
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Handshake timeout')), 30_000),
          ),
        ])
        const ackMsg = decodeMessage(ackData) as Extract<P2PMessage, { type: 'HANDSHAKE_ACK' }>
        if (ackMsg.type !== 'HANDSHAKE_ACK') throw new Error('Expected HANDSHAKE_ACK')

        const remotePublicKey = await importEcdhPublicKey(ackMsg.publicKey)
        const sharedSecret = await deriveSharedSecret(myKeyPair.privateKey, remotePublicKey)
        const sessionKey = await deriveSessionKey(sharedSecret)
        const code = await computePairingCode(sharedSecret)

        const trusted = await isTrustedDevice(device.id)
        if (trusted) {
          await touchTrustedDevice(device.id)
          // Trusted — skip visual confirmation, proceed directly to transfer
          await doTransfer(conn, sessionKey, reportId, reportPayload, patientIdShort, practitionerId, privateKey, device)
        } else {
          setPairingCode(code)
          setPhase('pairing')

          // Store session key and callback in refs (not window globals)
          pairingSessionKeyRef.current = sessionKey
          pairingCallbackRef.current = (key: CryptoKey) => {
            void (async () => {
              await saveTrustedDevice({
                deviceId: device.id,
                deviceName: device.name,
                firstPairedAt: new Date().toISOString(),
                lastConnectedAt: new Date().toISOString(),
                appType: 'opd-lite',
              })
              reportP2PAuditEvent({
                action: 'P2P_DEVICE_PAIRED',
                remoteDeviceId: device.id,
                transferMethod: 'local-network',
              })
              await doTransfer(conn, key, reportId, reportPayload, patientIdShort, practitionerId, privateKey, device)
            })()
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Connection failed'
        setErrorMsg(msg)
        setPhase('failure')
        reportP2PAuditEvent({
          action: 'P2P_TRANSFER_FAILED',
          remoteDeviceId: device.id,
          transferMethod: 'local-network',
        })
      }
    },
    [session, reportId, reportPayload, patientIdShort, practitionerId, privateKey],
  )

  const handlePairingConfirmed = useCallback(() => {
    const key = pairingSessionKeyRef.current
    const cb = pairingCallbackRef.current
    if (key && cb) {
      cb(key)
      pairingSessionKeyRef.current = null
      pairingCallbackRef.current = null
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Transfer
  // ---------------------------------------------------------------------------

  async function doTransfer(
    conn: P2PConnection,
    sessionKey: CryptoKey,
    rptId: string,
    payload: unknown,
    shortId: string,
    practId: string,
    privKey: Uint8Array,
    device: DiscoveredDevice,
  ) {
    setPhase('transferring')
    try {
      // Sign the bundle
      const signedBundle = signDiagnosticReportBundle(payload, privKey, practId)

      // Encrypt the full SignedBundle (not just the bundle string) to protect signerPractitionerId
      const { ciphertext, iv } = await encryptBundle(JSON.stringify(signedBundle), sessionKey)
      const packed = packIvAndCiphertext(iv, ciphertext)
      const chunks = chunkArrayBuffer(packed)
      setProgress({ sent: 0, total: chunks.length })

      // Send TRANSFER_OFFER
      const offerMsg: P2PMessage = {
        type: 'TRANSFER_OFFER',
        reportId: rptId,
        sizeBytes: packed.byteLength,
        patientIdShort: shortId,
      }
      await conn.send(encodeMessage(offerMsg))

      // Wait for TRANSFER_ACCEPT (30s timeout)
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          conn.onReceive((data) => {
            const msg = decodeMessage(data)
            if (msg.type === 'TRANSFER_ACCEPT') resolve()
            else if (msg.type === 'TRANSFER_REJECT') reject(new Error((msg as Extract<P2PMessage, {type:'TRANSFER_REJECT'}>).reason))
          })
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Transfer accept timeout')), 30_000),
        ),
      ])

      // Send chunks
      await sendChunks({
        connection: conn,
        chunks,
        onProgress: (sent, total) => setProgress({ sent, total }),
      })

      // Send TRANSFER_COMPLETE — signature/signerPractitionerId are inside the encrypted payload
      const completeMsg: P2PMessage = {
        type: 'TRANSFER_COMPLETE',
        signature: '[encrypted]',
        signerPractitionerId: '[encrypted]',
      }
      await conn.send(encodeMessage(completeMsg))

      // Wait for TRANSFER_VERIFY_OK / FAIL (30s timeout)
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          conn.onReceive((data) => {
            const msg = decodeMessage(data)
            if (msg.type === 'TRANSFER_VERIFY_OK') resolve()
            else if (msg.type === 'TRANSFER_VERIFY_FAIL') reject(new Error((msg as Extract<P2PMessage, {type:'TRANSFER_VERIFY_FAIL'}>).reason))
          })
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Verification timeout')), 30_000),
        ),
      ])

      const durationMs = Date.now() - startTimeRef.current
      reportP2PAuditEvent({
        action: 'P2P_RESULT_SENT',
        remoteDeviceId: device.id,
        diagnosticReportRef: rptId,
        transferMethod: 'local-network',
        transferSizeBytes: packed.byteLength,
        durationMs,
      })

      conn.close()
      setPhase('success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transfer failed'
      setErrorMsg(msg)
      conn.close()
      setPhase('failure')
      reportP2PAuditEvent({
        action: 'P2P_TRANSFER_FAILED',
        remoteDeviceId: device.id,
        diagnosticReportRef: rptId,
        transferMethod: 'local-network',
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('dialogTitle')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="relative w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl dark:bg-card">
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label={t('close')}
          className="absolute end-4 top-4 rounded-full p-1 text-muted-foreground hover:bg-muted dark:hover:bg-card"
        >
          <X size={18} />
        </button>

        <h2 className="mb-4 text-lg font-semibold text-foreground dark:text-foreground">
          {t('dialogTitle')}
        </h2>

        {/* PHASE: discovering */}
        {phase === 'discovering' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 size={32} className="animate-spin text-primary" />
            <p className="text-sm text-muted-foreground dark:text-muted-foreground">{t('searching')}</p>
          </div>
        )}

        {/* PHASE: device-select */}
        {phase === 'device-select' && (
          <div className="flex flex-col gap-2">
            {devices.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <WifiOff size={32} className="text-muted-foreground" />
                <p className="text-sm text-muted-foreground dark:text-muted-foreground">{t('noDevicesFound')}</p>
                <button
                  onClick={() => void startDiscovery()}
                  className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
                >
                  {t('retry')}
                </button>
              </div>
            ) : (
              <>
                <p className="mb-2 text-sm text-muted-foreground dark:text-muted-foreground">{t('selectDevice')}</p>
                <ul role="list" className="divide-y divide-border/50 dark:divide-border">
                  {devices.map((device) => (
                    <li key={device.id}>
                      <button
                        onClick={() => void handleDeviceSelect(device)}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-start hover:bg-muted/30 dark:hover:bg-card"
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium text-foreground dark:text-foreground">
                            {device.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {device.type === 'ble'
                              ? t('deviceTypeBle')
                              : device.type === 'wifi-direct'
                              ? t('deviceTypeWifi')
                              : t('deviceTypeLocal')}
                          </span>
                        </div>
                        <DirectionalIcon category="navigation">
                          <ChevronRight size={16} className="text-muted-foreground" />
                        </DirectionalIcon>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {/* PHASE: pairing */}
        {phase === 'pairing' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <p className="text-center text-sm text-muted-foreground dark:text-muted-foreground">
              {t('pairingInstruction')}
            </p>
            <div
              aria-label={t('pairingCode')}
              className="rounded-xl bg-primary/10 px-6 py-4 text-center text-4xl font-bold tracking-widest text-primary dark:bg-blue-950"
            >
              {pairingCode}
            </div>
            <div className="flex w-full gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/30 dark:border-border dark:text-muted-foreground"
              >
                {t('pairingCancel')}
              </button>
              <button
                onClick={handlePairingConfirmed}
                className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                {t('pairingConfirm')}
              </button>
            </div>
          </div>
        )}

        {/* PHASE: transferring */}
        {phase === 'transferring' && (
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center gap-2">
              <Loader2 size={18} className="animate-spin text-primary" />
              <p className="text-sm text-muted-foreground dark:text-muted-foreground">{t('transferring')}</p>
            </div>
            {progress.total > 0 && (
              <>
                <div
                  role="progressbar"
                  aria-valuenow={progress.sent}
                  aria-valuemin={0}
                  aria-valuemax={progress.total}
                  className="h-2 w-full overflow-hidden rounded-full bg-muted dark:bg-muted"
                >
                  <div
                    className="h-full bg-primary transition-all duration-150"
                    style={{ width: `${Math.round((progress.sent / progress.total) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('transferProgress', { sent: progress.sent, total: progress.total })}
                </p>
              </>
            )}
          </div>
        )}

        {/* PHASE: success */}
        {phase === 'success' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle size={48} className="text-green-600" />
            <p className="text-center text-sm font-medium text-foreground dark:text-foreground">
              {t('successTitle')}
            </p>
            <p className="text-center text-sm text-muted-foreground dark:text-muted-foreground">
              {t('successMessage', { doctorName: selectedDevice?.name ?? '' })}
            </p>
            <button
              onClick={onClose}
              className="mt-2 rounded-lg bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              {t('close')}
            </button>
          </div>
        )}

        {/* PHASE: failure */}
        {phase === 'failure' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <WifiOff size={48} className="text-red-500" />
            <p className="text-center text-sm font-medium text-foreground dark:text-foreground">
              {t('failureTitle')}
            </p>
            <p className="text-center text-sm text-muted-foreground dark:text-muted-foreground">
              {errorMsg || t('failureMessage')}
            </p>
            <div className="flex w-full gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/30 dark:border-border dark:text-muted-foreground"
              >
                {t('close')}
              </button>
              <button
                onClick={() => void startDiscovery()}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
              >
                {t('retry')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
