/**
 * MPI duplicate BLOCK enforcement mode (Story 60.3, Task 2 / M-HUB-9, M-HUB-13).
 *
 * The MPI (Master Patient Index) scorer classifies a prospective registration
 * against existing patients as ALLOW / WARN / BLOCK. BLOCK enforcement was
 * disabled (patient.ts TODO) because the scoring algorithm was flagged
 * not-yet-production-ready in the system audit — a false BLOCK would hard-stop a
 * legitimate registration in a clinic with no network to appeal to.
 *
 * Enforcement is STAGED via the `MPI_BLOCK_MODE` env var (Decision #5):
 *   - `warn` (DEFAULT): a BLOCK-level score behaves like WARN online — the
 *     clinician can override with a proceedToken, and the create is FLAGGED
 *     (mpi_warn=true) so it lands in the duplicate-review queue for adjudication.
 *     This is the safe default while the scorer is not production-ready: no
 *     legitimate registration is ever hard-blocked, but every high-confidence
 *     duplicate is surfaced for review.
 *   - `enforce`: a BLOCK-level score HARD-BLOCKS an ONLINE create — no override,
 *     the clinician must resolve/merge first. Flip this only once the scorer is
 *     validated as production-ready.
 *
 * Reversible by design: a single env var flips behavior; no code change or
 * migration is needed to move between modes.
 *
 * NOTE: this mode governs ONLINE `patient.create` only. Offline-queued
 * registrations cannot be pre-blocked (there is no network to score against at
 * capture time); a BLOCK detected at sync-drain (`patient.syncCreate` → async
 * MPI) always becomes a flagged duplicate-review item, never a silent create,
 * in BOTH modes (see async-mpi-scoring.ts).
 *
 * No PHI: reads an env var only.
 */

export type MpiBlockMode = 'warn' | 'enforce'

export function getMpiBlockMode(): MpiBlockMode {
  return process.env.MPI_BLOCK_MODE === 'enforce' ? 'enforce' : 'warn'
}
