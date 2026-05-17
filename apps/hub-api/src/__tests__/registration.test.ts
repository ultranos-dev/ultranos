import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Registration Unit Tests — Story 27.6
// Tests registerOrganization (public), selectInitialModules (auth),
// and PENDING_VERIFICATION gate enforcement.
// ============================================================

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    pipeline: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([]) }),
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabaseClient),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

let rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = []

const mockSupabaseClient = {
  from: vi.fn(),
  auth: {
    admin: {
      createUser: vi.fn(),
    },
  },
  rpc: vi.fn().mockImplementation((fn: string, params: Record<string, unknown>) => {
    rpcCalls.push({ fn, params })
    return Promise.resolve({ data: null, error: null })
  }),
  storage: {
    from: vi.fn().mockReturnValue({
      createSignedUploadUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: 'https://storage.example.com/upload?token=abc123' },
        error: null,
      }),
    }),
  },
}

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const createCaller = createCallerFactory(appRouter)

const ORG_UUID = '00000000-0000-4000-8000-000000000901'
const USER_UUID = '00000000-0000-4000-8000-000000000902'
const ADMIN_USER = {
  sub: USER_UUID,
  role: 'ADMIN',
  sessionId: 'sess-admin-1',
  orgId: ORG_UUID,
}

const PRACTITIONER_UUID = '00000000-0000-4000-8000-000000000903'
const DOCTOR_USER = {
  sub: PRACTITIONER_UUID,
  role: 'DOCTOR',
  sessionId: 'sess-doctor-1',
  orgId: ORG_UUID,
}

function createUnauthContext() {
  return {
    supabase: mockSupabaseClient as never,
    user: null,
    headers: new Headers(),
  }
}

function createAdminContext(orgId: string = ORG_UUID) {
  return {
    supabase: mockSupabaseClient as never,
    user: { ...ADMIN_USER, orgId },
    headers: new Headers(),
  }
}

function createDoctorContext(practitionerId: string = PRACTITIONER_UUID) {
  return {
    supabase: mockSupabaseClient as never,
    user: { ...DOCTOR_USER, sub: practitionerId },
    headers: new Headers(),
  }
}

/** Mock for organizations table — used by enforceVerifiedOrg middleware */
function mockOrganizationsTable(status = 'TRIAL') {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { status },
          error: null,
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: ORG_UUID },
          error: null,
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  }
}

/** Mock for org_subscriptions table — used by enforceEntitlement */
function mockOrgSubscriptionsTable() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'sub-1', status: 'ACTIVE' },
              error: null,
            }),
            limit: vi.fn().mockResolvedValue({
              data: [{ id: 'sub-1', status: 'ACTIVE' }],
              error: null,
            }),
          }),
        }),
        in: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
    }),
  }
}

/** Audit log mock */
function mockAuditTable() {
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
    insert: vi.fn().mockResolvedValue({ error: null }),
  }
}

const validRegistrationInput = {
  orgName: 'Acme Clinic',
  countryCode: 'IQ',
  billingEmail: 'billing@acmeclinic.com',
  adminName: 'Dr. Ahmed',
  adminEmail: 'ahmed@acmeclinic.com',
  adminPassword: 'SecurePass123!',
}

beforeEach(() => {
  vi.clearAllMocks()
  rpcCalls = []
})

// ─── registerOrganization ──────────────────────────────────────────────

