'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import type { ExposureType, PepRecommendation, SourceStatus, TechVaccinationStatus } from '@/lib/safety/exposure-protocol'
import { getFirstAidSteps, getPepRecommendation, getExposureTypeLabel } from '@/lib/safety/exposure-protocol'
import { getLastProcessedSample, getSourcePatientStatus, getSourcePatientDisplay } from '@/lib/safety/source-patient-lookup'
import { getPepProviders } from '@/lib/safety/pep-providers'
import { generateIncidentReport, persistIncidentReport, queueExposureNotifications } from '@/lib/safety/incident-report'
import { reportSafetyAuditEvent } from '@/lib/audit-client'
import { useAuthSessionStore } from '@/stores/auth-session-store'

const TOTAL_STEPS = 6

interface ExposureWorkflowProps {
  exposureType: ExposureType
  onClose: () => void
}

// Large text styles for emergency UI
const styles = {
  container: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 10000,
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'auto',
  },
  header: {
    backgroundColor: '#dc2626',
    color: 'white',
    padding: '1rem 1.5rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  body: {
    flex: 1,
    padding: '1.5rem',
    maxWidth: '40rem',
    margin: '0 auto',
    width: '100%',
  },
  stepTitle: {
    fontSize: '1.5rem',   // 24px
    fontWeight: 700,
    color: '#111827',
    margin: '0 0 1rem 0',
  },
  stepText: {
    fontSize: '1.125rem', // 18px
    color: '#1f2937',
    lineHeight: 1.6,
  },
  confirmButton: {
    backgroundColor: '#16a34a',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '1rem 2rem',
    fontSize: '1.125rem',
    fontWeight: 700,
    cursor: 'pointer',
    minHeight: '56px',
    width: '100%',
    marginTop: '1.5rem',
  },
  backButton: {
    backgroundColor: 'transparent',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    borderRadius: '0.5rem',
    padding: '0.75rem 1.5rem',
    fontSize: '1rem',
    cursor: 'pointer',
    minHeight: '48px',
  },
}

