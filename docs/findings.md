# Ultranos — Findings
## Research, Discoveries & Constraints

> **Protocol:** Append-only. Never delete findings. Add a timestamp to each entry.
> **Last Updated:** 2026-04-26

---

## 🗂️ Project State at Protocol 0 Initialization

### Workspace
- **Root:** `c:\Users\malan\OneDrive\Documents\Ultranos\`
- **Git:** `.git/` directory present — local repo initialized
- **GitHub:** Previously connected in Conversation `052a1365` (GitHub Integration Setup)

### Existing Files
| File | Status | Notes |
|------|--------|-------|
| `CLAUDE.md` | ✅ Exists (141 lines) | Project Constitution fully populated. Tech stack, directory structure, safety rules, arch decisions all defined. |
| `design.md` | ✅ Exists (174 lines) | Design Constitution fully populated. Wise-inspired design system: Lime Green `#9fe870`, Wise Sans 900, 0.85 line-height. |
| `ultranos_master_prd_v3.md` | ✅ Exists (1,081 lines) | Full Master PRD v3.0. Engineering Baseline. April 2026. |
| `.claude/settings.json` | ✅ Exists | Claude Code settings |
| `task_plan.md` | ✅ Created (Protocol 0) | This session |
| `findings.md` | ✅ Created (Protocol 0) | This file |
| `progress.md` | ✅ Created (Protocol 0) | This session |

### What Does NOT Yet Exist (needs building)
- No `apps/` directory — no application code written
- No `packages/` directory — no shared packages
- No `infra/` directory — no Terraform
- No `tools/` directory — no Python automation scripts
- No `architecture/` directory — no SOPs written
- No `.env` — no credentials configured
- No `.tmp/` — no temp workspace

---

## 🏗️ Architecture Discoveries

### Tech Stack (from `CLAUDE.md`)
| Layer | Technology |
|-------|-----------|
| OPD Lite Desktop | Next.js 15 PWA, TypeScript, Tailwind CSS, IndexedDB (Web Crypto API), Service Worker |
| OPD Lite Android | React Native 0.76+, TypeScript, SQLCipher, Android Keystore |
| Health Passport | React Native 0.76+ (iOS + Android), RTL-first, SQLCipher |
| Pharmacy POS | Next.js 15 PWA, TypeScript, Tailwind CSS |
| Lab Portal | Next.js 15 PWA, TypeScript, Tailwind CSS |
| Hub API | Node.js, Express/Fastify, PostgreSQL 16, Redis, JWT RS256 |
| AI | OpenAI-compatible API, Edge ONNX models, Cloud Vision OCR |
| Infra | Terraform, Docker, GitHub Actions CI/CD |
| Testing | Vitest, Playwright, Jest (React Native) |
| Package Manager | pnpm workspaces (monorepo) |

### Design System (from `design.md`)
- **Inspired by:** Wise (fintech) design language
- **Primary accent:** Lime Green `#9fe870` — buttons + accents only
- **Button text:** Dark Green `#163300`
- **Body text:** Near Black `#0e0f0c`
- **Heading font:** Wise Sans weight 900, line-height 0.85 (OpenType `"calt"`)
- **Body font:** Inter weight 600 as default
- **Buttons:** Pill shape (9999px radius), scale(1.05) hover
- **Cards:** 30–40px radius, ring shadow only

### Non-Negotiable Architectural Rules (from PRD Section 4)
1. **Offline-First** — every workflow completes without a network connection
2. **RTL from first commit** — Noto Sans Arabic embedded in app payloads
3. **FHIR R4 aligned from Day 1** — schema must require zero migration to expose FHIR APIs
4. **Data minimization by role** — Lab Portal: name + age only; Pharmacy: active unfilled prescriptions only
5. **Medical record immutability** — append-only amendments, original always preserved
6. **Audit log is law** — every PHI access logged, append-only, SHA-256 hash chained

### Healthcare Safety Rules (from `CLAUDE.md`)
1. PHI never in logs, errors, or comments
2. AI clinical content requires explicit physician confirmation gate
3. Drug interaction check failure → explicit "check unavailable" warning (never false negative)
4. Allergies: red, uncollapsed, top of sidebar, never behind a tab
5. Tier 1 fields: append-only (allergies, active meds, critical diagnoses)
6. Every PHI access emits audit event via `@ultranos/audit-logger`
7. Lab Portal API: returns ONLY first name + age — enforced at API layer

---

## 🔑 Regulatory Constraints

| Geography | Hosting Requirement |
|-----------|-------------------|
| UAE | Mandatory: Azure UAE North or AWS me-central-1 |
| KSA | Mandatory: KSA-resident infra (STC Cloud). AWS me-south-1 Bahrain = non-compliant |
| Jordan | No strict localization. Cross-border transfer needs explicit patient consent |
| Afghanistan | No localization mandate. EU/regional hosting recommended |

### Compliance Actions Required Before V1
- [ ] OQ-01: KSA infrastructure decision
- [ ] OQ-02: Drug interaction DB licensed (Wolters Kluwer, Cerner Multum, FDB, or WHO equivalent)
- [ ] OQ-03: SaMD classification review by Regulatory Affairs specialist
- [ ] OQ-07: DPO appointed (GDPR)

---

## 🔌 External Service Requirements (Phase 2 Link)

| Service | Purpose | Status |
|---------|---------|--------|
| OpenAI-compatible LLM | Clinical Scribe, Empathy Translation | Keys unknown — TBD |
| Cloud Vision OCR | KYC doc extraction, paper Rx, lab metadata | Keys unknown — TBD |
| Dialect TTS API | Empathy Translation audio | Keys unknown — TBD |
| Drug Interaction DB | Licensed pharmaceutical database (see OQ-02) | Not yet licensed |
| PostgreSQL 16 | Central Patient Ledger | Local dev or cloud TBD |
| Redis | Refresh token store, sync queue | Local dev or cloud TBD |
| Cloud KMS / HSM | Backup encryption key management | Cloud provider TBD |
| Terraform cloud backend | Infra state | TBD |
| GitHub | Version control | Connected (Conversation 052a1365) |

---

## 📐 FHIR R4 Resource Mapping Summary

| Entity | FHIR Resource |
|--------|--------------|
| Patient | `Patient` |
| Provider | `Practitioner` |
| Prescription | `MedicationRequest` |
| Lab Result | `DiagnosticReport` |
| Vitals | `Observation` (LOINC coded) |
| Clinical Note | `DocumentReference` |
| Allergy | `AllergyIntolerance` |
| Diagnosis | `Condition` (ICD-10-CM) |
| Consent | `Consent` |

---

## ⚠️ Known Risks & Constraints

| Risk | Mitigation |
|------|-----------|
| KSA data residency — no compliant cloud confirmed | OQ-01 must be resolved before Phase 0 exit |
| Drug DB not licensed | OQ-02 — no interaction checks possible without this |
| SaMD pre-market clearance could extend timeline 12–24 months | OQ-03 must be resolved immediately |
| Afghanistan has no national ID system | Probabilistic MPI matching is primary identity mechanism |
| Desktop PWA offline security less hardened than Android SQLCipher | Accepted trade-off documented in PRD §9; key-in-memory model mitigates |
| LLM hallucination in SOAP notes | Physician confirmation gate is mandatory; both AI + confirmed versions stored |
| Prescription duplicate dispensing during offline window | Idempotent atomic invalidation + HLC queue ordering |
| Last-Write-Wins explicitly prohibited for Tier 1 fields | Enforced in `packages/sync-engine/src/conflict-resolver.ts` |
