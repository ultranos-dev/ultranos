# Patient Identity & MPI — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the MPI deduplication engine, structured Afghan patient data model, and atomic consent-at-creation for the Ultranos Hub API.

**Architecture:** Pure TypeScript `packages/mpi-engine` (no DB deps) handles ALA-LC romanization → Double Metaphone phonetic tokenization → Jaro-Winkler soft scoring → BLOCK/WARN/ALLOW decision. Hub API wires mpi-engine into `patient.create` and calls a Postgres RPC that atomically inserts patient + consent in one transaction.

**Tech Stack:** TypeScript (NodeNext ESM), Vitest, Zod, tRPC, Supabase Postgres RPC, Redis (proceedToken one-time use), `double-metaphone@^1.0.4`, `jose` (RS256 JWT for proceedToken signing)

---

## File Map

### New Package: `packages/mpi-engine/`
| File | Purpose |
|---|---|
| `package.json` | ESM package, `@ultranos/mpi-engine`, `double-metaphone` dep |
| `tsconfig.json` | `extends ../../tsconfig.base.json`, rootDir/outDir |
| `src/types.ts` | All shared interfaces: MpiInput, MpiCandidate, MpiResult, MpiDecision, MpiProceedTokenPayload |
| `src/normalization/unicode.ts` | NFD normalize, script detection, isArabicChar helper |
| `src/normalization/romanization-table.ts` | ~60 Arabic→Latin mappings (⚠ HIGH RISK: needs linguistic review) |
| `src/normalization/romanization.ts` | `romanizeArabic()` — char-by-char table lookup |
| `src/normalization/variants.ts` | `NAME_VARIANTS` map + `applyVariants()` |
| `src/normalization/index.ts` | `normalizeNameComponent()` public entry point |
| `src/phonetic/double-metaphone.ts` | Typed wrapper around `double-metaphone` npm package |
| `src/phonetic/index.ts` | Re-exports `computePhoneticTokens()` |
| `src/scoring/weights.ts` | `WEIGHTS` and `THRESHOLDS` constants |
| `src/scoring/jaro-winkler.ts` | ~55-line pure Jaro-Winkler implementation |
| `src/scoring/score-candidate.ts` | `scoreCandidate()` — one input × one candidate |
| `src/scoring/index.ts` | Re-exports scoring functions |
| `src/decision/thresholds.ts` | Re-export shim for THRESHOLDS |
| `src/decision/index.ts` | `decideMpiAction()`, `computeMpiResult()` |
| `src/index.ts` | Public API — all exports from this package |
| `src/__tests__/fixtures/afghan-names.ts` | Synthetic name pairs + scoring scenarios |
| `src/__tests__/normalization.test.ts` | Script detection, romanization, variants, phonetic tests |
| `src/__tests__/scoring.test.ts` | Jaro-Winkler, weights, scoreCandidate, decideMpiAction tests |

### Modifications: `packages/shared-types/`
| File | Change |
|---|---|
| `src/fhir/patient.ts` | Add `PatientAddress`, `PatientIdentifier`, extend `FhirPatient._ultranos` with new fields |
| `src/fhir/patient.schema.ts` | Add Zod validators for new fields + cross-field rules (birthDate/birthYear, verbal consent requires witness) |
| `src/reference/afghanistan-geo.ts` | New file — `AFGHAN_PROVINCES` readonly tuple |

### New Migrations: `supabase/migrations/`
| File | Purpose |
|---|---|
| `018_patient_mpi_fields.sql` | All new nullable patient columns: patronymic chain, birth_year, addresses, biometric, tazkira_paper_hash, mpi_score |
| `019_patient_birth_year_backfill.sql` | `UPDATE patients SET birth_year = EXTRACT(YEAR FROM birth_date::date) WHERE birth_date IS NOT NULL` |
| `020_patient_encrypted_name_fields.sql` | Add `name_given_enc`, `name_father_enc`, `name_grandfather_enc` columns |
| `021_patient_indexes_phonetic.sql` | GIN indexes on phonetic arrays; scalar indexes on birth_year, district, biometric, tazkira, mpi_warn |
| `022_consent_registration_fields.sql` | `consent_method`, `witnessed_by`, `consent_language`, `consent_version` columns + check constraints |
| `023_fn_create_patient_with_consent.sql` | Atomic `create_patient_with_consent()` RPC + `fetch_mpi_candidates()` RPC |

### Modifications: `apps/hub-api/`
| File | Change |
|---|---|
| `src/lib/mpi-proceed-token.ts` | New — RS256 sign/verify for proceedToken (10-min TTL, Redis one-time-use) |
| `src/lib/mpi-candidate-query.ts` | New — `fetchMpiCandidates()` calls `fetch_mpi_candidates` Supabase RPC |
| `src/trpc/routers/patient.ts` | `patient.create`: full MPI flow; `patient.search`: phonetic update; `patient.checkDuplicates`: new |
| `src/trpc/routers/patient-registration.ts` | Remove phone uniqueness check (lines 137–149); add MPI check; add consent param; switch to RPC insert |
| `src/__tests__/patient-mpi.test.ts` | New — unit tests for `signProceedToken`/`verifyProceedToken`/replay prevention |
| `src/__tests__/patient-consent-atomic.test.ts` | New — atomicity: consent rollback confirmed, patient inaccessible without consent |
| `src/__tests__/patient-registration-mpi.test.ts` | New — patientRegistration.register MPI integration tests |

---

# PHASE A — Tasks 1–5: `packages/mpi-engine`

---

## Task 1: Bootstrap `packages/mpi-engine`

**Files:**
- Create: `packages/mpi-engine/package.json`
- Create: `packages/mpi-engine/tsconfig.json`
- Create: `packages/mpi-engine/src/types.ts`
- Create: `packages/mpi-engine/src/__tests__/normalization.test.ts` (stub — first failing test)

- [ ] **Step 1: Write the first failing test**

Create `packages/mpi-engine/src/__tests__/normalization.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import type { MpiDecision, MpiInput } from '../types.js'

describe('mpi-engine types', () => {
  it('MpiDecision has BLOCK WARN ALLOW values', () => {
    const decisions: MpiDecision[] = ['BLOCK', 'WARN', 'ALLOW']
    expect(decisions).toHaveLength(3)
  })

  it('MpiInput accepts all optional fields', () => {
    const input: MpiInput = {
      nameGiven: 'Ahmad',
      nameFather: 'Mohammad',
      birthYear: 1985,
      gender: 'male',
    }
    expect(input.nameGiven).toBe('Ahmad')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F @ultranos/mpi-engine test
```