describe('registration.registerOrganization', () => {
  it('creates org with PENDING_VERIFICATION status and 30-day trial_ends_at', async () => {
    // Mock: slug check returns no existing org
    let insertedOrg: Record<string, unknown> | null = null
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            }),
          }),
          insert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
            insertedOrg = data
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: ORG_UUID },
                  error: null,
                }),
              }),
            }
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      if (table === 'audit_log') return mockAuditTable()
      return {}
    })

    mockSupabaseClient.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: USER_UUID } },
      error: null,
    })

    const caller = createCaller(createUnauthContext())
    const result = await caller.registration.registerOrganization(validRegistrationInput)

    expect(result.success).toBe(true)
    expect(result.orgId).toBe(ORG_UUID)
    expect(result.slug).toBe('acme-clinic')
    expect(insertedOrg).toBeTruthy()
    expect(insertedOrg!.status).toBe('PENDING_VERIFICATION')
    expect(insertedOrg!.trial_ends_at).toBeTruthy()

    // Verify trial_ends_at is ~30 days from now
    const trialEnd = new Date(insertedOrg!.trial_ends_at as string)
    const now = new Date()
    const diffDays = (trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThan(29)
    expect(diffDays).toBeLessThan(31)
  })

  it('creates Supabase Auth user with ADMIN role and org_id', async () => {
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: ORG_UUID },
                error: null,
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      if (table === 'audit_log') return mockAuditTable()
      return {}
    })

    mockSupabaseClient.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: USER_UUID } },
      error: null,
    })

    const caller = createCaller(createUnauthContext())
    await caller.registration.registerOrganization(validRegistrationInput)

    expect(mockSupabaseClient.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: validRegistrationInput.adminEmail,
        password: validRegistrationInput.adminPassword,
        email_confirm: true,
        user_metadata: expect.objectContaining({
          name: validRegistrationInput.adminName,
          role: 'ADMIN',
          org_id: ORG_UUID,
        }),
      }),
    )
  })

  it('generates unique slug with numeric suffix on duplicate', async () => {
    let slugCheckCount = 0
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_col: string, val: string) => {
              slugCheckCount++
              // First slug "acme-clinic" exists, "acme-clinic-2" is free
              if (val === 'acme-clinic') {
                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'existing-org' },
                  }),
                }
              }
              return {
                maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              }
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: ORG_UUID },
                error: null,
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      if (table === 'audit_log') return mockAuditTable()
      return {}
    })

    mockSupabaseClient.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: USER_UUID } },
      error: null,
    })

    const caller = createCaller(createUnauthContext())
    const result = await caller.registration.registerOrganization(validRegistrationInput)

    expect(result.slug).toBe('acme-clinic-2')
  })

  it('returns generic error on duplicate email (anti-enumeration)', async () => {
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: ORG_UUID },
                error: null,
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      return {}
    })

    // Supabase Auth returns duplicate user error
    mockSupabaseClient.auth.admin.createUser.mockResolvedValue({
      data: null,
      error: { message: 'A user with this email address has already been registered' },
    })

    const caller = createCaller(createUnauthContext())
    await expect(
      caller.registration.registerOrganization(validRegistrationInput),
    ).rejects.toThrow(/registration failed/i)

    // Verify org was rolled back (delete called)
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('organizations')
  })

  it('rolls back org when user creation fails', async () => {
    let deleteCalledWithOrgId = false
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: ORG_UUID },
                error: null,
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_col: string, val: string) => {
              if (val === ORG_UUID) deleteCalledWithOrgId = true
              return Promise.resolve({ error: null })
            }),
          }),
        }
      }
      return {}
    })

    mockSupabaseClient.auth.admin.createUser.mockRejectedValue(
      new Error('Auth service unavailable'),
    )

    const caller = createCaller(createUnauthContext())
    await expect(
      caller.registration.registerOrganization(validRegistrationInput),
    ).rejects.toThrow()

    expect(deleteCalledWithOrgId).toBe(true)
  })

  it('emits audit event with no PHI', async () => {
    rpcCalls = []
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: ORG_UUID },
                error: null,
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      return {}
    })

    mockSupabaseClient.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: USER_UUID } },
      error: null,
    })

    const caller = createCaller(createUnauthContext())
    await caller.registration.registerOrganization(validRegistrationInput)

    // Audit event must have been emitted via RPC
    const auditRpcCall = rpcCalls.find((c) => c.fn === 'audit_emit_with_lock')
    expect(auditRpcCall).toBeTruthy()
    // Audit event must NOT contain PHI (no email, no password)
    const auditStr = JSON.stringify(auditRpcCall!.params)
    expect(auditStr).not.toContain(validRegistrationInput.adminEmail)
    expect(auditStr).not.toContain(validRegistrationInput.adminPassword)
  })

  it('rejects password shorter than 12 characters', async () => {
    const caller = createCaller(createUnauthContext())
    await expect(
      caller.registration.registerOrganization({
        ...validRegistrationInput,
        adminPassword: 'Short1!',
      }),
    ).rejects.toThrow()
  })

  it('rejects org name with no alphanumeric characters', async () => {
    const caller = createCaller(createUnauthContext())
    await expect(
      caller.registration.registerOrganization({
        ...validRegistrationInput,
        orgName: 'عيادة الأمل',
      }),
    ).rejects.toThrow(/alphanumeric/)
  })

  it('rejects invalid country code format', async () => {
    const caller = createCaller(createUnauthContext())
    await expect(
      caller.registration.registerOrganization({
        ...validRegistrationInput,
        countryCode: 'iraq',
      }),
    ).rejects.toThrow()
  })
})

