export type MpiDecision = 'BLOCK' | 'WARN' | 'ALLOW'

export interface MpiInput {
  nameGiven?: string
  nameFather?: string
  nameGrandfather?: string
  birthYear?: number
  gender?: string
  addressDistrictOrigin?: string
  addressProvinceOrigin?: string
  phone?: string
  // Hard identifiers — any exact match triggers BLOCK immediately
  nationalIdHash?: string
  tazkiraPaperHash?: string
  biometricFingerprintHash?: string
  patientId?: string  // Health Passport QR scan path
}

export interface MpiCandidate {
  id: string
  nameGiven?: string
  nameFather?: string
  nameGrandfather?: string
  namePhoneticGiven?: string[]
  namePhoneticFather?: string[]
  namePhoneticGrandfather?: string[]
  birthYear?: number
  gender?: string
  addressDistrictOrigin?: string
  addressProvinceOrigin?: string
  phone?: string
  nationalIdHash?: string
  tazkiraPaperHash?: string
  biometricFingerprintHash?: string
}

export interface MpiScoreBreakdown {
  givenName: number
  fatherName: number
  grandfatherName: number
  birthYear: number
  gender: number
  districtOrigin: number
  provinceOrigin: number
  phone: number
  total: number
}

export interface MpiCandidateScore {
  candidate: MpiCandidate
  score: number
  breakdown: MpiScoreBreakdown
  hardIdMatch: boolean
}

export interface MpiResult {
  decision: MpiDecision
  topScore: number
  /** Top 5 scored candidates sorted by score desc. Present even on ALLOW decisions for auditing. */
  candidates: MpiCandidateScore[]
}

/**
 * Shared type for the proceedToken JWT payload.
 * The actual sign/verify functions live in apps/hub-api/src/lib/mpi-proceed-token.ts
 * (they require the RS256 private key and must NOT be bundled into client-side code).
 */
export interface MpiProceedTokenPayload {
  jti: string
  candidateIds: string[]
  maxScore: number
  issuedTo: string  // practitioner userId
  exp: number
}
