/**
 * Outbreak Integration Tests — Story 54.5 (Task 15.7)
 *
 * Full service-layer integration test:
 *   activation → sitrep generation → deactivation cycle
 *
 * Tests the sequence of service calls as they would run in production:
 *   1. activateOutbreakMode (persists config, invalidates cache)
 *   2. isOutbreakModeActive (cache check → returns config)
 *   3. generateDailySitrep (queries results, persists sitrep)
 *   4. deactivateOutbreakMode (updates status, invalidates cache)
 *   5. isOutbreakModeActive (cache miss → returns null)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LabRole } from '@ultranos/shared-types'
import {
  activateOutbreakMode,
  deactivateOutbreakMode,
  isOutbreakModeActive,
  _invalidateOutbreakCache,
} from '../lib/outbreak-service'
import { generateDailySitrep } from '../lib/sitrep-generator'
import type { OutbreakAuthContext } from '../lib/outbreak-service'
import type { OutbreakModeConfig } from '../types/outbreak'
import * as dbModule from '../lib/db'

// ---------------------------------------------------------------------------
// Mutable state shared between mocked modules
// ---------------------------------------------------------------------------

const dbStore: Record<string, OutbreakModeConfig> = {}
let sitrepCount = 0

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock('../lib/db', () => ({
  putOutbreakConfig: vi.fn(),
  getActiveOutbreak: vi.fn(),
  getDb: vi.fn(() => ({
    outbreak_configs: {
      get: vi.fn((id: string) => Promise.resolve(dbStore[id] ?? null)),
      put: vi.fn((config: OutbreakModeConfig) => {
        dbStore[config.id] = config
        return Promise.resolve()
      }),
    },
    lab_results: {
      where: () => ({
        anyOf: () => ({
          toArray: () => Promise.resolve([]),
        }),
      }),
    },
    samples: {
      filter: () => ({
        count: () => Promise.resolve(0),
      }),
    },
    reagent_inventory: {
      where: () => ({
        anyOf: () => ({
          filter: () => ({
            toArray: () => Promise.resolve([]),
          }),
        }),
      }),
      update: vi.fn().mockResolvedValue(1),
    },
  })),
  addDailySitrep: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/hlc', () => ({
  hlc: { now: vi.fn(() => ({ wallTime: 0, logicalTime: 0, nodeId: 'test' })) },
  serializeHlc: vi.fn(() => '2026-05-31T10:00:00Z:0:test'),
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => {
    sitrepCount++
    return `uuid-${sitrepCount}`
  }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const authorizedCtx: OutbreakAuthContext = {
  actorId: 'prac-001',
  actorRole: 'HEALTH_OFFICER',
  actorLabRole: null,
}

const supervisorCtx: OutbreakAuthContext = {
  actorId: 'prac-002',
  actorRole: 'LAB_TECH',
  actorLabRole: LabRole.SUPERVISOR,
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('Outbreak lifecycle integration', () => {
  beforeEach(() => {
    // Clear state
    for (const key of Object.keys(dbStore)) delete dbStore[key]
    sitrepCount = 0
    _invalidateOutbreakCache()
    vi.clearAllMocks()

    // Re-wire mocks after clearAllMocks
    vi.mocked(dbModule.putOutbreakConfig).mockImplementation((config: OutbreakModeConfig) => {
      dbStore[config.id] = config
      return Promise.resolve(undefined)
    })
    vi.mocked(dbModule.getActiveOutbreak).mockImplementation(() => {
      const active = Object.values(dbStore).find((c) => c.status === 'active')
      return Promise.resolve(active ?? null)
    })
    vi.mocked(dbModule.addDailySitrep).mockResolvedValue(undefined)
  })

  it('full cycle: activate → check active → generate sitrep → deactivate → check inactive', async () => {
    // 1. Activate
    const config = await activateOutbreakMode(
      {
        activatedBy: 'prac-001',
        targetPathogen: { code: 'MALARIA', display: 'Malaria' },
        targetTestCodes: ['51587-4'],
        affectedScope: ['loc-001'],
        activationReason: 'WHO alert',
      },
      authorizedCtx,
    )
    expect(config.status).toBe('active')
    expect(config.targetPathogen.code).toBe('MALARIA')

    // 2. isOutbreakModeActive returns the config (cache hit after activation)
    const active = await isOutbreakModeActive()
    expect(active).not.toBeNull()
    expect(active!.id).toBe(config.id)

    // 3. Generate sitrep
    const sitrep = await generateDailySitrep(config, {
      generatedBy: 'prac-001',
      reportDate: '2026-05-31',
    })
    expect(sitrep.outbreakConfigId).toBe(config.id)
    expect(sitrep.syncStatus).toBe('pending')
    expect(dbModule.addDailySitrep).toHaveBeenCalledWith(sitrep)

    // 4. Deactivate (setup db.get to return the config)
    vi.mocked(dbModule.getDb)().outbreak_configs.get = vi.fn().mockResolvedValue({ ...config })
    const deactivated = await deactivateOutbreakMode(config.id, supervisorCtx)
    expect(deactivated.status).toBe('inactive')
    expect(deactivated.deactivatedBy).toBe('prac-002')

    // 5. isOutbreakModeActive now returns null after cache invalidation
    _invalidateOutbreakCache()
    const afterDeactivate = await isOutbreakModeActive()
    expect(afterDeactivate).toBeNull()
  })

  it('prevents activating a second outbreak while one is active', async () => {
    await activateOutbreakMode(
      {
        activatedBy: 'prac-001',
        targetPathogen: { code: 'MALARIA', display: 'Malaria' },
        targetTestCodes: ['51587-4'],
        affectedScope: ['loc-001'],
        activationReason: 'First outbreak',
      },
      authorizedCtx,
    )

    await expect(
      activateOutbreakMode(
        {
          activatedBy: 'prac-001',
          targetPathogen: { code: 'CHOLERA', display: 'Cholera' },
          targetTestCodes: ['9830-1'],
          affectedScope: ['loc-001'],
          activationReason: 'Second outbreak attempt',
        },
        authorizedCtx,
      ),
    ).rejects.toThrow('already active')
  })

  it('deactivation by lab_supervisor (LabRole.SUPERVISOR) is authorized', async () => {
    const config = await activateOutbreakMode(
      {
        activatedBy: 'prac-001',
        targetPathogen: { code: 'TB', display: 'Tuberculosis' },
        targetTestCodes: ['14957-5'],
        affectedScope: ['loc-001'],
        activationReason: 'National directive',
      },
      authorizedCtx,
    )
    vi.mocked(dbModule.getDb)().outbreak_configs.get = vi.fn().mockResolvedValue({ ...config })
    await expect(deactivateOutbreakMode(config.id, supervisorCtx)).resolves.not.toThrow()
  })

  it('generated sitrep has positivity rate of 0 when no results', async () => {
    const config = await activateOutbreakMode(
      {
        activatedBy: 'prac-001',
        targetPathogen: { code: 'MALARIA', display: 'Malaria' },
        targetTestCodes: ['51587-4'],
        affectedScope: ['loc-001'],
        activationReason: 'Test',
      },
      authorizedCtx,
    )
    const sitrep = await generateDailySitrep(config, { reportDate: '2026-05-31' })
    expect(sitrep.totalTestsPerformed).toBe(0)
    expect(sitrep.positivityRate).toBe(0)
  })

  it('uses custom surgeMultiplier when provided during activation', async () => {
    const config = await activateOutbreakMode(
      {
        activatedBy: 'prac-001',
        targetPathogen: { code: 'CHOLERA', display: 'Cholera' },
        targetTestCodes: ['9830-1'],
        affectedScope: ['loc-001'],
        activationReason: 'Test surge',
        surgeMultiplier: 5,
      },
      authorizedCtx,
    )
    expect(config.surgeMultiplier).toBe(5)
  })
})