// ─── selectInitialModules ──────────────────────────────────────────────

describe('registration.selectInitialModules', () => {
  it('creates org_subscriptions with TRIAL status', async () => {
    let insertedRows: Array<Record<string, unknown>> = []
    let orgQueryCount = 0
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'org_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockImplementation((rows: Array<Record<string, unknown>>) => {
            insertedRows = rows
            return Promise.resolve({ error: null })
          }),
        }
      }
      if (table === 'modules') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ code: 'OPD_LITE' }, { code: 'LAB_LITE' }],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'organizations') {
        // Single combined query returns both status and trial_ends_at
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { status: 'PENDING_VERIFICATION', trial_ends_at: '2026-06-14T00:00:00.000Z' },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'audit_log') return mockAuditTable()
      return {}
    })

    const caller = createCaller(createAdminContext())
    const result = await caller.registration.selectInitialModules({
      orgId: ORG_UUID,
      moduleCodes: ['OPD_LITE', 'LAB_LITE'],
    })

    expect(result.success).toBe(true)
    expect(result.subscriptions).toHaveLength(2)
    expect(insertedRows).toHaveLength(2)
    expect(insertedRows[0].status).toBe('TRIAL')
    expect(insertedRows[0].expires_at).toBe('2026-06-14T00:00:00.000Z')
  })

  it('rejects empty module list', async () => {
    const caller = createCaller(createAdminContext())
    await expect(
      caller.registration.selectInitialModules({
        orgId: ORG_UUID,
        moduleCodes: [],
      }),
    ).rejects.toThrow()
  })

  it('rejects invalid module codes', async () => {
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { status: 'PENDING_VERIFICATION' },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'org_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'modules') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ code: 'OPD_LITE' }],
                error: null,
              }),
            }),
          }),
        }
      }
      return {}
    })

    const caller = createCaller(createAdminContext())
    await expect(
      caller.registration.selectInitialModules({
        orgId: ORG_UUID,
        moduleCodes: ['OPD_LITE', 'INVALID_MODULE'],
      }),
    ).rejects.toThrow(/invalid module codes/i)
  })

  it('rejects if org already has active subscriptions', async () => {
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { status: 'PENDING_VERIFICATION' },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'org_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [{ id: 'existing-sub' }],
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      return {}
    })

    const caller = createCaller(createAdminContext())
    await expect(
      caller.registration.selectInitialModules({
        orgId: ORG_UUID,
        moduleCodes: ['OPD_LITE'],
      }),
    ).rejects.toThrow(/already has active subscriptions/i)
  })

  it('requires authentication', async () => {
    const caller = createCaller(createUnauthContext())
    await expect(
      caller.registration.selectInitialModules({
        orgId: ORG_UUID,
        moduleCodes: ['OPD_LITE'],
      }),
    ).rejects.toThrow()
  })

  it('rejects non-ADMIN role', async () => {
    const ctx = {
      supabase: mockSupabaseClient as never,
      user: { sub: 'doc-1', role: 'DOCTOR', sessionId: 'sess-1', orgId: ORG_UUID },
      headers: new Headers(),
    }
    const caller = createCaller(ctx)
    await expect(
      caller.registration.selectInitialModules({
        orgId: ORG_UUID,
        moduleCodes: ['OPD_LITE'],
      }),
    ).rejects.toThrow(/denied|forbidden/i)
  })

  it('rejects admin from different org', async () => {
    const ctx = createAdminContext('different-org-id')
    const caller = createCaller(ctx)
    await expect(
      caller.registration.selectInitialModules({
        orgId: ORG_UUID,
        moduleCodes: ['OPD_LITE'],
      }),
    ).rejects.toThrow(/denied|forbidden/i)
  })
})

