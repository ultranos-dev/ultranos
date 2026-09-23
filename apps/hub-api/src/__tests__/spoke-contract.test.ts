/**
 * Spoke ↔ Hub contract guard — Story 59.2 Task 1 (audit C-SYS-5 / §10 Theme 1).
 *
 * Regenerates (at test time) the inventory of every `router.procedure` path
 * the three raw-fetch spokes (opd-lite, lab-lite, pharmacy-lite) call on the
 * Hub, and asserts each path resolves against the Hub's actual router map
 * (`src/trpc/routers/_app.ts`). A spoke calling a procedure that does not
 * exist fails this test with the offending spoke file:line — the exact class
 * of silent runtime failure documented in docs/system-audit-2026-09-23.md §2.
 *
 * Known-dead paths are quarantined in `spoke-contract.allowlist.json`
 * (Story 59.1 is repairing/deferring them). The allowlist must only ever
 * SHRINK: once 59.1 lands a procedure, its entry becomes stale and is
 * reported (warning, not failure, to avoid blocking 59.1's parallel PR).
 * Any NEW unlisted dead path fails immediately.
 */
import { describe, it, expect, vi } from 'vitest'

// Defensive mock, matching the other router tests — importing the app router
// must not require a live Supabase configuration.
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: vi.fn() })),
  db: {
    toRow: (data: unknown) => data,
    toRowRaw: (data: unknown) => data,
    fromRow: (data: unknown) => data,
    fromRowRaw: (data: unknown) => data,
    fromRows: (data: unknown[]) => data,
  },
}))

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain .mjs module (allowJs), no bundled declarations.
import { extractHubCalls, findRepoRoot, SPOKES } from '../../../../scripts/extract-hub-calls.mjs'
import allowlistJson from './spoke-contract.allowlist.json'
import path from 'node:path'

const { appRouter } = await import('../trpc/routers/_app')

// ── Types ────────────────────────────────────────────────────────────────

interface InventoryEntry {
  path: string
  callSites: string[]
}
type Inventory = Record<string, InventoryEntry[]>

interface AllowlistEntry {
  spoke: string
  path: string
  reason: string
}

// ── Hub router introspection ─────────────────────────────────────────────

/**
 * Collect every dotted procedure path from the app router. Uses the flat
 * `_def.procedures` map (tRPC v11) unioned with a recursive walk of
 * `_def.record` as a fallback, so a tRPC internals change cannot silently
 * produce an empty set (a sanity test below guards against that too).
 */
function collectProcedurePaths(router: unknown): Set<string> {
  const out = new Set<string>()
  const def = (router as { _def?: Record<string, unknown> })?._def
  const flat = def?.procedures
  if (flat && typeof flat === 'object') {
    for (const key of Object.keys(flat)) out.add(key)
  }
  const walk = (node: unknown, prefix: string): void => {
    const record = (node as { _def?: { record?: Record<string, unknown> } })?._def?.record
    if (!record) return
    for (const [key, value] of Object.entries(record)) {
      const p = prefix ? `${prefix}.${key}` : key
      const vdef = (value as { _def?: { router?: boolean } })?._def
      if (!vdef) continue
      if (vdef.router) walk(value, p)
      else out.add(p)
    }
  }
  walk(router, '')
  return out
}

// ── Contract check (pure — also exercised with an invented path below) ───

function findContractViolations(
  inventory: Inventory,
  hubPaths: Set<string>,
  allowlist: AllowlistEntry[],
): string[] {
  const allowed = new Set(allowlist.map((e) => `${e.spoke}:${e.path}`))
  const violations: string[] = []
  for (const [spoke, entries] of Object.entries(inventory)) {
    for (const entry of entries) {
      if (hubPaths.has(entry.path)) continue
      if (allowed.has(`${spoke}:${entry.path}`)) continue
      violations.push(`${spoke} → ${entry.path}  (called from: ${entry.callSites.join(', ')})`)
    }
  }
  return violations.sort()
}

/** Allowlist entries that no longer describe a dead path (must be removed). */
function findStaleAllowlistEntries(
  inventory: Inventory,
  hubPaths: Set<string>,
  allowlist: AllowlistEntry[],
): string[] {
  const stale: string[] = []
  for (const entry of allowlist) {
    const calledPaths = new Set((inventory[entry.spoke] ?? []).map((e) => e.path))
    if (hubPaths.has(entry.path)) {
      stale.push(`${entry.spoke}:${entry.path} — now exists on the hub; remove from allowlist`)
    } else if (!calledPaths.has(entry.path)) {
      stale.push(`${entry.spoke}:${entry.path} — no longer called by the spoke; remove from allowlist`)
    }
  }
  return stale
}

