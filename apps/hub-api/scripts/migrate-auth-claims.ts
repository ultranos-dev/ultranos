import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

/**
 * Story 56.1 (audit C-SYS-1) — one-time authorization-claim migration.
 *
 * Copies the authorization claims { role, org_id, facility_id, status, patient_id }
 * from user-writable `user_metadata` into server-authoritative `app_metadata`
 * for every existing Supabase Auth user, via the service-role Admin API.
 *
 * Rules:
 * - `app_metadata` wins: a field already present in app_metadata is NEVER
 *   overwritten (e.g. status written by the subscription-lifecycle path).
 * - `user_metadata` values are left in place (display compatibility) — the
 *   Hub no longer reads them for authorization. Cleanup is a later story.
 * - Idempotent: re-running skips users whose app_metadata already carries
 *   every claim their user_metadata does.
 * - Logs NO PHI: only opaque auth user ids, claim KEY names, and counts.
 *
 * Usage (dry run first):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/migrate-auth-claims.ts --dry-run
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/migrate-auth-claims.ts
 */

/** Authorization claims mirrored from user_metadata → app_metadata. */
const AUTHZ_CLAIM_KEYS = ['role', 'org_id', 'facility_id', 'status', 'patient_id'] as const

export interface MigrationPlan {
  /** Fields to merge into app_metadata (only keys missing there). */
  patch: Record<string, unknown>
  /** True when nothing needs to be written for this user. */
  upToDate: boolean
}

/** Pure, unit-testable: compute the app_metadata patch for one user. */
export function planUserMigration(
  userMeta: Record<string, unknown> | null | undefined,
  appMeta: Record<string, unknown> | null | undefined,
): MigrationPlan {
  const um = userMeta ?? {}
  const am = appMeta ?? {}
  const patch: Record<string, unknown> = {}
  for (const key of AUTHZ_CLAIM_KEYS) {
    // app_metadata is authoritative — never overwrite an existing value.
    if (am[key] == null && um[key] != null) patch[key] = um[key]
  }
  return { patch, upToDate: Object.keys(patch).length === 0 }
}

interface Report {
  scanned: number
  migrated: number
  alreadyUpToDate: number
  failed: number
  /** Users migrated per (uppercased) role claim value. */
  migratedPerRole: Record<string, number>
  /** Post-migration invariant: users with a user_metadata role but NO app_metadata role. */
  roleGapUserIds: string[]
}

async function migrate(supabase: SupabaseClient, dryRun: boolean): Promise<Report> {
  const report: Report = {
    scanned: 0,
    migrated: 0,
    alreadyUpToDate: 0,
    failed: 0,
    migratedPerRole: {},
    roleGapUserIds: [],
  }

  const PER_PAGE = 200
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error) throw new Error(`listUsers failed on page ${page}: ${error.message}`)
    const users: User[] = data?.users ?? []
    if (users.length === 0) break

    for (const user of users) {
      report.scanned++
      const plan = planUserMigration(
        user.user_metadata as Record<string, unknown>,
        user.app_metadata as Record<string, unknown>,
      )

      if (plan.upToDate) {
        report.alreadyUpToDate++
        continue
      }

      if (!dryRun) {
        // Admin API merges app_metadata shallowly — existing keys not in the
        // patch are preserved. user_metadata is not touched.
        const { error: upErr } = await supabase.auth.admin.updateUserById(user.id, {
          app_metadata: plan.patch,
        })
        if (upErr) {
          // Opaque id + error code only — never claim VALUES or PHI.
          console.error('[MIGRATE_AUTH_CLAIMS] update failed', {
            userId: user.id,
            keys: Object.keys(plan.patch),
            status: upErr.status ?? 'unknown',
          })
          report.failed++
          continue
        }
      }

      report.migrated++
      const roleClaim = plan.patch.role ?? (user.app_metadata as Record<string, unknown>)?.role
      if (typeof roleClaim === 'string' && roleClaim) {
        const role = roleClaim.toUpperCase()
        report.migratedPerRole[role] = (report.migratedPerRole[role] ?? 0) + 1
      }
    }

    if (users.length < PER_PAGE) break
  }

  return report
}

/** Reconciliation pass: assert zero users hold a role in user_metadata but none in app_metadata. */
async function reconcile(supabase: SupabaseClient, report: Report): Promise<void> {
  const PER_PAGE = 200
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error) throw new Error(`reconciliation listUsers failed on page ${page}: ${error.message}`)
    const users: User[] = data?.users ?? []
    if (users.length === 0) break
    for (const user of users) {
      const um = (user.user_metadata ?? {}) as Record<string, unknown>
      const am = (user.app_metadata ?? {}) as Record<string, unknown>
      if (um.role != null && am.role == null) report.roleGapUserIds.push(user.id)
    }
    if (users.length < PER_PAGE) break
  }
}

async function main() {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required')

  const dryRun = process.argv.includes('--dry-run')
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`[MIGRATE_AUTH_CLAIMS] starting${dryRun ? ' (DRY RUN — no writes)' : ''}`)
  const report = await migrate(supabase, dryRun)
  if (!dryRun) await reconcile(supabase, report)

  // Reconciliation report — counts and opaque ids only, no PHI.
  console.log('[MIGRATE_AUTH_CLAIMS] complete', {
    dryRun,
    scanned: report.scanned,
    migrated: report.migrated,
    alreadyUpToDate: report.alreadyUpToDate,
    failed: report.failed,
    migratedPerRole: report.migratedPerRole,
  })

  if (!dryRun) {
    if (report.roleGapUserIds.length > 0) {
      console.error('[MIGRATE_AUTH_CLAIMS] RECONCILIATION FAILED — users with a user_metadata role but no app_metadata role:', {
        count: report.roleGapUserIds.length,
        userIds: report.roleGapUserIds,
      })
      process.exitCode = 1
      return
    }
    console.log('[MIGRATE_AUTH_CLAIMS] reconciliation OK — zero users with a role gap')
  }
  if (report.failed > 0) process.exitCode = 1
}

// Run only when invoked directly (not when imported by tests).
if (process.argv[1] && process.argv[1].includes('migrate-auth-claims')) {
  main().catch((e) => {
    console.error('[MIGRATE_AUTH_CLAIMS] failed', e instanceof Error ? e.message : 'unknown error')
    process.exit(1)
  })
}