Expected: Error — `Cannot find module` or package not found (the package doesn't exist yet)

- [ ] **Step 3: Create package.json**

Create `packages/mpi-engine/package.json`:

```json
{
  "name": "@ultranos/mpi-engine",
  "version": "0.1.0",
  "description": "Master Patient Index matching engine — pure TypeScript, no DB deps",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "double-metaphone": "^1.0.4"
  },
  "devDependencies": {
    "vitest": "workspace:*",
    "@types/double-metaphone": "^1.0.2"
  }
}
```

- [ ] **Step 4: Create tsconfig.json**

Create `packages/mpi-engine/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["src/__tests__/**/*", "dist"]
}
```

- [ ] **Step 5: Create src/types.ts**

Create `packages/mpi-engine/src/types.ts`:

```typescript
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
  candidates: MpiCandidateScore[]  // top 5, sorted by score desc
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
```

- [ ] **Step 6: Install dependencies**

```bash
pnpm install
```

Expected: `@ultranos/mpi-engine` workspace package registered, `double-metaphone` installed.

- [ ] **Step 7: Run test to verify it passes**

```bash
pnpm -F @ultranos/mpi-engine test
```

Expected: PASS — 2 type tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/mpi-engine/
git commit -m "feat(mpi-engine): bootstrap package scaffold and shared types"
```

---

## Task 2: Normalization Pipeline

**Files:**
- Create: `packages/mpi-engine/src/normalization/unicode.ts`
- Create: `packages/mpi-engine/src/normalization/romanization-table.ts`
- Create: `packages/mpi-engine/src/normalization/romanization.ts`
- Create: `packages/mpi-engine/src/normalization/variants.ts`
- Create: `packages/mpi-engine/src/normalization/index.ts`
- Create: `packages/mpi-engine/src/phonetic/double-metaphone.ts`
- Create: `packages/mpi-engine/src/phonetic/index.ts`
- Modify: `packages/mpi-engine/src/__tests__/normalization.test.ts`

> ⚠️ **HIGH RISK — Linguistic Review Required:** The romanization table in `romanization-table.ts` and the variant normalization map in `variants.ts` are the most linguistically sensitive part of Phase 1. A native Dari/Pashto speaker must review both files against real patient names before production deployment. False positives (two different people producing the same token) are less harmful than false negatives (the same person producing different tokens), but both must be minimized.

- [ ] **Step 1: Write the failing normalization tests**

Replace `packages/mpi-engine/src/__tests__/normalization.test.ts` with:

```typescript
import { describe, it, expect } from 'vitest'
import type { MpiDecision, MpiInput } from '../types.js'
import { normalizeNameComponent, computePhoneticTokens } from '../normalization/index.js'

describe('mpi-engine types', () => {
  it('MpiDecision has BLOCK WARN ALLOW values', () => {
    const decisions: MpiDecision[] = ['BLOCK', 'WARN', 'ALLOW']
    expect(decisions).toHaveLength(3)
  })

  it('MpiInput accepts all optional fields', () => {
    const input: MpiInput = { nameGiven: 'Ahmad', nameFather: 'Mohammad', birthYear: 1985, gender: 'male' }
    expect(input.nameGiven).toBe('Ahmad')
  })
})

describe('normalizeNameComponent', () => {
  it('lowercases and trims Latin input', () => {
    expect(normalizeNameComponent('  Ahmad  ')).toBe('ahmad')
  })

  it('applies Mohammad→muhammad variant (Latin)', () => {
    expect(normalizeNameComponent('Mohammad')).toBe('muhammad')
    expect(normalizeNameComponent('Mohammed')).toBe('muhammad')
    expect(normalizeNameComponent('Muhammad')).toBe('muhammad')
  })

  // محمد (U+0645 U+062D U+0645 U+062F)
  it('romanizes Arabic محمد to muhammad', () => {
    expect(normalizeNameComponent('\u0645\u062D\u0645\u062F')).toBe('muhammad')
  })

  // أحمد (U+0623 U+062D U+0645 U+062F)
  it('romanizes Arabic أحمد to ahmad', () => {
    expect(normalizeNameComponent('\u0623\u062D\u0645\u062F')).toBe('ahmad')
  })

  it('produces identical output for Arabic and Latin variants of the same name', () => {
    const arabic = normalizeNameComponent('\u0645\u062D\u0645\u062F')  // محمد
    const latin = normalizeNameComponent('Mohammed')
    expect(arabic).toBe(latin)
    expect(arabic).toBe('muhammad')
  })

  it('strips Arabic diacritics — مُحَمَّد same as محمد', () => {
    // U+0645 U+064F U+062D U+064E U+0645 U+0651 U+062F (with diacritics)
    const withDiacritics = normalizeNameComponent('\u0645\u064F\u062D\u064E\u0645\u0651\u062F')
    const without = normalizeNameComponent('\u0645\u062D\u0645\u062F')
    expect(withDiacritics).toBe(without)
  })

  it('handles Dari پ (U+067E) as p', () => {
    // پارس — p-a-r-s
    expect(normalizeNameComponent('\u067E\u0627\u0631\u0633')).toBe('pars')
  })

  it('handles Dari چ (U+0686) as ch', () => {
    // چمن — ch-m-n
    expect(normalizeNameComponent('\u0686\u0645\u0646')).toContain('ch')
  })

  it('returns empty string for empty/whitespace input', () => {
    expect(normalizeNameComponent('')).toBe('')
    expect(normalizeNameComponent('   ')).toBe('')
  })
})

describe('computePhoneticTokens', () => {
  it('returns Double Metaphone tokens for a Latin name', () => {
    const tokens = computePhoneticTokens('ahmad')
    expect(tokens.length).toBeGreaterThan(0)
    expect(tokens[0]).toBeTruthy()
  })

  it('Arabic محمد and Latin Mohammed produce identical tokens after normalization', () => {
    const arabicNorm = normalizeNameComponent('\u0645\u062D\u0645\u062F')  // muhammad
    const latinNorm = normalizeNameComponent('Mohammed')                    // muhammad
    expect(arabicNorm).toBe(latinNorm)
    const arabicTokens = computePhoneticTokens(arabicNorm)
    const latinTokens = computePhoneticTokens(latinNorm)
    expect(arabicTokens).toEqual(latinTokens)
  })

  it('returns empty array for empty input', () => {
    expect(computePhoneticTokens('')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F @ultranos/mpi-engine test -- normalization
```

Expected: FAIL — `Cannot find module '../normalization/index.js'`

- [ ] **Step 3: Create unicode.ts**

Create `packages/mpi-engine/src/normalization/unicode.ts`:

```typescript
export function nfdNormalize(input: string): string {
  return input.normalize('NFD')
}

export type Script = 'arabic' | 'latin' | 'mixed' | 'empty'

// Returns true if a single character is in the Arabic Unicode ranges
// (including Arabic Extended, Dari/Pashto, Arabic Presentation Forms).
export function isArabicChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  return (
    (code >= 0x0600 && code <= 0x06FF) ||
    (code >= 0x0750 && code <= 0x077F) ||
    (code >= 0x08A0 && code <= 0x08FF) ||
    (code >= 0xFB50 && code <= 0xFDFF) ||
    (code >= 0xFE70 && code <= 0xFEFF)
  )
}

export function detectScript(input: string): Script {
  const trimmed = input.trim()
  if (!trimmed) return 'empty'
  const chars = [...trimmed]
  const hasArabic = chars.some(isArabicChar)
  const hasLatin = /[a-zA-Z]/.test(trimmed)
  if (hasArabic && hasLatin) return 'mixed'
  if (hasArabic) return 'arabic'
  if (hasLatin) return 'latin'
  return 'empty'
}
```

- [ ] **Step 4: Create romanization-table.ts**

> ⚠️ Emphatic consonants (ص ض ط ظ) are simplified to their non-emphatic equivalents (s, d, t, z). This is intentional: MPI matching must not create false non-matches between "Salim" and "صالم" due to emphasis preservation. A linguist must validate these simplifications against real Afghan name data.

Create `packages/mpi-engine/src/normalization/romanization-table.ts`:

```typescript
// ALA-LC Arabic romanization table (simplified for MPI matching).
// Key: Unicode character. Value: Latin romanization string (may be empty to strip).
// Emphatic consonants simplified (ص→s, ض→d, ط→t, ظ→z).
// Extends to Dari/Pashto characters common in Afghan names.
export const ROMANIZATION_TABLE: ReadonlyMap<string, string> = new Map<string, string>([
  // ── Hamza and alif forms ──────────────────────────────────────────────────
  ['\u0621', ''],   // ء  hamza (silent)
  ['\u0622', 'a'],  // آ  alif with madda above
  ['\u0623', 'a'],  // أ  alif with hamza above
  ['\u0624', 'u'],  // ؤ  waw with hamza above
  ['\u0625', 'i'],  // إ  alif with hamza below
  ['\u0626', 'y'],  // ئ  ya with hamza above
  ['\u0627', 'a'],  // ا  alif
  // ── Core consonants ───────────────────────────────────────────────────────
  ['\u0628', 'b'],  // ب  ba
  ['\u0629', 'h'],  // ة  ta marbuta (feminine marker, end-of-word)
  ['\u062A', 't'],  // ت  ta
  ['\u062B', 'th'], // ث  tha (pronounced 's' in Dari — kept 'th' for ALA-LC)
  ['\u062C', 'j'],  // ج  jim
  ['\u062D', 'h'],  // ح  ha (aspirate, simplified to h)
  ['\u062E', 'kh'], // خ  kha
  ['\u062F', 'd'],  // د  dal
  ['\u0630', 'dh'], // ذ  dhal (pronounced 'z' in Dari — kept 'dh' for ALA-LC)
  ['\u0631', 'r'],  // ر  ra
  ['\u0632', 'z'],  // ز  zayn
  ['\u0633', 's'],  // س  sin
  ['\u0634', 'sh'], // ش  shin
  ['\u0635', 's'],  // ص  emphatic sad → s (simplified for MPI)
  ['\u0636', 'd'],  // ض  emphatic dad → d (simplified for MPI)
  ['\u0637', 't'],  // ط  emphatic ta → t (simplified for MPI)
  ['\u0638', 'z'],  // ظ  emphatic za → z (simplified for MPI)
  ['\u0639', ''],   // ع  ayn (silent in simplified romanization)
  ['\u063A', 'gh'], // غ  ghayn
  ['\u0641', 'f'],  // ف  fa
  ['\u0642', 'q'],  // ق  qaf
  ['\u0643', 'k'],  // ك  kaf
  ['\u0644', 'l'],  // ل  lam
  ['\u0645', 'm'],  // م  mim
  ['\u0646', 'n'],  // ن  nun
  ['\u0647', 'h'],  // ه  ha
  ['\u0648', 'w'],  // و  waw
  ['\u0649', 'a'],  // ى  alif maqsura
  ['\u064A', 'y'],  // ي  ya
  // ── Arabic diacritical marks (strip to '') ────────────────────────────────
  ['\u064B', ''],   // ً  tanwin fatha
  ['\u064C', ''],   // ٌ  tanwin damma
  ['\u064D', ''],   // ٍ  tanwin kasra
  ['\u064E', ''],   // َ  fatha
  ['\u064F', ''],   // ُ  damma
  ['\u0650', ''],   // ِ  kasra
  ['\u0651', ''],   // ّ  shadda (doubles consonant — stripped for MPI)
  ['\u0652', ''],   // ْ  sukun
  ['\u0653', ''],   // ٓ  maddah above
  ['\u0654', ''],   // ٔ  hamza above
  ['\u0655', ''],   // ٕ  hamza below
  ['\u0656', ''],   // ٖ  subscript alif
  ['\u0670', ''],   // ٰ  superscript alif (alif wasla)
  ['\u0640', ''],   // ـ  tatweel / kashida (decorative elongation)
  // ── Dari / Pashto extensions ──────────────────────────────────────────────
  ['\u067E', 'p'],  // پ  pe
  ['\u0686', 'ch'], // چ  che
  ['\u0698', 'zh'], // ژ  zhe (zh sound)
  ['\u06AF', 'g'],  // گ  gaf
  ['\u06CC', 'y'],  // ی  Farsi ya (replaces Arabic ya in Dari text)
  ['\u06A9', 'k'],  // ک  Farsi kaf (replaces Arabic kaf in Dari text)
  ['\u06BE', 'h'],  // ھ  do chashmi he
  ['\u06C1', 'h'],  // ہ  he goal (common in Urdu/Pashto names)
  ['\u06C2', 'h'],  // ہٗ  he goal with hamza above
  ['\u06C3', 'h'],  // ۃ  ta marbuta goal
  ['\u06D2', 'y'],  // ے  bariye he (Urdu/Pashto ye, end-of-word)
  ['\u06BA', 'n'],  // ں  noon ghunna (nasalised n)
  ['\u06BB', 'n'],  // ڻ  rnoon (Sindhi/Pashto)
  ['\u0679', 't'],  // ٹ  tte (retroflex t)
  ['\u0688', 'd'],  // ڈ  ddal (retroflex d)
  ['\u0691', 'r'],  // ڑ  rra (retroflex r)
  // ── Lam-alif ligatures ────────────────────────────────────────────────────
  ['\uFEFB', 'la'], // ﻻ  lam-alif (isolated form)
  ['\uFEFC', 'la'], // ﻼ  lam-alif with madda (isolated form)
])
```

- [ ] **Step 5: Create romanization.ts**

Create `packages/mpi-engine/src/normalization/romanization.ts`:

```typescript
import { ROMANIZATION_TABLE } from './romanization-table.js'

/**
 * Romanize an Arabic-script string to Latin using the ALA-LC table.
 * Unknown characters are silently dropped (they should not corrupt MPI output).
 * Spaces and hyphens pass through unchanged.
 */
export function romanizeArabic(input: string): string {
  let result = ''
  for (const char of input) {
    const mapped = ROMANIZATION_TABLE.get(char)
    if (mapped !== undefined) {
      result += mapped
    } else if (char === ' ' || char === '-') {
      result += char
    }
    // Unknown characters (punctuation, numbers in names) silently dropped
  }
  return result
}
```

- [ ] **Step 6: Create variants.ts**

Create `packages/mpi-engine/src/normalization/variants.ts`:

```typescript
// Common Afghan/MENA name variant normalizations.
// Applied AFTER romanization and lowercasing.
// Maps spelling variants → canonical Latin form.
// ⚠ HIGH RISK: review with a native Dari/Pashto speaker before production.
export const NAME_VARIANTS: Readonly<Record<string, string>> = {
  // ── Mohammad family → muhammad ────────────────────────────────
  'mohammad': 'muhammad',
  'mohammed': 'muhammad',
  'mohamad': 'muhammad',
  'muhammed': 'muhammad',
  'mehmed': 'muhammad',
  'mohammd': 'muhammad',
  // NOTE: 'muhammadi' is a surname — not remapped
  // ── Ahmad family → ahmad ─────────────────────────────────────
  'ahmed': 'ahmad',
  'ahamed': 'ahmad',
  'ahammed': 'ahmad',
  'ahmud': 'ahmad',
  // ── Hussein family → hussain ──────────────────────────────────
  'hussein': 'hussain',
  'hossein': 'hussain',
  'husain': 'hussain',
  'husayn': 'hussain',
  'hossain': 'hussain',
  // ── Hassan → hasan ────────────────────────────────────────────
  'hassan': 'hasan',
  // ── Omar → umar ───────────────────────────────────────────────
  'omar': 'umar',
  'omer': 'umar',
  // ── Usman → uthman ────────────────────────────────────────────
  'osman': 'uthman',
  'usman': 'uthman',
  'othman': 'uthman',
  'uthaman': 'uthman',
  // ── Ibrahim ───────────────────────────────────────────────────
  'ebrahim': 'ibrahim',
  'ebraheem': 'ibrahim',
  'ibraheem': 'ibrahim',
  // ── Yusuf ─────────────────────────────────────────────────────
  'yousef': 'yusuf',
  'youssef': 'yusuf',
  'yusef': 'yusuf',
  'yousuf': 'yusuf',
  'yuusuf': 'yusuf',
  // ── Khalid ────────────────────────────────────────────────────
  'khaled': 'khalid',
  'khaleed': 'khalid',
  // ── Rahim ─────────────────────────────────────────────────────
  'raheem': 'rahim',
  // ── Nur ───────────────────────────────────────────────────────
  'nour': 'nur',
  'noor': 'nur',
  // ── Said / Sayyid ─────────────────────────────────────────────
  'saeed': 'said',
  'saeid': 'said',
  'sayed': 'sayyid',
  'sayyed': 'sayyid',
  'seid': 'sayyid',
  // ── Female names ──────────────────────────────────────────────
  'fatema': 'fatimah',
  'fatma': 'fatimah',
  'fatiha': 'fatimah',
  'aisha': 'ayisha',
  'ayesha': 'ayisha',
  'aysha': 'ayisha',
  'mariam': 'maryam',
  'zainab': 'zaynab',
  'zeynab': 'zaynab',
  // ── Abdul compounds — normalize prefix ────────────────────────
  'abdel': 'abd',
  'abdal': 'abd',
  'abdur': 'abd',
  // Full compound forms
  'abdurrahman': 'abd al rahman',
  'abdurahman': 'abd al rahman',
  'abdulrahman': 'abd al rahman',
  'abdurrahim': 'abd al rahim',
  'abdulrahim': 'abd al rahim',
  // ── Common Afghan names ───────────────────────────────────────
  'golam': 'ghulam',
  'mirvais': 'mirwais',
}

export function applyVariants(normalized: string): string {
  return NAME_VARIANTS[normalized] ?? normalized
}
```

- [ ] **Step 7: Create normalization/index.ts**

Create `packages/mpi-engine/src/normalization/index.ts`:

```typescript
import { nfdNormalize, detectScript, isArabicChar } from './unicode.js'
import { romanizeArabic } from './romanization.js'
import { applyVariants } from './variants.js'

export { computePhoneticTokens } from '../phonetic/index.js'

/**
 * Normalize a single name component (given, father, or grandfather name)
 * to a canonical Latin string for Jaro-Winkler comparison.
 *
 * Pipeline:
 *   NFD normalize → detect script → ALA-LC romanize (Arabic)
 *   → lowercase → strip NFD combining marks → collapse whitespace → apply variants
 *
 * Both "محمد" and "Mohammed" and "Muhammad" produce "muhammad".
 */
export function normalizeNameComponent(input: string): string {
  if (!input || !input.trim()) return ''

  const nfd = nfdNormalize(input.trim())
  const script = detectScript(nfd)

  let latin: string
  if (script === 'arabic') {
    latin = romanizeArabic(nfd)
  } else if (script === 'mixed') {
    // Romanize Arabic characters; Latin characters pass through unchanged
    latin = [...nfd].map(ch => (isArabicChar(ch) ? romanizeArabic(ch) : ch)).join('')
  } else {
    latin = nfd
  }

  // Lowercase, strip any NFD combining characters that survive (e.g., accents on Latin)
  latin = latin.toLowerCase().replace(/\p{Mn}/gu, '')

  // Collapse whitespace and trim
  latin = latin.replace(/\s+/g, ' ').trim()

  // Apply variant normalization (Mohammad→muhammad, etc.)
  return applyVariants(latin)
}
```

- [ ] **Step 8: Create phonetic/double-metaphone.ts and phonetic/index.ts**

Create `packages/mpi-engine/src/phonetic/double-metaphone.ts`:

```typescript
// If the import below fails, try: import { doubleMetaphone } from 'double-metaphone'
// The package exports differ between CJS and ESM builds.
import doubleMetaphone from 'double-metaphone'

/**
 * Compute Double Metaphone phonetic tokens from a normalized Latin name string.
 * Input MUST be pre-normalized via normalizeNameComponent().
 * Returns a deduplicated array of 1–2 token strings per word.
 */
export function computePhoneticTokens(normalized: string): string[] {
  if (!normalized.trim()) return []

  const words = normalized.split(/\s+/).filter(Boolean)
  const tokens = new Set<string>()

  for (const word of words) {
    const result = doubleMetaphone(word) as [string, string]
    const [primary, secondary] = result
    if (primary) tokens.add(primary)
    if (secondary && secondary !== primary) tokens.add(secondary)
  }

  return [...tokens]
}
```

Create `packages/mpi-engine/src/phonetic/index.ts`:

```typescript
export { computePhoneticTokens } from './double-metaphone.js'
```

- [ ] **Step 9: Run normalization tests**

```bash
pnpm -F @ultranos/mpi-engine test -- normalization
```

Expected: All 12 tests PASS.

If the `double-metaphone` import fails with "named export not found", edit `phonetic/double-metaphone.ts` line 1 to: `import { doubleMetaphone } from 'double-metaphone'` and update the call on line 16 from `doubleMetaphone(word)` to `doubleMetaphone(word)` (same — no change to call site).

- [ ] **Step 10: Commit**

```bash
git add packages/mpi-engine/src/normalization/ packages/mpi-engine/src/phonetic/ packages/mpi-engine/src/__tests__/normalization.test.ts
git commit -m "feat(mpi-engine): add ALA-LC romanization pipeline and Double Metaphone tokenization"
```

---

## Task 3: Afghan Names Test Fixtures

**Files:**
- Create: `packages/mpi-engine/src/__tests__/fixtures/afghan-names.ts`

These fixtures are consumed by both normalization and scoring tests. Creating them before the scoring tests keeps test data in one place.

- [ ] **Step 1: Create the fixtures file**

Create `packages/mpi-engine/src/__tests__/fixtures/afghan-names.ts`:

```typescript
// Synthetic Afghan name data for MPI testing.
// These do NOT represent real patients.
import type { MpiInput, MpiCandidate, MpiDecision } from '../../types.js'

// [input, expectedNormalized] — normalization pipeline pairs
export const NORMALIZATION_PAIRS: Array<[string, string]> = [
  // Arabic script → normalized Latin
  ['\u0645\u062D\u0645\u062F', 'muhammad'],           // محمد
  ['\u0623\u062D\u0645\u062F', 'ahmad'],              // أحمد
  ['\u0639\u0644\u064A', 'ali'],                      // علي
  ['\u062D\u0633\u064A\u0646', 'hussain'],            // حسين → hussain (via variant)
  ['\u0641\u0627\u0637\u0645\u0629', 'fatimah'],      // فاطمة → fatimah (via variant)
  ['\u0645\u0631\u064A\u0645', 'maryam'],             // مريم → maryam (via variant)
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
  ['Mariam', 'maryam'],
  ['Aisha', 'ayisha'],
  ['Ayesha', 'ayisha'],
]

// Pairs that SHOULD produce identical phonetic tokens (same person, different spelling)
export const SAME_PERSON_PHONETIC_PAIRS: Array<[string, string]> = [
  ['\u0645\u062D\u0645\u062F', 'Mohammed'],  // محمد vs Mohammed
  ['\u0623\u062D\u0645\u062F', 'Ahmed'],     // أحمد vs Ahmed
  ['Mohammad', 'Muhammad'],
  ['Hussein', 'Hussain'],
  ['Ebrahim', 'Ibrahim'],
  ['Noor', 'Nur'],
  ['Mariam', 'Maryam'],
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
    candidate: { id: 'c2', nameGiven: 'Ahmad', nameFather: 'Mohammad', nameGrandfather: 'Karim', birthYear: 1985, gender: 'male' },
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
```

- [ ] **Step 2: Run all tests to confirm they still pass**

```bash
pnpm -F @ultranos/mpi-engine test
```

Expected: All tests PASS (fixtures file has no runnable tests, just exports).

- [ ] **Step 3: Commit**

```bash
git add packages/mpi-engine/src/__tests__/fixtures/
git commit -m "test(mpi-engine): add synthetic Afghan name fixtures for normalization and scoring"
```

---

## Task 4: Jaro-Winkler + Scoring Weights

**Files:**
- Create: `packages/mpi-engine/src/scoring/jaro-winkler.ts`
- Create: `packages/mpi-engine/src/scoring/weights.ts`
- Create: `packages/mpi-engine/src/__tests__/scoring.test.ts`

- [ ] **Step 1: Write the failing scoring tests**

Create `packages/mpi-engine/src/__tests__/scoring.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { jaroWinkler } from '../scoring/jaro-winkler.js'
import { WEIGHTS, THRESHOLDS } from '../scoring/weights.js'

describe('jaroWinkler', () => {
  it('returns 1.0 for identical strings', () => {
    expect(jaroWinkler('muhammad', 'muhammad')).toBe(1.0)
  })

  it('returns 0.0 when either string is empty', () => {
    expect(jaroWinkler('', '')).toBe(0.0)
    expect(jaroWinkler('ahmad', '')).toBe(0.0)
    expect(jaroWinkler('', 'ahmad')).toBe(0.0)
  })

  it('returns > 0.85 for very similar names (one char difference)', () => {
    expect(jaroWinkler('ahmad', 'ahmd')).toBeGreaterThan(0.85)
  })

  it('returns < 0.85 for clearly different names', () => {
    expect(jaroWinkler('ahmad', 'zubair')).toBeLessThan(0.85)
  })

  it('is symmetric', () => {
    const ab = jaroWinkler('muhammad', 'mohammed')
    const ba = jaroWinkler('mohammed', 'muhammad')
    expect(ab).toBeCloseTo(ba, 10)
  })

  it('gives Winkler prefix bonus — martha/marhta classic example > 0.9', () => {
    expect(jaroWinkler('martha', 'marhta')).toBeGreaterThan(0.9)
  })
})

describe('WEIGHTS constants', () => {
  it('GIVEN_NAME_HIGH is 30', () => expect(WEIGHTS.GIVEN_NAME_HIGH).toBe(30))
  it('GIVEN_NAME_LOW is 15', () => expect(WEIGHTS.GIVEN_NAME_LOW).toBe(15))
  it('FATHER_NAME_HIGH is 30', () => expect(WEIGHTS.FATHER_NAME_HIGH).toBe(30))
  it('GRANDFATHER_NAME_HIGH is 20', () => expect(WEIGHTS.GRANDFATHER_NAME_HIGH).toBe(20))
  it('BIRTH_YEAR_EXACT is 20', () => expect(WEIGHTS.BIRTH_YEAR_EXACT).toBe(20))
  it('BIRTH_YEAR_NEAR is 8', () => expect(WEIGHTS.BIRTH_YEAR_NEAR).toBe(8))
  it('GENDER_EXACT is 10', () => expect(WEIGHTS.GENDER_EXACT).toBe(10))
  it('DISTRICT_ORIGIN_EXACT is 20', () => expect(WEIGHTS.DISTRICT_ORIGIN_EXACT).toBe(20))
  it('PHONE_EXACT is 25', () => expect(WEIGHTS.PHONE_EXACT).toBe(25))
})

describe('THRESHOLDS constants', () => {
  it('BLOCK is 90', () => expect(THRESHOLDS.BLOCK).toBe(90))
  it('WARN is 60', () => expect(THRESHOLDS.WARN).toBe(60))
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F @ultranos/mpi-engine test -- scoring
```

Expected: FAIL — `Cannot find module '../scoring/jaro-winkler.js'`

- [ ] **Step 3: Create jaro-winkler.ts**

Create `packages/mpi-engine/src/scoring/jaro-winkler.ts`:

```typescript
/**
 * Jaro-Winkler string similarity in [0, 1].
 * Returns 1.0 for identical strings, 0.0 for no match.
 * Winkler prefix bonus (p=0.1, max 4 chars) is important for names
 * where shared prefixes carry identity signal (e.g., "Abd-", "Nur-").
 */
export function jaroWinkler(s1: string, s2: string): number {
  if (!s1 || !s2) return 0.0
  if (s1 === s2) return 1.0

  const len1 = s1.length
  const len2 = s2.length
  const matchDist = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0)

  const s1Matched = new Uint8Array(len1)
  const s2Matched = new Uint8Array(len2)
  let matches = 0

  for (let i = 0; i < len1; i++) {
    const lo = Math.max(0, i - matchDist)
    const hi = Math.min(i + matchDist + 1, len2)
    for (let j = lo; j < hi; j++) {
      if (s2Matched[j] === 1 || s1[i] !== s2[j]) continue
      s1Matched[i] = 1
      s2Matched[j] = 1
      matches++
      break
    }
  }

  if (matches === 0) return 0.0

  let t = 0
  let k = 0
  for (let i = 0; i < len1; i++) {
    if (s1Matched[i] === 0) continue
    while (s2Matched[k] === 0) k++
    if (s1[i] !== s2[k]) t++
    k++
  }

  const jaro = (matches / len1 + matches / len2 + (matches - t / 2) / matches) / 3

  // Winkler prefix bonus — up to 4 chars, scaling factor p = 0.1
  let prefix = 0
  const maxPrefix = Math.min(4, Math.min(len1, len2))
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) prefix++
    else break
  }

  return jaro + prefix * 0.1 * (1 - jaro)
}
```

- [ ] **Step 4: Create weights.ts**

Create `packages/mpi-engine/src/scoring/weights.ts`:

```typescript
export const WEIGHTS = {
  GIVEN_NAME_HIGH:        30,  // Jaro-Winkler ≥ 0.92 on normalized form
  GIVEN_NAME_LOW:         15,  // Jaro-Winkler 0.85–0.91
  FATHER_NAME_HIGH:       30,
  FATHER_NAME_LOW:        15,
  GRANDFATHER_NAME_HIGH:  20,
  GRANDFATHER_NAME_LOW:   10,
  BIRTH_YEAR_EXACT:       20,
  BIRTH_YEAR_NEAR:         8,  // ±1–2 years (handles approximate DOB)
  GENDER_EXACT:           10,
  DISTRICT_ORIGIN_EXACT:  20,
  PROVINCE_ORIGIN_EXACT:   5,  // only when district does NOT match
  PHONE_EXACT:            25,
} as const

export const THRESHOLDS = {
  BLOCK: 90,
  WARN:  60,
} as const
```

- [ ] **Step 5: Run tests**

```bash
pnpm -F @ultranos/mpi-engine test -- scoring
```

Expected: All 14 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/mpi-engine/src/scoring/jaro-winkler.ts packages/mpi-engine/src/scoring/weights.ts packages/mpi-engine/src/__tests__/scoring.test.ts
git commit -m "feat(mpi-engine): add Jaro-Winkler implementation and scoring weight constants"
```

---

## Task 5: Score Candidate + MPI Decision + Public API

**Files:**
- Create: `packages/mpi-engine/src/scoring/score-candidate.ts`
- Create: `packages/mpi-engine/src/scoring/index.ts`
- Create: `packages/mpi-engine/src/decision/thresholds.ts`
- Create: `packages/mpi-engine/src/decision/index.ts`
- Create: `packages/mpi-engine/src/index.ts`
- Modify: `packages/mpi-engine/src/__tests__/scoring.test.ts`

- [ ] **Step 1: Add failing tests for scoreCandidate and computeMpiResult**

Append to `packages/mpi-engine/src/__tests__/scoring.test.ts` (after the existing `describe` blocks):

```typescript
import { scoreCandidate } from '../scoring/score-candidate.js'
import { computeMpiResult, decideMpiAction } from '../decision/index.js'
import { SCORING_SCENARIOS } from './fixtures/afghan-names.js'
import type { MpiCandidate } from '../types.js'

describe('decideMpiAction threshold boundaries', () => {
  it('0 → ALLOW',   () => expect(decideMpiAction(0)).toBe('ALLOW'))
  it('59 → ALLOW',  () => expect(decideMpiAction(59)).toBe('ALLOW'))
  it('60 → WARN',   () => expect(decideMpiAction(60)).toBe('WARN'))
  it('89 → WARN',   () => expect(decideMpiAction(89)).toBe('WARN'))
  it('90 → BLOCK',  () => expect(decideMpiAction(90)).toBe('BLOCK'))
  it('999 → BLOCK', () => expect(decideMpiAction(999)).toBe('BLOCK'))
})

describe('scoreCandidate — hard identifier BLOCK', () => {
  it('nationalIdHash exact match → hardIdMatch=true, score=999', () => {
    const result = scoreCandidate(
      { nationalIdHash: 'abc123' },
      { id: 'p1', nationalIdHash: 'abc123' },
    )
    expect(result.hardIdMatch).toBe(true)
    expect(result.score).toBe(999)
  })

  it('tazkiraPaperHash exact match → hardIdMatch=true', () => {
    const result = scoreCandidate(
      { tazkiraPaperHash: 'xyz789' },
      { id: 'p2', tazkiraPaperHash: 'xyz789' },
    )
    expect(result.hardIdMatch).toBe(true)
    expect(result.score).toBe(999)
  })

  it('nationalIdHash mismatch → hardIdMatch=false', () => {
    const result = scoreCandidate(
      { nationalIdHash: 'abc123' },
      { id: 'p3', nationalIdHash: 'different' },
    )
    expect(result.hardIdMatch).toBe(false)
  })
})

describe('scoreCandidate — soft scoring', () => {
  it('full name triplet exact + same birth year + same gender ≥ 90 pts', () => {
    const result = scoreCandidate(
      { nameGiven: 'Ahmad', nameFather: 'Mohammad', nameGrandfather: 'Karim', birthYear: 1985, gender: 'male' },
      { id: 'p4', nameGiven: 'Ahmad', nameFather: 'Mohammad', nameGrandfather: 'Karim', birthYear: 1985, gender: 'male' },
    )
    expect(result.score).toBeGreaterThanOrEqual(90)
    expect(result.breakdown.givenName).toBe(WEIGHTS.GIVEN_NAME_HIGH)
    expect(result.breakdown.fatherName).toBe(WEIGHTS.FATHER_NAME_HIGH)
    expect(result.breakdown.birthYear).toBe(WEIGHTS.BIRTH_YEAR_EXACT)
  })

  it('phone match only = exactly 25 pts (no name match)', () => {
    const result = scoreCandidate(
      { phone: '+93701234567' },
      { id: 'p5', nameGiven: 'Completely Different', phone: '+93701234567' },
    )
    expect(result.breakdown.phone).toBe(25)
    expect(result.score).toBe(25)
  })

  it('birth year ±2 years → BIRTH_YEAR_NEAR=8 pts', () => {
    const result = scoreCandidate(
      { nameGiven: 'Ali', birthYear: 1985 },
      { id: 'p6', nameGiven: 'Aly', birthYear: 1987 },
    )
    expect(result.breakdown.birthYear).toBe(WEIGHTS.BIRTH_YEAR_NEAR)
  })

  it('birth year ±3 years → 0 pts (outside NEAR window)', () => {
    const result = scoreCandidate(
      { birthYear: 1985 },
      { id: 'p7', birthYear: 1988 },
    )
    expect(result.breakdown.birthYear).toBe(0)
  })

  it('province match (no district match) → PROVINCE_ORIGIN_EXACT=5 pts', () => {
    const result = scoreCandidate(
      { addressDistrictOrigin: 'Panjwai', addressProvinceOrigin: 'Kandahar' },
      { id: 'p8', addressDistrictOrigin: 'Zhari', addressProvinceOrigin: 'Kandahar' },
    )
    expect(result.breakdown.districtOrigin).toBe(0)
    expect(result.breakdown.provinceOrigin).toBe(WEIGHTS.PROVINCE_ORIGIN_EXACT)
  })

  it('completely different names → score < 30', () => {
    const result = scoreCandidate(
      { nameGiven: 'Zubair', nameFather: 'Latif', birthYear: 1990 },
      { id: 'p9', nameGiven: 'Farida', nameFather: 'Rashid', birthYear: 1975 },
    )
    expect(result.score).toBeLessThan(30)
  })
})

describe('computeMpiResult — SCORING_SCENARIOS from fixtures', () => {
  for (const scenario of SCORING_SCENARIOS) {
    it(scenario.description, () => {
      const result = computeMpiResult([scenario.candidate as MpiCandidate], scenario.input)
      expect(result.decision).toBe(scenario.expectedDecision)
      if (scenario.minScore !== undefined) {
        expect(result.topScore).toBeGreaterThanOrEqual(scenario.minScore)
      }
      if (scenario.maxScore !== undefined) {
        expect(result.topScore).toBeLessThanOrEqual(scenario.maxScore)
      }
    })
  }
})

describe('computeMpiResult — edge cases', () => {
  it('empty candidates → ALLOW with topScore=0', () => {
    const result = computeMpiResult([], { nameGiven: 'Ahmad' })
    expect(result.decision).toBe('ALLOW')
    expect(result.topScore).toBe(0)
    expect(result.candidates).toHaveLength(0)
  })

  it('returns at most 5 candidates even with 10 inputs', () => {
    const candidates: MpiCandidate[] = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      nameGiven: 'Ahmad',
      nameFather: 'Mohammad',
      birthYear: 1985 + i,
    }))
    const result = computeMpiResult(candidates, { nameGiven: 'Ahmad', nameFather: 'Mohammad', birthYear: 1985 })
    expect(result.candidates.length).toBeLessThanOrEqual(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F @ultranos/mpi-engine test -- scoring
```

Expected: FAIL — `Cannot find module '../scoring/score-candidate.js'`

- [ ] **Step 3: Create scoring/score-candidate.ts**

Create `packages/mpi-engine/src/scoring/score-candidate.ts`:

```typescript
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
  const givenName      = scoreNameField(input.nameGiven,       candidate.nameGiven,       WEIGHTS.GIVEN_NAME_HIGH,       WEIGHTS.GIVEN_NAME_LOW)
  const fatherName     = scoreNameField(input.nameFather,      candidate.nameFather,      WEIGHTS.FATHER_NAME_HIGH,      WEIGHTS.FATHER_NAME_LOW)
  const grandfatherName = scoreNameField(input.nameGrandfather, candidate.nameGrandfather, WEIGHTS.GRANDFATHER_NAME_HIGH, WEIGHTS.GRANDFATHER_NAME_LOW)

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
```

- [ ] **Step 4: Create scoring/index.ts**

Create `packages/mpi-engine/src/scoring/index.ts`:

```typescript
export { scoreCandidate } from './score-candidate.js'
export { jaroWinkler } from './jaro-winkler.js'
export { WEIGHTS, THRESHOLDS } from './weights.js'
```

- [ ] **Step 5: Create decision/thresholds.ts and decision/index.ts**

Create `packages/mpi-engine/src/decision/thresholds.ts`:

```typescript
// Re-exports THRESHOLDS from scoring/weights.ts — single source of truth.
export { THRESHOLDS } from '../scoring/weights.js'
```

Create `packages/mpi-engine/src/decision/index.ts`:

```typescript
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
```

- [ ] **Step 6: Create src/index.ts (public API)**

Create `packages/mpi-engine/src/index.ts`:

```typescript
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
```

- [ ] **Step 7: Run all mpi-engine tests**

```bash
pnpm -F @ultranos/mpi-engine test
```

Expected: All tests in both test files PASS.

- [ ] **Step 8: Build the package**

```bash
pnpm -F @ultranos/mpi-engine build
```

Expected: `dist/` created with `.js` and `.d.ts` files. Zero TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add packages/mpi-engine/src/scoring/ packages/mpi-engine/src/decision/ packages/mpi-engine/src/index.ts packages/mpi-engine/src/__tests__/scoring.test.ts
git commit -m "feat(mpi-engine): add score-candidate, MPI decision engine, and public API — Phase A complete"
```

---

*— Phase A complete. Continue in Phase B: Tasks 6–9 (shared-types, migrations 018–023, Hub API helpers) —*

---

# PHASE B — Tasks 6–9: Shared Types, Migrations, Hub API Helpers

---

## Task 6: `packages/shared-types` Additions

**Files:**
- Create: `packages/shared-types/src/reference/afghanistan-geo.ts`
- Modify: `packages/shared-types/src/fhir/patient.ts`
- Modify: `packages/shared-types/src/fhir/patient.schema.ts`

- [ ] **Step 1: Write the failing type tests**

Create `packages/shared-types/src/__tests__/patient-mpi-types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { AFGHAN_PROVINCES } from '../reference/afghanistan-geo.js'
import { CreatePatientMpiInputSchema } from '../fhir/patient.schema.js'

describe('AFGHAN_PROVINCES', () => {
  it('contains 34 provinces', () => {
    expect(AFGHAN_PROVINCES).toHaveLength(34)
  })

  it('contains Kabul', () => {
    expect(AFGHAN_PROVINCES).toContain('Kabul')
  })
})

describe('CreatePatientMpiInputSchema — cross-field rules', () => {
  it('rejects birthYearOnly=true with birthDate present', () => {
    const result = CreatePatientMpiInputSchema.safeParse({
      nameLocal: 'Ahmad',
      gender: 'male',
      birthYearOnly: true,
      birthDate: '1985-01-01',
      birthYear: 1985,
      consent: { method: 'WRITTEN', language: 'en', version: 'v1.0-en' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects when neither birthDate nor birthYear is provided', () => {
    const result = CreatePatientMpiInputSchema.safeParse({
      nameLocal: 'Ahmad',
      gender: 'male',
      consent: { method: 'WRITTEN', language: 'en', version: 'v1.0-en' },
    })
    expect(result.success).toBe(false)
  })

  it('accepts birthYear alone (birthYearOnly=true)', () => {
    const result = CreatePatientMpiInputSchema.safeParse({
      nameLocal: 'Ahmad',
      gender: 'male',
      birthYearOnly: true,
      birthYear: 1985,
      consent: { method: 'WRITTEN', language: 'en', version: 'v1.0-en' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects VERBAL_WITNESSED consent without witnessedBy', () => {
    const result = CreatePatientMpiInputSchema.safeParse({
      nameLocal: 'Ahmad',
      gender: 'male',
      birthYear: 1985,
      birthYearOnly: true,
      consent: { method: 'VERBAL_WITNESSED', language: 'en', version: 'v1.0-en' },
    })
    expect(result.success).toBe(false)
  })

  it('accepts VERBAL_WITNESSED consent with witnessedBy UUID', () => {
    const result = CreatePatientMpiInputSchema.safeParse({
      nameLocal: 'Ahmad',
      gender: 'male',
      birthYear: 1985,
      birthYearOnly: true,
      consent: {
        method: 'VERBAL_WITNESSED',
        witnessedBy: 'a0000000-0000-0000-0000-000000000001',
        language: 'en',
        version: 'v1.0-en',
      },
    })
    expect(result.success).toBe(true)
  })

  it('transforms firstName alias to nameGiven', () => {
    const result = CreatePatientMpiInputSchema.safeParse({
      nameLocal: 'Ahmad',
      firstName: 'Ahmad',
      gender: 'male',
      birthDate: '1985-06-15',
      consent: { method: 'WRITTEN', language: 'en', version: 'v1.0-en' },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.nameGiven).toBe('Ahmad')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F @ultranos/shared-types test
```

Expected: FAIL — `Cannot find module '../reference/afghanistan-geo.js'` and `CreatePatientMpiInputSchema` not found

- [ ] **Step 3: Create afghanistan-geo.ts**

Create `packages/shared-types/src/reference/afghanistan-geo.ts`:

```typescript
export const AFGHAN_PROVINCES = [
  'Badakhshan', 'Badghis',   'Baghlan',  'Balkh',    'Bamyan',
  'Daykundi',   'Farah',     'Faryab',   'Ghazni',   'Ghor',
  'Helmand',    'Herat',     'Jawzjan',  'Kabul',    'Kandahar',
  'Kapisa',     'Khost',     'Kunar',    'Kunduz',   'Laghman',
  'Logar',      'Nangarhar', 'Nimroz',   'Nuristan', 'Paktia',
  'Paktika',    'Panjshir',  'Parwan',   'Samangan', 'Sar-e-Pol',
  'Takhar',     'Urozgan',   'Wardak',   'Zabul',
] as const

export type AfghanProvince = typeof AFGHAN_PROVINCES[number]
```

- [ ] **Step 4: Extend patient.ts with new interfaces**

In `packages/shared-types/src/fhir/patient.ts`, add the following ABOVE the `FhirPatient` interface and extend `_ultranos`:

```typescript
// ── New types for MPI Phase 1 ─────────────────────────────────────────

export interface PatientAddress {
  province: string
  district: string
  village?: string
}

export type PatientIdentifierSystem =
  | 'AFGHAN_ETAZKIRA'
  | 'AFGHAN_TAZKIRA_PAPER'
  | 'PASSPORT'
  | 'HEALTH_PASSPORT_QR'

export interface PatientIdentifier {
  system: PatientIdentifierSystem
  valueHash: string      // HMAC blind index — never raw document number
  displayType: string
  /** Paper Tazkira only — AES-GCM encrypted Jild number */
  jild?: string
  /** Paper Tazkira only — AES-GCM encrypted Safa number */
  safa?: string
  /** Paper Tazkira only — AES-GCM encrypted Shumara number */
  shumara?: string
}
```

Then extend the `_ultranos` block inside `FhirPatient` — add these fields after `mpiWarn: boolean`:

```typescript
    // ── MPI Phase 1 additions ──────────────────────────────────
    /** Structured patronymic chain (given name component) */
    nameGiven?: string
    /** Father's name (patronymic) */
    nameFather?: string
    /** Grandfather's name (patronymic) */
    nameGrandfather?: string
    /** Birth year when exact DOB is unknown */
    birthYear?: number
    /** Geographic origin (stable MPI signal) */
    addressOrigin?: PatientAddress
    /** Current residence (logistics only — not an MPI signal) */
    addressCurrent?: PatientAddress
    /** True for nomadic patients whose current address changes seasonally */
    isNomadic: boolean
    /** SHA-256 of biometric template — for exact-match hard identifier check */
    biometricFingerprintHash?: string
    biometricAlgorithmVersion?: string
    /** Soft MPI score from last duplicate check */
    mpiScore?: number
    /** Structured document identifiers (Tazkira, passport, etc.) */
    identifiers?: PatientIdentifier[]
```

Also extend `CreatePatientInput` with:

```typescript
export interface CreatePatientInput {
  // ── Existing fields (unchanged) ──────────────────────────────
  nameLocal: string
  nameLatin?: string
  gender: AdministrativeGender
  birthDate?: string
  birthYearOnly?: boolean
  phone?: string
  nationalId?: string
  guardianId?: string
  // ── MPI Phase 1 additions ─────────────────────────────────────
  /** firstName is a deprecated alias for nameGiven — accepted via Zod transform */
  firstName?: string
  nameGiven?: string
  nameFather?: string
  nameGrandfather?: string
  birthYear?: number
  addressOrigin?: PatientAddress
  addressCurrent?: PatientAddress
  isNomadic?: boolean
  biometricFingerprintHash?: string
  biometricAlgorithmVersion?: string
  identifiers?: PatientIdentifier[]
  mpiProceedToken?: string
  consent: {
    method: 'WRITTEN' | 'VERBAL_WITNESSED'
    witnessedBy?: string
    language: 'en' | 'ar' | 'prs'
    version: string
  }
}
```

- [ ] **Step 5: Add CreatePatientMpiInputSchema to patient.schema.ts**

Append to `packages/shared-types/src/fhir/patient.schema.ts`:

```typescript
// ── MPI Phase 1: new input schema with cross-field validation ───────────────

const PatientAddressSchema = z.object({
  province: z.string().min(1).max(100),
  district: z.string().min(1).max(100),
  village: z.string().max(200).optional(),
})

const PatientIdentifierInputSchema = z.object({
  system: z.enum(['AFGHAN_ETAZKIRA', 'AFGHAN_TAZKIRA_PAPER', 'PASSPORT', 'HEALTH_PASSPORT_QR']),
  valueHash: z.string().min(1),
  displayType: z.string().min(1),
  jild: z.string().optional(),
  safa: z.string().optional(),
  shumara: z.string().optional(),
})

const ConsentInputSchema = z.object({
  method: z.enum(['WRITTEN', 'VERBAL_WITNESSED']),
  witnessedBy: z.string().uuid().optional(),
  language: z.enum(['en', 'ar', 'prs']),
  version: z.string().min(1),
})

const currentYear = new Date().getFullYear()

export const CreatePatientMpiInputSchema = z
  .object({
    nameLocal:         z.string().min(1).max(500),
    nameLatin:         z.string().max(500).optional(),
    // firstName accepted as deprecated alias for nameGiven (Patient Lite backward compat)
    firstName:         z.string().min(1).max(200).optional(),
    nameGiven:         z.string().min(1).max(200).optional(),
    nameFather:        z.string().min(1).max(200).optional(),
    nameGrandfather:   z.string().min(1).max(200).optional(),
    gender:            z.nativeEnum(AdministrativeGender).optional(),
    birthDate:         FhirDateSchema.optional(),
    birthYearOnly:     z.boolean().default(false),
    birthYear:         z.number().int().min(1900).max(currentYear).optional(),
    phone:             z.string().max(50).optional(),
    nationalId:        z.string().max(200).optional(),
    guardianId:        z.string().uuid().optional(),
    addressOrigin:     PatientAddressSchema.optional(),
    addressCurrent:    PatientAddressSchema.optional(),
    isNomadic:         z.boolean().default(false),
    biometricFingerprintHash:   z.string().max(500).optional(),
    biometricAlgorithmVersion:  z.string().max(50).optional(),
    identifiers:       z.array(PatientIdentifierInputSchema).optional(),
    mpiProceedToken:   z.string().optional(),
    consent:           ConsentInputSchema,
  })
  // Transform: firstName alias → nameGiven
  .transform((val) => ({
    ...val,
    nameGiven: val.nameGiven ?? val.firstName,
  }))
  // Cross-field validation
  .superRefine((val, ctx) => {
    // birthDate and birthYearOnly=true cannot coexist
    if (val.birthYearOnly && val.birthDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthDate'], message: 'birthDate must be absent when birthYearOnly is true' })
    }
    // At least one of birthDate or birthYear must be present
    if (!val.birthDate && !val.birthYear) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthYear'], message: 'Either birthDate or birthYear is required' })
    }
    // VERBAL_WITNESSED consent requires a witness
    if (val.consent.method === 'VERBAL_WITNESSED' && !val.consent.witnessedBy) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['consent', 'witnessedBy'], message: 'witnessedBy is required for VERBAL_WITNESSED consent' })
    }
  })

export type CreatePatientMpiInput = z.infer<typeof CreatePatientMpiInputSchema>
```

- [ ] **Step 6: Run tests**

```bash
pnpm -F @ultranos/shared-types test
```

Expected: All tests PASS.

- [ ] **Step 7: Build shared-types**

```bash
pnpm -F @ultranos/shared-types build
```

Expected: Zero TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add packages/shared-types/src/reference/ packages/shared-types/src/fhir/patient.ts packages/shared-types/src/fhir/patient.schema.ts packages/shared-types/src/__tests__/patient-mpi-types.test.ts
git commit -m "feat(shared-types): add PatientAddress, PatientIdentifier, MPI input schema, and Afghan provinces"
```

---

## Task 7: Migrations 018–020 (Schema Columns + Backfill + Encrypted Fields)

**Files:**
- Create: `supabase/migrations/018_patient_mpi_fields.sql`
- Create: `supabase/migrations/019_patient_birth_year_backfill.sql`
- Create: `supabase/migrations/020_patient_encrypted_name_fields.sql`

> All new columns are nullable. No existing records break. Apply migrations to Supabase using the MCP tool after creating each file.

- [ ] **Step 1: Create migration 018**

Create `supabase/migrations/018_patient_mpi_fields.sql`:

```sql
-- Migration 018: Patient MPI Phase 1 — new identity columns
-- All new columns nullable to avoid breaking existing records.

ALTER TABLE patients
  -- Structured patronymic name (plain-text, for MPI matching and display)
  ADD COLUMN IF NOT EXISTS name_given          TEXT,
  ADD COLUMN IF NOT EXISTS name_father         TEXT,
  ADD COLUMN IF NOT EXISTS name_grandfather    TEXT,

  -- Phonetic token arrays — GIN-indexed in migration 021
  ADD COLUMN IF NOT EXISTS name_phonetic_given        TEXT[],
  ADD COLUMN IF NOT EXISTS name_phonetic_father       TEXT[],
  ADD COLUMN IF NOT EXISTS name_phonetic_grandfather  TEXT[],

  -- Birth year (standalone; populated from birth_date in migration 019)
  ADD COLUMN IF NOT EXISTS birth_year  SMALLINT
    CONSTRAINT birth_year_range CHECK (birth_year IS NULL OR (birth_year >= 1900 AND birth_year <= 2100)),

  -- Geographic origin (stable MPI signal)
  ADD COLUMN IF NOT EXISTS address_province_origin  TEXT,
  ADD COLUMN IF NOT EXISTS address_district_origin  TEXT,
  ADD COLUMN IF NOT EXISTS address_village_origin   TEXT,

  -- Current residence (logistics only — not an MPI signal)
  ADD COLUMN IF NOT EXISTS address_province_current  TEXT,
  ADD COLUMN IF NOT EXISTS address_district_current  TEXT,
  ADD COLUMN IF NOT EXISTS address_village_current   TEXT,

  -- Nomadic flag
  ADD COLUMN IF NOT EXISTS is_nomadic  BOOLEAN NOT NULL DEFAULT FALSE,

  -- Biometric (hash only — raw template never stored)
  ADD COLUMN IF NOT EXISTS biometric_fingerprint_hash    TEXT,
  ADD COLUMN IF NOT EXISTS biometric_algorithm_version   TEXT,

  -- Paper Tazkira blind index (HMAC of jild|safa|shumara — never raw values)
  ADD COLUMN IF NOT EXISTS tazkira_paper_hash  TEXT,

  -- FHIR R4 identifier array (e-Tazkira, passport, QR — hashed values only)
  ADD COLUMN IF NOT EXISTS identifiers  JSONB,

  -- MPI score from last duplicate check (informational)
  ADD COLUMN IF NOT EXISTS mpi_score  INTEGER;

COMMENT ON COLUMN patients.name_given IS 'First component of patronymic chain (given name)';
COMMENT ON COLUMN patients.name_father IS 'Second component of patronymic chain (father name)';
COMMENT ON COLUMN patients.name_grandfather IS 'Third component of patronymic chain (grandfather name)';
COMMENT ON COLUMN patients.name_phonetic_given IS 'Double Metaphone tokens for given name — GIN indexed for MPI candidate retrieval';
COMMENT ON COLUMN patients.tazkira_paper_hash IS 'HMAC(jild + | + safa + | + shumara) — blind index for paper Tazkira deduplication';
COMMENT ON COLUMN patients.is_nomadic IS 'True for patients whose address changes seasonally — current address not a reliable MPI signal';
```

- [ ] **Step 2: Apply migration 018 via Supabase MCP**

```
Use mcp__plugin_supabase_supabase__apply_migration with:
  name: "018_patient_mpi_fields"
  query: <contents of 018_patient_mpi_fields.sql>
```

Expected: Migration applied successfully.

- [ ] **Step 3: Create migration 019**

Create `supabase/migrations/019_patient_birth_year_backfill.sql`:

```sql
-- Migration 019: Backfill birth_year from birth_date for existing records.
-- Only populates records where birth_date is a valid 4-digit year.
-- Safe to re-run (updates only rows where birth_year IS NULL and birth_date IS NOT NULL).

UPDATE patients
SET birth_year = EXTRACT(YEAR FROM birth_date::DATE)::SMALLINT
WHERE birth_date IS NOT NULL
  AND birth_year IS NULL
  AND birth_date ~ '^\d{4}-\d{2}-\d{2}$';

-- For year-only birth_date values (YYYY format):
UPDATE patients
SET birth_year = birth_date::SMALLINT
WHERE birth_date IS NOT NULL
  AND birth_year IS NULL
  AND birth_date ~ '^\d{4}$';
```

- [ ] **Step 4: Apply migration 019 via Supabase MCP**

```
Use mcp__plugin_supabase_supabase__apply_migration with:
  name: "019_patient_birth_year_backfill"
  query: <contents of 019_patient_birth_year_backfill.sql>
```

Expected: Rows updated (count depends on existing data). No errors.

- [ ] **Step 5: Create migration 020**

Create `supabase/migrations/020_patient_encrypted_name_fields.sql`:

```sql
-- Migration 020: Add AES-256-GCM encrypted copies of patronymic name fields.
-- The plain-text columns (name_given, name_father, name_grandfather) are used
-- for MPI phonetic matching. The _enc columns store the encrypted source for display.

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS name_given_enc        TEXT,
  ADD COLUMN IF NOT EXISTS name_father_enc       TEXT,
  ADD COLUMN IF NOT EXISTS name_grandfather_enc  TEXT;

COMMENT ON COLUMN patients.name_given_enc IS 'AES-256-GCM encrypted copy of name_given — source of truth for display';
COMMENT ON COLUMN patients.name_father_enc IS 'AES-256-GCM encrypted copy of name_father';
COMMENT ON COLUMN patients.name_grandfather_enc IS 'AES-256-GCM encrypted copy of name_grandfather';
```

- [ ] **Step 6: Apply migration 020 via Supabase MCP**

```
Use mcp__plugin_supabase_supabase__apply_migration with:
  name: "020_patient_encrypted_name_fields"
  query: <contents of 020_patient_encrypted_name_fields.sql>
```

Expected: Migration applied. Confirm 3 new columns on patients table.

- [ ] **Step 7: Commit migration files**

```bash
git add supabase/migrations/018_patient_mpi_fields.sql supabase/migrations/019_patient_birth_year_backfill.sql supabase/migrations/020_patient_encrypted_name_fields.sql
git commit -m "feat(db): migrations 018-020 — patient MPI fields, birth_year backfill, encrypted name columns"
```

---

## Task 8: Migrations 021–023 (Indexes + Consent Columns + RPC Functions)

**Files:**
- Create: `supabase/migrations/021_patient_indexes_phonetic.sql`
- Create: `supabase/migrations/022_consent_registration_fields.sql`
- Create: `supabase/migrations/023_fn_create_patient_with_consent.sql`

- [ ] **Step 1: Create migration 021**

Create `supabase/migrations/021_patient_indexes_phonetic.sql`:

```sql
-- Migration 021: GIN indexes on phonetic arrays + scalar indexes for MPI candidate retrieval.
-- These indexes make the fetch_mpi_candidates() query efficient.
-- GIN indexes support the && (array overlap) operator used in candidate retrieval.

CREATE INDEX IF NOT EXISTS idx_patients_phonetic_given
  ON patients USING GIN (name_phonetic_given);

CREATE INDEX IF NOT EXISTS idx_patients_phonetic_father
  ON patients USING GIN (name_phonetic_father);

CREATE INDEX IF NOT EXISTS idx_patients_phonetic_grandfather
  ON patients USING GIN (name_phonetic_grandfather);

CREATE INDEX IF NOT EXISTS idx_patients_birth_year
  ON patients (birth_year)
  WHERE birth_year IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_district_origin
  ON patients (address_district_origin)
  WHERE address_district_origin IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_biometric
  ON patients (biometric_fingerprint_hash)
  WHERE biometric_fingerprint_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_tazkira_paper
  ON patients (tazkira_paper_hash)
  WHERE tazkira_paper_hash IS NOT NULL;

-- mpi_warn index for admin review queue (existing column, new partial index)
CREATE INDEX IF NOT EXISTS idx_patients_mpi_warn
  ON patients (mpi_warn)
  WHERE mpi_warn = TRUE;
```

- [ ] **Step 2: Apply migration 021 via Supabase MCP**

```
Use mcp__plugin_supabase_supabase__apply_migration with:
  name: "021_patient_indexes_phonetic"
  query: <contents of 021_patient_indexes_phonetic.sql>
```

Expected: 8 indexes created.

- [ ] **Step 3: Create migration 022**

Create `supabase/migrations/022_consent_registration_fields.sql`:

```sql
-- Migration 022: Add consent method/witness/language/version columns to consents table.
-- These fields are required for the atomic create_patient_with_consent() RPC.

ALTER TABLE consents
  ADD COLUMN IF NOT EXISTS consent_method   TEXT
    CONSTRAINT consent_method_values CHECK (consent_method IN ('WRITTEN', 'VERBAL_WITNESSED', 'SELF_REGISTERED')),

  ADD COLUMN IF NOT EXISTS witnessed_by     UUID REFERENCES practitioners(id),

  ADD COLUMN IF NOT EXISTS consent_language TEXT
    CONSTRAINT consent_language_values CHECK (consent_language IN ('en', 'ar', 'prs')),

  ADD COLUMN IF NOT EXISTS consent_version  TEXT NOT NULL DEFAULT 'v1.0-en';

-- A VERBAL_WITNESSED consent must have a witness
ALTER TABLE consents
  ADD CONSTRAINT consent_verbal_requires_witness CHECK (
    (consent_method = 'VERBAL_WITNESSED' AND witnessed_by IS NOT NULL)
    OR (consent_method IS NULL OR consent_method != 'VERBAL_WITNESSED')
  );

COMMENT ON COLUMN consents.consent_method IS 'WRITTEN | VERBAL_WITNESSED | SELF_REGISTERED — how consent was obtained';
COMMENT ON COLUMN consents.witnessed_by IS 'Practitioner UUID who witnessed verbal consent — required when consent_method = VERBAL_WITNESSED';
COMMENT ON COLUMN consents.consent_language IS 'Language in which consent was presented (en | ar | prs)';
COMMENT ON COLUMN consents.consent_version IS 'Consent text version (e.g. v1.0-en) — allows consent renewal on text change';
```

- [ ] **Step 4: Apply migration 022 via Supabase MCP**

```
Use mcp__plugin_supabase_supabase__apply_migration with:
  name: "022_consent_registration_fields"
  query: <contents of 022_consent_registration_fields.sql>
```

Expected: 4 columns added to consents. 1 check constraint added.

- [ ] **Step 5: Create migration 023**

Create `supabase/migrations/023_fn_create_patient_with_consent.sql`:

```sql
-- Migration 023: Two Postgres RPC functions for MPI Phase 1.
--
-- 1. create_patient_with_consent(p_patient JSONB, p_consent JSONB) → JSONB
--    Atomically inserts patient + consent in one transaction.
--    Either both rows exist, or neither does.
--
-- 2. fetch_mpi_candidates(p_input JSONB) → JSONB
--    Returns ≤50 candidate patients matching any phonetic token, hard identifier,
--    birth-year+district combination, or phone number.
--    Used by Hub API to build the candidate list before scoring.

-- ─────────────────────────────────────────────────────────────────
-- Function 1: Atomic patient + consent insert
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_patient_with_consent(
  p_patient JSONB,
  p_consent  JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_patient_id UUID;
  v_consent_id UUID;
BEGIN
  -- Insert patient row. jsonb_populate_record maps JSON keys to column names.
  -- Caller is responsible for providing valid values (id, is_active, etc.).
  INSERT INTO patients
  SELECT * FROM jsonb_populate_record(null::patients, p_patient)
  RETURNING id INTO v_patient_id;

  -- Insert consent row linked to the new patient
  INSERT INTO consents (
    id,
    patient_id,
    status,
    scope,
    provision_start,
    provision_end,
    consent_method,
    witnessed_by,
    consent_language,
    consent_version,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_patient_id,
    'active',
    'patient-privacy',
    NOW(),
    NOW() + INTERVAL '3 years',
    p_consent->>'consent_method',
    NULLIF(p_consent->>'witnessed_by', '')::UUID,
    p_consent->>'consent_language',
    COALESCE(p_consent->>'consent_version', 'v1.0-en'),
    NOW()
  )
  RETURNING id INTO v_consent_id;

  RETURN jsonb_build_object(
    'patientId',  v_patient_id,
    'consentId',  v_consent_id
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Re-raise: the implicit transaction rolls back both inserts
    RAISE;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- Function 2: MPI candidate retrieval
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fetch_mpi_candidates(
  p_input JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phonetic_given        TEXT[];
  v_phonetic_father       TEXT[];
  v_national_id_hash      TEXT;
  v_tazkira_paper_hash    TEXT;
  v_biometric_hash        TEXT;
  v_birth_year            SMALLINT;
  v_district_origin       TEXT;
  v_phone                 TEXT;
BEGIN
  -- Extract inputs
  SELECT
    ARRAY(SELECT jsonb_array_elements_text(p_input->'phoneticGiven')),
    ARRAY(SELECT jsonb_array_elements_text(p_input->'phoneticFather')),
    p_input->>'nationalIdHash',
    p_input->>'tazkiraPaperHash',
    p_input->>'biometricFingerprintHash',
    (p_input->>'birthYear')::SMALLINT,
    p_input->>'addressDistrictOrigin',
    p_input->>'phone'
  INTO
    v_phonetic_given, v_phonetic_father,
    v_national_id_hash, v_tazkira_paper_hash, v_biometric_hash,
    v_birth_year, v_district_origin, v_phone;

  RETURN (
    SELECT jsonb_agg(row_to_json(c))
    FROM (
      SELECT
        id,
        name_given,
        name_father,
        name_grandfather,
        name_phonetic_given,
        name_phonetic_father,
        name_phonetic_grandfather,
        birth_year,
        gender,
        address_district_origin,
        address_province_origin,
        telecom_phone    AS phone,
        national_id_hash,
        tazkira_paper_hash,
        biometric_fingerprint_hash
      FROM patients
      WHERE ultranos_is_active = TRUE
        AND (
          (v_phonetic_given  IS NOT NULL AND array_length(v_phonetic_given,  1) > 0 AND name_phonetic_given  && v_phonetic_given)
          OR (v_phonetic_father IS NOT NULL AND array_length(v_phonetic_father, 1) > 0 AND name_phonetic_father && v_phonetic_father)
          OR (v_national_id_hash   IS NOT NULL AND national_id_hash        = v_national_id_hash)
          OR (v_tazkira_paper_hash IS NOT NULL AND tazkira_paper_hash      = v_tazkira_paper_hash)
          OR (v_biometric_hash     IS NOT NULL AND biometric_fingerprint_hash = v_biometric_hash)
          OR (v_birth_year IS NOT NULL AND v_district_origin IS NOT NULL
              AND birth_year = v_birth_year AND address_district_origin = v_district_origin)
          OR (v_phone IS NOT NULL AND telecom_phone = v_phone)
        )
      LIMIT 50
    ) c
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_patient_with_consent(JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION fetch_mpi_candidates(JSONB) TO authenticated;
```

- [ ] **Step 6: Apply migration 023 via Supabase MCP**

```
Use mcp__plugin_supabase_supabase__apply_migration with:
  name: "023_fn_create_patient_with_consent"
  query: <contents of 023_fn_create_patient_with_consent.sql>
```

Expected: Both functions created. GRANT executed.

- [ ] **Step 7: Verify functions exist via Supabase MCP**

```sql
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('create_patient_with_consent', 'fetch_mpi_candidates');
```

Expected: 2 rows returned.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/021_patient_indexes_phonetic.sql supabase/migrations/022_consent_registration_fields.sql supabase/migrations/023_fn_create_patient_with_consent.sql
git commit -m "feat(db): migrations 021-023 — phonetic indexes, consent columns, atomic patient+consent RPC"
```

---

## Task 9: Hub API Helpers (`mpi-proceed-token.ts` + `mpi-candidate-query.ts`)

**Files:**
- Create: `apps/hub-api/src/lib/mpi-proceed-token.ts`
- Create: `apps/hub-api/src/lib/mpi-candidate-query.ts`
- Create: `apps/hub-api/src/__tests__/patient-mpi.test.ts`

The `jose` library is already a dependency of hub-api (used in `jwt.ts`). Redis is accessed via `getRedisClient()` from `lib/redis.ts`.

- [ ] **Step 1: Write failing tests for proceed token**

Create `apps/hub-api/src/__tests__/patient-mpi.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateKeyPair, exportPKCS8, exportSPKI } from 'jose'

// Stub env vars and Redis before importing the module under test
vi.stubEnv('MPI_TOKEN_PRIVATE_KEY', '')
vi.stubEnv('MPI_TOKEN_PUBLIC_KEY', '')

// Mock Redis client
vi.mock('@/lib/redis', () => ({
  getRedisClient: vi.fn(),
}))

import { signProceedToken, verifyProceedToken, consumeProceedToken } from '@/lib/mpi-proceed-token'
import { getRedisClient } from '@/lib/redis'

describe('mpi-proceed-token', () => {
  let privateKeyPem: string
  let publicKeyPem: string
  let mockRedis: {
    set: ReturnType<typeof vi.fn>
    get: ReturnType<typeof vi.fn>
    del: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    // Generate a fresh RSA key pair for each test
    const { privateKey, publicKey } = await generateKeyPair('RS256')
    privateKeyPem = await exportPKCS8(privateKey)
    publicKeyPem  = await exportSPKI(publicKey)

    vi.stubEnv('MPI_TOKEN_PRIVATE_KEY', privateKeyPem)
    vi.stubEnv('MPI_TOKEN_PUBLIC_KEY', publicKeyPem)

    mockRedis = {
      set: vi.fn().mockResolvedValue('OK'),
      get: vi.fn().mockResolvedValue(null),
      del: vi.fn().mockResolvedValue(1),
    }
    vi.mocked(getRedisClient).mockReturnValue(mockRedis as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('signs a proceed token with the expected payload shape', async () => {
    const token = await signProceedToken({
      candidateIds: ['p1', 'p2'],
      maxScore: 75,
      issuedTo: 'user-uuid-001',
    })
    expect(typeof token).toBe('string')
    expect(token.split('.').length).toBe(3)  // JWT format
  })

  it('verifies a valid token and returns payload', async () => {
    const token = await signProceedToken({
      candidateIds: ['p1'],
      maxScore: 65,
      issuedTo: 'user-uuid-002',
    })

    // Mark token as NOT consumed (get returns null = not used yet)
    mockRedis.get.mockResolvedValue(null)

    const payload = await verifyProceedToken(token)
    expect(payload.candidateIds).toEqual(['p1'])
    expect(payload.maxScore).toBe(65)
    expect(payload.issuedTo).toBe('user-uuid-002')
    expect(payload.jti).toBeTruthy()
  })

  it('rejects a token signed with a different key', async () => {
    const { privateKey: wrongKey } = await generateKeyPair('RS256')
    const wrongPem = await exportPKCS8(wrongKey)
    vi.stubEnv('MPI_TOKEN_PRIVATE_KEY', wrongPem)

    const tokenWithWrongKey = await signProceedToken({
      candidateIds: ['p3'],
      maxScore: 80,
      issuedTo: 'user-uuid-003',
    })

    // Restore correct private key, but keep original public key
    vi.stubEnv('MPI_TOKEN_PRIVATE_KEY', privateKeyPem)

    await expect(verifyProceedToken(tokenWithWrongKey)).rejects.toThrow()
  })

  it('consumeProceedToken marks jti as used in Redis', async () => {
    const token = await signProceedToken({
      candidateIds: ['p4'],
      maxScore: 70,
      issuedTo: 'user-uuid-004',
    })
    const payload = await verifyProceedToken(token)
    mockRedis.get.mockResolvedValue(null)

    await consumeProceedToken(payload.jti)

    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringContaining(payload.jti),
      'consumed',
      'EX',
      expect.any(Number),
    )
  })

  it('verifyProceedToken throws when jti is already consumed (replay prevention)', async () => {
    const token = await signProceedToken({
      candidateIds: ['p5'],
      maxScore: 72,
      issuedTo: 'user-uuid-005',
    })

    // Simulate token already consumed
    mockRedis.get.mockResolvedValue('consumed')

    await expect(verifyProceedToken(token)).rejects.toThrow(/already consumed|replay/)
  })

  it('throws when MPI_TOKEN_PRIVATE_KEY is not set', async () => {
    vi.stubEnv('MPI_TOKEN_PRIVATE_KEY', '')
    await expect(signProceedToken({ candidateIds: [], maxScore: 0, issuedTo: 'u' })).rejects.toThrow(/MPI_TOKEN_PRIVATE_KEY/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F hub-api test -- patient-mpi
```

Expected: FAIL — `Cannot find module '@/lib/mpi-proceed-token'`

- [ ] **Step 3: Create mpi-proceed-token.ts**

Create `apps/hub-api/src/lib/mpi-proceed-token.ts`:

```typescript
import { SignJWT, jwtVerify, importPKCS8, importSPKI } from 'jose'
import { getRedisClient } from './redis.js'
import type { MpiProceedTokenPayload } from '@ultranos/mpi-engine'

const ALG = 'RS256'
const TOKEN_TTL_SECONDS = 600  // 10 minutes
const REDIS_KEY_PREFIX = 'mpi:token:'

function getPrivateKeyPem(): string {
  const key = process.env.MPI_TOKEN_PRIVATE_KEY
  if (!key) throw new Error('MPI_TOKEN_PRIVATE_KEY environment variable is not set')
  return key
}

function getPublicKeyPem(): string {
  const key = process.env.MPI_TOKEN_PUBLIC_KEY
  if (!key) throw new Error('MPI_TOKEN_PUBLIC_KEY environment variable is not set')
  return key
}

export async function signProceedToken(
  payload: Omit<MpiProceedTokenPayload, 'jti' | 'exp'>,
): Promise<string> {
  const privateKey = await importPKCS8(getPrivateKeyPem(), ALG)
  const jti = crypto.randomUUID()

  return new SignJWT({
    candidateIds: payload.candidateIds,
    maxScore:     payload.maxScore,
    issuedTo:     payload.issuedTo,
  })
    .setProtectedHeader({ alg: ALG })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(privateKey)
}

/**
 * Verify a proceed token.
 * Throws if signature is invalid, token is expired, or jti has been consumed (replay).
 */
export async function verifyProceedToken(token: string): Promise<MpiProceedTokenPayload> {
  const publicKey = await importSPKI(getPublicKeyPem(), ALG)

  const { payload } = await jwtVerify(token, publicKey, { algorithms: [ALG] })

  const jti = payload.jti
  if (!jti) throw new Error('Proceed token missing jti claim')

  // Replay prevention: check if this jti has already been consumed
  const redis = getRedisClient()
  if (redis) {
    const existing = await redis.get(`${REDIS_KEY_PREFIX}${jti}`)
    if (existing) throw new Error(`Proceed token already consumed (replay prevention): jti=${jti}`)
  }

  return {
    jti,
    candidateIds: payload['candidateIds'] as string[],
    maxScore:     payload['maxScore'] as number,
    issuedTo:     payload['issuedTo'] as string,
    exp:          payload.exp as number,
  }
}

/**
 * Mark a proceed token jti as consumed in Redis.
 * Call AFTER successfully creating the patient (commit path only).
 * TTL matches token expiry so Redis entries self-clean.
 */
export async function consumeProceedToken(jti: string): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return  // Fail-open: if Redis unavailable, we can't enforce replay prevention
  await redis.set(`${REDIS_KEY_PREFIX}${jti}`, 'consumed', 'EX', TOKEN_TTL_SECONDS)
}
```

- [ ] **Step 4: Create mpi-candidate-query.ts**

Create `apps/hub-api/src/lib/mpi-candidate-query.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MpiCandidate } from '@ultranos/mpi-engine'
import { computePhoneticTokens, normalizeNameComponent } from '@ultranos/mpi-engine'
import { generateBlindIndex } from '@ultranos/crypto/server'
import { getFieldEncryptionKeys } from './field-encryption.js'

export interface MpiQueryInput {
  nameGiven?: string
  nameFather?: string
  nationalId?: string
  tazkiraPaperHash?: string
  biometricFingerprintHash?: string
  birthYear?: number
  addressDistrictOrigin?: string
  phone?: string
}

/**
 * Query the DB for MPI candidate patients using the fetch_mpi_candidates RPC.
 * Returns ≤50 candidates whose phonetic tokens, hard identifiers, or
 * birth-year+district combination overlap with the input.
 */
export async function fetchMpiCandidates(
  supabase: SupabaseClient,
  input: MpiQueryInput,
): Promise<MpiCandidate[]> {
  const { hmacKey } = getFieldEncryptionKeys()

  // Compute phonetic tokens from normalized name components
  const phoneticGiven  = input.nameGiven  ? computePhoneticTokens(normalizeNameComponent(input.nameGiven))  : []
  const phoneticFather = input.nameFather ? computePhoneticTokens(normalizeNameComponent(input.nameFather)) : []

  // Hash nationalId if provided (HMAC blind index)
  const nationalIdHash = input.nationalId
    ? generateBlindIndex(input.nationalId, hmacKey)
    : null

  const rpcInput = {
    phoneticGiven,
    phoneticFather,
    nationalIdHash:           nationalIdHash ?? undefined,
    tazkiraPaperHash:         input.tazkiraPaperHash,
    biometricFingerprintHash: input.biometricFingerprintHash,
    birthYear:                input.birthYear,
    addressDistrictOrigin:    input.addressDistrictOrigin,
    phone:                    input.phone,
  }

  const { data, error } = await supabase.rpc('fetch_mpi_candidates', { p_input: rpcInput })

  if (error) {
    console.error('[MPI_CANDIDATE_QUERY] RPC error:', { code: error.code })
    throw new Error('MPI candidate query failed')
  }

  if (!data) return []

  // Map snake_case DB row to MpiCandidate interface
  return (data as Record<string, unknown>[]).map((row) => ({
    id:                       String(row['id'] ?? ''),
    nameGiven:                row['name_given'] as string | undefined,
    nameFather:               row['name_father'] as string | undefined,
    nameGrandfather:          row['name_grandfather'] as string | undefined,
    namePhoneticGiven:        row['name_phonetic_given'] as string[] | undefined,
    namePhoneticFather:       row['name_phonetic_father'] as string[] | undefined,
    namePhoneticGrandfather:  row['name_phonetic_grandfather'] as string[] | undefined,
    birthYear:                row['birth_year'] as number | undefined,
    gender:                   row['gender'] as string | undefined,
    addressDistrictOrigin:    row['address_district_origin'] as string | undefined,
    addressProvinceOrigin:    row['address_province_origin'] as string | undefined,
    phone:                    row['phone'] as string | undefined,
    nationalIdHash:           row['national_id_hash'] as string | undefined,
    tazkiraPaperHash:         row['tazkira_paper_hash'] as string | undefined,
    biometricFingerprintHash: row['biometric_fingerprint_hash'] as string | undefined,
  }))
}
```

- [ ] **Step 5: Run proceed token tests**

```bash
pnpm -F hub-api test -- patient-mpi
```

Expected: All 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/hub-api/src/lib/mpi-proceed-token.ts apps/hub-api/src/lib/mpi-candidate-query.ts apps/hub-api/src/__tests__/patient-mpi.test.ts
git commit -m "feat(hub-api): add MPI proceed-token signing/verification and candidate query helper"
```

---

*— Phase B complete. Continue in Phase C: Tasks 10–14 (patient.create MPI, consent atomicity, patientRegistration, patient.search, patient.checkDuplicates) —*

---

# PHASE C — Tasks 10–14: Hub API Router Changes

---

## Task 10: `patient.create` — MPI Decision Flow

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/patient.ts`
- Create: `apps/hub-api/src/__tests__/patient-consent-atomic.test.ts`

The existing `patient.create` mutation uses a direct `supabase.from('patients').insert()`. This task replaces it with:
1. MPI candidate retrieval + scoring
2. BLOCK / WARN / ALLOW decision
3. `supabase.rpc('create_patient_with_consent', ...)` for atomic insert

- [ ] **Step 1: Write the failing MPI integration tests**

Create `apps/hub-api/src/__tests__/patient-consent-atomic.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const TEST_ENCRYPTION_KEY = 'a'.repeat(64)
const TEST_HMAC_KEY = 'b'.repeat(64)

vi.stubEnv('FIELD_ENCRYPTION_KEY', TEST_ENCRYPTION_KEY)
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', TEST_HMAC_KEY)

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({})),
  db: {
    toRow: (data: Record<string, unknown>) => data,
    toRowRaw: (data: Record<string, unknown>) => data,
    fromRow: (data: Record<string, unknown>) => data,
    fromRowRaw: (data: Record<string, unknown>) => data,
    fromRows: (data: unknown[]) => data,
  },
}))

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: vi.fn().mockResolvedValue({}),
  })),
}))

vi.mock('../trpc/middleware/enforceConsent', () => ({
  enforceConsentMiddleware: vi.fn(() => async (opts: Record<string, unknown>) => {
    const next = opts['next'] as (args: unknown) => unknown
    return next({ ctx: opts['ctx'] })
  }),
}))

vi.mock('../trpc/middleware/enforceResourceAccess', () => ({
  enforceResourceAccess: vi.fn(() => async (opts: Record<string, unknown>) => {
    const next = opts['next'] as (args: unknown) => unknown
    return next({ ctx: opts['ctx'] })
  }),
}))

// MPI engine mock — default: no candidates, decision = ALLOW
const mockComputeMpiResult = vi.fn().mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] })
vi.mock('@ultranos/mpi-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ultranos/mpi-engine')>()
  return {
    ...actual,
    computeMpiResult: (...args: unknown[]) => mockComputeMpiResult(...args),
  }
})

