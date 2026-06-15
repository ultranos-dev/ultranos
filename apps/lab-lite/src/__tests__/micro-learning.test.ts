/**
 * Micro-Learning Module Tests — Story 46.2
 * Tasks 1, 2, 5, 6 (data model, trigger engine, assessment scoring, sync)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import {
  getDb,
  addMicroLearningModule,
  getMicroLearningModuleByProcedure,
  addModuleCompletion,
  getPendingModuleCompletions,
  markModuleCompletionsSynced,
  upsertMicroLearningModules,
} from '../lib/db'
import type {
  MicroLearningModule,
  ModuleCompletion,
} from '../lib/micro-learning-types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModule(overrides: Partial<MicroLearningModule> = {}): MicroLearningModule {
  return {
    id: crypto.randomUUID(),
    procedureRef: 'CBC-85025',
    procedureName: 'Complete Blood Count',
    title: 'CBC Refresher',
    content: [
      { stepNumber: 1, text: '## Collect sample', imageAlt: 'Tube collection' },
      { stepNumber: 2, text: '## Load analyzer' },
    ],
    keyTips: ['Always verify patient ID', 'Check reagent expiry'],
    selfAssessment: [
      {
        id: 'q1',
        question: 'What is the first step?',
        options: ['Collect sample', 'Run QC', 'Label tube'],
        correctIndex: 0,
      },
      {
        id: 'q2',
        question: 'How should reagents be stored?',
        options: ['Room temp', 'Refrigerated', 'Frozen'],
        correctIndex: 1,
      },
    ],
    durationMinutes: 3,
    version: '1.0.0',
    meta: {
      lastUpdated: '2026-05-01T00:00:00.000Z',
      versionId: '1',
    },
    ...overrides,
  }
}

function makeCompletion(overrides: Partial<ModuleCompletion> = {}): ModuleCompletion {
  return {
    id: crypto.randomUUID(),
    moduleId: 'mod-1',
    moduleVersion: '1.0.0',
    technicianId: 'tech-1',
    completedAt: new Date().toISOString(),
    assessmentScore: 1,
    assessmentPassed: true,
    syncStatus: 'pending',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Task 1: Data Model & Dexie Schema
// ---------------------------------------------------------------------------

describe('MicroLearningModule Dexie CRUD (Task 1)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.micro_learning_modules.clear()
    await db.module_completions.clear()
  })

  afterEach(async () => {
    const db = getDb()
    await db.micro_learning_modules.clear()
    await db.module_completions.clear()
  })

  it('stores and retrieves a module by procedureRef', async () => {
    const mod = makeModule({ id: 'mod-1', procedureRef: 'CBC-85025' })
    await addMicroLearningModule(mod)

    const result = await getMicroLearningModuleByProcedure('CBC-85025')
    expect(result).toBeDefined()
    expect(result!.procedureName).toBe('Complete Blood Count')
    expect(result!.durationMinutes).toBe(3)
  })

  it('module contains correct structure with all required fields', () => {
    const mod = makeModule()
    expect(mod.id).toBeDefined()
    expect(mod.procedureRef).toBeDefined()
    expect(mod.procedureName).toBeDefined()
    expect(mod.title).toBeDefined()
    expect(mod.content).toBeInstanceOf(Array)
    expect(mod.keyTips).toBeInstanceOf(Array)
    expect(mod.selfAssessment).toBeInstanceOf(Array)
    expect(mod.durationMinutes).toBeTypeOf('number')
    expect(mod.version).toBeDefined()
    expect(mod.meta.lastUpdated).toBeDefined()
    expect(mod.meta.versionId).toBeDefined()
  })

  it('module content steps support optional base64 images', () => {
    const mod = makeModule({
      content: [
        {
          stepNumber: 1,
          text: '## Step 1',
          imageBase64: 'base64data==',
          imageMimeType: 'image/png',
          imageAlt: 'Collection tube',
        },
      ],
    })
    expect(mod.content[0]!.imageBase64).toBe('base64data==')
    expect(mod.content[0]!.imageMimeType).toBe('image/png')
    expect(mod.content[0]!.imageAlt).toBe('Collection tube')
  })

  it('upserts modules (insert + update)', async () => {
    const mod = makeModule({ id: 'mod-upsert', version: '1.0.0' })
    await upsertMicroLearningModules([mod])

    let result = await getMicroLearningModuleByProcedure(mod.procedureRef)
    expect(result!.version).toBe('1.0.0')

    const updated = { ...mod, version: '2.0.0', meta: { lastUpdated: '2026-06-01T00:00:00.000Z', versionId: '2' } }
    await upsertMicroLearningModules([updated])

    result = await getMicroLearningModuleByProcedure(mod.procedureRef)
    expect(result!.version).toBe('2.0.0')
  })
})

describe('ModuleCompletion Dexie CRUD (Task 1)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.module_completions.clear()
  })

  afterEach(async () => {
    const db = getDb()
    await db.module_completions.clear()
  })

  it('stores a completion record with pending syncStatus', async () => {
    const completion = makeCompletion({ id: 'c1', moduleId: 'mod-1', technicianId: 'tech-1' })
    await addModuleCompletion(completion)

    const pending = await getPendingModuleCompletions()
    expect(pending).toHaveLength(1)
    expect(pending[0]!.id).toBe('c1')
    expect(pending[0]!.syncStatus).toBe('pending')
  })

  it('marks completions as synced', async () => {
    await addModuleCompletion(makeCompletion({ id: 'c1', syncStatus: 'pending' }))
    await addModuleCompletion(makeCompletion({ id: 'c2', syncStatus: 'pending' }))

    await markModuleCompletionsSynced(['c1', 'c2'])

    const pending = await getPendingModuleCompletions()
    expect(pending).toHaveLength(0)

    const db = getDb()
    const record = await db.module_completions.get('c1')
    expect(record!.syncStatus).toBe('synced')
  })

  it('failed assessment (score < 66%) is stored with assessmentPassed=false', async () => {
    const completion = makeCompletion({
      id: 'c-fail',
      assessmentScore: 0,
      assessmentPassed: false,
    })
    await addModuleCompletion(completion)

    const db = getDb()
    const record = await db.module_completions.get('c-fail')
    expect(record!.assessmentPassed).toBe(false)
    // Completion still recorded — low-stakes, no gatekeeping
    expect(record).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Task 2: Trigger Engine
// ---------------------------------------------------------------------------

describe('Trigger Engine — evaluateTriggers (Task 2)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.micro_learning_modules.clear()
    await db.module_completions.clear()
    await db.lab_results.clear()
    await db.sop_acknowledgments.clear()
    await db.sops.clear()
  })

  afterEach(async () => {
    const db = getDb()
    await db.micro_learning_modules.clear()
    await db.module_completions.clear()
    await db.lab_results.clear()
    await db.sop_acknowledgments.clear()
    await db.sops.clear()
  })

  it('returns first_time trigger when tech has never performed this procedure', async () => {
    const db = getDb()
    const mod = makeModule({ id: 'mod-cbc', procedureRef: 'CBC-85025' })
    await db.micro_learning_modules.put(mod)

    const { evaluateTriggers } = await import('../lib/learning-trigger-engine')
    const result = await evaluateTriggers('tech-1', 'CBC-85025')

    expect(result).not.toBeNull()
    expect(result!.type).toBe('first_time')
    expect(result!.moduleId).toBe('mod-cbc')
    expect(result!.procedureName).toBe('Complete Blood Count')
    expect(result!.durationMinutes).toBe(3)
  })

  it('returns skill_decay trigger when last procedure was >30 days ago', async () => {
    const db = getDb()
    const mod = makeModule({ id: 'mod-cbc', procedureRef: 'CBC-85025' })
    await db.micro_learning_modules.put(mod)

    // Insert a result from 31 days ago
    const oldDate = new Date()
    oldDate.setDate(oldDate.getDate() - 31)
    await db.lab_results.put({
      id: 'r-old',
      sampleId: 'sample-1',
      templateId: 'tpl-cbc',
      templateVersion: '1.0.0',
      status: 'completed',
      enteredBy: 'tech-1',
      enteredAt: oldDate.toISOString(),
      updatedAt: oldDate.toISOString(),
      loincCode: 'CBC-85025',
    })

    const { evaluateTriggers } = await import('../lib/learning-trigger-engine')
    const result = await evaluateTriggers('tech-1', 'CBC-85025')

    expect(result).not.toBeNull()
    expect(result!.type).toBe('skill_decay')
  })

  it('returns null when tech performed procedure within 30 days', async () => {
    const db = getDb()
    const mod = makeModule({ id: 'mod-cbc', procedureRef: 'CBC-85025' })
    await db.micro_learning_modules.put(mod)

    // Insert a recent result
    const recentDate = new Date()
    recentDate.setDate(recentDate.getDate() - 5)
    await db.lab_results.put({
      id: 'r-recent',
      sampleId: 'sample-2',
      templateId: 'tpl-cbc',
      templateVersion: '1.0.0',
      status: 'completed',
      enteredBy: 'tech-1',
      enteredAt: recentDate.toISOString(),
      updatedAt: recentDate.toISOString(),
      loincCode: 'CBC-85025',
    })

    const { evaluateTriggers } = await import('../lib/learning-trigger-engine')
    const result = await evaluateTriggers('tech-1', 'CBC-85025')

    expect(result).toBeNull()
  })

  it('returns new_sop trigger when there is an unacknowledged SOP for this procedure', async () => {
    const db = getDb()
    const mod = makeModule({ id: 'mod-cbc', procedureRef: 'CBC-85025', relatedSopId: 'sop-1' })
    await db.micro_learning_modules.put(mod)

    // Recent result (no decay trigger)
    const recentDate = new Date()
    recentDate.setDate(recentDate.getDate() - 2)
    await db.lab_results.put({
      id: 'r-recent2',
      sampleId: 'sample-3',
      templateId: 'tpl-cbc',
      templateVersion: '1.0.0',
      status: 'completed',
      enteredBy: 'tech-1',
      enteredAt: recentDate.toISOString(),
      updatedAt: recentDate.toISOString(),
      loincCode: 'CBC-85025',
    })

    // SOP with version 2.0.0 exists but tech only acknowledged 1.0.0
    await db.sops.put({
      id: 'sop-1',
      title: 'CBC SOP',
      version: '2.0.0',
      effectiveDate: '2026-05-01',
      author: 'Lab Manager',
      category: 'HEMATOLOGY',
      content: '## Updated CBC SOP',
      images: [],
      status: 'active',
      meta: { lastUpdated: '2026-05-01T00:00:00.000Z', versionId: '2' },
    })
    await db.sop_acknowledgments.put({
      id: 'ack-1',
      sopId: 'sop-1',
      sopVersion: '1.0.0',
      technicianId: 'tech-1',
      acknowledgedAt: '2026-01-01T00:00:00.000Z',
      syncStatus: 'synced',
    })

    const { evaluateTriggers } = await import('../lib/learning-trigger-engine')
    const result = await evaluateTriggers('tech-1', 'CBC-85025')

    expect(result).not.toBeNull()
    expect(result!.type).toBe('new_sop')
  })

  it('returns null when no module exists for this procedure', async () => {
    const { evaluateTriggers } = await import('../lib/learning-trigger-engine')
    const result = await evaluateTriggers('tech-1', 'UNKNOWN-PROC-99999')
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Task 5: Assessment Scoring
// ---------------------------------------------------------------------------

import {
  calculateAssessmentScore,
  isAssessmentPassed,
} from '../lib/learning-trigger-engine'

describe('Assessment Scoring (Task 5)', () => {
  it('calculates score as correct / total', () => {
    expect(calculateAssessmentScore(2, 3)).toBeCloseTo(2 / 3)
    expect(calculateAssessmentScore(3, 3)).toBe(1)
    expect(calculateAssessmentScore(0, 3)).toBe(0)
  })

  it('passes at >= 66% threshold (default)', () => {
    expect(isAssessmentPassed(2, 3)).toBe(true)   // 66.6%
    expect(isAssessmentPassed(1, 3)).toBe(false)  // 33.3%
    expect(isAssessmentPassed(3, 3)).toBe(true)   // 100%
    expect(isAssessmentPassed(0, 2)).toBe(false)  // 0%
    expect(isAssessmentPassed(1, 2)).toBe(false)  // 50% — below 66%
  })

  it('respects custom threshold', () => {
    expect(isAssessmentPassed(1, 2, 0.5)).toBe(true)   // 50% >= 50%
    expect(isAssessmentPassed(1, 3, 0.8)).toBe(false)  // 33% < 80%
  })
})

// ---------------------------------------------------------------------------
// Task 6: Module Sync
// ---------------------------------------------------------------------------

describe('syncModules (Task 6)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.micro_learning_modules.clear()
    await db.module_completions.clear()
  })

  afterEach(async () => {
    const db = getDb()
    await db.micro_learning_modules.clear()
    await db.module_completions.clear()
  })

  it('syncs modules from hub and upserts into Dexie', async () => {
    const remoteMods = [
      makeModule({ id: 'remote-1', procedureRef: 'CBC-85025', version: '1.0.0' }),
      makeModule({ id: 'remote-2', procedureRef: 'UA-81001', version: '2.0.0', procedureName: 'Urinalysis' }),
    ]

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: { data: { json: { modules: remoteMods } } },
      }),
    } as unknown as Response)

    const { syncModules } = await import('../lib/module-sync')
    const result = await syncModules('fake-token')

    expect(result.newCount).toBe(2)
    expect(result.updatedCount).toBe(0)
    expect(result.totalModules).toBe(2)

    const db = getDb()
    const stored = await db.micro_learning_modules.toArray()
    expect(stored).toHaveLength(2)
  })

  it('updates modules when meta.lastUpdated is newer', async () => {
    const db = getDb()
    const existing = makeModule({ id: 'remote-1', procedureRef: 'CBC-85025', version: '1.0.0', meta: { lastUpdated: '2026-01-01T00:00:00.000Z', versionId: '1' } })
    await db.micro_learning_modules.put(existing)

    const remoteMods = [
      { ...existing, version: '2.0.0', meta: { lastUpdated: '2026-06-01T00:00:00.000Z', versionId: '2' } },
    ]

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: { data: { json: { modules: remoteMods } } },
      }),
    } as unknown as Response)

    const { syncModules } = await import('../lib/module-sync')
    const result = await syncModules('fake-token')

    expect(result.newCount).toBe(0)
    expect(result.updatedCount).toBe(1)

    const stored = await db.micro_learning_modules.get('remote-1')
    expect(stored!.version).toBe('2.0.0')
  })

  it('syncs pending completions back to hub', async () => {
    const db = getDb()
    await db.module_completions.put(makeCompletion({ id: 'c1', syncStatus: 'pending' }))

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as unknown as Response)

    const { syncModuleCompletions } = await import('../lib/module-sync')
    const count = await syncModuleCompletions('fake-token')

    expect(count).toBe(1)

    const pending = await getPendingModuleCompletions()
    expect(pending).toHaveLength(0)
  })

  it('returns 0 when no pending completions', async () => {
    const { syncModuleCompletions } = await import('../lib/module-sync')
    const count = await syncModuleCompletions('fake-token')
    expect(count).toBe(0)
  })
})
