'use client'

// ---------------------------------------------------------------------------
// Story 54.3 — Courier Pickup Screen (Task 6)
// 5-step wizard: Courier ID → Destination → Scan Samples → Temperature → Summary
// On confirmation: calls startTransport(), generates manifest, shows success step.
//
// PHI rules (CLAUDE.md):
//   Rule #1: No PHI in logs or displayed data — only opaque IDs and label numbers.
//   Rule #7: Lab Portal sees only name + age — transport records must not carry demographics.
//
// i18n TODO: All strings are hardcoded English. Wire up useTranslations('transport.pickup')
//            when the i18n JSON keys are added (tracked separately).
// ---------------------------------------------------------------------------

import { useState } from 'react'
import { Truck, Scan, Thermometer, CheckCircle, AlertCircle, Package, ClipboardList } from '@ultranos/ui-kit/icons'
import { startTransport } from '@/lib/transport-service'
import { generateManifest, renderManifestText } from '@/lib/transport-manifest'
import type { StartTransportInput } from '@/types/transport'
import type { FhirSpecimen } from '@ultranos/shared-types'

type Step = 'courier-id' | 'destination' | 'scan-samples' | 'temperature' | 'summary' | 'success'

export interface CourierPickupScreenProps {
  originLocationId: string       // current location (CHW post or satellite lab)
  destinationLocationId: string  // main lab ID
  onDone: () => void
}

