/**
 * Certification Progress Calculation Engine — Story 46.6
 *
 * Computes TechnicianProgress by aggregating data from local Dexie tables.
 * Fully offline-capable: all queries are local-first.
 *
 * No PHI: all source tables use opaque IDs (technicianId, LOINC codes).
 */

import { getDb } from '@/lib/db'
import type {
  CertificationPathway,
  CertificationMilestone,
  TechnicianProgress,
  MilestoneProgress,
} from '@/lib/certification-types'

// ---------------------------------------------------------------------------
// Per-category calculators
// ---------------------------------------------------------------------------

async function calculateModulesProgress(
  technicianId: string,
  milestone: CertificationMilestone,
): Promise<number> {
  const db = getDb()
  let query = db.module_completions
    .where('technicianId')
    .equals(technicianId)

  const completions = await query.toArray()
  const passed = completions.filter((c) => c.assessmentPassed)

  if (milestone.requirement.procedureFilter?.length) {
    const modules = await db.micro_learning_modules.toArray()
    const moduleMap = new Map(modules.map((m) => [m.id, m]))
    const filteredPassed = passed.filter((c) => {
      const mod = moduleMap.get(c.moduleId)
      return mod && milestone.requirement.procedureFilter!.includes(mod.procedureRef)
    })
    return filteredPassed.length
  }

  return passed.length
}

async function calculateEducationHoursProgress(technicianId: string): Promise<number> {
  const db = getDb()
  // Sum durationMinutes from completed modules / 60 → hours
  const completions = await db.module_completions
    .where('technicianId')
    .equals(technicianId)
    .toArray()

  if (completions.length === 0) return 0

  const moduleIds = [...new Set(completions.map((c) => c.moduleId))]
  const modules = await db.micro_learning_modules.bulkGet(moduleIds)

  let totalMinutes = 0
  for (const mod of modules) {
    if (mod) totalMinutes += mod.durationMinutes
  }
  return Math.floor(totalMinutes / 60)
}

async function calculateSupervisedProceduresProgress(
  technicianId: string,
  milestone: CertificationMilestone,
): Promise<number> {
  const db = getDb()
  let records = await db.supervised_procedures
    .where('technicianId')
    .equals(technicianId)
    .toArray()

  if (milestone.requirement.procedureFilter?.length) {
    records = records.filter((r) =>
      milestone.requirement.procedureFilter!.includes(r.procedureRef),
    )
  }

  return records.length
}

async function calculateMentorshipProgress(technicianId: string): Promise<number> {
  const db = getDb()

  const checkIns = await db.check_in_records.toArray()
  const journals = await db.learning_journal.toArray()
  const pairings = await db.mentorship_pairings
    .where('[menteeId+status]')
    .equals([technicianId, 'active'])
    .toArray()

  const pairingIds = new Set(pairings.map((p) => p.id))

  const relevantCheckIns = checkIns.filter((c) => pairingIds.has(c.pairingId))
  const relevantJournals = journals.filter(
    (j) => j.authorId === technicianId && pairingIds.has(j.pairingId),
  )

  return relevantCheckIns.length + relevantJournals.length
}

/**
 * Competency milestone — queries procedure_competencies table from Story 46.3.
 * That story is not yet implemented; returns 0 gracefully until it ships.
 */
