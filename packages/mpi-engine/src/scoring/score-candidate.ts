import { jaroWinkler } from './jaro-winkler.js'
import { WEIGHTS } from './weights.js'
import { normalizeNameComponent } from '../normalization/index.js'
import type { MpiInput, MpiCandidate, MpiCandidateScore, MpiScoreBreakdown } from '../types.js'

function scoreNameField(
  inputName: string | undefined,
  candidateName: string | undefined,
  highPts: number,
  lowPts: number,
): number {
  if (!inputName || !candidateName) return 0
  const jw = jaroWinkler(normalizeNameComponent(inputName), normalizeNameComponent(candidateName))
  if (jw >= 0.92) return highPts
  if (jw >= 0.85) return lowPts
  return 0
}

export function scoreCandidate(input: MpiInput, candidate: MpiCandidate): MpiCandidateScore {
  // Hard identifier check — any exact match triggers BLOCK immediately
  if (
    (input.nationalIdHash && candidate.nationalIdHash && input.nationalIdHash === candidate.nationalIdHash) ||
    (input.tazkiraPaperHash && candidate.tazkiraPaperHash && input.tazkiraPaperHash === candidate.tazkiraPaperHash) ||
    (input.biometricFingerprintHash && candidate.biometricFingerprintHash && input.biometricFingerprintHash === candidate.biometricFingerprintHash) ||
    (input.patientId && input.patientId === candidate.id)
  ) {
    const breakdown: MpiScoreBreakdown = {
      givenName: 0, fatherName: 0, grandfatherName: 0,
      birthYear: 0, gender: 0, districtOrigin: 0, provinceOrigin: 0, phone: 0,
      total: 999,
    }
    return { candidate, score: 999, breakdown, hardIdMatch: true }
  }

  // Soft scoring
  const givenName       = scoreNameField(input.nameGiven,        candidate.nameGiven,        WEIGHTS.GIVEN_NAME_HIGH,       WEIGHTS.GIVEN_NAME_LOW)
  const fatherName      = scoreNameField(input.nameFather,       candidate.nameFather,       WEIGHTS.FATHER_NAME_HIGH,      WEIGHTS.FATHER_NAME_LOW)
  const grandfatherName = scoreNameField(input.nameGrandfather,  candidate.nameGrandfather,  WEIGHTS.GRANDFATHER_NAME_HIGH, WEIGHTS.GRANDFATHER_NAME_LOW)

  let birthYear = 0
  if (input.birthYear && candidate.birthYear) {
    const diff = Math.abs(input.birthYear - candidate.birthYear)
    if (diff === 0) birthYear = WEIGHTS.BIRTH_YEAR_EXACT
    else if (diff <= 2) birthYear = WEIGHTS.BIRTH_YEAR_NEAR
  }

  const gender =
    input.gender && candidate.gender && input.gender === candidate.gender
      ? WEIGHTS.GENDER_EXACT : 0

  let districtOrigin = 0
  let provinceOrigin = 0
  if (input.addressDistrictOrigin && candidate.addressDistrictOrigin &&
      input.addressDistrictOrigin.toLowerCase() === candidate.addressDistrictOrigin.toLowerCase()) {
    districtOrigin = WEIGHTS.DISTRICT_ORIGIN_EXACT
  } else if (
    input.addressProvinceOrigin && candidate.addressProvinceOrigin &&
    input.addressProvinceOrigin.toLowerCase() === candidate.addressProvinceOrigin.toLowerCase()
  ) {
    provinceOrigin = WEIGHTS.PROVINCE_ORIGIN_EXACT
  }

  const phone =
    input.phone && candidate.phone && input.phone === candidate.phone
      ? WEIGHTS.PHONE_EXACT : 0

  const breakdown: MpiScoreBreakdown = {
    givenName, fatherName, grandfatherName, birthYear, gender, districtOrigin, provinceOrigin, phone,
    total: givenName + fatherName + grandfatherName + birthYear + gender + districtOrigin + provinceOrigin + phone,
  }

  return { candidate, score: breakdown.total, breakdown, hardIdMatch: false }
}