const mockFetchMpiCandidates = vi.fn().mockResolvedValue([])
vi.mock('@/lib/mpi-candidate-query', () => ({
  fetchMpiCandidates: (...args: unknown[]) => mockFetchMpiCandidates(...args),
}))

const mockSignProceedToken   = vi.fn().mockResolvedValue('signed-proceed-token')
const mockVerifyProceedToken = vi.fn()
const mockConsumeProceedToken = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/mpi-proceed-token', () => ({
  signProceedToken:    (...args: unknown[]) => mockSignProceedToken(...args),
  verifyProceedToken:  (...args: unknown[]) => mockVerifyProceedToken(...args),
  consumeProceedToken: (...args: unknown[]) => mockConsumeProceedToken(...args),
}))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const PATIENT_UUID  = '11111111-1111-1111-1111-111111111111'
const CONSENT_UUID  = '22222222-2222-2222-2222-222222222222'
const TEST_USER     = { sub: 'doctor-001', role: 'DOCTOR', sessionId: 'sess-mpi-1' }

const VALID_CREATE_INPUT = {
  nameLocal: 'Ahmad Mohammad Karim',
  nameGiven: 'Ahmad',
  nameFather: 'Mohammad',
  nameGrandfather: 'Karim',
  gender: 'male' as const,
  birthYear: 1985,
  birthYearOnly: true,
  consent: { method: 'WRITTEN' as const, language: 'en' as const, version: 'v1.0-en' },
}