async function calculateCompetencyProgress(
  technicianId: string,
  milestone: CertificationMilestone,
): Promise<number> {
  try {
    const db = getDb()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableExists = (db as any).tables?.some((t: { name: string }) => t.name === 'procedure_competencies')
    if (!tableExists) return 0

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const records = await (db as any).procedure_competencies
      .where('technicianId')
      .equals(technicianId)
      .toArray()

    const filtered = milestone.requirement.procedureFilter?.length
      ? records.filter((r: { procedureRef: string }) =>
          milestone.requirement.procedureFilter!.includes(r.procedureRef),
        )
      : records

    if (milestone.requirement.type === 'all_green') {
      const allActive = filtered.every((r: { status: string }) => r.status === 'active')
      return allActive && filtered.length > 0 ? milestone.requirement.target : 0
    }

    if (milestone.requirement.type === 'streak_days') {
      // Streak calculation deferred — requires Story 46.3 full implementation
      return 0
    }

    return filtered.filter((r: { status: string }) => r.status === 'active').length
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------------------
// Single-milestone progress resolver
// ---------------------------------------------------------------------------

async function getMilestoneCurrentValue(
  technicianId: string,
  milestone: CertificationMilestone,
): Promise<number> {
  switch (milestone.category) {
    case 'modules':
      return calculateModulesProgress(technicianId, milestone)
    case 'education_hours':
      return calculateEducationHoursProgress(technicianId)
    case 'supervised_procedures':
      return calculateSupervisedProceduresProgress(technicianId, milestone)
    case 'mentorship':
      return calculateMentorshipProgress(technicianId)
    case 'competency':
      return calculateCompetencyProgress(technicianId, milestone)
    default:
      return 0
  }
}

// ---------------------------------------------------------------------------
// Main public API
// ---------------------------------------------------------------------------

/**
 * Calculate full TechnicianProgress for a given pathway.
 * All data sourced from local Dexie tables — works fully offline.
 */
export async function calculateProgress(
  technicianId: string,
  pathway: CertificationPathway,
): Promise<TechnicianProgress> {
  const sorted = [...pathway.milestones].sort((a, b) => a.order - b.order)

  const milestoneProgress: MilestoneProgress[] = await Promise.all(
    sorted.map(async (milestone) => {
      const currentValue = await getMilestoneCurrentValue(technicianId, milestone)
      const targetValue = milestone.requirement.target
      const isComplete = currentValue >= targetValue

      // Preserve existing completedAt if available from stored progress
      return {
        milestoneId: milestone.id,
        currentValue,
        targetValue,
        completedAt: isComplete ? new Date().toISOString() : undefined,
      }
    }),
  )

  // Weighted average: each milestone counts equally
  const overallPercent =
    sorted.length === 0
      ? 0
      : Math.round(
          milestoneProgress.reduce((sum, mp) => {
            return sum + Math.min(mp.currentValue / mp.targetValue, 1)
          }, 0) /
            sorted.length *
            100,
        )

  // Current level = name of the last completed milestone group
  const completedMilestones = sorted.filter((m, i) =>
    milestoneProgress[i] && milestoneProgress[i].currentValue >= milestoneProgress[i].targetValue,
  )
  const currentLevel = completedMilestones.at(-1)?.name ?? null

  return {
    id: `${technicianId}-${pathway.id}`,
    technicianId,
    pathwayId: pathway.id,
    milestoneProgress,
    overallPercent,
    currentLevel,
    updatedAt: new Date().toISOString(),
    syncStatus: 'pending',
  }
}

/**
 * Detect newly completed milestones by comparing old progress with new.
 * Returns array of milestone IDs that were just completed.
 */
export function detectNewlyCompletedMilestones(
  oldProgress: TechnicianProgress | null,
  newProgress: TechnicianProgress,
): string[] {
  if (!oldProgress) {
    return newProgress.milestoneProgress
      .filter((mp) => mp.currentValue >= mp.targetValue)
      .map((mp) => mp.milestoneId)
  }

  const oldMap = new Map(oldProgress.milestoneProgress.map((mp) => [mp.milestoneId, mp]))

  return newProgress.milestoneProgress
    .filter((mp) => {
      const old = oldMap.get(mp.milestoneId)
      const wasComplete = old ? old.currentValue >= old.targetValue : false
      const isNowComplete = mp.currentValue >= mp.targetValue
      return isNowComplete && !wasComplete
    })
    .map((mp) => mp.milestoneId)
}

/**
 * Persist updated progress to Dexie and return newly completed milestone IDs.
 */
export async function saveProgressAndDetectCompletions(
  technicianId: string,
  pathway: CertificationPathway,
): Promise<{ progress: TechnicianProgress; newlyCompletedMilestoneIds: string[] }> {
  const db = getDb()
  const progressId = `${technicianId}-${pathway.id}`

  const [newProgress, oldProgress] = await Promise.all([
    calculateProgress(technicianId, pathway),
    db.technician_progress.get(progressId),
  ])

  // Preserve existing completedAt timestamps for already-completed milestones
  if (oldProgress) {
    const oldMap = new Map(oldProgress.milestoneProgress.map((mp) => [mp.milestoneId, mp]))
    for (const mp of newProgress.milestoneProgress) {
      const prev = oldMap.get(mp.milestoneId)
      if (prev?.completedAt && mp.currentValue >= mp.targetValue) {
        mp.completedAt = prev.completedAt
      }
    }
  }

  const newlyCompletedMilestoneIds = detectNewlyCompletedMilestones(oldProgress ?? null, newProgress)

  await db.technician_progress.put(newProgress)

  return { progress: newProgress, newlyCompletedMilestoneIds }
}
