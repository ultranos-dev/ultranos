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
  if (score >= 90) return 'bg-red-100 text-red-800 border-red-300'
  if (score >= 60) return 'bg-amber-100 text-amber-800 border-amber-300'
  return 'bg-green-100 text-green-800 border-green-300'
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
    <div className="rounded-xl bg-neutral-50/70 backdrop-blur-md p-4 ring-[0.65px] ring-gray-400/40">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
          {t('candidateId', { id: candidate.id.slice(0, 8) })}
        </span>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${badgeClasses}`}
          role="status"
          aria-label={t('scoreAriaLabel', { score: candidate.mpiScore, level: scoreLabel })}
        >
          {t('scoreLabel', { score: candidate.mpiScore })}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {fields.map((field) => (
          <div key={field.label}>
            <dt className="font-medium text-neutral-500">{field.label}</dt>
            <dd className="mt-0.5 text-neutral-900">
              {field.value ?? <span className="text-neutral-400">{t('notAvailable')}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