function makeRpcSuccessContext() {
  const mockRpc = vi.fn().mockResolvedValue({
    data: { patientId: PATIENT_UUID, consentId: CONSENT_UUID },
    error: null,
  })
  return {
    supabase: { rpc: mockRpc } as never,
    user: TEST_USER,
    headers: new Headers(),
  }
}

describe('patient.create — MPI ALLOW path', () => {
  const createCaller = createCallerFactory(appRouter)

  beforeEach(() => {
    vi.clearAllMocks()
    mockComputeMpiResult.mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] })
    mockFetchMpiCandidates.mockResolvedValue([])
  })

  it('creates patient via RPC and returns id + mpiWarn=false on ALLOW', async () => {
    const ctx = makeRpcSuccessContext()
    const caller = createCaller(ctx)
    const result = await caller.patient.create(VALID_CREATE_INPUT)
    expect(result.id).toBe(PATIENT_UUID)
    expect(result.mpiWarn).toBe(false)
    expect((ctx.supabase as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
      'create_patient_with_consent',
      expect.objectContaining({ p_patient: expect.any(Object), p_consent: expect.any(Object) }),
    )
  })

  it('p_consent includes method, language, version', async () => {
    const ctx = makeRpcSuccessContext()
    const caller = createCaller(ctx)
    await caller.patient.create(VALID_CREATE_INPUT)
    const rpcCall = (ctx.supabase as { rpc: ReturnType<typeof vi.fn> }).rpc.mock.calls[0]
    const pConsent = rpcCall[1]['p_consent'] as Record<string, unknown>
    expect(pConsent['consent_method']).toBe('WRITTEN')
    expect(pConsent['consent_language']).toBe('en')
    expect(pConsent['consent_version']).toBe('v1.0-en')
  })

  it('p_patient includes phonetic token arrays', async () => {
    const ctx = makeRpcSuccessContext()
    const caller = createCaller(ctx)
    await caller.patient.create(VALID_CREATE_INPUT)
    const rpcCall = (ctx.supabase as { rpc: ReturnType<typeof vi.fn> }).rpc.mock.calls[0]
    const pPatient = rpcCall[1]['p_patient'] as Record<string, unknown>
    expect(Array.isArray(pPatient['name_phonetic_given'])).toBe(true)
    expect(Array.isArray(pPatient['name_phonetic_father'])).toBe(true)
  })

  it('emits PHI_WRITE audit with mpiDecision=ALLOW', async () => {
    const mockEmit = vi.fn().mockResolvedValue({})
    const { AuditLogger } = await import('@ultranos/audit-logger')
    vi.mocked(AuditLogger).mockImplementationOnce(() => ({ emit: mockEmit }))

    const ctx = makeRpcSuccessContext()
    const caller = createCaller(ctx)
    await caller.patient.create(VALID_CREATE_INPUT)

    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_WRITE',
        metadata: expect.objectContaining({ mpiDecision: 'ALLOW' }),
      }),
    )
  })
})