export function ExposureWorkflow({ exposureType, onClose }: ExposureWorkflowProps) {
  const t = useTranslations('safety.emergency')
  const session = useAuthSessionStore((s) => s.session)
  const techId = session?.practitionerId ?? 'unknown'

  const [currentStep, setCurrentStep] = useState(1)
  const [confirmedSteps, setConfirmedSteps] = useState<Set<number>>(new Set())
  const [sourcePatientRef, setSourcePatientRef] = useState<string>('')
  const [sourceStatus, setSourceStatus] = useState<SourceStatus>({
    hepB: 'UNKNOWN',
    hiv: 'UNKNOWN',
    hepC: 'UNKNOWN',
  })
  const [techVaccinationStatus] = useState<TechVaccinationStatus>({
    hepBImmunity: 'UNKNOWN',
  })
  const [pepRecommendation, setPepRecommendation] = useState<PepRecommendation | null>(null)
  const [pepProviders, setPepProviders] = useState<Array<{ id: string; name: string; phone: string; address: string; hours: string }>>([])
  const [incidentReportId, setIncidentReportId] = useState<string | null>(null)
  const [sourcePatientDisplay, setSourcePatientDisplay] = useState<{ firstName: string; age: number | null } | null>(null)
  const [location, setLocation] = useState('')
  const [mechanism, setMechanism] = useState('')
  const [firstAidSteps] = useState(() => getFirstAidSteps(exposureType))

  // Emit audit event on mount
  useEffect(() => {
    reportSafetyAuditEvent({
      action: 'EXPOSURE_PROTOCOL_STARTED',
      techId,
      exposureType,
    })
  }, [techId, exposureType])

  // Load source patient on mount
  useEffect(() => {
    void (async () => {
      const sample = await getLastProcessedSample(techId)
      if (sample) {
        setSourcePatientRef(sample.patientRef)
        const display = await getSourcePatientDisplay(sample.patientRef)
        if (display) setSourcePatientDisplay(display)
        const status = await getSourcePatientStatus(sample.patientRef)
        setSourceStatus(status)
      }
    })()
  }, [techId])

  // Load PEP recommendation whenever sourceStatus or exposureType changes
  useEffect(() => {
    const rec = getPepRecommendation(exposureType, sourceStatus, techVaccinationStatus)
    setPepRecommendation(rec)
  }, [exposureType, sourceStatus, techVaccinationStatus])

  // Load PEP providers
  useEffect(() => {
    void getPepProviders().then(setPepProviders)
  }, [])

  const confirmStep = () => {
    setConfirmedSteps((prev) => new Set([...prev, currentStep]))
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((s) => s + 1)
    }
  }

  const goBack = () => {
    if (currentStep > 1) setCurrentStep((s) => s - 1)
  }

  const handleSourcePatientViewed = () => {
    if (sourcePatientRef) {
      reportSafetyAuditEvent({
        action: 'SOURCE_PATIENT_ACCESSED',
        techId,
        patientRef: sourcePatientRef,
      })
    }
    confirmStep()
  }

  const handleGenerateReport = async () => {
    if (!pepRecommendation) return
    try {
      const report = generateIncidentReport({
        exposureType,
        occurredAt: new Date().toISOString(),
        location,
        mechanism,
        sourcePatientRef: sourcePatientRef || 'Patient/unknown',
        sourceStatus,
        techId,
        techVaccinationStatus,
        firstAidActions: firstAidSteps,
        pepRecommendation,
      })
      await persistIncidentReport(report)
      await queueExposureNotifications(report)
      setIncidentReportId(report.id)
      reportSafetyAuditEvent({
        action: 'INCIDENT_REPORT_CREATED',
        incidentId: report.id,
        exposureType,
        techId,
        patientRef: report.sourcePatientRef,
      })
      reportSafetyAuditEvent({
        action: 'EXPOSURE_NOTIFICATION_SENT',
        incidentId: report.id,
        exposureType,
        techId,
      })
      confirmStep()
    } catch {
      // Silent — never block emergency workflow
      confirmStep()
    }
  }

  const stepTitles = [
    t('workflow.steps.firstAid'),
    t('workflow.steps.sourcePatient'),
    t('workflow.steps.sourceStatus'),
    t('workflow.steps.pepRecommendation'),
    t('workflow.steps.providerContact'),
    t('workflow.steps.incidentReport'),
  ]

  return (
    <div role="dialog" aria-modal="true" style={styles.container} dir="auto">
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>
            {t('workflow.title')} — {getExposureTypeLabel(exposureType)}
          </div>
          <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>
            {t('workflow.step', { current: currentStep, total: TOTAL_STEPS })}
          </div>
        </div>
        {/* Progress dots */}
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: i + 1 <= currentStep ? 'white' : 'rgba(255,255,255,0.4)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={styles.body}>
        <h2 style={styles.stepTitle}>{stepTitles[currentStep - 1]}</h2>

        {/* Step 1: First Aid */}
        {currentStep === 1 && (
          <div>
            <p style={{ ...styles.stepText, marginBottom: '1rem', fontWeight: 600, color: '#dc2626' }}>
              {t('firstAid.title')}
            </p>
            <ol style={{ paddingInlineStart: '1.5rem', margin: 0 }}>
              {firstAidSteps.map((step, i) => (
                <li key={i} style={{ ...styles.stepText, marginBottom: '0.75rem' }}>
                  {step}
                </li>
              ))}
            </ol>
            <button type="button" onClick={confirmStep} style={styles.confirmButton}>
              {t('firstAid.confirm')} — {t('workflow.next')}
            </button>
          </div>
        )}

        {/* Step 2: Source Patient */}
        {currentStep === 2 && (
          <div>
            {sourcePatientDisplay ? (
              <div style={{ backgroundColor: '#f3f4f6', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem' }}>
                <div style={{ ...styles.stepText, fontWeight: 600 }}>
                  {t('sourcePatient.lastProcessed')}
                </div>
                <div style={{ fontSize: '1.25rem', marginTop: '0.5rem' }}>
                  {t('sourcePatient.display', { firstName: sourcePatientDisplay.firstName, age: sourcePatientDisplay.age ?? '?' })}
                </div>
              </div>
            ) : sourcePatientRef ? (
              <div style={{ backgroundColor: '#f3f4f6', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem' }}>
                <div style={styles.stepText}>{sourcePatientRef}</div>
              </div>
            ) : (
              <div style={{ marginBottom: '1rem' }}>
                <p style={styles.stepText}>{t('sourcePatient.unknownSource')}</p>
                <input
                  type="text"
                  placeholder={t('sourcePatient.patientRef')}
                  value={sourcePatientRef}
                  onChange={(e) => setSourcePatientRef(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    fontSize: '1.125rem',
                    border: '2px solid #d1d5db',
                    borderRadius: '0.5rem',
                    boxSizing: 'border-box' as const,
                  }}
                />
              </div>
            )}
            <button type="button" onClick={handleSourcePatientViewed} style={styles.confirmButton}>
              {t('workflow.next')}
            </button>
          </div>
        )}

        {/* Step 3: Source Status */}
        {currentStep === 3 && (
          <div>
            {(['hepB', 'hiv', 'hepC'] as const).map((pathogen) => (
              <div
                key={pathogen}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  marginBottom: '0.75rem',
                  borderRadius: '0.5rem',
                  backgroundColor: sourceStatus[pathogen] === 'POSITIVE' ? '#fee2e2' : '#f3f4f6',
                  border: `2px solid ${sourceStatus[pathogen] === 'POSITIVE' ? '#dc2626' : '#d1d5db'}`,
                }}
              >
                <span style={{ ...styles.stepText, fontWeight: 600 }}>
                  {t(`sourceStatus.${pathogen}` as any)}
                </span>
                <span
                  style={{
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: sourceStatus[pathogen] === 'POSITIVE' ? '#dc2626' : sourceStatus[pathogen] === 'NEGATIVE' ? '#16a34a' : '#92400e',
                  }}
                >
                  {t(`sourceStatus.${sourceStatus[pathogen].toLowerCase()}` as any)}
                </span>
              </div>
            ))}
            <p style={{ ...styles.stepText, color: '#92400e', fontSize: '1rem', marginTop: '0.5rem' }}>
              {t('sourceStatus.note')}
            </p>
            <button type="button" onClick={confirmStep} style={styles.confirmButton}>
              {t('workflow.next')}
            </button>
          </div>
        )}

        {/* Step 4: PEP Recommendation */}
        {currentStep === 4 && pepRecommendation && (
          <div>
            <div
              style={{
                backgroundColor: pepRecommendation.urgency === 'IMMEDIATE' ? '#fee2e2' : pepRecommendation.urgency === 'WITHIN_HOURS' ? '#fef3c7' : '#f0fdf4',
                border: `3px solid ${pepRecommendation.urgency === 'IMMEDIATE' ? '#dc2626' : pepRecommendation.urgency === 'WITHIN_HOURS' ? '#d97706' : '#16a34a'}`,
                borderRadius: '0.5rem',
                padding: '1rem',
                marginBottom: '1rem',
              }}
            >
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: pepRecommendation.urgency === 'IMMEDIATE' ? '#dc2626' : pepRecommendation.urgency === 'WITHIN_HOURS' ? '#d97706' : '#16a34a' }}>
                {t(`pep.urgency.${pepRecommendation.urgency}` as any)}
              </div>
              <div style={{ ...styles.stepText, marginTop: '0.5rem' }}>
                {pepRecommendation.referral ? t('pep.referral') : t('pep.noReferral')}
              </div>
            </div>
            <ul style={{ paddingInlineStart: '1.5rem', margin: 0 }}>
              {pepRecommendation.actions.map((action, i) => (
                <li key={i} style={{ ...styles.stepText, marginBottom: '0.5rem' }}>
                  {action}
                </li>
              ))}
            </ul>
            <button type="button" onClick={confirmStep} style={styles.confirmButton}>
              {t('workflow.next')}
            </button>
          </div>
        )}

        {/* Step 5: Provider Contacts */}
        {currentStep === 5 && (
          <div>
            {pepProviders.length === 0 ? (
              <p style={{ ...styles.stepText, color: '#dc2626', fontWeight: 600 }}>
                {t('providers.noProviders')}
              </p>
            ) : (
              pepProviders.map((provider) => (
                <div
                  key={provider.id}
                  style={{
                    border: '2px solid #d1d5db',
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div style={{ ...styles.stepText, fontWeight: 700 }}>{provider.name}</div>
                  <div style={styles.stepText}>{provider.address}</div>
                  <div style={styles.stepText}>{t('providers.hours', { hours: provider.hours })}</div>
                  <a
                    href={`tel:${provider.phone}`}
                    style={{
                      display: 'inline-block',
                      marginTop: '0.5rem',
                      backgroundColor: '#16a34a',
                      color: 'white',
                      padding: '0.5rem 1.25rem',
                      borderRadius: '0.375rem',
                      textDecoration: 'none',
                      fontSize: '1.125rem',
                      fontWeight: 700,
                    }}
                  >
                    {t('providers.call')} {provider.phone}
                  </a>
                </div>
              ))
            )}
            <button type="button" onClick={confirmStep} style={styles.confirmButton}>
              {t('workflow.next')}
            </button>
          </div>
        )}

        {/* Step 6: Incident Report */}
        {currentStep === 6 && (
          <div>
            {incidentReportId ? (
              <div>
                <div style={{ backgroundColor: '#f0fdf4', border: '2px solid #16a34a', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem' }}>
                  <div style={{ ...styles.stepText, fontWeight: 700, color: '#16a34a' }}>
                    {t('report.title')}
                  </div>
                  <div style={styles.stepText}>{t('report.id')}: {incidentReportId.slice(0, 8)}...</div>
                </div>
                <p style={styles.stepText}>{t('notifications.pendingSync')}</p>
                <button type="button" onClick={onClose} style={{ ...styles.confirmButton, backgroundColor: '#1d4ed8' }}>
                  {t('report.complete')}
                </button>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ ...styles.stepText, display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {t('report.location')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('report.locationPlaceholder')}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    style={{ width: '100%', padding: '0.75rem', fontSize: '1.125rem', border: '2px solid #d1d5db', borderRadius: '0.5rem', boxSizing: 'border-box' as const }}
                  />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ ...styles.stepText, display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {t('report.mechanism')}
                  </label>
                  <textarea
                    placeholder={t('report.mechanismPlaceholder')}
                    value={mechanism}
                    onChange={(e) => setMechanism(e.target.value)}
                    rows={3}
                    style={{ width: '100%', padding: '0.75rem', fontSize: '1.125rem', border: '2px solid #d1d5db', borderRadius: '0.5rem', boxSizing: 'border-box' as const, resize: 'vertical' as const }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => { void handleGenerateReport() }}
                  style={styles.confirmButton}
                >
                  {t('workflow.next')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Back button */}
        {currentStep > 1 && !incidentReportId && (
          <button type="button" onClick={goBack} style={{ ...styles.backButton, marginTop: '1rem' }}>
            {t('workflow.back')}
          </button>
        )}
      </div>
    </div>
  )
}
