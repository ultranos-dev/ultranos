'use client'

// ---------------------------------------------------------------------------
// Story 54.2 — Patient Identification Screen
// Two pathways: QR scan (Health Passport) or name + father's name entry.
// On success: shows first name + age confirmation, then proceeds to sample type.
// ---------------------------------------------------------------------------

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { QrCode, Keyboard, User, AlertCircle } from '@ultranos/ui-kit/icons'
import { identifyPatientByQR, identifyPatientByName } from '@/lib/chw-service'

export interface IdentifiedPatient {
  pid: string
  firstName: string
  age: number
  identifiedBy: 'qr' | 'name'
}

interface Props {
  onIdentified: (patient: IdentifiedPatient) => void
}

type Mode = 'choose' | 'qr' | 'name' | 'confirmed'

export function PatientIdentifyScreen({ onIdentified }: Props) {
  const t = useTranslations('chw.identify')
  const [mode, setMode] = useState<Mode>('choose')
  const [patient, setPatient] = useState<IdentifiedPatient | null>(null)
  const [firstName, setFirstName] = useState('')
  const [fatherName, setFatherName] = useState('')
  const [searching, setSearching] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [qrInput, setQrInput] = useState('')
  const [qrError, setQrError] = useState(false)

  // ------------ QR path ------------

  function handleQRScan() {
    setQrError(false)
    const result = identifyPatientByQR(qrInput.trim())
    if (result) {
      const identified: IdentifiedPatient = { ...result, identifiedBy: 'qr' }
      setPatient(identified)
      setMode('confirmed')
    } else {
      setQrError(true)
    }
  }

  // ------------ Name path ------------

  async function handleNameSearch() {
    if (!firstName.trim()) return
    setSearching(true)
    setNotFound(false)
    try {
      const result = await identifyPatientByName(firstName, fatherName)
      if (result) {
        const identified: IdentifiedPatient = { ...result, identifiedBy: 'name' }
        setPatient(identified)
        setMode('confirmed')
      } else {
        // Not found — allow continuing with a temp patient reference
        setNotFound(true)
      }
    } finally {
      setSearching(false)
    }
  }

  function handleContinueWithoutMatch() {
    // Use a temp reference that links on sync
    const tempPid = `temp-${crypto.randomUUID()}`
    const identified: IdentifiedPatient = {
      pid: tempPid,
      firstName: firstName.trim(),
      age: 0, // unknown — will be linked on sync
      identifiedBy: 'name',
    }
    setPatient(identified)
    setMode('confirmed')
  }

  function handleConfirm() {
    if (patient) onIdentified(patient)
  }

  // ------------ Choose mode screen ------------

  if (mode === 'choose') {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h2 className="text-center text-2xl font-bold text-gray-900">{t('title')}</h2>
        <ChoiceButton
          icon={<QrCode size={48} aria-hidden />}
          label={t('scanQR')}
          onClick={() => setMode('qr')}
          color="bg-blue-600 hover:bg-blue-700"
        />
        <ChoiceButton
          icon={<Keyboard size={48} aria-hidden />}
          label={t('enterName')}
          onClick={() => setMode('name')}
          color="bg-green-600 hover:bg-green-700"
        />
      </div>
    )
  }

  // ------------ QR scan screen ------------

  if (mode === 'qr') {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h2 className="text-center text-2xl font-bold text-gray-900">{t('scanQR')}</h2>
        {/* QR viewfinder placeholder — real impl uses device camera */}
        <div className="flex h-48 items-center justify-center rounded-2xl border-4 border-dashed border-blue-300 bg-blue-50">
          <QrCode size={64} className="text-blue-400" aria-hidden />
        </div>
        {/* Manual QR data entry (for testing and external scanners) */}
        <input
          type="text"
          value={qrInput}
          onChange={(e) => setQrInput(e.target.value)}
          placeholder="Scan or paste QR data"
          className="min-h-[48px] rounded-xl border border-gray-300 px-4 py-3 text-lg"
          aria-label="QR data"
        />
        {qrError && (
          <p className="flex items-center gap-2 text-red-600" role="alert">
            <AlertCircle size={16} aria-hidden /> Invalid or expired QR code
          </p>
        )}
        <LargeButton onClick={handleQRScan} disabled={!qrInput.trim()}>
          {t('continue')}
        </LargeButton>
        <BackButton onClick={() => setMode('choose')} />
      </div>
    )
  }

  // ------------ Name entry screen ------------

  if (mode === 'name') {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h2 className="text-center text-2xl font-bold text-gray-900">{t('title')}</h2>
        <LargeInput
          label={t('patientName')}
          placeholder={t('namePlaceholder')}
          value={firstName}
          onChange={setFirstName}
        />
        <LargeInput
          label={t('fatherName')}
          placeholder={t('fatherPlaceholder')}
          value={fatherName}
          onChange={setFatherName}
        />
        <LargeButton onClick={handleNameSearch} disabled={!firstName.trim() || searching}>
          {searching ? '…' : t('searchButton')}
        </LargeButton>
        {notFound && (
          <div className="rounded-xl bg-amber-50 p-4 text-amber-800">
            <p className="text-lg">{t('notFound')}</p>
            <LargeButton
              onClick={handleContinueWithoutMatch}
              className="mt-3 bg-amber-600 hover:bg-amber-700"
            >
              {t('continue')}
            </LargeButton>
          </div>
        )}
        <BackButton onClick={() => setMode('choose')} />
      </div>
    )
  }

  // ------------ Confirmed screen ------------

  return (
    <div className="flex flex-col items-center gap-6 p-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
        <User size={40} className="text-green-700" aria-hidden />
      </div>
      <h2 className="text-2xl font-bold text-gray-900">{t('confirmed')}</h2>
      {patient && (
        <div className="rounded-2xl bg-gray-50 px-8 py-6 text-center">
          <p className="text-4xl font-bold text-gray-900">{patient.firstName}</p>
          {patient.age > 0 && (
            <p className="mt-2 text-xl text-gray-600">{patient.age} yrs</p>
          )}
        </div>
      )}
      <LargeButton onClick={handleConfirm} className="w-full">
        {t('continue')}
      </LargeButton>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ChoiceButton({
  icon,
  label,
  onClick,
  color,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  color: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[96px] w-full flex-col items-center justify-center gap-3 rounded-2xl px-4 py-5 text-white shadow-md transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${color}`}
    >
      {icon}
      <span className="text-xl font-semibold">{label}</span>
    </button>
  )
}

function LargeInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string
  placeholder: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-lg font-medium text-gray-700">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[56px] rounded-xl border border-gray-300 px-4 py-3 text-xl focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
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
      className={`min-h-[56px] w-full rounded-xl bg-blue-600 px-6 py-4 text-xl font-semibold text-white hover:bg-blue-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${className}`}
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
      className="mt-2 text-lg text-gray-500 underline"
    >
      ← Back
    </button>
  )
}