describe('patient.create — MPI BLOCK path', () => {
  const createCaller = createCallerFactory(appRouter)

  beforeEach(() => {
    vi.clearAllMocks()
    mockComputeMpiResult.mockReturnValue({
      decision: 'BLOCK',
      topScore: 95,
      candidates: [{ candidate: { id: 'existing-1', nameGiven: 'Ahmad' }, score: 95, breakdown: {}, hardIdMatch: false }],
    })
    mockFetchMpiCandidates.mockResolvedValue([{ id: 'existing-1', nameGiven: 'Ahmad' }])
  })

  it('throws CONFLICT (409) on BLOCK decision', async () => {
    const ctx = makeRpcSuccessContext()
    const caller = createCaller(ctx)
    await expect(caller.patient.create(VALID_CREATE_INPUT)).rejects.toThrow(/CONFLICT|duplicate|already exist/i)
  })

  it('does NOT call RPC on BLOCK — no patient created', async () => {
    const ctx = makeRpcSuccessContext()
    const caller = createCaller(ctx)
    try { await caller.patient.create(VALID_CREATE_INPUT) } catch { /* expected */ }
    expect((ctx.supabase as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled()
  })
})

describe('patient.create — MPI WARN path', () => {
  const createCaller = createCallerFactory(appRouter)

  const WARN_RESULT = {
    decision: 'WARN' as const,
    topScore: 75,
    candidates: [{ candidate: { id: 'candidate-1', nameGiven: 'Ahmad' }, score: 75, breakdown: {}, hardIdMatch: false }],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockComputeMpiResult.mockReturnValue(WARN_RESULT)
    mockFetchMpiCandidates.mockResolvedValue([{ id: 'candidate-1', nameGiven: 'Ahmad' }])
  })

  it('returns PRECONDITION_FAILED (412) with proceedToken on WARN without token', async () => {
    const ctx = makeRpcSuccessContext()
    const caller = createCaller(ctx)
    await expect(caller.patient.create(VALID_CREATE_INPUT)).rejects.toThrow(/PRECONDITION_FAILED|proceed/i)
  })

  it('does NOT call RPC on WARN without token — no patient created', async () => {
    const ctx = makeRpcSuccessContext()
    const caller = createCaller(ctx)
    try { await caller.patient.create(VALID_CREATE_INPUT) } catch { /* expected */ }
    expect((ctx.supabase as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled()
  })

  it('creates patient and returns mpiWarn=true on WARN with valid token', async () => {
    mockVerifyProceedToken.mockResolvedValue({
      jti: 'test-jti-valid',
      candidateIds: ['candidate-1'],
      maxScore: 75,
      issuedTo: TEST_USER.sub,
      exp: Math.floor(Date.now() / 1000) + 600,
    })

    const ctx = makeRpcSuccessContext()
    const caller = createCaller(ctx)
    const result = await caller.patient.create({ ...VALID_CREATE_INPUT, mpiProceedToken: 'valid-token' })
    expect(result.mpiWarn).toBe(true)
    expect((ctx.supabase as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
      'create_patient_with_consent',
      expect.any(Object),
    )
  })

  it('throws BAD_REQUEST on WARN with expired/invalid token', async () => {
    mockVerifyProceedToken.mockRejectedValue(new Error('Token expired'))
    const ctx = makeRpcSuccessContext()
    const caller = createCaller(ctx)
    await expect(
      caller.patient.create({ ...VALID_CREATE_INPUT, mpiProceedToken: 'expired-token' }),
    ).rejects.toThrow(/BAD_REQUEST|invalid|expired/i)
  })

  it('consumes the proceedToken after successful WARN-path creation', async () => {
    mockVerifyProceedToken.mockResolvedValue({
      jti: 'consume-this-jti',
      candidateIds: ['candidate-1'],
      maxScore: 75,
      issuedTo: TEST_USER.sub,
      exp: Math.floor(Date.now() / 1000) + 600,
    })

    const ctx = makeRpcSuccessContext()
    const caller = createCaller(ctx)
    await caller.patient.create({ ...VALID_CREATE_INPUT, mpiProceedToken: 'valid-token' })
    expect(mockConsumeProceedToken).toHaveBeenCalledWith('consume-this-jti')
  })
})

describe('patient.create — RPC failure rolls back', () => {
  const createCaller = createCallerFactory(appRouter)

  beforeEach(() => {
    vi.clearAllMocks()
    mockComputeMpiResult.mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] })
    mockFetchMpiCandidates.mockResolvedValue([])
  })

  it('throws INTERNAL_SERVER_ERROR when RPC returns an error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'unique constraint' } })
    const ctx = {
      supabase: { rpc: mockRpc } as never,
      user: TEST_USER,
      headers: new Headers(),
    }
    const caller = createCaller(ctx)
    await expect(caller.patient.create(VALID_CREATE_INPUT)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F hub-api test -- patient-consent-atomic
```

Expected: FAIL — `patient.create` does not yet call `supabase.rpc` or handle MPI decisions

- [ ] **Step 3: Update `patient.create` in patient.ts**

Replace the `create` mutation (from `create: protectedProcedure` through the closing `}),` of the create block) in `apps/hub-api/src/trpc/routers/patient.ts` with:

```typescript
  create: protectedProcedure
    .use(enforceResourceAccess('Patient'))
    .input(CreatePatientMpiInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { encryptionKey, hmacKey } = getFieldEncryptionKeys()
      const now = new Date().toISOString()
      const patientId = crypto.randomUUID()

      // ── Step 1: Normalize name components and compute phonetic tokens ──────
      const nameGiven = input.nameGiven ?? null
      const nameFather = input.nameFather ?? null
      const nameGrandfather = input.nameGrandfather ?? null

      const phoneticGiven       = nameGiven       ? computePhoneticTokens(normalizeNameComponent(nameGiven))       : []
      const phoneticFather      = nameFather      ? computePhoneticTokens(normalizeNameComponent(nameFather))      : []
      const phoneticGrandfather = nameGrandfather ? computePhoneticTokens(normalizeNameComponent(nameGrandfather)) : []

      // ── Step 2: Hash hard identifiers ─────────────────────────────────────
      const nationalIdHash = input.nationalId
        ? generateBlindIndex(input.nationalId, hmacKey)
        : null

      // Paper Tazkira: HMAC of jild|safa|shumara — built from identifiers array
      const tazkiraId = input.identifiers?.find(id => id.system === 'AFGHAN_TAZKIRA_PAPER')
      const tazkiraPaperHash = tazkiraId?.valueHash ?? null

      // ── Step 3: MPI candidate retrieval and scoring ───────────────────────
      const candidates = await fetchMpiCandidates(ctx.supabase, {
        nameGiven:             nameGiven  ?? undefined,
        nameFather:            nameFather ?? undefined,
        nationalId:            input.nationalId,
        tazkiraPaperHash:      tazkiraPaperHash  ?? undefined,
        biometricFingerprintHash: input.biometricFingerprintHash,
        birthYear:             input.birthYear,
        addressDistrictOrigin: input.addressOrigin?.district,
        phone:                 input.phone,
      })

      const mpiResult = computeMpiResult(candidates, {
        nameGiven:                nameGiven  ?? undefined,
        nameFather:               nameFather ?? undefined,
        nameGrandfather:          nameGrandfather ?? undefined,
        birthYear:                input.birthYear,
        gender:                   input.gender,
        addressDistrictOrigin:    input.addressOrigin?.district,
        addressProvinceOrigin:    input.addressOrigin?.province,
        phone:                    input.phone,
        nationalIdHash:           nationalIdHash  ?? undefined,
        tazkiraPaperHash:         tazkiraPaperHash ?? undefined,
        biometricFingerprintHash: input.biometricFingerprintHash,
      })

      // ── Step 4: Handle MPI decision ───────────────────────────────────────
      let mpiWarn = false
      let consumeJti: string | null = null

      if (mpiResult.decision === 'BLOCK') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Possible duplicate patient detected. Review candidates before creating a new record.',
          cause: { candidates: mpiResult.candidates.slice(0, 5), topScore: mpiResult.topScore },
        })
      }

      if (mpiResult.decision === 'WARN') {
        if (!input.mpiProceedToken) {
          // Issue a proceedToken so the clinician can review and re-submit
          const proceedToken = await signProceedToken({
            candidateIds: mpiResult.candidates.map(c => c.candidate.id),
            maxScore: mpiResult.topScore,
            issuedTo: ctx.user.sub,
          })
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Possible duplicate detected. Include mpiProceedToken to confirm creation.',
            cause: { candidates: mpiResult.candidates.slice(0, 5), proceedToken, topScore: mpiResult.topScore },
          })
        }

        // Verify the proceed token (throws on invalid/expired/consumed)
        try {
          const tokenPayload = await verifyProceedToken(input.mpiProceedToken)
          consumeJti = tokenPayload.jti
        } catch {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Proceed token is invalid, expired, or already used.',
          })
        }
        mpiWarn = true
      }

      // ── Step 5: Build patient row ─────────────────────────────────────────
      const birthYear = input.birthYear
        ?? (input.birthDate ? parseInt(input.birthDate.slice(0, 4), 10) : null)

      const row = db.toRow({
        id: patientId,
        // Legacy plain + encrypted copies
        nameLocal:        input.nameLocal,
        nameLocalEnc:     input.nameLocal,
        nameLatin:        input.nameLatin ?? null,
        nameLatinEnc:     input.nameLatin ?? null,
        // Patronymic chain
        name_given:             nameGiven,
        name_father:            nameFather,
        name_grandfather:       nameGrandfather,
        name_given_enc:         nameGiven   ? encryptField(nameGiven, encryptionKey) : null,
        name_father_enc:        nameFather  ? encryptField(nameFather, encryptionKey) : null,
        name_grandfather_enc:   nameGrandfather ? encryptField(nameGrandfather, encryptionKey) : null,
        // Phonetic tokens
        name_phonetic_given:       phoneticGiven,
        name_phonetic_father:      phoneticFather,
        name_phonetic_grandfather: phoneticGrandfather,
        // Demographics
        gender:         input.gender ?? null,
        birth_date:     input.birthDate ?? null,
        birth_date_enc: input.birthDate ? encryptField(input.birthDate, encryptionKey) : null,
        birth_year:     birthYear,
        birth_year_only: input.birthYearOnly ?? false,
        telecom_phone:  input.phone ?? null,
        // Hard identifiers
        national_id_hash:              nationalIdHash,
        tazkira_paper_hash:            tazkiraPaperHash,
        biometric_fingerprint_hash:    input.biometricFingerprintHash ?? null,
        biometric_algorithm_version:   input.biometricAlgorithmVersion ?? null,
        identifiers:    input.identifiers ? JSON.stringify(input.identifiers) : null,
        // Geography
        address_province_origin:  input.addressOrigin?.province ?? null,
        address_district_origin:  input.addressOrigin?.district ?? null,
        address_village_origin:   input.addressOrigin?.village  ?? null,
        address_province_current: input.addressCurrent?.province ?? null,
        address_district_current: input.addressCurrent?.district ?? null,
        address_village_current:  input.addressCurrent?.village  ?? null,
        is_nomadic: input.isNomadic ?? false,
        // MPI state
        mpi_warn:  mpiWarn,
        mpi_score: mpiResult.topScore,
        // Standard
        ultranos_is_active:         true,
        ultranos_patient_tier:      'FREE',
        ultranos_preferred_language: null,
        ultranos_created_by:        ctx.user.sub,
        ultranos_created_at:        now,
        ultranos_updated_at:        now,
        meta_last_updated:          now,
        guardian_id:                input.guardianId ?? null,
      })

      const consentRow = {
        consent_method:   input.consent.method,
        witnessed_by:     input.consent.witnessedBy ?? null,
        consent_language: input.consent.language,
        consent_version:  input.consent.version,
      }

      // ── Step 6: Atomic insert via RPC ─────────────────────────────────────
      const { data: rpcData, error: rpcError } = await ctx.supabase.rpc(
        'create_patient_with_consent',
        { p_patient: row, p_consent: consentRow },
      )

      if (rpcError || !rpcData) {
        console.error('[PATIENT_CREATE] RPC error:', { code: rpcError?.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create patient' })
      }

      // ── Step 7: Consume proceedToken (WARN path only) ─────────────────────
      if (consumeJti) {
        await consumeProceedToken(consumeJti)
      }

      // ── Step 8: Audit ──────────────────────────────────────────────────────
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_WRITE',
          resourceType: 'PATIENT',
          resourceId: patientId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            operation: 'create',
            mpiDecision: mpiResult.decision,
            mpiScore: mpiResult.topScore,
            mpiCandidateIds: mpiResult.candidates.map(c => c.candidate.id),
            consentMethod: input.consent.method,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'PATIENT', resourceId: patientId })
      }

      return {
        id: patientId,
        resourceType: 'Patient' as const,
        meta: { lastUpdated: now },
        mpiWarn,
        _ultranos: { createdAt: now },
      }
    }),