export function CourierPickupScreen({
  originLocationId,
  destinationLocationId,
  onDone,
}: CourierPickupScreenProps) {
  // TODO i18n: const t = useTranslations('transport.pickup')

  const [step, setStep] = useState<Step>('courier-id')
  const [courierId, setCourierId] = useState('')
  const [selectedDestination] = useState(destinationLocationId)
  const [scanInput, setScanInput] = useState('')
  const [scannedLabels, setScannedLabels] = useState<string[]>([])
  const [scanError, setScanError] = useState<'duplicate' | null>(null)
  const [temperature, setTemperature] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [manifestText, setManifestText] = useState('')

  // ------------ Step 1: Courier ID ------------

  if (step === 'courier-id') {
    return (
      <div className="flex flex-col gap-4 p-4" data-testid="courier-pickup-screen">
        <StepHeader icon={<Truck size={32} aria-hidden />} title="Enter Courier ID" step={1} total={5} />
        <div className="flex flex-col gap-1">
          <label className="text-lg font-medium text-gray-700" htmlFor="courier-id-input">
            Courier ID
          </label>
          <input
            id="courier-id-input"
            data-testid="courier-id-input"
            type="text"
            value={courierId}
            onChange={(e) => setCourierId(e.target.value)}
            placeholder="e.g. CRR-001"
            className="min-h-[56px] rounded-xl border border-gray-300 px-4 py-3 text-xl focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            autoFocus
          />
        </div>
        <LargeButton disabled={!courierId.trim()} onClick={() => setStep('destination')}>
          Next
        </LargeButton>
      </div>
    )
  }

  // ------------ Step 2: Destination ------------

  if (step === 'destination') {
    return (
      <div className="flex flex-col gap-4 p-4" data-testid="courier-pickup-screen">
        <StepHeader icon={<Package size={32} aria-hidden />} title="Select Destination" step={2} total={5} />

        {/* Single-option radio — extensible to multi-location in future */}
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-3 rounded-xl border-2 border-blue-500 bg-blue-50 p-4 cursor-pointer">
            <input
              type="radio"
              name="destination"
              value={destinationLocationId}
              defaultChecked
              readOnly
              className="h-5 w-5 accent-blue-600"
            />
            <div>
              <p className="text-lg font-semibold text-gray-900">Main Laboratory</p>
              <p className="text-sm text-gray-500">ID: {destinationLocationId}</p>
            </div>
          </label>
        </div>

        <div className="flex gap-3">
          <BackButton onClick={() => setStep('courier-id')} />
          <LargeButton onClick={() => setStep('scan-samples')} className="flex-1">
            Next
          </LargeButton>
        </div>
      </div>
    )
  }

  // ------------ Step 3: Scan Samples ------------

  function handleAddSample() {
    const label = scanInput.trim().toUpperCase()
    if (!label) return
    if (scannedLabels.includes(label)) {
      setScanError('duplicate')
      return
    }
    setScanError(null)
    setScannedLabels((prev) => [...prev, label])
    setScanInput('')
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50)
    }
  }

  function handleScanKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleAddSample()
  }

  if (step === 'scan-samples') {
    return (
      <div className="flex flex-col gap-4 p-4" data-testid="courier-pickup-screen">
        <StepHeader icon={<Scan size={32} aria-hidden />} title="Scan Samples" step={3} total={5} />

        {/* Camera viewfinder placeholder */}
        <div className="flex h-36 items-center justify-center rounded-2xl border-4 border-dashed border-blue-300 bg-blue-50">
          <Scan size={48} className="text-blue-400" aria-hidden />
        </div>

        <div className="flex gap-2">
          <input
            data-testid="scan-input"
            type="text"
            value={scanInput}
            onChange={(e) => { setScanInput(e.target.value); setScanError(null) }}
            onKeyDown={handleScanKeyDown}
            placeholder="Scan or type label number"
            className="min-h-[56px] flex-1 rounded-xl border border-gray-300 px-4 py-3 text-xl focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            aria-label="Sample label number"
          />
          <button
            type="button"
            data-testid="add-sample-button"
            onClick={handleAddSample}
            disabled={!scanInput.trim()}
            className="flex h-[56px] w-[56px] items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            aria-label="Add sample"
          >
            +
          </button>
        </div>

        {scanError === 'duplicate' && (
          <p className="flex items-center gap-2 text-amber-600" role="alert">
            <AlertCircle size={16} aria-hidden /> Label already added
          </p>
        )}

        {scannedLabels.length > 0 && (
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="mb-2 text-base font-semibold text-gray-700">
              {scannedLabels.length} sample{scannedLabels.length !== 1 ? 's' : ''} added
            </p>
            <ul className="flex flex-col gap-1">
              {scannedLabels.map((label) => (
                <li key={label} className="flex items-center gap-2 text-base text-gray-800">
                  <CheckCircle size={14} className="text-green-600 shrink-0" aria-hidden />
                  <span className="font-mono">{label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-3">
          <BackButton onClick={() => setStep('destination')} />
          <LargeButton
            disabled={scannedLabels.length === 0}
            onClick={() => setStep('temperature')}
            className="flex-1"
          >
            Next
          </LargeButton>
        </div>
      </div>
    )
  }

  // ------------ Step 4: Temperature (optional) ------------

  if (step === 'temperature') {
    return (
      <div className="flex flex-col gap-4 p-4" data-testid="courier-pickup-screen">
        <StepHeader icon={<Thermometer size={32} aria-hidden />} title="Temperature at Pickup" step={4} total={5} />

        <div className="flex flex-col gap-1">
          <label className="text-lg font-medium text-gray-700" htmlFor="temperature-input">
            Temperature (°C) — optional
          </label>
          <input
            id="temperature-input"
            data-testid="temperature-input"
            type="number"
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            placeholder="e.g. 22"
            className="min-h-[56px] rounded-xl border border-gray-300 px-4 py-3 text-xl focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            inputMode="decimal"
          />
        </div>

        <div className="flex gap-3">
          <BackButton onClick={() => setStep('scan-samples')} />
          <button
            type="button"
            data-testid="skip-temperature-button"
            onClick={() => { setTemperature(''); setStep('summary') }}
            className="min-h-[56px] rounded-xl border border-gray-300 px-5 py-4 text-xl font-semibold text-gray-700 hover:bg-gray-50"
          >
            Skip
          </button>
          <LargeButton onClick={() => setStep('summary')} className="flex-1">
            Next
          </LargeButton>
        </div>
      </div>
    )
  }

  // ------------ Step 5: Summary / Confirm ------------

  function getTemperatureCelsius(): number | undefined {
    if (!temperature) return undefined
    const n = parseFloat(temperature)
    return isNaN(n) ? undefined : n
  }

  async function handleStartTransport() {
    setSubmitting(true)
    setSubmitError(false)
    try {
      const input: StartTransportInput = {
        courierId: courierId.trim(),
        originLocationId,
        destinationLocationId: selectedDestination,
        sampleIds: scannedLabels, // label numbers used as opaque IDs for offline scenario
        pickupTemperature: getTemperatureCelsius(),
      }
      const session = await startTransport(input)

      // P14: Build stub specimens so generateManifest can produce manifest entries.
      // Full specimen records aren't available at pickup time (offline scenario);
      // sampleIds are the label numbers scanned by the courier.
      // TODO: resolve actual location names via getLocationById()
      const stubSamples = session.sampleIds.map((labelId) => ({
        _ultranos: { labSampleId: labelId },
        type: undefined,
      } as unknown as FhirSpecimen))
      // P9: reportManifestGenerated is called inside generateManifest — no manual call needed.
      const manifest = generateManifest(session, stubSamples, {
        origin: { id: originLocationId, name: originLocationId } as never,
        destination: { id: selectedDestination, name: selectedDestination } as never,
      })
      const text = renderManifestText(manifest)

      setManifestText(text)
      setStep('success')
    } catch {
      // CLAUDE.md Rule #1: no PHI or session IDs in error message
      setSubmitError(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'summary') {
    const tempC = getTemperatureCelsius()

    return (
      <div className="flex flex-col gap-4 p-4" data-testid="courier-pickup-screen">
        <StepHeader icon={<ClipboardList size={32} aria-hidden />} title="Confirm Transport" step={5} total={5} />

        <div className="rounded-2xl bg-gray-50 p-5 flex flex-col gap-3">
          <SummaryRow label="Courier ID" value={courierId} />
          <SummaryRow label="Destination" value="Main Laboratory" />
          <SummaryRow label="Samples" value={String(scannedLabels.length)} />
          {tempC != null && (
            <SummaryRow label="Temperature" value={`${tempC}°C`} />
          )}
        </div>

        {submitError && (
          <p className="flex items-center gap-2 text-red-600" role="alert">
            <AlertCircle size={16} aria-hidden /> Failed to start transport. Please try again.
          </p>
        )}

        <div className="flex gap-3">
          <BackButton onClick={() => setStep('temperature')} />
          <LargeButton
            data-testid="start-transport-button"
            onClick={() => void handleStartTransport()}
            disabled={submitting}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            {submitting ? 'Starting…' : 'Start Transport'}
          </LargeButton>
        </div>
      </div>
    )
  }

  // ------------ Success screen ------------

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="courier-pickup-screen">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-green-100">
          <CheckCircle size={48} className="text-green-700" aria-hidden />
        </div>
        <h2 className="text-center text-2xl font-bold text-gray-900">Transport Started</h2>
        <p className="text-center text-xl text-gray-600">
          {scannedLabels.length} sample{scannedLabels.length !== 1 ? 's' : ''} logged for transport
        </p>
      </div>

      {/* Manifest text — no PHI, safe to display per CLAUDE.md Rule #7 */}
      <pre
        data-testid="manifest-text"
        className="rounded-xl bg-gray-50 p-4 text-sm font-mono text-gray-800 overflow-x-auto whitespace-pre-wrap"
      >
        {manifestText}
      </pre>

      <button
        type="button"
        data-testid="done-button"
        onClick={onDone}
        className="min-h-[56px] rounded-xl bg-blue-600 px-6 py-4 text-xl font-semibold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      >
        Done
      </button>
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
  total,
}: {
  icon: React.ReactNode
  title: string
  step: number
  total: number
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Step {step} of {total}
        </p>
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
  'data-testid': testId,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  className?: string
  'data-testid'?: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
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
      aria-label="Back"
    >
      ←
    </button>
  )
}