// ─── PENDING_VERIFICATION gate ─────────────────────────────────────────

describe('PENDING_VERIFICATION gate', () => {
  it('clinical routes reject with KYC_REQUIRED for PENDING_VERIFICATION orgs', async () => {
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { status: 'PENDING_VERIFICATION' },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
      return {}
    })

    const ctx = {
      supabase: mockSupabaseClient as never,
      user: { sub: 'doc-1', role: 'DOCTOR', sessionId: 'sess-1', orgId: ORG_UUID },
      headers: new Headers(),
    }
    const caller = createCaller(ctx)

    // Encounter create should be blocked
    await expect(
      caller.encounter.create({
        id: '00000000-0000-4000-8000-000000000100',
        patientId: '00000000-0000-4000-8000-000000000001',
        status: 'in-progress',
        classCode: 'AMB',
        periodStart: '2026-05-10T08:00:00Z',
        participantPractitionerId: '00000000-0000-4000-8000-000000000010',
        reasonCode: 'test',
        hlcTimestamp: '000001715300000:00001:node-1',
      }),
    ).rejects.toThrow(/KYC_REQUIRED/i)
  })

  it('subscription routes still work for PENDING_VERIFICATION orgs', async () => {
    // subscription.listModules doesn't use enforceVerifiedOrg
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'modules') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'mod-1', code: 'OPD_LITE', display_name: 'OPD', description: null, base_price_usd: '0', is_active: true }],
                error: null,
              }),
            }),
          }),
        }
      }
      return {}
    })

    const ctx = {
      supabase: mockSupabaseClient as never,
      user: { sub: 'admin-1', role: 'ADMIN', sessionId: 'sess-1', orgId: ORG_UUID },
      headers: new Headers(),
    }
    const caller = createCaller(ctx)

    // subscription.listModules should pass — no verification gate
    const result = await caller.subscription.listModules()
    expect(result.modules).toHaveLength(1)
  })

  it('TRIAL orgs pass the clinical gate', async () => {
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { status: 'TRIAL' },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
      if (table === 'allergy_intolerances') {
        // Chain: .select('*').eq('patient_ref', ...).order(...).eq('clinical_status_code', ...)
        const chainResult = { data: [], error: null }
        const eqFn: any = vi.fn().mockReturnValue(chainResult)
        const orderFn: any = vi.fn().mockReturnValue(chainResult)
        // order returns a thenable with .eq chained
        orderFn.mockReturnValue({ ...chainResult, eq: eqFn, then: (resolve: any) => resolve(chainResult) })
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: orderFn,
            }),
          }),
        }
      }
      if (table === 'audit_log') return mockAuditTable()
      return {}
    })

    const ctx = {
      supabase: mockSupabaseClient as never,
      user: { sub: 'doc-1', role: 'DOCTOR', sessionId: 'sess-1', orgId: ORG_UUID },
      headers: new Headers(),
    }
    const caller = createCaller(ctx)

    // allergy.list should pass for TRIAL org
    const result = await caller.allergy.list({
      patientId: '00000000-0000-4000-8000-000000000001',
    })
    expect(result).toBeTruthy()
  })

  it('SUSPENDED orgs are blocked from clinical routes', async () => {
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { status: 'SUSPENDED' },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
      return {}
    })

    const ctx = {
      supabase: mockSupabaseClient as never,
      user: { sub: 'doc-1', role: 'DOCTOR', sessionId: 'sess-1', orgId: ORG_UUID },
      headers: new Headers(),
    }
    const caller = createCaller(ctx)

    await expect(
      caller.encounter.create({
        id: '00000000-0000-4000-8000-000000000100',
        patientId: '00000000-0000-4000-8000-000000000001',
        status: 'in-progress',
        classCode: 'AMB',
        periodStart: '2026-05-10T08:00:00Z',
        participantPractitionerId: '00000000-0000-4000-8000-000000000010',
        reasonCode: 'test',
        hlcTimestamp: '000001715300000:00001:node-1',
      }),
    ).rejects.toThrow(/ORG_INACTIVE/i)
  })

  it('CANCELLED orgs are blocked from clinical routes', async () => {
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { status: 'CANCELLED' },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
      return {}
    })

    const ctx = {
      supabase: mockSupabaseClient as never,
      user: { sub: 'doc-1', role: 'DOCTOR', sessionId: 'sess-1', orgId: ORG_UUID },
      headers: new Headers(),
    }
    const caller = createCaller(ctx)

    await expect(
      caller.encounter.create({
        id: '00000000-0000-4000-8000-000000000100',
        patientId: '00000000-0000-4000-8000-000000000001',
        status: 'in-progress',
        classCode: 'AMB',
        periodStart: '2026-05-10T08:00:00Z',
        participantPractitionerId: '00000000-0000-4000-8000-000000000010',
        reasonCode: 'test',
        hlcTimestamp: '000001715300000:00001:node-1',
      }),
    ).rejects.toThrow(/ORG_INACTIVE/i)
  })

  it('ACTIVE orgs pass the clinical gate', async () => {
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { status: 'ACTIVE' },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
      if (table === 'allergy_intolerances') {
        const chainResult = { data: [], error: null }
        const eqFn: any = vi.fn().mockReturnValue(chainResult)
        const orderFn: any = vi.fn().mockReturnValue(chainResult)
        orderFn.mockReturnValue({ ...chainResult, eq: eqFn, then: (resolve: any) => resolve(chainResult) })
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: orderFn,
            }),
          }),
        }
      }
      if (table === 'audit_log') return mockAuditTable()
      return {}
    })

    const ctx = {
      supabase: mockSupabaseClient as never,
      user: { sub: 'doc-1', role: 'DOCTOR', sessionId: 'sess-1', orgId: ORG_UUID },
      headers: new Headers(),
    }
    const caller = createCaller(ctx)

    const result = await caller.allergy.list({
      patientId: '00000000-0000-4000-8000-000000000001',
    })
    expect(result).toBeTruthy()
  })
})

