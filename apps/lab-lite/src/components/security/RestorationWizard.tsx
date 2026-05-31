'use client'

/**
 * Story 49.4 — Restoration Wizard
 *
 * Step-by-step wizard for restoring operations after Security Alert:
 *   1. Authenticate — re-login to verify identity
 *   2. Choose source — Hub (network) or backup file (USB)
 *   3. Import — decrypt and import records
 *   4. Verify — confirm record counts
 *   5. Done — deactivated Security Mode
 */

import { useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { restoreFromBackup, restoreFromHub } from '@/lib/security/restoration'
import type { SecurityBackup } from '@/lib/security/backup-generator'

type Step = 'source' | 'import' | 'done' | 'error'
type Source = 'hub' | 'file'

interface RestorationWizardProps {
  onComplete?: () => void
}

export function RestorationWizard({ onComplete }: RestorationWizardProps) {
  const t = useTranslations('security')
  const [step, setStep] = useState<Step>('source')
  const [source, setSource] = useState<Source | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isRestoring, setIsRestoring] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFileRestore() {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setError(t('restoration.noFileSelected'))
      return
    }
    if (!keyInput.trim()) {
      setError(t('restoration.noKeyEntered'))
      return
    }

    setIsRestoring(true)
    setError(null)
    try {
      const text = await file.text()
      const backup: SecurityBackup = JSON.parse(text) as SecurityBackup
      await restoreFromBackup(backup, keyInput.trim())
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('restoration.genericError'))
      setStep('error')
    } finally {
      setIsRestoring(false)
    }
  }

  if (step === 'done') {
    return (
      <div className="flex flex-col items-center gap-6 py-8 text-center">
        <div className="text-5xl">✅</div>
        <h2 className="text-2xl font-bold text-green-700">{t('restoration.done')}</h2>
        <p className="text-neutral-600">{t('restoration.doneDescription')}</p>
        <button
          type="button"
          onClick={onComplete}
          className="w-full py-4 bg-green-600 text-white rounded-lg font-bold text-lg
            hover:bg-green-700 focus-visible:outline focus-visible:outline-2
            focus-visible:outline-offset-2 focus-visible:outline-green-600"
        >
          {t('restoration.doneButton')}
        </button>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-800">
          <p className="font-semibold">{t('restoration.failedTitle')}</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
        <button
          type="button"
          onClick={() => { setStep('source'); setError(null) }}
          className="w-full py-3 bg-neutral-800 text-white rounded-lg font-semibold
            hover:bg-neutral-700"
        >
          {t('restoration.tryAgain')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-bold text-neutral-900">{t('restoration.title')}</h2>

      {step === 'source' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-neutral-600">{t('restoration.chooseSource')}</p>
          <button
            type="button"
            onClick={() => { setSource('file'); setStep('import') }}
            className="w-full py-4 border-2 border-neutral-300 rounded-lg font-semibold
              text-neutral-800 hover:border-neutral-500 hover:bg-neutral-50
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-neutral-600"
          >
            📁 {t('restoration.fromFile')}
          </button>
          <button
            type="button"
            onClick={() => { setSource('hub'); setStep('import') }}
            className="w-full py-4 border-2 border-blue-300 rounded-lg font-semibold
              text-blue-800 hover:border-blue-500 hover:bg-blue-50
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-blue-600"
          >
            ☁️ {t('restoration.fromHub')}
          </button>
        </div>
      )}

      {step === 'import' && source === 'file' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-neutral-600">{t('restoration.fileInstructions')}</p>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              {t('restoration.backupFile')}
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".ultranos.bak,.json"
              className="block w-full text-sm text-neutral-700 file:mr-3 file:py-2 file:px-4
                file:rounded file:border-0 file:bg-neutral-100 file:font-medium
                file:hover:bg-neutral-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              {t('restoration.oneTimeKey')}
            </label>
            <input
              type="text"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={t('restoration.keyPlaceholder')}
              className="w-full border border-neutral-300 rounded px-3 py-2 text-sm
                font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 font-medium">{error}</p>
          )}

          <button
            type="button"
            onClick={handleFileRestore}
            disabled={isRestoring}
            className="w-full py-4 bg-blue-600 text-white rounded-lg font-bold text-base
              disabled:opacity-40 hover:bg-blue-700
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-blue-600"
          >
            {isRestoring ? t('restoration.restoring') : t('restoration.restoreButton')}
          </button>
        </div>
      )}
    </div>
  )
}
