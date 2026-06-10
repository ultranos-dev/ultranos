'use client'

/**
 * Story 49.4 — Security Alert Flow
 *
 * Full-screen, step-by-step wizard for conflict-zone security protocols.
 *
 * Steps:
 *   1. Activate   — large red button, role verification, confirmation dialog
 *   2. Encrypt    — progress bar, key export (USB download + QR display)
 *   3. Backup     — generate and export backup
 *   4. Checklist  — rapid shutdown checklist
 *   5. Wipe       — optional device wipe (double-confirmation)
 *   6. Done       — "Device Secured" confirmation screen
 *
 * Design principles (high-stress use):
 *   - Large touch targets (min 48×48 px)
 *   - Simple, unambiguous language
 *   - Sequential — cannot skip required steps
 *   - Red/destructive styling for irreversible actions
 *   - Green/safe styling for completed steps
 *   - RTL support via logical CSS properties
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useSecurityAlertStore } from '@/stores/security-alert-store'
import { performEmergencyEncryption } from '@/lib/security/emergency-encrypt'
import { generateSecurityBackup, downloadBackup } from '@/lib/security/backup-generator'
import { performDeviceWipe } from '@/lib/security/device-wipe'
import { ShutdownChecklist } from '@/components/security/ShutdownChecklist'
import { LabRole } from '@ultranos/shared-types'
import { reportSecurityAuditEvent } from '@/lib/audit-client'

type FlowStep = 'activate' | 'encrypt' | 'backup' | 'checklist' | 'wipe' | 'done'

interface SecurityAlertFlowProps {
  onClose?: () => void
}

export function SecurityAlertFlow({ onClose }: SecurityAlertFlowProps) {
  const t = useTranslations('security')
  const session = useAuthSessionStore((s) => s.session)
  const { activate, isActive, markBackupGenerated } = useSecurityAlertStore()

  const [step, setStep] = useState<FlowStep>('activate')
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null)
  const [encryptProgress, setEncryptProgress] = useState(0)
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wipePhrase, setWipePhrase] = useState('')
  const [wipeConfirm1, setWipeConfirm1] = useState(false)
  const [showQr, setShowQr] = useState(false)

  const isManager = session?.labRole === LabRole.LAB_MANAGER
  const localizedWipePhrase = t('wipe.confirmPhrase')

  // ─── Step: Activate ───────────────────────────────────────────────────────

  async function handleActivate() {
    if (!session || !isManager) {
      setError(t('errors.notAuthorized'))
      return
    }
    setIsWorking(true)
    setError(null)
    try {
      await activate(session.userId)
      setStep('encrypt')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.activationFailed'))
    } finally {
      setIsWorking(false)
    }
  }

  // ─── Step: Encrypt ────────────────────────────────────────────────────────

  async function handleEncrypt() {
    setIsWorking(true)
    setError(null)
    setEncryptProgress(0)
    try {
      const { keyBase64 } = await performEmergencyEncryption((_, processed, total) => {
        setEncryptProgress(total > 0 ? Math.round((processed / total) * 100) : 0)
      })
      setEncryptionKey(keyBase64)
      setEncryptProgress(100)
      reportSecurityAuditEvent({ action: 'SECURITY_EMERGENCY_ENCRYPT' })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.encryptionFailed'))
    } finally {
      setIsWorking(false)
    }
  }

  function handleDownloadKey() {
    if (!encryptionKey) return
    const filename = `security-key-${Date.now()}.key`
    const blob = new Blob([encryptionKey], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    reportSecurityAuditEvent({ action: 'SECURITY_BACKUP_EXPORTED', backupMethod: 'usb' })
  }

  // ─── Step: Backup ─────────────────────────────────────────────────────────

  async function handleGenerateBackup() {
    setIsWorking(true)
    setError(null)
    try {
      const backup = await generateSecurityBackup()
      downloadBackup(backup)
      await markBackupGenerated()
      reportSecurityAuditEvent({ action: 'SECURITY_BACKUP_GENERATED', backupMethod: 'usb' })
      setStep('checklist')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.backupFailed'))
    } finally {
      setIsWorking(false)
    }
  }

  // ─── Step: Wipe ───────────────────────────────────────────────────────────

  async function handleWipe() {
    if (!wipeConfirm1) {
      setError(t('wipe.mustConfirmFirst'))
      return
    }
    setIsWorking(true)
    setError(null)
    try {
      await performDeviceWipe({ confirmationPhrase: wipePhrase, expectedPhrase: localizedWipePhrase })
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.wipeFailed'))
    } finally {
      setIsWorking(false)
    }
  }

  // ─── Step renderers ───────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 bg-card overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={t('flow.title')}
    >
      <div className="max-w-lg mx-auto px-4 py-8 flex flex-col gap-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-red-700">{t('flow.title')}</h1>
          {step === 'activate' && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground p-2 rounded
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                focus-visible:outline-neutral-500"
              aria-label={t('flow.close')}
            >
              ✕
            </button>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div
            role="alert"
            className="rounded-lg bg-red-50 border border-red-300 p-4 text-red-800 text-sm"
          >
            {error}
          </div>
        )}

        {/* ── Step: Activate ─────────────────────────────────────────── */}
        {step === 'activate' && (
          <div className="flex flex-col gap-4">
            {!isManager && (
              <div className="rounded-lg bg-amber-50 border border-amber-300 p-4 text-amber-800 text-sm">
                {t('flow.notManagerWarning')}
              </div>
            )}
            <p className="text-foreground">{t('flow.activateDescription')}</p>
            <button
              type="button"
              disabled={!isManager || isWorking}
              onClick={handleActivate}
              className="
                w-full py-5 rounded-xl font-bold text-xl bg-red-600 text-white
                disabled:opacity-40 disabled:cursor-not-allowed
                hover:bg-red-700 active:bg-red-800
                focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2
                focus-visible:outline-red-600
                transition-colors
              "
            >
              {isWorking ? t('flow.activating') : t('flow.activateButton')}
            </button>
          </div>
        )}

        {/* ── Step: Encrypt ──────────────────────────────────────────── */}
        {step === 'encrypt' && (
          <div className="flex flex-col gap-4">
            <p className="text-foreground">{t('flow.encryptDescription')}</p>

            {!encryptionKey && (
              <button
                type="button"
                disabled={isWorking}
                onClick={handleEncrypt}
                className="w-full py-4 rounded-lg font-bold text-lg bg-red-600 text-white
                  disabled:opacity-40 hover:bg-red-700
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                  focus-visible:outline-red-600"
              >
                {isWorking ? (
                  <span>{t('flow.encryptingProgress', { progress: encryptProgress })}</span>
                ) : (
                  t('flow.encryptButton')
                )}
              </button>
            )}

            {isWorking && (
              <div
                role="progressbar"
                aria-valuenow={encryptProgress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t('flow.encryptProgressLabel')}
                className="w-full h-3 bg-muted rounded-full overflow-hidden"
              >
                <div
                  className="h-full bg-red-500 transition-all duration-300"
                  style={{ width: `${encryptProgress}%` }}
                />
              </div>
            )}

            {encryptionKey && (
              <div className="flex flex-col gap-4">
                <div className="rounded-lg border-2 border-green-400 bg-green-50 p-4">
                  <p className="text-sm font-semibold text-green-800 mb-2">
                    {t('flow.keyExportTitle')}
                  </p>
                  <p className="text-xs text-green-700 mb-3">{t('flow.keyExportDescription')}</p>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadKey}
                      className="w-full py-3 bg-green-600 text-white rounded font-semibold
                        hover:bg-green-700"
                    >
                      💾 {t('flow.downloadKey')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowQr(!showQr)}
                      className="w-full py-3 bg-card border border-green-400 text-green-800
                        rounded font-semibold hover:bg-green-50"
                    >
                      📷 {t('flow.showQr')}
                    </button>
                  </div>
                  {showQr && (
                    <div className="mt-3 p-3 bg-card border border-border rounded">
                      <p className="text-xs text-muted-foreground mb-2">{t('flow.qrInstructions')}</p>
                      <code className="text-xs break-all font-mono text-foreground block">
                        {encryptionKey}
                      </code>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setStep('backup')}
                  className="w-full py-4 bg-card text-white rounded-lg font-bold text-lg
                    hover:bg-muted"
                >
                  {t('flow.continueToBackup')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Step: Backup ───────────────────────────────────────────── */}
        {step === 'backup' && (
          <div className="flex flex-col gap-4">
            <p className="text-foreground">{t('flow.backupDescription')}</p>
            <button
              type="button"
              disabled={isWorking}
              onClick={handleGenerateBackup}
              className="w-full py-4 bg-amber-600 text-white rounded-lg font-bold text-lg
                disabled:opacity-40 hover:bg-amber-700
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                focus-visible:outline-amber-600"
            >
              {isWorking ? t('flow.generatingBackup') : t('flow.backupButton')}
            </button>
          </div>
        )}

        {/* ── Step: Checklist ────────────────────────────────────────── */}
        {step === 'checklist' && (
          <div className="flex flex-col gap-4">
            <p className="text-foreground">{t('flow.checklistDescription')}</p>
            <ShutdownChecklist onComplete={() => setStep('wipe')} />
          </div>
        )}

        {/* ── Step: Wipe (optional) ──────────────────────────────────── */}
        {step === 'wipe' && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg bg-red-50 border-2 border-red-400 p-4">
              <h2 className="text-lg font-bold text-red-800 mb-2">
                {t('wipe.optionalTitle')}
              </h2>
              <p className="text-sm text-red-700">{t('wipe.description')}</p>
            </div>

            {/* First confirmation */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={wipeConfirm1}
                onChange={(e) => setWipeConfirm1(e.target.checked)}
                className="mt-0.5 h-5 w-5 accent-red-600"
              />
              <span className="text-sm font-medium text-foreground">
                {t('wipe.firstConfirmLabel')}
              </span>
            </label>

            {/* Typed phrase */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                {t('wipe.typeToConfirm', { phrase: localizedWipePhrase })}
              </label>
              <input
                type="text"
                value={wipePhrase}
                onChange={(e) => setWipePhrase(e.target.value)}
                placeholder={localizedWipePhrase}
                className="w-full border-2 border-red-300 rounded px-3 py-3 text-base
                  font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                aria-label={t('wipe.confirmPhraseAriaLabel')}
              />
            </div>

            <button
              type="button"
              disabled={isWorking || wipePhrase !== localizedWipePhrase || !wipeConfirm1}
              onClick={handleWipe}
              className="w-full py-4 bg-red-700 text-white rounded-lg font-bold text-lg
                disabled:opacity-40 disabled:cursor-not-allowed
                hover:bg-red-800 active:bg-red-900
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                focus-visible:outline-red-700"
            >
              {isWorking ? t('wipe.wiping') : t('wipe.wipeButton')}
            </button>

            {/* Skip wipe */}
            <button
              type="button"
              onClick={() => setStep('done')}
              className="w-full py-3 bg-card border border-border text-foreground
                rounded-lg font-medium hover:bg-muted/30"
            >
              {t('wipe.skipButton')}
            </button>
          </div>
        )}

        {/* ── Step: Done ─────────────────────────────────────────────── */}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="text-6xl">🔒</div>
            <h2 className="text-2xl font-bold text-foreground">{t('flow.doneTitle')}</h2>
            <p className="text-muted-foreground">{t('flow.doneDescription')}</p>
            <div
              data-testid="security-mode-banner"
              className="w-full rounded-lg bg-red-100 border border-red-300 p-3
                text-red-800 text-sm font-medium text-center"
            >
              {t('banner.title')}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