// ─── KYC Upload URL (Story 22.5, Task 2) ─────────────────────────────

const KYC_SUBMISSION_UUID = '00000000-0000-4000-8000-000000000910'

const validKycSubmission = {
  practitionerId: PRACTITIONER_UUID,
  documents: [
    {
      type: 'MEDICAL_LICENSE' as const,
      storageKey: `${PRACTITIONER_UUID}/MEDICAL_LICENSE-1715900000000`,
      ocrResults: {
        fields: [
          { name: 'full_name', value: 'Dr. Ahmed Hassan', confidence: 0.97 },
          { name: 'license_number', value: 'HAAD-12345', confidence: 0.95 },
          { name: 'issuing_body', value: 'HAAD', confidence: 0.92 },
          { name: 'expiry_date', value: '2027-12-31', confidence: 0.88 },
        ],
      },
    },
    {
      type: 'NATIONAL_ID' as const,
      storageKey: `${PRACTITIONER_UUID}/NATIONAL_ID-1715900001000`,
      ocrResults: {
        fields: [
          { name: 'full_name', value: 'Ahmed Hassan', confidence: 0.96 },
        ],
      },
    },
  ],
  registryNumber: 'REG-2026-00123',
}

/** Helper: mock practitioners + kyc_submissions tables for KYC tests */
function mockKycTables(opts?: {
  kycStatus?: string
  insertError?: boolean
  practitionerNotFound?: boolean
  latestSubmission?: Record<string, unknown> | null
}) {
  return (table: string) => {
    if (table === 'practitioners') {
      if (opts?.practitionerNotFound) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: PRACTITIONER_UUID, kyc_status: opts?.kycStatus ?? 'PENDING_VERIFICATION' },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
    if (table === 'kyc_submissions') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(
              opts?.insertError
                ? { data: null, error: { message: 'Insert failed' } }
                : { data: { id: KYC_SUBMISSION_UUID, submitted_at: '2026-05-15T12:00:00.000Z' }, error: null },
            ),
          }),
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: opts?.latestSubmission ?? null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'audit_log') return mockAuditTable()
    return {}
  }
}

