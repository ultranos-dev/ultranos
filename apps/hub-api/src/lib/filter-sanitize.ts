/**
 * Shared PostgREST filter sanitizer.
 *
 * Story 62.2 / M-HUB-1: user-supplied search strings interpolated into
 * PostgREST `.or()` / `.ilike()` filters must be sanitized so an attacker
 * cannot inject filter metacharacters (commas, parens, dots, stars,
 * backslashes) that would break out of the intended filter clause and
 * alter the query (e.g. `%,role.eq.ADMIN%`). We also escape SQL `LIKE`
 * wildcards (`%`, `_`) so the value matches literally.
 *
 * This is the single canonical implementation — previously each router
 * defined its own copy. New routers MUST import this rather than re-rolling
 * their own, so the sweep stays complete.
 *
 * Semantics are identical to the original `patient.ts:sanitizeFilterValue`.
 */
export function sanitizeFilterValue(value: string): string {
  // Strip dangerous PostgREST metacharacters, then escape SQL LIKE wildcards.
  return value
    .replace(/[,.*()\\]/g, '')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}
