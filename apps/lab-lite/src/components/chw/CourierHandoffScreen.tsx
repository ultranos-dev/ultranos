'use client'

// ---------------------------------------------------------------------------
// Story 54.2 — Courier Handoff Screen
// 4-step wizard: Courier ID → Scan Samples → Temperature → Summary/Confirm
// On confirmation: calls recordCourierHandoff(), shows success, returns to dashboard.
// No PHI displayed — only sample label numbers and counts (CLAUDE.md Rule #7).
// ---------------------------------------------------------------------------

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Truck, Scan, Thermometer, CheckCircle, AlertCircle, Plus } from '@ultranos/ui-kit/icons'
import { recordCourierHandoff } from '@/lib/chw-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'

type Step = 'courier-id' | 'scan-samples' | 'temperature' | 'summary' | 'success'

interface Props {
  onDone: () => void
}

export function CourierHandoffScreen({ onDone }: Props) {
  const t = useTranslations('chw.handoff')
  const session = useAuthSessionStore((s) => s.session)

  const [step, setStep] = useState<Step>('courier-id')
  const [courierId, setCourierId] = useState('')
  const [scannedIds, setScannedIds] = useState<string[]>([])
  const [barcodeInput, setBarcodeInput] = useState('')
  const [scanError, setScanError] = useState<'not-found' | 'duplicate' | null>(null)
  const [tempValue, setTempValue] = useState('')
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)

  // ------------ Step 1: Courier ID ------------

  if (step === 'courier-id') {
    return (
      <div className="flex flex-col gap-4 p-4">
        <StepHeader icon={<Truck size={32} aria-hidden />} title={t('step1Title')} step={1} />
        <div className="flex flex-col gap-1">
          <label className="text-lg font-medium text-gray-700">{t('courierId')}</label>
          <input
            type="text"
            value={courierId}
            onChange={(e) => setCourierId(e.target.value)}
            placeholder={t('courierPlaceholder')}
            className="min-h-[56px] rounded-xl border border-gray-300 px-4 py-3 text-xl focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            autoFocus
          />
        </div>
        <LargeButton
          disabled={!courierId.trim()}
          onClick={() => setStep('scan-samples')}
        >
          {t('next')}
        </LargeButton>
      </div>
    )
  }

  // ------------ Step 2: Scan samples ------------

  function handleBarcodeScan() {
    const label = barcodeInput.trim().toUpperCase()
    if (!label) return

    if (scannedIds.includes(label)) {
      setScanError('duplicate')
      return
    }
    // Accept any CHW-format label (CHW-MMDD-NNN) — validation against DB would be async;
    // recordCourierHandoff() will validate all IDs exist at confirm time.
    if (!label.startsWith('CHW-')) {
      setScanError('not-found')
      return
    }
    setScanError(null)
    setScannedIds((prev) => [...prev, label])
    setBarcodeInput('')
    // Vibrate on scan confirmation (if supported)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50)
    }
  }

  function handleBarcodeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleBarcodeScan()
  }

  if (step === 'scan-samples') {
    return (
      <div className="flex flex-col gap-4 p-4">
        <StepHeader icon={<Scan size={32} aria-hidden />} title={t('step2Title')} step={2} />

        {/* Camera viewfinder placeholder — real impl uses device camera */}
        <div className="flex h-36 items-center justify-center rounded-2xl border-4 border-dashed border-blue-300 bg-blue-50">
          <Scan size={48} className="text-blue-400" aria-hidden />
        </div>

        {/* Barcode input (manual entry + external scanner) */}
        <div className="flex gap-2">
          <input
            type="text"
            value={barcodeInput}
            onChange={(e) => { setBarcodeInput(e.target.value); setScanError(null) }}
            onKeyDown={handleBarcodeKeyDown}
            placeholder={t('barcodePlaceholder')}
            className="min-h-[56px] flex-1 rounded-xl border border-gray-300 px-4 py-3 text-xl focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            aria-label={t('barcodePlaceholder')}
          />
          <button
            type="button"
            onClick={handleBarcodeScan}
            disabled={!barcodeInput.trim()}
            className="flex h-[56px] w-[56px] items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            aria-label="Add"
          >
            <Plus size={24} aria-hidden />
          </button>
        </div>

        {scanError === 'not-found' && (
          <p className="flex items-center gap-2 text-red-600" role="alert">
            <AlertCircle size={16} aria-hidden /> {t('notFound')}
          </p>
        )}
        {scanError === 'duplicate' && (
          <p className="flex items-center gap-2 text-amber-600" role="alert">
            <AlertCircle size={16} aria-hidden /> {t('alreadyScanned')}
          </p>
        )}

        {/* Running list of scanned samples */}
        {scannedIds.length > 0 && (
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="mb-2 text-base font-semibold text-gray-700">
              {t('scannedCount', { count: scannedIds.length })}
            </p>
            <ul className="flex flex-col gap-1">
              {scannedIds.map((id) => (
                <li key={id} className="flex items-center gap-2 text-base text-gray-800">
                  <CheckCircle size={14} className="text-green-600 shrink-0" aria-hidden />
                  <span className="font-mono">{id}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-3">
          <BackButton onClick={() => setStep('courier-id')} />
          <LargeButton
            disabled={scannedIds.length === 0}
            onClick={() => setStep('temperature')}
            className="flex-1"
          >
            {t('next')}
          </LargeButton>
        </div>
      </div>
    )
  }

  // ------------ Step 3: Temperature (optional) ------------

  if (step === 'temperature') {
    return (
      <div className="flex flex-col gap-4 p-4">
        <StepHeader icon={<Thermometer size={32} aria-hidden />} title={t('step3Title')} step={3} />

        <div className="flex gap-3">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-lg font-medium text-gray-700">{t('tempLabel')}</label>
            <input
              type="number"
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              placeholder={t('tempPlaceholder')}
              className="min-h-[56px] rounded-xl border border-gray-300 px-4 py-3 text-xl focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              inputMode="decimal"
            />
          </div>
          {/* Unit toggle */}
          <div className="flex flex-col gap-1">
            <span className="text-lg font-medium text-gray-700">&nbsp;</span>
            <div className="flex h-[56px] overflow-hidden rounded-xl border border-gray-300">
              <button
                type="button"
                onClick={() => setTempUnit('C')}
                className={`px-4 text-lg font-semibold transition-colors ${
                  tempUnit === 'C' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'
                }`}
              >
                {t('celsius')}
              </button>
              <button
                type="button"
                onClick={() => setTempUnit('F')}
                className={`px-4 text-lg font-semibold transition-colors ${
                  tempUnit === 'F' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'
                }`}
              >
                {t('fahrenheit')}
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <BackButton onClick={() => setStep('scan-samples')} />
          <LargeButton onClick={() => setStep('summary')} className="flex-1">
            {tempValue ? t('next') : t('skip')}
          </LargeButton>
        </div>
      </div>
    )
  }

  // ------------ Step 4: Summary / Confirm ------------

  function getTempCelsius(): number | undefined {
    if (!tempValue) return undefined
    const n = parseFloat(tempValue)
    if (isNaN(n)) return undefined
    return tempUnit === 'F' ? Math.round(((n - 32) * 5) / 9 * 10) / 10 : n
  }

  async function handleConfirm() {
    setSubmitting(true)
    setSubmitError(false)
    try {
      await recordCourierHandoff({
        courierId: courierId.trim(),
        sampleIds: scannedIds,
        temperatureAtPickup: getTempCelsius(),
        collectedBy: session?.userId ?? 'unknown',
      })
      setStep('success')
    } catch {
      setSubmitError(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'summary') {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    const tempC = getTempCelsius()

    return (
      <div className="flex flex-col gap-4 p-4">
        <StepHeader icon={<Truck size={32} aria-hidden />} title={t('step4Title')} step={4} />

        <div className="rounded-2xl bg-gray-50 p-5 flex flex-col gap-3">
          <SummaryRow label={t('courier')} value={courierId} />
          <SummaryRow label={t('samples')} value={String(scannedIds.length)} />
          <SummaryRow label={t('time')} value={now} />
          {tempC != null && (
            <SummaryRow label={t('temp')} value={`${tempC}°C`} />
          )}
        </div>

        {submitError && (
          <p className="flex items-center gap-2 text-red-600" role="alert">
            <AlertCircle size={16} aria-hidden /> {t('submitError')}
          </p>
        )}

        <div className="flex gap-3">
          <BackButton onClick={() => setStep('temperature')} />
          <LargeButton
            onClick={() => void handleConfirm()}
            disabled={submitting}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            {submitting ? '…' : t('confirmButton')}
          </LargeButton>
        </div>
      </div>
    )
  }

  // ------------ Success screen ------------

  return (
    <div className="flex flex-col items-center gap-6 p-4">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-green-100">
        <CheckCircle size={48} className="text-green-700" aria-hidden />
      </div>
      <h2 className="text-center text-2xl font-bold text-gray-900">{t('successTitle')}</h2>
      <p className="text-center text-xl text-gray-600">
        {t('successMessage', { count: scannedIds.length })}
      </p>
      <LargeButton onClick={onDone} className="w-full">
        {t('backToDashboard')}
      </LargeButton>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StepHeader({
  icon,
  title,
  step,
}: {
  icon: React.ReactNode
  title: string
  step: number
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Step {step} of 4</p>
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-lg text-gray-600">{label}</span>
      <span className="text-lg font-semibold text-gray-900">{value}</span>
    </div>
  )
}

function LargeButton({
  children,
  onClick,
  disabled = false,
  className = '',
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[56px] rounded-xl bg-blue-600 px-6 py-4 text-xl font-semibold text-white hover:bg-blue-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${className}`}
    >
      {children}
    </button>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[56px] rounded-xl border border-gray-300 px-5 py-4 text-xl font-semibold text-gray-700 hover:bg-gray-50"
    >
      ←
    </button>
  )
}