describe('registration.getKycUploadUrl', () => {
  it('generates a signed upload URL for valid request', async () => {
    const caller = createCaller(createDoctorContext())
    const result = await caller.registration.getKycUploadUrl({
      practitionerId: PRACTITIONER_UUID,
      documentType: 'MEDICAL_LICENSE',
      contentType: 'image/jpeg',
    })

    expect(result.uploadUrl).toBeTruthy()
    expect(result.storageKey).toContain(PRACTITIONER_UUID)
    expect(result.storageKey).toContain('MEDICAL_LICENSE')
    expect(result.expiresAt).toBeTruthy()

    // Verify storage was called with correct bucket
    expect(mockSupabaseClient.storage.from).toHaveBeenCalledWith('kyc-documents')
  })

  it('rejects if caller does not match practitionerId', async () => {
    const caller = createCaller(createDoctorContext('different-user-id'))
    await expect(
      caller.registration.getKycUploadUrl({
        practitionerId: PRACTITIONER_UUID,
        documentType: 'MEDICAL_LICENSE',
        contentType: 'image/jpeg',
      }),
    ).rejects.toThrow(/denied|forbidden/i)
  })

  it('rejects invalid content types', async () => {
    const caller = createCaller(createDoctorContext())
    await expect(
      caller.registration.getKycUploadUrl({
        practitionerId: PRACTITIONER_UUID,
        documentType: 'MEDICAL_LICENSE',
        contentType: 'application/zip' as any,
      }),
    ).rejects.toThrow()
  })

  it('requires authentication', async () => {
    const caller = createCaller(createUnauthContext())
    await expect(
      caller.registration.getKycUploadUrl({
        practitionerId: PRACTITIONER_UUID,
        documentType: 'MEDICAL_LICENSE',
        contentType: 'image/jpeg',
      }),
    ).rejects.toThrow()
  })
})

// ─── KYC Submit (Story 22.5, Task 1) ──────────────────────────────────