// ── Fixtures (built once — extraction scans three src trees) ─────────────

const repoRoot: string = findRepoRoot(path.join(__dirname, '..', '..'))
const inventory: Inventory = extractHubCalls(repoRoot)
const hubPaths = collectProcedurePaths(appRouter)
const allowlist: AllowlistEntry[] = (allowlistJson as { entries: AllowlistEntry[] }).entries

// ── Tests ────────────────────────────────────────────────────────────────

describe('spoke ↔ hub contract guard (Story 59.2 / audit C-SYS-5)', () => {
  it('sanity: hub router introspection yields a plausible procedure map', () => {
    // If tRPC internals change shape, fail loudly here rather than letting
    // an empty hub set mark every spoke call as dead (or a broken walk mark
    // everything as fine).
    expect(hubPaths.size).toBeGreaterThan(100)
    for (const known of ['sync.pull', 'sync.push', 'patient.create', 'lab.pullOrders', 'notification.list']) {
      expect(hubPaths.has(known), `expected hub router to expose ${known}`).toBe(true)
    }
  })

  it('sanity: extraction finds a plausible inventory for every spoke', () => {
    for (const spoke of SPOKES as string[]) {
      expect(inventory[spoke], `missing inventory for ${spoke}`).toBeDefined()
      expect(
        (inventory[spoke] ?? []).length,
        `suspiciously empty inventory for ${spoke} — extraction regexes may have broken`,
      ).toBeGreaterThan(10)
    }
    // Hallmark call sites that must always be found (verified real idioms).
    const opd = new Set((inventory['opd-lite'] ?? []).map((e) => e.path))
    const lab = new Set((inventory['lab-lite'] ?? []).map((e) => e.path))
    const pharm = new Set((inventory['pharmacy-lite'] ?? []).map((e) => e.path))
    expect(opd.has('sync.push')).toBe(true) // `${config.hubBaseUrl}/api/trpc/sync.push`
    expect(opd.has('registration.submitKyc')).toBe(true) // buildUrl('registration.submitKyc')
    expect(lab.has('lab.pullOrders')).toBe(true) // `${getHubApiUrl()}/lab.pullOrders?...`
    expect(pharm.has('medication.recordDispense')).toBe(true) // pathname concat idiom
  })

  it('every hub procedure called by a spoke exists on the hub router (or is an allowlisted known-dead path)', () => {
    const violations = findContractViolations(inventory, hubPaths, allowlist)
    expect(
      violations,
      [
        'Spoke(s) call hub tRPC procedures that do not exist — this is the C-SYS-5 silent-failure class.',
        'Either the hub procedure was renamed/removed, or the spoke call is wrong.',
        'Fix the call (or the router), do NOT add to spoke-contract.allowlist.json unless a story explicitly defers it.',
        '',
        ...violations,
      ].join('\n'),
    ).toEqual([])
  })

  it('the guard itself catches an invented dead path (self-test)', () => {
    const forged: Inventory = {
      ...inventory,
      'lab-lite': [
        ...(inventory['lab-lite'] ?? []),
        { path: 'lab.thisProcedureDoesNotExist', callSites: ['apps/lab-lite/src/fake.ts:1'] },
      ],
    }
    const violations = findContractViolations(forged, hubPaths, allowlist)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('lab.thisProcedureDoesNotExist')
    expect(violations[0]).toContain('apps/lab-lite/src/fake.ts:1')
  })

  it('allowlist entries are well-formed and belong to known spokes', () => {
    for (const entry of allowlist) {
      expect(entry.path, 'allowlist entry missing path').toMatch(/^[A-Za-z][A-Za-z0-9-]*\.[A-Za-z_][A-Za-z0-9_]*$/)
      expect((SPOKES as string[]).includes(entry.spoke), `unknown spoke '${entry.spoke}' in allowlist`).toBe(true)
      expect(entry.reason?.length ?? 0, `allowlist entry ${entry.spoke}:${entry.path} needs a reason`).toBeGreaterThan(10)
    }
  })

  it('reports (but does not fail on) stale allowlist entries — the list must only shrink', () => {
    // Warning-only: Story 59.1 is landing procedure fixes in parallel; its PR
    // must not be blocked by having to touch this file in the same commit.
    // CI logs surface the cleanup task; remove stale entries promptly.
    const stale = findStaleAllowlistEntries(inventory, hubPaths, allowlist)
    if (stale.length > 0) {
      console.warn(
        `[spoke-contract] ${stale.length} stale allowlist entr${stale.length === 1 ? 'y' : 'ies'} — please remove:\n  ${stale.join('\n  ')}`,
      )
    }
    expect(Array.isArray(stale)).toBe(true)
  })
})