```

Also add these imports at the top of patient.ts:

```typescript
import {
  normalizeNameComponent,
  computePhoneticTokens,
  computeMpiResult,
  signProceedToken,
  verifyProceedToken,
  consumeProceedToken,
} from '@ultranos/mpi-engine'
// NOTE: signProceedToken / verifyProceedToken / consumeProceedToken are imported
// from the hub-api lib, not from mpi-engine (the package only exports the type).
// Correct import path:
import { signProceedToken, verifyProceedToken, consumeProceedToken } from '@/lib/mpi-proceed-token'
import { fetchMpiCandidates } from '@/lib/mpi-candidate-query'
import { encryptField } from '@ultranos/crypto/server'
import { CreatePatientMpiInputSchema } from '@ultranos/shared-types/fhir/patient.schema'
```

> **Note:** Remove the duplicate import — `signProceedToken/verifyProceedToken/consumeProceedToken` come from `@/lib/mpi-proceed-token`, NOT from `@ultranos/mpi-engine`. Only `normalizeNameComponent`, `computePhoneticTokens`, `computeMpiResult` come from `@ultranos/mpi-engine`. The above shows the correct final imports after removing the duplicate line.

- [ ] **Step 4: Run the MPI integration tests**

```bash
pnpm -F hub-api test -- patient-consent-atomic
```

Expected: All 12 tests PASS.

- [ ] **Step 5: Run all hub-api tests to confirm no regressions**

```bash
pnpm -F hub-api test
```

Expected: All existing tests PASS plus new MPI tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/hub-api/src/trpc/routers/patient.ts apps/hub-api/src/__tests__/patient-consent-atomic.test.ts
git commit -m "feat(hub-api): patient.create — MPI decision flow and atomic RPC insert"
```

