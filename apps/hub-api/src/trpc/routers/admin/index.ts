/**
 * Admin router barrel — Story 62.2 (L-HUB admin.ts monolith split).
 *
 * The 8k-line `admin.ts` monolith is relocated into this `admin/` module
 * directory. This is a MECHANICAL split: the router object itself is unchanged
 * (see `admin-router.ts`), so every procedure, name, and PATH is byte-identical
 * and the behavior-diff is empty. `_app.ts` continues to `import { adminRouter }
 * from './admin'`, which now resolves to this barrel — no route changes.
 *
 * Follow-up domain decomposition (users / kyc / audit / thresholds / labs) can
 * layer additional files behind this barrel via `t.mergeRouters` without
 * changing the mounted path, since the barrel is the single public entry point.
 */
// Re-export EVERY named export (adminRouter, sanitizeMetadata, …) so all prior
// importers of `routers/admin` — including tests that import helpers — resolve
// unchanged. This keeps the split behavior- and API-identical.
export * from './admin-router'
