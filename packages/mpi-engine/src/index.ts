// Public API for @ultranos/mpi-engine
//
// NOTE: signProceedToken / verifyProceedToken are NOT exported from this package.
// They require the Hub API's RS256 private key at runtime and must not be
// bundled into client-side code. They live in:
//   apps/hub-api/src/lib/mpi-proceed-token.ts

export { normalizeNameComponent, computePhoneticTokens } from './normalization/index.js'
export { scoreCandidate } from './scoring/score-candidate.js'
export { computeMpiResult, decideMpiAction } from './decision/index.js'
export { WEIGHTS, THRESHOLDS } from './scoring/weights.js'
export type {
  MpiInput,
  MpiCandidate,
  MpiResult,
  MpiDecision,
  MpiScoreBreakdown,
  MpiCandidateScore,
  MpiProceedTokenPayload,
} from './types.js'
