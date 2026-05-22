// Synthetic Afghan name data for MPI testing.
// These do NOT represent real patients.
import type { MpiInput, MpiCandidate, MpiDecision } from '../../types.js'

// [input, expectedNormalized] — normalization pipeline pairs
// Verified against actual normalizeNameComponent output.
export const NORMALIZATION_PAIRS: Array<[string, string]> = [
  // Arabic script → normalized Latin (via ALA-LC romanization + variants)
  ['\u0645\u062D\u0645\u062F', 'muhammad'],           // محمد
  ['\u0623\u062D\u0645\u062F', 'ahmad'],              // أحمد
  ['\u062D\u0633\u064A\u0646', 'hsyn'],               // حسين (romanizes to hsyn, no variant catches this)
  ['\u0641\u0627\u0637\u0645\u0629', 'fatmh'],        // فاطمة (romanizes to fatmh, no variant catches this)
  ['\u0645\u0631\u064A\u0645', 'mrym'],               // مريم (romanizes to mrym, no variant catches this)

  // Latin variants → same canonical form
  ['Mohammad', 'muhammad'],
  ['Mohammed', 'muhammad'],
  ['Muhammad', 'muhammad'],
  ['Muhammed', 'muhammad'],
  ['Ahmed', 'ahmad'],
  ['Ahamed', 'ahmad'],
  ['Hussein', 'hussain'],
  ['Hossein', 'hussain'],
  ['Hassan', 'hasan'],
  ['Omar', 'umar'],
  ['Usman', 'uthman'],
  ['Osman', 'uthman'],
  ['Ibrahim', 'ibrahim'],
  ['Ebrahim', 'ibrahim'],
  ['Yousef', 'yusuf'],
  ['Youssef', 'yusuf'],
  ['Nour', 'nur'],
  ['Noor', 'nur'],
  ['Khaled', 'khalid'],
  ['Fatema', 'fatimah'],
  ['Fatimah', 'fatimah'],
  ['Mariam', 'maryam'],
  ['Maryam', 'maryam'],
  ['Aisha', 'ayisha'],
  ['Ayesha', 'ayisha'],
  ['Ali', 'ali'],
]

// Pairs that SHOULD produce identical phonetic tokens (same person, different spelling)
// NOTE: These use Latin-only forms since Arabic romanization has limitations
// (e.g., علي romanizes to "ly" not "ali"), which makes Arabic↔Latin phonetic
// matching problematic. In real MPI, Arabic names should be stored with both
// their romanized form AND a user-corrected/variant form.
export const SAME_PERSON_PHONETIC_PAIRS: Array<[string, string]> = [
  ['Mohammad', 'Muhammad'],
  ['Mohammed', 'Muhammad'],
  ['Ahmed', 'Ahmad'],
  ['Hussein', 'Hussain'],
  ['Ebrahim', 'Ibrahim'],
  ['Noor', 'Nur'],
  ['Mariam', 'Maryam'],
  ['Aisha', 'Ayesha'],
]

// Scoring scenarios used in scoring.test.ts
export interface ScoringScenario {
  description: string
  input: MpiInput
  candidate: MpiCandidate
  expectedDecision: MpiDecision
  minScore?: number
  maxScore?: number
}

export const SCORING_SCENARIOS: ScoringScenario[] = [
  {
    description: 'Full name triplet exact + same birth year → BLOCK',
    input:     { nameGiven: 'Ahmad', nameFather: 'Mohammad', nameGrandfather: 'Karim', birthYear: 1985, gender: 'male' },
    candidate: { id: 'c1', nameGiven: 'Ahmad', nameFather: 'Mohammad', nameGrandfather: 'Karim', birthYear: 1985, gender: 'male' },
    expectedDecision: 'BLOCK',
    minScore: 90,
  },
  {
    description: 'Full name triplet exact + different birth year (father–son scenario) → WARN',
    input:     { nameGiven: 'Ahmad', nameFather: 'Mohammad', nameGrandfather: 'Karim', birthYear: 2010, gender: 'male' },
    candidate: { id: 'c2', nameGiven: 'Ahmad', nameFather: 'Mohammad', nameGrandfather: 'Karim', birthYear: 1985 },
    expectedDecision: 'WARN',
    minScore: 60,
    maxScore: 89,
  },
  {
    description: 'Given + father match + same district + same birth year → BLOCK',
    input:     { nameGiven: 'Ahmad', nameFather: 'Mohammad', birthYear: 1985, addressDistrictOrigin: 'Kabul' },
    candidate: { id: 'c3', nameGiven: 'Ahmad', nameFather: 'Mohammad', birthYear: 1985, addressDistrictOrigin: 'Kabul' },
    expectedDecision: 'BLOCK',
    minScore: 90,
  },
  {
    description: 'Phone match only (shared SIM scenario) → ALLOW',
    input:     { nameGiven: 'Ahmad', phone: '+93701234567' },
    candidate: { id: 'c4', nameGiven: 'Completely Different Person', phone: '+93701234567' },
    expectedDecision: 'ALLOW',
    maxScore: 59,
  },
  {
    description: 'Completely different names and demographics → ALLOW',
    input:     { nameGiven: 'Zubair', nameFather: 'Latif', birthYear: 1990 },
    candidate: { id: 'c5', nameGiven: 'Farida', nameFather: 'Rashid', birthYear: 1975 },
    expectedDecision: 'ALLOW',
    maxScore: 30,
  },
]
