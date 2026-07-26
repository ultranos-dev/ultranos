'use client'

import { useTranslations } from 'next-intl'

export interface DuplicateCandidate {
  id: string
  nameGiven?: string
  nameFather?: string
  birthYear?: number
  gender?: string
  districtOrigin?: string
  mpiScore: number
}

interface CandidateComparisonCardProps {
  candidate: DuplicateCandidate
}

function getScoreBadgeClasses(score: number): string {
  if (score >= 90) return 'bg-destructive/20 text-destructive border-destructive/30'
  if (score >= 60) return 'bg-warning/20 text-warning border-warning/30'
  return 'bg-success/20 text-success border-success/30'
}

function getScoreLabel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 90) return 'high'
  if (score >= 60) return 'medium'
  return 'low'
}

/**
 * Displays a single duplicate candidate's demographic fields alongside an
 * MPI similarity score badge. Used inside the expandable rows of the
 * DuplicateReviewTable.
 */
export function CandidateComparisonCard({ candidate }: CandidateComparisonCardProps) {
  const t = useTranslations('duplicateReview')
  const badgeClasses = getScoreBadgeClasses(candidate.mpiScore)
  const scoreLabel = getScoreLabel(candidate.mpiScore)

  const fields: { label: string; value: string | number | undefined }[] = [
    { label: t('fieldGivenName'), value: candidate.nameGiven },
    { label: t('fieldFatherName'), value: candidate.nameFather },
    { label: t('fieldBirthYear'), value: candidate.birthYear },
    { label: t('fieldGender'), value: candidate.gender },
    { label: t('fieldDistrict'), value: candidate.districtOrigin },
  ]

  return (
    <div className="rounded-xl bg-muted p-4 ring-[0.65px] ring-border/50">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {t('candidateId', { id: candidate.id.slice(0, 8) })}
        </span>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums ${badgeClasses}`}
          role="status"
          aria-label={t('scoreAriaLabel', { score: candidate.mpiScore, level: scoreLabel })}
        >
          {t('scoreLabel', { score: candidate.mpiScore })}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {fields.map((field) => (
          <div key={field.label}>
            <dt className="font-medium text-muted-foreground">{field.label}</dt>
            <dd className="mt-0.5 text-foreground">
              {field.value ?? <span className="text-muted-foreground">{t('notAvailable')}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
