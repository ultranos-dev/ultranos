/**
 * Outbreak Service Tests — Story 54.5 (Task 15.1)
 *
 * Unit tests for outbreak-service.ts:
 *   - Role authorization (health_officer, lab_supervisor, unauthorized)
 *   - Activation: valid input, duplicate active outbreak
 *   - Deactivation: valid, already inactive, not found
 *   - Queue priority calculation
 *   - isOutbreakModeActive caching
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LabRole } from '@ultranos/shared-types'
import {
  isOutbreakAuthorized,
  activateOutbreakMode,
  deactivateOutbreakMode,
  isOutbreakModeActive,
  getOutbreakQueuePriority,
  OutbreakAuthorizationError,
  _invalidateOutbreakCache,
} from '../lib/outbreak-service'
import type { OutbreakAuthContext } from '../lib/outbreak-service'
import type { OutbreakModeConfig } from '../types/outbreak'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockConfig: OutbreakModeConfig = {
  id: 'test-config-1',
  status: 'active',
  activatedBy: 'prac-001',
  activatedAt: '2026-05-31T10:00:00Z:0:test',
  deactivatedBy: null,
  deactivatedAt: null,
  targetPathogen: { code: 'MALARIA', display: 'Malaria' },
  targetTestCodes: ['51587-4'],
  affectedScope: ['loc-001', 'loc-002'],
  activationReason: 'WHO alert',
  surgeMultiplier: 3,
  meta: { lastUpdated: '2026-05-31T10:00:00Z', versionId: '1' },
  _ultranos: { createdAt: '2026-05-31T10:00:00Z', hlcTimestamp: '2026-05-31T10:00:00Z:0:test' },
}

// ---------------------------------------------------------------------------
// Stable mock DB object — getDb() always returns this same reference
// ---------------------------------------------------------------------------

const mockOutbreakConfigsGet = vi.fn()
const mockOutbreakConfigsPut = vi.fn().mockResolvedValue(undefined)

const mockDb = {
  outbreak_configs: {
    put: mockOutbreakConfigsPut,
    get: mockOutbreakConfigsGet,
    where: vi.fn(() => ({
      equals: vi.fn(() => ({
        first: vi.fn().mockResolvedValue(null),
      })),
    })),
  },
  reagent_inventory: {
    where: vi.fn(() => ({
      anyOf: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([]),
      })),
    })),
    update: vi.fn().mockResolvedValue(1),
  },
}

vi.mock('../lib/db', () => ({
  getDb: vi.fn(() => mockDb),
  putOutbreakConfig: vi.fn().mockResolvedValue(undefined),
  getActiveOutbreak: vi.fn().mockResolvedValue(null),
}))

vi.mock('../lib/hlc', () => ({
  hlc: { now: vi.fn(() => ({ wallTime: 0, logicalTime: 0, nodeId: 'test' })) },
  serializeHlc: vi.fn(() => '2026-05-31T10:00:00Z:0:test'),
}))

// ---------------------------------------------------------------------------
// Module-level import
// ---------------------------------------------------------------------------

import * as db from '../lib/db'

// ---------------------------------------------------------------------------
// isOutbreakAuthorized
// ---------------------------------------------------------------------------

describe('isOutbreakAuthorized', () => {
  it('authorizes health_officer role', () => {
    const ctx: OutbreakAuthContext = { actorId: 'u1', actorRole: 'HEALTH_OFFICER', actorLabRole: null }
    expect(isOutbreakAuthorized(ctx)).toBe(true)
  })

  it('authorizes SUPERVISOR lab role', () => {
    const ctx: OutbreakAuthContext = { actorId: 'u2', actorRole: 'LAB_TECH', actorLabRole: LabRole.SUPERVISOR }
    expect(isOutbreakAuthorized(ctx)).toBe(true)
  })

  it('authorizes LAB_MANAGER lab role', () => {
    const ctx: OutbreakAuthContext = { actorId: 'u3', actorRole: 'LAB_TECH', actorLabRole: LabRole.LAB_MANAGER }
    expect(isOutbreakAuthorized(ctx)).toBe(true)
  })

  it('rejects regular LAB_TECH', () => {
    const ctx: OutbreakAuthContext = { actorId: 'u4', actorRole: 'LAB_TECH', actorLabRole: LabRole.LAB_TECH }
    expect(isOutbreakAuthorized(ctx)).toBe(false)
  })

  it('rejects SENIOR_TECH', () => {
    const ctx: OutbreakAuthContext = { actorId: 'u5', actorRole: 'LAB_TECH', actorLabRole: LabRole.SENIOR_TECH }
    expect(isOutbreakAuthorized(ctx)).toBe(false)
  })

  it('rejects null role and null labRole', () => {
    const ctx: OutbreakAuthContext = { actorId: 'u6', actorRole: 'PATIENT', actorLabRole: null }
    expect(isOutbreakAuthorized(ctx)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// activateOutbreakMode
// ---------------------------------------------------------------------------

describe('activateOutbreakMode', () => {
  const authorizedCtx: OutbreakAuthContext = {
    actorId: 'prac-001',
    actorRole: 'HEALTH_OFFICER',
    actorLabRole: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    _invalidateOutbreakCache()
    vi.mocked(db.getActiveOutbreak).mockResolvedValue(null)
    vi.mocked(db.putOutbreakConfig).mockResolvedValue(undefined)
    mockOutbreakConfigsGet.mockImplementation((id: string) =>
      id === 'test-config-1' ? Promise.resolve({ ...mockConfig }) : Promise.resolve(null),
    )
  })

  it('creates an active config for authorized user', async () => {
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
    expect(config.surgeMultiplier).toBe(3)
    expect(config.deactivatedBy).toBeNull()
    expect(db.putOutbreakConfig).toHaveBeenCalledWith(config)
  })

  it('uses custom surgeMultiplier when provided', async () => {
    const config = await activateOutbreakMode(
      {
        activatedBy: 'prac-001',
        targetPathogen: { code: 'TB', display: 'Tuberculosis' },
        targetTestCodes: ['14957-5'],
        affectedScope: ['loc-001'],
        activationReason: 'National directive',
        surgeMultiplier: 5,
      },
      authorizedCtx,
    )
    expect(config.surgeMultiplier).toBe(5)
  })

  it('throws OutbreakAuthorizationError for unauthorized role', async () => {
    const unauthorizedCtx: OutbreakAuthContext = {
      actorId: 'u4',
      actorRole: 'LAB_TECH',
      actorLabRole: LabRole.LAB_TECH,
    }
    await expect(
      activateOutbreakMode(
        {
          activatedBy: 'u4',
          targetPathogen: { code: 'MALARIA', display: 'Malaria' },
          targetTestCodes: ['51587-4'],
          affectedScope: ['loc-001'],
          activationReason: 'Test',
        },
        unauthorizedCtx,
      ),
    ).rejects.toThrow(OutbreakAuthorizationError)
  })

  it('throws if another outbreak is already active', async () => {
    vi.mocked(db.getActiveOutbreak).mockResolvedValue(mockConfig)
    await expect(
      activateOutbreakMode(
        {
          activatedBy: 'prac-001',
          targetPathogen: { code: 'CHOLERA', display: 'Cholera' },
          targetTestCodes: ['9830-1'],
          affectedScope: ['loc-001'],
          activationReason: 'Test',
        },
        authorizedCtx,
      ),
    ).rejects.toThrow('already active')
  })
})

// ---------------------------------------------------------------------------
// deactivateOutbreakMode
// ---------------------------------------------------------------------------

describe('deactivateOutbreakMode', () => {
  const authorizedCtx: OutbreakAuthContext = {
    actorId: 'prac-002',
    actorRole: 'LAB_TECH',
    actorLabRole: LabRole.LAB_MANAGER,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    _invalidateOutbreakCache()
    vi.mocked(db.putOutbreakConfig).mockResolvedValue(undefined)
  })

  it('deactivates an active config', async () => {
    mockOutbreakConfigsGet.mockResolvedValue({ ...mockConfig })
    const updated = await deactivateOutbreakMode('test-config-1', authorizedCtx)
    expect(updated.status).toBe('inactive')
    expect(updated.deactivatedBy).toBe('prac-002')
    expect(updated.deactivatedAt).toBeTruthy()
  })

  it('throws for unauthorized role', async () => {
    const unauthorizedCtx: OutbreakAuthContext = {
      actorId: 'u4',
      actorRole: 'LAB_TECH',
      actorLabRole: LabRole.LAB_TECH,
    }
    await expect(
      deactivateOutbreakMode('test-config-1', unauthorizedCtx),
    ).rejects.toThrow(OutbreakAuthorizationError)
  })

  it('throws if config not found', async () => {
    mockOutbreakConfigsGet.mockResolvedValue(null)
    await expect(
      deactivateOutbreakMode('nonexistent', authorizedCtx),
    ).rejects.toThrow('not found')
  })

  it('throws if config already inactive', async () => {
    const inactiveConfig = { ...mockConfig, status: 'inactive' as const }
    mockOutbreakConfigsGet.mockResolvedValue(inactiveConfig)
    await expect(
      deactivateOutbreakMode('test-config-1', authorizedCtx),
    ).rejects.toThrow('already inactive')
  })
})

// ---------------------------------------------------------------------------
// getOutbreakQueuePriority
// ---------------------------------------------------------------------------

describe('getOutbreakQueuePriority', () => {
  const mockSampleMatchingOutbreak = {
    id: 'sample-001',
    type: { coding: [{ system: 'http://loinc.org', code: '51587-4' }] },
    _ultranos: { pipelineStatus: 'received', testLoincCode: '51587-4' },
  } as unknown as Parameters<typeof getOutbreakQueuePriority>[0]

  const mockSampleNotMatching = {
    id: 'sample-002',
    type: { coding: [{ system: 'http://loinc.org', code: '14957-5' }] },
    _ultranos: { pipelineStatus: 'received', testLoincCode: '14957-5' },
  } as unknown as Parameters<typeof getOutbreakQueuePriority>[0]

  it('returns outbreak priority when sample matches target test codes', () => {
    const result = getOutbreakQueuePriority(mockSampleMatchingOutbreak, mockConfig)
    expect(result.isOutbreakPriority).toBe(true)
    expect(result.priorityLevel).toBe(100)
    expect(result.outbreakConfigId).toBe('test-config-1')
  })

  it('returns standard priority when sample does not match', () => {
    const result = getOutbreakQueuePriority(mockSampleNotMatching, mockConfig)
    expect(result.isOutbreakPriority).toBe(false)
    expect(result.priorityLevel).toBe(0)
    expect(result.outbreakConfigId).toBeNull()
  })

  it('returns standard priority when outbreak is null', () => {
    const result = getOutbreakQueuePriority(mockSampleMatchingOutbreak, null)
    expect(result.isOutbreakPriority).toBe(false)
    expect(result.priorityLevel).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// isOutbreakModeActive — cache behavior
// ---------------------------------------------------------------------------

describe('isOutbreakModeActive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _invalidateOutbreakCache()
    mockOutbreakConfigsGet.mockResolvedValue(null)
  })

  it('returns null when no active outbreak', async () => {
    vi.mocked(db.getActiveOutbreak).mockResolvedValue(null)
    const result = await isOutbreakModeActive()
    expect(result).toBeNull()
  })

  it('returns cached result on second call', async () => {
    vi.mocked(db.getActiveOutbreak).mockResolvedValue(mockConfig)
    await isOutbreakModeActive()
    await isOutbreakModeActive()
    // getActiveOutbreak should only be called once (cache hit on second call)
    expect(db.getActiveOutbreak).toHaveBeenCalledTimes(1)
  })

  it('re-fetches after cache invalidation', async () => {
    vi.mocked(db.getActiveOutbreak).mockResolvedValue(mockConfig)
    await isOutbreakModeActive()
    _invalidateOutbreakCache()
    await isOutbreakModeActive()
    expect(db.getActiveOutbreak).toHaveBeenCalledTimes(2)
  })
})
