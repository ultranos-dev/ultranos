'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import type { TripAnalysis } from '@/lib/trip-optimizer'
import { WaitTimeIndicator } from './WaitTimeIndicator'

interface TripRecommendationProps {
  analysis: TripAnalysis
  /** Optional: patient token for print card (no PHI — token only) */
  patientToken?: string
  /** Optional: lab name for print card */
  labName?: string
}

/**
 * Displays the trip optimization result to the lab tech,
 * who communicates it to the patient before they leave.
 *
 * Icon-heavy design for low-literacy communication.
 * Color coding: green = no return, blue = please wait, amber = return on date.
 *
 * Story 45.5 — Task 3
 */
export function TripRecommendation({
  analysis,
  patientToken,
  labName,
}: TripRecommendationProps) {
  const t = useTranslations('tripOptimizer')

  const { waitTests, remoteTests, returnTests, estimatedWaitMinutes, optimalReturnDate, recommendation } = analysis

  // No tests at all — render nothing
  const hasAnyTests = waitTests.length + remoteTests.length + returnTests.length > 0
  if (!hasAnyTests) return null

  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm print:shadow-none">
      <h2 className="mb-4 text-lg font-bold text-foreground">{t('title')}</h2>

      <div className="flex flex-col gap-4">
        {/* WAIT section — blue */}
        {waitTests.length > 0 && (
          <section
            data-testid="trip-wait-section"
            className="rounded-lg border border-blue-200 bg-blue-50 p-4"
            aria-label={t('waitSection')}
          >
            <div className="mb-3 flex items-center gap-2">
              <span role="img" aria-label="clock" className="text-2xl">🕐</span>
              <p className="text-base font-semibold text-blue-900">
                {t('pleaseWait', { minutes: estimatedWaitMinutes })}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {waitTests.map((profile) => (
                <WaitTimeIndicator key={profile.loincCode} profile={profile} />
              ))}
            </div>
          </section>
        )}

        {/* NO-RETURN section — green */}
        {remoteTests.length > 0 && (
          <section
            data-testid="trip-no-return-section"
            className="rounded-lg border border-green-200 bg-green-50 p-4"
            aria-label={t('noReturnSection')}
          >
            <div className="flex items-center gap-3">
              <span role="img" aria-label="checkmark" className="text-3xl">✅</span>
              <span role="img" aria-label="phone" className="text-2xl">📱</span>
              <p className="text-base font-semibold text-green-900">
                {t('noReturnNeeded')}
              </p>
            </div>
            <p className="mt-2 text-sm text-green-800">{t('doctorWillContact')}</p>
          </section>
        )}

        {/* RETURN section — amber */}
        {returnTests.length > 0 && optimalReturnDate && (
          <section
            data-testid="trip-return-section"
            className="rounded-lg border border-amber-200 bg-amber-50 p-4"
            aria-label={t('returnSection')}
          >
            <div className="mb-2 flex items-center gap-2">
              <span role="img" aria-label="calendar" className="text-2xl">📅</span>
              <p className="text-base font-semibold text-amber-900">
                {t('returnOnDate')}
              </p>
            </div>
            <p className="text-3xl font-bold text-amber-900">{optimalReturnDate}</p>
          </section>
        )}
      </div>

      {/* Print summary card — shown when any content is displayed */}
      <div className="mt-4 print:hidden">
        <button
          data-testid="trip-print-button"
          onClick={handlePrint}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          type="button"
        >
          🖨️ {t('printSummary')}
        </button>
      </div>

      {/* Print-only summary card — no PHI */}
      <div className="hidden print:block mt-6 border-t border-dashed pt-4">
        {labName && <p className="text-sm font-semibold">{labName}</p>}
        {patientToken && (
          <p className="text-sm text-muted-foreground">
            Token: <span className="font-bold">{patientToken}</span>
          </p>
        )}
        {optimalReturnDate && (
          <p className="mt-2 text-2xl font-bold">{optimalReturnDate}</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {t('printSummary')}
        </p>
      </div>
    </div>
  )
}