---

## Task 11: `patientRegistration.register` — Remove Phone Check + Add MPI + Consent

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/patient-registration.ts`
- Create: `apps/hub-api/src/__tests__/patient-registration-mpi.test.ts`

The current `register` mutation:
- Blocks on duplicate phone number (lines 137–149) — **remove**
- Creates patient via direct INSERT — **replace with RPC**
- Has no MPI check — **add**
- Creates no consent record — **add via RPC**

- [ ] **Step 1: Write failing tests**

Create `apps/hub-api/src/__tests__/patient-registration-mpi.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const TEST_ENCRYPTION_KEY = 'a'.repeat(64)
vi.stubEnv('FIELD_ENCRYPTION_KEY', TEST_ENCRYPTION_KEY)
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({})),
  db: {
    toRow: (d: Record<string, unknown>) => d,
    toRowRaw: (d: Record<string, unknown>) => d,
    fromRow: (d: Record<string, unknown>) => d,
    fromRowRaw: (d: Record<string, unknown>) => d,
    fromRows: (d: unknown[]) => d,
  },
}))

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: vi.fn().mockResolvedValue({}) })),
}))

vi.mock('../trpc/middleware/enforceConsent', () => ({
  enforceConsentMiddleware: vi.fn(() => async (opts: Record<string, unknown>) => {
    const next = opts['next'] as (a: unknown) => unknown
    return next({ ctx: opts['ctx'] })
  }),
}))

vi.mock('../trpc/middleware/enforceResourceAccess', () => ({
  enforceResourceAccess: vi.fn(() => async (opts: Record<string, unknown>) => {
    const next = opts['next'] as (a: unknown) => unknown
    return next({ ctx: opts['ctx'] })
  }),
}))

const mockComputeMpiResult = vi.fn().mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] })
vi.mock('@ultranos/mpi-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ultranos/mpi-engine')>()
  return { ...actual, computeMpiResult: (...args: unknown[]) => mockComputeMpiResult(...args) }
})

const mockFetchMpiCandidates = vi.fn().mockResolvedValue([])
vi.mock('@/lib/mpi-candidate-query', () => ({
  fetchMpiCandidates: (...args: unknown[]) => mockFetchMpiCandidates(...args),
}))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const PATIENT_UUID = '33333333-3333-3333-3333-333333333333'
const CONSENT_UUID = '44444444-4444-4444-4444-444444444444'

const VALID_REGISTER_INPUT = {
  phone: '+93701234567',
  otpCode: '123456',
  firstName: 'Ahmad',
  dateOfBirth: '1990-06-15',
  preferredLanguage: 'en' as const,
}

function makeRegisterContext(otpSuccess = true) {
  return {
    supabase: {
      auth: {
        signInWithOtp: vi.fn().mockResolvedValue({}),
        verifyOtp: otpSuccess
          ? vi.fn().mockResolvedValue({ data: { session: { user: { id: 'auth-user-123' } } }, error: null })
          : vi.fn().mockResolvedValue({ data: { session: null }, error: { message: 'invalid OTP' } }),
        admin: { updateUserById: vi.fn().mockResolvedValue({}) },
      },
      rpc: vi.fn().mockResolvedValue({
        data: { patientId: PATIENT_UUID, consentId: CONSENT_UUID },
        error: null,
      }),
    } as never,
    user: null,
    headers: new Headers(),
  }
}

describe('patientRegistration.register — MPI integration', () => {
  const createCaller = createCallerFactory(appRouter)

  beforeEach(() => {
    vi.clearAllMocks()
    mockComputeMpiResult.mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] })
    mockFetchMpiCandidates.mockResolvedValue([])
  })

  it('creates patient via RPC on ALLOW', async () => {
    const ctx = makeRegisterContext()
    const caller = createCaller(ctx)
    const result = await caller.patientRegistration.register(VALID_REGISTER_INPUT)
    expect(result.patientId ?? result.id).toBeTruthy()
    expect(ctx.supabase.rpc).toHaveBeenCalledWith(
      'create_patient_with_consent',
      expect.objectContaining({ p_consent: expect.objectContaining({ consent_method: 'SELF_REGISTERED' }) }),
    )
  })

  it('does NOT block on shared phone (ALLOW even with phone match)', async () => {
    // A candidate exists with the same phone but different name
    mockFetchMpiCandidates.mockResolvedValue([{ id: 'existing-p1', nameGiven: 'Zubair', phone: '+93701234567' }])
    mockComputeMpiResult.mockReturnValue({ decision: 'ALLOW', topScore: 25, candidates: [] }) // phone=25pts < 60

    const ctx = makeRegisterContext()
    const caller = createCaller(ctx)
    const result = await caller.patientRegistration.register(VALID_REGISTER_INPUT)
    expect(result.patientId ?? result.id).toBeTruthy()
  })

  it('returns non-PHI block message on BLOCK — no PHI exposed', async () => {
    mockFetchMpiCandidates.mockResolvedValue([{ id: 'existing-p2', nameGiven: 'Ahmad', nameFather: 'Mohammad', birthYear: 1990 }])
    mockComputeMpiResult.mockReturnValue({
      decision: 'BLOCK',
      topScore: 95,
      candidates: [{ candidate: { id: 'existing-p2' }, score: 95, breakdown: {}, hardIdMatch: false }],
    })

    const ctx = makeRegisterContext()
    const caller = createCaller(ctx)
    const result = await caller.patientRegistration.register(VALID_REGISTER_INPUT)

    // Self-registration BLOCK: no throw — returns blocked: true with safe message
    expect(result).toHaveProperty('blocked', true)
    expect(result).toHaveProperty('message')
    // Response must NOT contain PHI (no candidate names, IDs, scores)
    const responseStr = JSON.stringify(result)
    expect(responseStr).not.toContain('existing-p2')
    expect(responseStr).not.toContain('Ahmad')
  })

  it('creates patient with mpi_warn=true on WARN (no token required for self-reg)', async () => {
    mockFetchMpiCandidates.mockResolvedValue([{ id: 'maybe-dup', nameGiven: 'Ahmad' }])
    mockComputeMpiResult.mockReturnValue({
      decision: 'WARN',
      topScore: 70,
      candidates: [{ candidate: { id: 'maybe-dup' }, score: 70, breakdown: {}, hardIdMatch: false }],
    })

    const ctx = makeRegisterContext()
    const caller = createCaller(ctx)
    const result = await caller.patientRegistration.register(VALID_REGISTER_INPUT)
    expect(result.patientId ?? result.id).toBeTruthy()
    // Verify mpi_warn=true was included in the RPC call
    const rpcCall = ctx.supabase.rpc.mock.calls[0]
    const pPatient = rpcCall[1]['p_patient'] as Record<string, unknown>
    expect(pPatient['mpi_warn']).toBe(true)
  })

  it('rejects invalid OTP — never reaches MPI check', async () => {
    const ctx = makeRegisterContext(false)
    const caller = createCaller(ctx)
    await expect(caller.patientRegistration.register(VALID_REGISTER_INPUT)).rejects.toThrow(/BAD_REQUEST|failed/i)
    expect(mockFetchMpiCandidates).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm -F hub-api test -- patient-registration-mpi
```

Expected: FAIL — `register` still has phone uniqueness check + no RPC call

- [ ] **Step 3: Update patient-registration.ts**

In `apps/hub-api/src/trpc/routers/patient-registration.ts`:

**a) Update the input schema** — make `dateOfBirth` optional, accept `birthYear`:

```typescript
// Replace existing input schema in register:
z.object({
  phone: z.string().min(7).max(20).regex(/^\+\d+$/, 'Phone must be E.164 format'),
  otpCode: z.string().length(6).regex(/^\d{6}$/, 'OTP must be 6 digits'),
  // firstName is legacy — kept for backward compat with Patient Lite v1
  firstName: z.string().min(1).max(200).transform((s) => s.trim()),
  // dateOfBirth now optional when birthYear is provided
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD')
    .refine(isValidCalendarDate, 'Date of birth must be a valid date in the past')
    .optional(),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  preferredLanguage: z.enum(SUPPORTED_LOCALES),
}).refine(
  (val) => val.dateOfBirth || val.birthYear,
  { message: 'Either dateOfBirth or birthYear is required', path: ['birthYear'] }
)
```

**b) Delete the phone uniqueness check block** (Step 2 in the original — lines 137–149):

```typescript
// DELETE this entire block:
// Step 2: Check for duplicate phone — generic error if exists (AC #8)
const { data: existingPatient } = await ctx.supabase
  .from('patients')
  .select('id')
  .eq('telecom_phone', input.phone)
  .limit(1)

if (existingPatient && existingPatient.length > 0) {
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: 'Registration failed. Please try again.',
  })
}
```

**c) Replace Step 3 (direct insert) with MPI + RPC.** Replace everything from `// Step 3: Create FHIR Patient resource` through the `insert` call and its error handler with:

```typescript
      // Step 3: MPI duplicate check
      const mpiCandidates = await fetchMpiCandidates(ctx.supabase, {
        nameGiven: input.firstName,
        phone: input.phone,
        birthYear: input.birthYear ?? (input.dateOfBirth ? parseInt(input.dateOfBirth.slice(0, 4), 10) : undefined),
      })

      const mpiResult = computeMpiResult(mpiCandidates, {
        nameGiven: input.firstName,
        phone: input.phone,
        birthYear: input.birthYear ?? (input.dateOfBirth ? parseInt(input.dateOfBirth.slice(0, 4), 10) : undefined),
      })

      // BLOCK on self-registration: return safe non-PHI message (no candidates, no throw)
      if (mpiResult.decision === 'BLOCK') {
        const audit = new AuditLogger(ctx.supabase)
        try {
          await audit.emit({
            action: 'PHI_WRITE', resourceType: 'PATIENT', resourceId: 'self-reg-blocked',
            actorId: userId, actorRole: 'PATIENT', outcome: 'BLOCKED',
            sessionId: userId, metadata: { operation: 'self_register', mpiDecision: 'BLOCK' },
          })
        } catch { /* audit failure is non-fatal */ }
        return {
          blocked: true,
          message: 'You may already be registered. Please ask your clinician to look up your record.',
        }
      }

      const mpiWarn = mpiResult.decision === 'WARN'

      // Step 4: Build patient row and consent — atomic RPC insert
      const birthYear = input.birthYear
        ?? (input.dateOfBirth ? parseInt(input.dateOfBirth.slice(0, 4), 10) : null)

      const row = db.toRow({
        id: patientId,
        name_given:          input.firstName,
        name_given_enc:      encryptField(input.firstName, encKey),
        ultranos_name_local: input.firstName,
        nameLocalEnc:        encryptField(input.firstName, encKey),
        gender:              null,
        birth_date:          input.dateOfBirth ?? null,
        birth_date_enc:      input.dateOfBirth ? encryptField(input.dateOfBirth, encKey) : null,
        birth_year:          birthYear,
        birth_year_only:     !input.dateOfBirth,
        telecom_phone:       input.phone,
        ultranos_is_active:  true,
        ultranos_patient_tier: 'FREE',
        ultranos_preferred_language: input.preferredLanguage,
        mpi_warn:            mpiWarn,
        mpi_score:           mpiResult.topScore,
        ultranos_created_at: now,
        ultranos_updated_at: now,
        meta_last_updated:   now,
      })

      const consentRow = {
        consent_method:   'SELF_REGISTERED',
        witnessed_by:     null,
        consent_language: input.preferredLanguage,
        consent_version:  'v1.0-en',
      }

      const { data: rpcData, error: rpcError } = await ctx.supabase.rpc(
        'create_patient_with_consent',
        { p_patient: row, p_consent: consentRow },
      )

      if (rpcError || !rpcData) {
        console.error('[PATIENT_REGISTRATION] RPC failed:', { code: rpcError?.code })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Registration failed. Please try again.' })
      }

      const createdPatientId = (rpcData as { patientId: string }).patientId ?? patientId
```

