import { THRESHOLDS } from './thresholds.js'
import { scoreCandidate } from '../scoring/score-candidate.js'
import type { MpiInput, MpiCandidate, MpiResult, MpiDecision } from '../types.js'

export function decideMpiAction(score: number): MpiDecision {
  if (score >= THRESHOLDS.BLOCK) return 'BLOCK'
  if (score >= THRESHOLDS.WARN) return 'WARN'
  return 'ALLOW'
}

export function computeMpiResult(candidates: MpiCandidate[], input: MpiInput): MpiResult {
  if (candidates.length === 0) {
    return { decision: 'ALLOW', topScore: 0, candidates: [] }
  }

  const scored = candidates
    .map(c => scoreCandidate(input, c))
    .sort((a, b) => b.score - a.score)

  const topScore = scored[0]!.score
  const decision = decideMpiAction(topScore)

  return { decision, topScore, candidates: scored.slice(0, 5) }
}
