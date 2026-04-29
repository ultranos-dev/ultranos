# Ultranos Ecosystem

A decentralized healthcare micro-app platform for low-resource, offline-prone clinical environments in MENA & Central Asia. Hub-and-Spoke architecture: four role-specific Spoke apps sync asynchronously to a FHIR R4-aligned Central Hub.

## Tech Stack

- **OPD Lite Desktop (primary):** Next.js 15 PWA, TypeScript, Tailwind CSS, IndexedDB (encrypted via Web Crypto API), Service Worker for offline
- **OPD Lite Android:** React Native 0.76+, TypeScript, SQLCipher, Android Keystore
- **Health Passport:** React Native 0.76+ (iOS + Android), RTL-first, TypeScript, SQLCipher
- **Pharmacy POS:** Next.js 15 PWA, TypeScript, Tailwind CSS
- **Lab Portal:** Next.js 15 PWA, TypeScript, Tailwind CSS
- **Central Hub API:** Node.js, Express/Fastify, PostgreSQL 16, Redis, JWT (RS256)
- **AI Integration:** OpenAI-compatible API (Cloud LLM), Edge ONNX models, Cloud Vision OCR
- **Infrastructure:** Terraform, Docker, GitHub Actions CI/CD
- **Testing:** Vitest (unit), Playwright (e2e), Jest (React Native)

## Directory Structure

```
ultranos/
├── apps/
│   ├── hub-api/           # Central Hub backend (Node.js)
│   ├── opd-desktop/       # OPD Lite Desktop PWA (Next.js)
│   ├── opd-android/       # OPD Lite Android (React Native)
│   ├── health-passport/   # Patient app (React Native)
│   ├── pharmacy-pos/      # Pharmacy PWA (Next.js)
│   └── lab-portal/        # Lab PWA (Next.js)
├── packages/
│   ├── shared-types/      # FHIR R4 type definitions, enums, interfaces
│   ├── sync-engine/       # Offline queue, HLC timestamps, conflict resolution
│   ├── crypto/            # Encryption helpers (Web Crypto + SQLCipher wrappers)
│   ├── drug-db/           # Drug interaction checker (online + offline subset)
│   ├── ui-kit/            # Shared component library (RTL-ready)
│   └── audit-logger/      # Structured audit event emitter
├── infra/                 # Terraform, Docker configs
├── docs/                  # PRD, architecture decisions, regulatory docs
│   └── prd-v3.md          # Master PRD — read this for full requirements
├── scripts/               # Dev tooling, seed data, migration helpers
└── CLAUDE.md
```

This is a **monorepo** managed with pnpm workspaces. Shared packages are in `packages/`. Each app imports from `@ultranos/<package-name>`.

## Critical Commands

```bash
pnpm install                          # Install all dependencies
pnpm -F hub-api dev                   # Run Hub API locally
pnpm -F opd-desktop dev               # Run OPD Desktop PWA locally
pnpm -F health-passport start         # Run Health Passport in simulator
pnpm test                             # Run all tests
pnpm -F hub-api test                  # Run tests for a specific app
pnpm -F shared-types build            # Build a shared package
pnpm lint                             # Lint all (ESLint + Prettier)
pnpm typecheck                        # TypeScript check across monorepo
```

## ⛔ HEALTHCARE SAFETY RULES — NEVER VIOLATE

This is a healthcare system handling Protected Health Information (PHI). These rules are non-negotiable.

1. **PHI must never appear in logs, error messages, console output, or comments.** Patient names, IDs, diagnoses, medication names, allergies — none of it goes in `console.log()`, thrown error messages, Sentry breadcrumbs, or inline code comments. Use opaque IDs in logs. If you need to debug PHI-related logic, log the *shape* of data, never the *content*.

2. **All AI-generated clinical content requires a physician confirmation gate.** Never write code that auto-commits an AI-generated SOAP note, drug suggestion, or clinical translation to the patient record. There must always be an explicit user action (button tap, keyboard shortcut) between AI output and record commitment. Both the AI version and confirmed version must be stored.

3. **Drug interaction checks must never be skipped silently.** If the drug interaction check fails (network error, DB unavailable, timeout), the UI must show an explicit warning: "Interaction check unavailable." Never default to "no interactions found" on failure — that's a false negative that could kill someone.

4. **Allergy data gets the highest display prominence.** In any patient-facing view for clinicians, allergies render first, in red, never collapsed, never behind a tab. Allergy-related code paths get dedicated test coverage.

5. **Conflict resolution: Tier 1 fields are append-only.** Allergies, active medications, and critical diagnoses use append-only merge in the sync engine. Never write LWW (Last-Write-Wins) logic for these fields. See `packages/sync-engine/src/conflict-resolver.ts` for the tiered resolution logic.

6. **Audit every PHI access.** Every read, write, or access to patient data must emit a structured audit event via `@ultranos/audit-logger`. No exceptions. The audit log is append-only with SHA-256 hash chaining — never update or delete audit records.

7. **The Lab Portal can only see patient name + age.** The Lab Portal API endpoints must return ONLY first name and age for patient verification. If you're writing or modifying a Lab Portal endpoint and it returns any other patient data, that's a data minimization violation. This is enforced at the API layer, not the UI.

## Architecture Decisions

