'use client'

import { useLocale, useTranslations } from 'next-intl'
import { formatDateTime, formatTime } from '@ultranos/ui-kit'
import { useEncounterDetailData, formatVital } from '@/components/patient/useEncounterDetailData'

interface EncounterDetailProps {
  encounterId: string
  encounterDate?: string
  patientId: string
}

export function EncounterDetail({ encounterId, encounterDate, patientId }: EncounterDetailProps) {
  const locale = useLocale() as 'en' | 'ar' | 'prs' | 'ps'
  const t = useTranslations('encounter')
  const tCommon = useTranslations('common')
  const { data, loading } = useEncounterDetailData(encounterId, patientId, { encounterDate })

  if (loading) {
    return (
      <div className="border-t border-border p-4" data-testid="encounter-detail-loading">
        <p className="text-sm text-muted-foreground">{t('loadingDetails')}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="border-t border-border p-4">
        <p className="text-sm text-muted-foreground">{t('unableToLoadDetails')}</p>
      </div>
    )
  }

  return (
    <div
      className="border-t border-border p-4 space-y-4"
      data-testid="encounter-detail"
    >
      {/* Allergy snapshot at time of visit */}
      {data.allergiesAtVisit.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-destructive">
            {t('allergiesAtVisit')}
          </h4>
          <div className="mt-1 flex flex-wrap gap-1">
            {data.allergiesAtVisit.map((a) => (
              <span
                key={a.id}
                className="inline-flex rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-semibold text-destructive"
                dir="auto"
              >
                {a._ultranos?.substanceFreeText || a.code?.text || tCommon('unknown')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Vital Signs */}
      {data.vitals.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {t('vitalSigns')}
          </h4>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.vitals.map((obs) => {
              const v = formatVital(obs)
              return (
                <div
                  key={obs.id}
                  className="rounded-md bg-muted px-3 py-2"
                  data-testid="vital-item"
                >
                  <span className="text-xs font-semibold text-muted-foreground">{v.label}</span>
                  <p className="text-sm font-bold text-foreground">{v.value}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* SOAP Notes — Story 24.1: Show all entries with AI badges */}
      {data.allSoapEntries.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {t('soapNotes')}
          </h4>
          <div className="mt-1 space-y-4">
            {data.allSoapEntries.map((entry) => (
              <div key={entry.id} className="rounded-md border border-border bg-muted p-3">
                {/* AI source badge */}
                <div className="mb-2 flex items-center gap-2">
                  {entry.source === 'AI_GENERATED' && (
                    <span
                      className="inline-flex rounded-full bg-primary/20 px-2 py-0.5 text-xs font-bold text-primary"
                      title={entry.aiModelVersion ? `Model: ${entry.aiModelVersion}` : undefined}
                    >
                      {t('aiGenerated')}
                    </span>
                  )}
                  {entry.source === 'AI_CONFIRMED' && (
                    <span
                      className="inline-flex rounded-full bg-success/20 px-2 py-0.5 text-xs font-bold text-success"
                      title={entry.confirmedBy ? `Confirmed by: ${entry.confirmedBy}${entry.confirmedAt ? ` at ${formatDateTime(entry.confirmedAt, locale)}` : ''}` : undefined}
                    >
                      {t('aiConfirmed')}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatTime(entry.createdAt, locale)}
                  </span>
                </div>
                <div className="space-y-1">
                  {entry.subjective && (
                    <div>
                      <span className="text-xs font-bold text-muted-foreground">{t('sSubjective')}</span>
                      <p className="text-sm text-foreground" dir="auto">{entry.subjective}</p>
                    </div>
                  )}
                  {entry.objective && (
                    <div>
                      <span className="text-xs font-bold text-muted-foreground">{t('oObjective')}</span>
                      <p className="text-sm text-foreground" dir="auto">{entry.objective}</p>
                    </div>
                  )}
                  {entry.assessment && (
                    <div>
                      <span className="text-xs font-bold text-muted-foreground">{t('aAssessment')}</span>
                      <p className="text-sm text-foreground" dir="auto">{entry.assessment}</p>
                    </div>
                  )}
                  {entry.plan && (
                    <div>
                      <span className="text-xs font-bold text-muted-foreground">{t('pPlan')}</span>
                      <p className="text-sm text-foreground" dir="auto">{entry.plan}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diagnoses */}
      {data.diagnoses.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {t('diagnoses')}
          </h4>
          <ul className="mt-1 space-y-1">
            {data.diagnoses.map((c) => (
              <li
                key={c.id}
                className="text-sm text-foreground"
                dir="auto"
                data-testid="diagnosis-item"
              >
                <span className="font-semibold">
                  {c.code?.coding?.[0]?.code && `[${c.code.coding[0].code}] `}
                </span>
                {c.code?.text || c.code?.coding?.[0]?.display || t('unspecified')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Prescriptions */}
      {data.prescriptions.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {t('prescriptions')}
          </h4>
          <ul className="mt-1 space-y-1">
            {data.prescriptions.map((rx) => (
              <li
                key={rx.id}
                className="text-sm text-foreground"
                dir="auto"
                data-testid="prescription-item"
              >
                <span className="font-semibold">
                  {rx.medicationCodeableConcept?.text || t('unknownMedication')}
                </span>
                {rx.dosageInstruction?.[0]?.text && (
                  <span className="ms-2 text-muted-foreground">
                    · {rx.dosageInstruction[0].text}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Empty state if nothing to show */}
      {data.vitals.length === 0 &&
        data.allSoapEntries.length === 0 &&
        data.diagnoses.length === 0 &&
        data.prescriptions.length === 0 &&
        data.allergiesAtVisit.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('noClinicalData')}</p>
        )}
    </div>
  )
}