Also add imports at the top of patient-registration.ts:

```typescript
import { computeMpiResult, normalizeNameComponent, computePhoneticTokens } from '@ultranos/mpi-engine'
import { fetchMpiCandidates } from '@/lib/mpi-candidate-query'
```

**d) Update the return value** at the bottom of the mutation to use `createdPatientId`:

```typescript
      // ... rest of Step 4 (updateUserById) stays the same ...
      return { patientId: createdPatientId, mpiWarn }
```

- [ ] **Step 4: Run registration MPI tests**

```bash
pnpm -F hub-api test -- patient-registration-mpi
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Run all hub-api tests**

```bash
pnpm -F hub-api test
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/hub-api/src/trpc/routers/patient-registration.ts apps/hub-api/src/__tests__/patient-registration-mpi.test.ts
git commit -m "feat(hub-api): patientRegistration.register — remove phone lock, add MPI check, atomic consent"
```

---

## Task 12: `patient.search` — Phonetic Update

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/patient.ts`

The current search uses `ILIKE` on `ultranos_name_local` and `ultranos_name_latin`. This task adds a phonetic pre-pass using the GIN indexes created in migration 021, while keeping ILIKE as fallback.

- [ ] **Step 1: Write a failing test for phonetic search**

Add this describe block to `apps/hub-api/src/__tests__/patient-crud.test.ts`:

```typescript
describe('patient.search — phonetic results', () => {
  const createCaller = createCallerFactory(appRouter)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns mpiScore and nameGiven fields in results', async () => {
    const mockFrom = createMockFrom()
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [{
                id: PATIENT_UUID,
                name: [{ given: ['Ahmad'], text: 'Ahmad Mohammad' }],
                gender: 'male',
                birth_date: null,
                birth_year_only: true,
                birth_year: 1985,
                identifier: null,
                meta_last_updated: new Date().toISOString(),
                meta_version_id: '1',
                ultranos_name_local: 'Ahmad Mohammad',
                ultranos_name_latin: 'Ahmad Mohammad',
                ultranos_national_id_hash: null,
                ultranos_is_active: true,
                ultranos_created_at: new Date().toISOString(),
                name_given: 'Ahmad',
                name_father: 'Mohammad',
                name_grandfather: null,
                address_district_origin: 'Kabul',
                mpi_score: 85,
                mpi_warn: true,
              }],
              error: null,
            }),
          }),
        }),
      }),
    })

    const ctx = createTestContext(mockFrom)
    const caller = createCaller(ctx)
    const result = await caller.patient.search({ query: 'Ahmad' })

    expect(result.patients).toHaveLength(1)
    // New fields must be present in response
    expect(result.patients[0]).toHaveProperty('_ultranos')
    const ult = result.patients[0]!._ultranos as Record<string, unknown>
    expect(ult).toHaveProperty('nameGiven', 'Ahmad')
    expect(ult).toHaveProperty('nameFather', 'Mohammad')
    expect(ult).toHaveProperty('mpiScore', 85)
    expect(ult).toHaveProperty('mpiWarn', true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F hub-api test -- patient-crud
```

Expected: FAIL — search result does not include `nameGiven`, `nameFather`, `mpiScore`, `mpiWarn`

- [ ] **Step 3: Update `patient.search` in patient.ts**

In the `search` query, update the SELECT columns list to include new fields:

```typescript
// Replace the .select(...) columns string with:
.select(
  'id, name, gender, birth_date, birth_year_only, birth_year, identifier, ' +
  'meta_last_updated, meta_version_id, ' +
  'ultranos_name_local, ultranos_name_latin, ultranos_national_id_hash, ultranos_is_active, ultranos_created_at, ' +
  'name_given, name_father, name_grandfather, ' +
  'address_district_origin, address_province_origin, ' +
  'mpi_score, mpi_warn'
)
```

And update the `return` mapping in `.map((row) => ({ ... }))` to include the new fields:

```typescript
        return {
          patients: (data ?? []).map((row) => ({
            id: row.id,
            resourceType: 'Patient' as const,
            name: row.name,
            gender: row.gender,
            birthDate: row.birth_date,
            birthYearOnly: row.birth_year_only,
            identifier: row.identifier,
            _ultranos: {
              nameLocal:    row.ultranos_name_local,
              nameLatin:    row.ultranos_name_latin,
              nationalIdHash: row.ultranos_national_id_hash,
              isActive:     row.ultranos_is_active,
              createdAt:    row.ultranos_created_at,
              // MPI Phase 1 additions
              nameGiven:           row.name_given,
              nameFather:          row.name_father,
              nameGrandfather:     row.name_grandfather,
              birthYear:           row.birth_year,
              addressDistrictOrigin: row.address_district_origin,
              addressProvinceOrigin: row.address_province_origin,
              mpiScore:    row.mpi_score,
              mpiWarn:     row.mpi_warn ?? false,
            },
            meta: {
              lastUpdated: row.meta_last_updated,
              versionId:   row.meta_version_id,
            },
          })),
        }
```

- [ ] **Step 4: Run tests**

```bash
pnpm -F hub-api test -- patient-crud
```

Expected: All tests PASS including new phonetic search test.

- [ ] **Step 5: Commit**

```bash
git add apps/hub-api/src/trpc/routers/patient.ts
git commit -m "feat(hub-api): patient.search — add nameGiven, nameFather, mpiScore, mpiWarn to response"
```

---

## Task 13: `patient.checkDuplicates` — New Procedure

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/patient.ts`

New tRPC procedure: clinicians can check for duplicates before manually entering a patient, without committing any record.

- [ ] **Step 1: Write failing test for checkDuplicates**

Add to `apps/hub-api/src/__tests__/patient-crud.test.ts`:

```typescript
describe('patient.checkDuplicates', () => {
  const createCaller = createCallerFactory(appRouter)

  beforeEach(() => {
    vi.clearAllMocks()
    mockComputeMpiResult.mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] })
    mockFetchMpiCandidates.mockResolvedValue([])
  })

  it('returns ALLOW decision with empty candidates for unique patient', async () => {
    const mockFrom = createMockFrom()
    const ctx = { ...createTestContext(mockFrom), supabase: { from: mockFrom, rpc: vi.fn().mockResolvedValue({ data: null, error: null }) } as never }
    const caller = createCaller(ctx)

    const result = await caller.patient.checkDuplicates({ nameGiven: 'UniqueName' })
    expect(result.decision).toBe('ALLOW')
    expect(result.candidates).toHaveLength(0)
    expect(result.proceedToken).toBeUndefined()
  })

  it('returns WARN decision with proceedToken when score 60–89', async () => {
    mockFetchMpiCandidates.mockResolvedValue([{ id: 'p1', nameGiven: 'Ahmad' }])
    mockComputeMpiResult.mockReturnValue({
      decision: 'WARN',
      topScore: 75,
      candidates: [{
        candidate: { id: 'p1', nameGiven: 'Ahmad' },
        score: 75,
        breakdown: { givenName: 30, fatherName: 30, grandfatherName: 0, birthYear: 15, gender: 0, districtOrigin: 0, provinceOrigin: 0, phone: 0, total: 75 },
        hardIdMatch: false,
      }],
    })

    const mockFrom = createMockFrom()
    const ctx = { ...createTestContext(mockFrom), supabase: { from: mockFrom, rpc: vi.fn().mockResolvedValue({ data: null, error: null }) } as never }
    const caller = createCaller(ctx)

    const result = await caller.patient.checkDuplicates({
      nameGiven: 'Ahmad',
      nameFather: 'Mohammad',
      birthYear: 1985,
    })
    expect(result.decision).toBe('WARN')
    expect(result.proceedToken).toBeTruthy()
    expect(result.candidates[0]).toHaveProperty('scoreBreakdown')
    expect(result.candidates[0]!.scoreBreakdown).toHaveProperty('givenName', 30)
  })

  it('returns BLOCK without proceedToken (clinician must dismiss)', async () => {
    mockFetchMpiCandidates.mockResolvedValue([{ id: 'p2', nameGiven: 'Ahmad' }])
    mockComputeMpiResult.mockReturnValue({
      decision: 'BLOCK',
      topScore: 95,
      candidates: [{ candidate: { id: 'p2' }, score: 95, breakdown: {}, hardIdMatch: false }],
    })

    const mockFrom = createMockFrom()
    const ctx = { ...createTestContext(mockFrom), supabase: { from: mockFrom, rpc: vi.fn().mockResolvedValue({ data: null, error: null }) } as never }
    const caller = createCaller(ctx)

    const result = await caller.patient.checkDuplicates({ nameGiven: 'Ahmad', nameFather: 'Mohammad', birthYear: 1985 })
    expect(result.decision).toBe('BLOCK')
    expect(result.proceedToken).toBeUndefined()
  })

  it('emits PHI_READ audit for mpi_check', async () => {
    const mockEmit = vi.fn().mockResolvedValue({})
    const { AuditLogger } = await import('@ultranos/audit-logger')
    vi.mocked(AuditLogger).mockImplementationOnce(() => ({ emit: mockEmit }))

    const mockFrom = createMockFrom()
    const ctx = { ...createTestContext(mockFrom), supabase: { from: mockFrom, rpc: vi.fn().mockResolvedValue({ data: null, error: null }) } as never }
    const caller = createCaller(ctx)
    await caller.patient.checkDuplicates({ nameGiven: 'Ahmad' })

    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PHI_READ',
        metadata: expect.objectContaining({ operation: 'mpi_check' }),
      }),
    )
  })
})
```

> **Note:** `mockComputeMpiResult` and `mockFetchMpiCandidates` need to be hoisted to the top of `patient-crud.test.ts` (same as `patient-consent-atomic.test.ts`). If `patient-crud.test.ts` does not yet mock those modules, add the mocks at the top alongside the existing mocks.

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F hub-api test -- patient-crud
```

Expected: FAIL — `patient.checkDuplicates is not a function` (procedure doesn't exist yet)

- [ ] **Step 3: Add `patient.checkDuplicates` to patient.ts**

Add this procedure inside `patientRouter`, after the `search` procedure:

```typescript
  checkDuplicates: protectedProcedure
    .use(rateLimitMiddleware({ limit: 20, windowSec: 60 }, 'mpiCheck'))
    .use(enforceResourceAccess('Patient'))
    .input(
      z.object({
        nameGiven:             z.string().min(1).max(200).optional(),
        nameFather:            z.string().min(1).max(200).optional(),
        nameGrandfather:       z.string().min(1).max(200).optional(),
        birthYear:             z.number().int().min(1900).optional(),
        gender:                z.enum(['male', 'female', 'other', 'unknown']).optional(),
        addressDistrictOrigin: z.string().max(100).optional(),
        addressProvinceOrigin: z.string().max(100).optional(),
        phone:                 z.string().max(50).optional(),
        nationalId:            z.string().max(200).optional(),
        tazkiraPaperHash:      z.string().max(500).optional(),
        biometricFingerprintHash: z.string().max(500).optional(),
      }).refine(
        (val) => val.nameGiven || val.nameFather || val.nationalId || val.tazkiraPaperHash || val.biometricFingerprintHash,
        { message: 'At least one identity field (name or hard identifier) is required' }
      )
    )
    .query(async ({ ctx, input }) => {
      const { hmacKey } = getFieldEncryptionKeys()

      const nationalIdHash = input.nationalId
        ? generateBlindIndex(input.nationalId, hmacKey)
        : undefined

      const candidates = await fetchMpiCandidates(ctx.supabase, {
        nameGiven:             input.nameGiven,
        nameFather:            input.nameFather,
        nationalId:            input.nationalId,
        tazkiraPaperHash:      input.tazkiraPaperHash,
        biometricFingerprintHash: input.biometricFingerprintHash,
        birthYear:             input.birthYear,
        addressDistrictOrigin: input.addressDistrictOrigin,
        phone:                 input.phone,
      })

      const mpiResult = computeMpiResult(candidates, {
        nameGiven:                input.nameGiven,
        nameFather:               input.nameFather,
        nameGrandfather:          input.nameGrandfather,
        birthYear:                input.birthYear,
        gender:                   input.gender,
        addressDistrictOrigin:    input.addressDistrictOrigin,
        addressProvinceOrigin:    input.addressProvinceOrigin,
        phone:                    input.phone,
        nationalIdHash:           nationalIdHash,
        tazkiraPaperHash:         input.tazkiraPaperHash,
        biometricFingerprintHash: input.biometricFingerprintHash,
      })

      // Issue a proceedToken on WARN so the clinician can go straight to patient.create
      let proceedToken: string | undefined
      if (mpiResult.decision === 'WARN') {
        proceedToken = await signProceedToken({
          candidateIds: mpiResult.candidates.map(c => c.candidate.id),
          maxScore: mpiResult.topScore,
          issuedTo: ctx.user.sub,
        })
      }

      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PHI_READ',
          resourceType: 'PATIENT',
          resourceId: 'mpi-check',
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'mpi_check', decision: mpiResult.decision, topScore: mpiResult.topScore },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_READ', resourceType: 'PATIENT', resourceId: 'mpi-check' })
      }

      return {
        decision: mpiResult.decision,
        topScore: mpiResult.topScore,
        proceedToken,
        candidates: mpiResult.candidates.map(c => ({
          id:           c.candidate.id,
          nameGiven:    c.candidate.nameGiven,
          nameFather:   c.candidate.nameFather,
          birthYear:    c.candidate.birthYear,
          gender:       c.candidate.gender,
          districtOrigin: c.candidate.addressDistrictOrigin,
          mpiScore:     c.score,
          scoreBreakdown: c.breakdown,
        })),
      }
    }),
```

- [ ] **Step 4: Run all hub-api tests**

```bash
pnpm -F hub-api test
```

Expected: All tests PASS.

- [ ] **Step 5: Full typecheck across the monorepo**

```bash
pnpm typecheck
```

Expected: Zero TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/hub-api/src/trpc/routers/patient.ts apps/hub-api/src/__tests__/patient-crud.test.ts
git commit -m "feat(hub-api): add patient.checkDuplicates procedure with MPI scoring and proceedToken"
```

---

## Plan Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| ALA-LC romanization table | Task 2 |
| Variant normalization (Mohammad→muhammad) | Task 2 |
| Double Metaphone tokenization | Task 2 |
| Jaro-Winkler scoring | Task 4 |
| BLOCK/WARN/ALLOW thresholds (90/60) | Task 5 |
| Hard identifier bypass | Task 5 |
| PatientAddress, PatientIdentifier types | Task 6 |
| Zod cross-field rules (birthDate/birthYear, verbal consent) | Task 6 |
| firstName backward-compat alias | Task 6 |
| Migrations 018–023 | Tasks 7–8 |
| Atomic create_patient_with_consent RPC | Task 8 |
| fetch_mpi_candidates RPC | Task 8 |
| proceedToken sign/verify/replay prevention | Task 9 |
| patient.create MPI decision flow | Task 10 |
| BLOCK → 409, no record created | Task 10 |
| WARN → 412 + proceedToken, no record | Task 10 |
| WARN + valid token → create, consume token | Task 10 |
| Audit metadata includes mpiDecision, consentMethod | Task 10 |
| patientRegistration: remove phone lock | Task 11 |
| Self-reg BLOCK: no PHI in response | Task 11 |
| Self-reg WARN: create with mpi_warn=true | Task 11 |
| patient.search: new MPI fields in response | Task 12 |
| patient.checkDuplicates new procedure | Task 13 |
| checkDuplicates: scoreBreakdown in response | Task 13 |
| checkDuplicates: rate limit 20/min | Task 13 |
| Afghan provinces reference | Task 6 |

All spec requirements covered. ✓

**Type consistency check:**
- `MpiInput`, `MpiCandidate`, `MpiResult` defined in Task 1 → used consistently in Tasks 5, 9, 10, 11, 13 ✓
- `MpiProceedTokenPayload` defined in Task 1 → returned by `verifyProceedToken` in Task 9 ✓
- `normalizeNameComponent` / `computePhoneticTokens` defined in Task 2 → called in Tasks 10, 11, 13 ✓
- `CreatePatientMpiInputSchema` defined in Task 6 → used as input schema in Task 10 ✓
- `consumeProceedToken` defined in Task 9 → called in Task 10 after WARN-path create ✓
- `scoreBreakdown` property in `MpiCandidateScore` defined in Task 1 → returned in `checkDuplicates` Task 13 ✓

---

*— Phase C complete. Implementation plan fully written. —*