### Offline-First
Every clinical workflow must complete without a network connection. When writing a new feature, ask: "Does this work if I pull the ethernet cable right now?" If not, redesign it.
- Sync queue: `packages/sync-engine/` — durable, survives app restart
- Events stamped with Hybrid Logical Clocks (HLC), not `Date.now()`
- Priority sync order: allergies/consent → prescriptions → lab notifications → notes → vitals → metadata

### Encryption
- **Hub DB:** AES-256-GCM field-level encryption on PHI columns (diagnosis, prescription content, notes). See `packages/crypto/src/field-encrypt.ts`
- **Android local store:** SQLCipher. Key from Android Keystore. Never store the key in SharedPreferences or plaintext.
- **Desktop PWA:** Web Crypto API AES-GCM wrapping IndexedDB. Encryption key lives in memory only — cleared on tab/browser close. Never use `localStorage` or `sessionStorage` for PHI.
- **QR codes — Identity (Health Passport):** Contain `{ pid, iat, exp, v, sig? }` (JWT-standard short names for QR compactness: `pid` = patient_id, `iat` = issued_at, `exp` = expiry, `sig` = ECDSA-P256 signature) — never raw PHI.
- **QR codes — Prescription:** Contain `{ payload, sig, pub, issued_at, expiry }` where payload is a minified prescription bundle (medication codes, dosage, references — no demographics or clinical notes). Signed with Ed25519. Never raw PHI.

### FHIR R4 Alignment
All clinical data types in `packages/shared-types/` map to FHIR R4 resources. When creating a new clinical entity:
- Check if a FHIR R4 resource exists for it at https://hl7.org/fhir/R4/resourcelist.html
- Use the FHIR field names as the canonical source; add Ultranos extensions in a separate namespace
- Types live in `packages/shared-types/src/fhir/`
- **Meta fields:** Use FHIR R4 canonical `Meta` field names: `lastUpdated` (ISO 8601 instant), `versionId` (string). The `createdAt` field is an Ultranos extension and MUST live inside the `_ultranos` namespace, never in `meta`. Do NOT use `createdAt`/`updatedAt` in the `meta` object.

### RTL Support
Arabic and Dari are RTL languages. Every UI component must work in both LTR and RTL.
- Use logical CSS properties: `margin-inline-start` not `margin-left`, `padding-inline-end` not `padding-right`
- Navigation icons (arrows, chevrons) must mirror. Medical icons (pill, stethoscope) must NOT mirror.
- Test both directions. The CI pipeline runs RTL layout snapshots — don't skip them.

### Auth & Sessions
- Access tokens: JWT RS256, 15-min expiry, stored in memory only (never localStorage)
- Refresh tokens: opaque, server-side Redis, single-use rotation
- MFA: TOTP required for all clinical staff roles. Patient auth is OTP-only (no password).
- Desktop PWA: 30-min inactivity → re-auth required on clinical views. Tab close → encrypted cache cleared.

## Sync Engine — Conflict Resolution Tiers

When writing sync logic, use the correct tier:

| Tier | Fields | Strategy |
|------|--------|----------|
| **Tier 1 — Safety-Critical** | Allergies, active meds, critical diagnoses | Append-only merge. Both versions kept. Conflict flag for physician review. Prescription generation blocked until resolved. |
| **Tier 2 — Clinical** | Notes, lab results, vitals, historical prescriptions | Timestamp-based merge. Newer wins. Both versions kept as addenda. |
| **Tier 3 — Operational** | Demographics, preferences | Last-Write-Wins. |
| **Consent — High-Priority Sync** | Consent grants/withdrawals | Append-only ledger. Syncs at priority 1 (same as allergies) because consent changes affect data access enforcement at the Hub API layer. |
| **Tier 4 — Queue Events** | Multi-device offline events for same patient | Chronological replay by HLC. Events within 60s conflict window → flagged regardless of tier. |

## Testing Requirements

- Every drug interaction code path needs dedicated test cases including: CONTRAINDICATED blocking, ALLERGY_MATCH blocking, override-with-reason logging, and the "check unavailable" fallback warning
- Allergy display: snapshot tests confirming allergy section renders first, in red, uncollapsed
- Sync engine: test Tier 1 append-only behavior with simulated conflicting offline events
- RTL: snapshot tests for every patient-facing component in both LTR and RTL
- Audit: every API endpoint that touches PHI must have a test asserting an audit event was emitted
- Offline: integration tests that simulate network disconnection mid-operation and verify queue persistence

## Decision Points

When you encounter a decision point (ambiguous design choice, multiple valid approaches, or a tradeoff that requires human judgment), always:

1. **Outline all viable options** with a short label (A, B, C...).
2. **Highlight your recommendation** for each decision with clear reasoning — consider effort, risk, alignment with project constraints, and pragmatism.
3. **Present to the user** before proceeding. Do not silently pick an option.

## When Compacting

When compacting, always preserve: the full list of modified files, any failing test names and their error messages, which sync tier is relevant to the current work, and the current module being worked on (hub-api, opd-desktop, etc.).

## Key Reference Files

- Full PRD with all requirements: `ultranos_master_prd_v3.md`
- FHIR type definitions: `packages/shared-types/src/fhir/`
- Sync engine conflict resolver: `packages/sync-engine/src/conflict-resolver.ts`
- Audit event schema: `packages/audit-logger/src/schema.ts`
- Drug interaction severity levels: `packages/drug-db/src/severity.ts`
- Encryption helpers: `packages/crypto/src/`
- Consent data model: `packages/shared-types/src/fhir/consent.ts`
