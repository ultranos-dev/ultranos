/**
 * Story 42.5 — Role-Permission Enforcement Tests
 * Task 11.3: permission matrix and self-authorization prevention
 */
import { describe, it, expect } from 'vitest'
import {
  canAccessAuthorizationQueue,
  canAuthorize,
  canReject,
  canHold,
} from '../lib/permissions'
import type { AuthorizableResult } from '../types/authorization'
import { LabRole } from '@ultranos/shared-types'

const routineResult: AuthorizableResult = {
  id: 'result-001',
  enteredBy: 'prac-tech-001',
  abnormalityFlags: [],
}

const abnormalResult: AuthorizableResult = {
  id: 'result-002',
  enteredBy: 'prac-tech-001',
  abnormalityFlags: ['H'],
}

const criticalResult: AuthorizableResult = {
  id: 'result-003',
  enteredBy: 'prac-tech-001',
  abnormalityFlags: ['LL'],
}

const otherTechResult: AuthorizableResult = {
  id: 'result-004',
  enteredBy: 'prac-other-999',
  abnormalityFlags: [],
}

describe('canAccessAuthorizationQueue', () => {
  it('LAB_TECH cannot access the authorization queue', () => {
    expect(canAccessAuthorizationQueue(LabRole.LAB_TECH)).toBe(false)
  })
  it('SENIOR_TECH can access the authorization queue', () => {
    expect(canAccessAuthorizationQueue(LabRole.SENIOR_TECH)).toBe(true)
  })
  it('SUPERVISOR can access the authorization queue', () => {
    expect(canAccessAuthorizationQueue(LabRole.SUPERVISOR)).toBe(true)
  })
  it('LAB_MANAGER can access the authorization queue', () => {
    expect(canAccessAuthorizationQueue(LabRole.LAB_MANAGER)).toBe(true)
  })
})

describe('canAuthorize (approve/authorize)', () => {
  it('LAB_TECH cannot authorize any result', () => {
    expect(canAuthorize(LabRole.LAB_TECH, 'prac-tech-001', routineResult)).toBe(false)
  })

  it('SENIOR_TECH can authorize routine result they did NOT enter', () => {
    expect(canAuthorize(LabRole.SENIOR_TECH, 'prac-senior-002', otherTechResult)).toBe(true)
  })

  it('SENIOR_TECH cannot authorize result they entered themselves (self-auth blocked)', () => {
    expect(canAuthorize(LabRole.SENIOR_TECH, 'prac-tech-001', routineResult)).toBe(false)
  })

  it('SENIOR_TECH cannot authorize critical result (LL/HH) — even if not their own', () => {
    expect(canAuthorize(LabRole.SENIOR_TECH, 'prac-senior-002', criticalResult)).toBe(false)
  })

  it('SENIOR_TECH cannot authorize abnormal (non-critical) result entered by someone else', () => {
    // SENIOR_TECH can only authorize ROUTINE (no flags at all)
    expect(canAuthorize(LabRole.SENIOR_TECH, 'prac-senior-002', abnormalResult)).toBe(false)
  })

  it('SUPERVISOR can authorize all results they did not enter', () => {
    expect(canAuthorize(LabRole.SUPERVISOR, 'prac-supervisor-003', routineResult)).toBe(true)
    expect(canAuthorize(LabRole.SUPERVISOR, 'prac-supervisor-003', abnormalResult)).toBe(true)
    expect(canAuthorize(LabRole.SUPERVISOR, 'prac-supervisor-003', criticalResult)).toBe(true)
  })

  it('SUPERVISOR self-authorization is blocked by default (returns false without break-glass)', () => {
    const ownResult: AuthorizableResult = {
      id: 'result-own',
      enteredBy: 'prac-supervisor-003',
      abnormalityFlags: [],
    }
    expect(canAuthorize(LabRole.SUPERVISOR, 'prac-supervisor-003', ownResult)).toBe(false)
  })

  it('LAB_MANAGER can authorize all results they did not enter', () => {
    expect(canAuthorize(LabRole.LAB_MANAGER, 'prac-manager-004', criticalResult)).toBe(true)
  })

  it('LAB_MANAGER self-authorization is blocked by default', () => {
    const ownResult: AuthorizableResult = {
      id: 'result-own',
      enteredBy: 'prac-manager-004',
      abnormalityFlags: [],
    }
    expect(canAuthorize(LabRole.LAB_MANAGER, 'prac-manager-004', ownResult)).toBe(false)
  })
})

describe('canReject', () => {
  it('LAB_TECH cannot reject', () => {
    expect(canReject(LabRole.LAB_TECH)).toBe(false)
  })
  it('SENIOR_TECH cannot reject', () => {
    expect(canReject(LabRole.SENIOR_TECH)).toBe(false)
  })
  it('SUPERVISOR can reject', () => {
    expect(canReject(LabRole.SUPERVISOR)).toBe(true)
  })
  it('LAB_MANAGER can reject', () => {
    expect(canReject(LabRole.LAB_MANAGER)).toBe(true)
  })
})

describe('canHold', () => {
  it('LAB_TECH cannot hold', () => {
    expect(canHold(LabRole.LAB_TECH)).toBe(false)
  })
  it('SENIOR_TECH can hold', () => {
    expect(canHold(LabRole.SENIOR_TECH)).toBe(true)
  })
  it('SUPERVISOR can hold', () => {
    expect(canHold(LabRole.SUPERVISOR)).toBe(true)
  })
  it('LAB_MANAGER can hold', () => {
    expect(canHold(LabRole.LAB_MANAGER)).toBe(true)
  })
})