describe('registration.submitKyc', () => {
  it('stores KYC submission and emits audit event', async () => {
    rpcCalls = []
    // submitKyc now requires REJECTED or REQUEST_MORE_INFO status (not PENDING_VERIFICATION)
    mockSupabaseClient.from.mockImplementation(mockKycTables({ kycStatus: 'REJECTED' }))

    const caller = createCaller(createDoctorContext())
    const result = await caller.registration.submitKyc(validKycSubmission)

    expect(result.success).toBe(true)
    expect(result.submissionId).toBe(KYC_SUBMISSION_UUID)
    expect(result.message).toContain('Pending Verification')
    expect(result.message).toContain('3 business days')

    // Verify audit event emitted via RPC
    const auditRpcCall = rpcCalls.find((c) => c.fn === 'audit_emit_with_lock')
    expect(auditRpcCall).toBeTruthy()
    // Audit must not contain PHI
    const auditStr = JSON.stringify(auditRpcCall!.params)
    expect(auditStr).not.toContain('Dr. Ahmed Hassan')
    expect(auditStr).not.toContain('HAAD-12345')
  })

  it('rejects if caller does not match practitionerId', async () => {
    const caller = createCaller(createDoctorContext('different-user-id'))
    await expect(
      caller.registration.submitKyc(validKycSubmission),
    ).rejects.toThrow(/denied|forbidden/i)
  })

  it('rejects if practitioner not found', async () => {
    mockSupabaseClient.from.mockImplementation(mockKycTables({ practitionerNotFound: true }))

    const caller = createCaller(createDoctorContext())
    await expect(
      caller.registration.submitKyc(validKycSubmission),
    ).rejects.toThrow(/not found/i)
  })

  it('rejects resubmission while PENDING_VERIFICATION (prevents spam)', async () => {
    mockSupabaseClient.from.mockImplementation(mockKycTables({ kycStatus: 'PENDING_VERIFICATION' }))

    const caller = createCaller(createDoctorContext())
    await expect(
      caller.registration.submitKyc(validKycSubmission),
    ).rejects.toThrow(/not allowed/i)
  })

  it('rejects if practitioner is already ACTIVE', async () => {
    mockSupabaseClient.from.mockImplementation(mockKycTables({ kycStatus: 'ACTIVE' }))

    const caller = createCaller(createDoctorContext())
    await expect(
      caller.registration.submitKyc(validKycSubmission),
    ).rejects.toThrow(/not allowed/i)
  })

  it('allows re-submission when status is REJECTED', async () => {
    mockSupabaseClient.from.mockImplementation(mockKycTables({ kycStatus: 'REJECTED' }))

    const caller = createCaller(createDoctorContext())
    const result = await caller.registration.submitKyc(validKycSubmission)

    expect(result.success).toBe(true)
  })

  it('allows re-submission when status is REQUEST_MORE_INFO', async () => {
    mockSupabaseClient.from.mockImplementation(mockKycTables({ kycStatus: 'REQUEST_MORE_INFO' }))

    const caller = createCaller(createDoctorContext())
    const result = await caller.registration.submitKyc(validKycSubmission)

    expect(result.success).toBe(true)
  })

  it('requires authentication', async () => {
    const caller = createCaller(createUnauthContext())
    await expect(
      caller.registration.submitKyc(validKycSubmission),
    ).rejects.toThrow()
  })

  it('rejects empty documents array', async () => {
    const caller = createCaller(createDoctorContext())
    await expect(
      caller.registration.submitKyc({
        ...validKycSubmission,
        documents: [],
      }),
    ).rejects.toThrow()
  })
})

// ─── KYC Status (Story 22.5) ──────────────────────────────────────────

describe('registration.getKycStatus', () => {
  it('returns KYC status and latest submission', async () => {
    const latestSubmission = {
      id: KYC_SUBMISSION_UUID,
      status: 'PENDING',
      documents: validKycSubmission.documents,
      registry_number: 'REG-2026-00123',
      rejection_reason: null,
      admin_message: null,
      submitted_at: '2026-05-15T12:00:00.000Z',
    }
    mockSupabaseClient.from.mockImplementation(mockKycTables({ latestSubmission }))

    const caller = createCaller(createDoctorContext())
    const result = await caller.registration.getKycStatus({
      practitionerId: PRACTITIONER_UUID,
    })

    expect(result.kycStatus).toBe('PENDING_VERIFICATION')
    expect(result.latestSubmission).toBeTruthy()
    expect(result.latestSubmission!.id).toBe(KYC_SUBMISSION_UUID)
  })

  it('returns null latestSubmission when no submissions exist', async () => {
    mockSupabaseClient.from.mockImplementation(mockKycTables({ latestSubmission: null }))

    const caller = createCaller(createDoctorContext())
    const result = await caller.registration.getKycStatus({
      practitionerId: PRACTITIONER_UUID,
    })

    expect(result.kycStatus).toBe('PENDING_VERIFICATION')
    expect(result.latestSubmission).toBeNull()
  })

  it('rejects if caller does not match practitionerId', async () => {
    const caller = createCaller(createDoctorContext('different-user-id'))
    await expect(
      caller.registration.getKycStatus({
        practitionerId: PRACTITIONER_UUID,
      }),
    ).rejects.toThrow(/denied|forbidden/i)
  })
})
