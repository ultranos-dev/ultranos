'use client'

// ---------------------------------------------------------------------------
// Story 54.2 — CHW Sample Collection Flow
// Multi-step wizard: Identify Patient → Select Sample Type → Display Label
// ---------------------------------------------------------------------------

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { PatientIdentifyScreen, type IdentifiedPatient } from '@/components/chw/PatientIdentifyScreen'
import { SampleTypeSelector } from '@/components/chw/SampleTypeSelector'
import { LabelDisplay } from '@/components/chw/LabelDisplay'
import { collectSample } from '@/lib/chw-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useIsCHWMode } from '@/lib/chw-mode'
import type { CHWSampleType } from '@/types/chw-mode'

type Step = 'identify' | 'sample-type' | 'label'

export default function CHWCollectPage() {
  const params = useParams()
  const locale = Array.isArray(params.locale) ? params.locale[0] : (params.locale ?? 'en')
  const router = useRouter()
  const isChw = useIsCHWMode()
  const session = useAuthSessionStore((s) => s.session)

  const [step, setStep] = useState<Step>('identify')
  const [patient, setPatient] = useState<IdentifiedPatient | null>(null)
  const [sampleType, setSampleType] = useState<CHWSampleType | null>(null)
  const [labelNumber, setLabelNumber] = useState('')
  const [collecting, setCollecting] = useState(false)

  if (!isChw) {
    router.replace(`/${locale}`)
    return null
  }

  async function handleSampleTypeConfirm(type: CHWSampleType) {
    if (!patient) return
    setSampleType(type)
    setCollecting(true)
    try {
      const record = await collectSample({
        patientRef: patient.pid,
        patientFirstName: patient.firstName,
        patientAge: patient.age,
        sampleType: type,
        collectedBy: session?.userId ?? 'unknown',
      })
      setLabelNumber(record.labelNumber)
      setStep('label')
    } finally {
      setCollecting(false)
    }
  }

  if (step === 'identify') {
    return (
      <div className="min-h-screen bg-card">
        <PatientIdentifyScreen
          onIdentified={(p) => {
            setPatient(p)
            setStep('sample-type')
          }}
        />
      </div>
    )
  }

  if (step === 'sample-type') {
    return (
      <div className="min-h-screen bg-card">
        {collecting ? (
          <div className="flex h-32 items-center justify-center text-gray-500 text-xl">…</div>
        ) : (
          <SampleTypeSelector onConfirm={(t) => void handleSampleTypeConfirm(t)} />
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-card">
      <LabelDisplay
        labelNumber={labelNumber}
        patientAge={patient?.age ?? 0}
        sampleType={sampleType ?? 'other'}
        onDone={() => router.replace(`/${locale}/chw`)}
      />
    </div>
  )
}
