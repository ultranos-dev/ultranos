# Audit Remediation Overview — Epics 56–63

**Source:** `docs/system-audit-2026-09-23.md` (7-agent full-system audit, orchestrator-verified Criticals).
**Created:** 2026-09-23. 28 stories across 8 epics, grouped by FUNCTION (not app) because the highest-severity findings are cross-app chains. Every story carries a Zero-Regression Mandate: no existing feature or functionality may be removed or degraded; full affected test suites + `pnpm typecheck` must pass before review.

## Epic Map & Sequencing

| Epic | Theme | Stories | Phase (audit §11) |
|---|---|---|---|
| **56** | Security & Trust Boundary | 56.1 app_metadata claims · 56.2 sync/patient object-level authz · 56.3 MFA feature toggle (admin-controlled, default OFF) · 56.4 auth perimeter | 0 — blockers |
| **57** | Medication Safety Chain | 57.1 allergy gate restoration · 57.2 server interaction gate + supervisor override · 57.3 dispense durability/idempotency · 57.4 inventory integrity + check-degradation surfacing | 0/1 |
| **58** | Lab Privacy & Data Minimization | 58.1 UUID/photo leak · 58.2 lab surface scoping · 58.3 spoke PHI-at-rest · 58.4 consent completeness | 0/1 |
| **59** | Contract Integrity & Dead Wiring | 59.1 lab-lite dead endpoints · 59.2 contract CI + typed clients · 59.3 OPD unwired components · 59.4 appointments repair | 0/1 |
| **60** | Sync & Offline Integrity | 60.1 HLC discipline · 60.2 sync-engine fail-safe hardening · 60.3 offline registration + MPI · 60.4 failure visibility + notification producers | 1/2 |
| **61** | Audit, Encryption & Transactions | 61.1 audit completeness/tamper evidence · 61.2 key-derivation hardening · 61.3 atomic multi-writes | 1/2 |
| **62** | Business & Enterprise Correctness | 62.1 pharmacy financial correctness (taxRate 100×, refunds, drawer) · 62.2 hub/admin enterprise hardening | 1/2 |
| **63** | UX, i18n & Consistency | 63.1 safety-critical i18n + lint · 63.2 lab-lite content gating + UI sweep · 63.3 platform consistency + doc truth | 3 |

**Ordering constraints:** 56.1 → before 56.2/56.3/62.2(RBAC). 59.2's contract guard should land the same sprint as 59.1. 60.1 supplies the `hlcNow()` helper 59.4 consumes. 61.2's KDF change unblocks 59.3's PhiCleanupGuard decision. 58.4 coordinates with 57.1's new allergy endpoint. 60.4 coordinates with 61.3 on MedicationStatement.

## Finding → Story Traceability (Criticals & Highs)

| Audit finding | Story |
|---|---|
| C-SYS-1 user_metadata privilege escalation | 56.1 |
| C-SYS-2 sync.pull/push authz + C-HUB-4 patient directory | 56.2 |
| C-SYS-3 pharmacy allergy gate placebo | 57.1 |
| C-SYS-4 patient UUID in photo URLs + H-HUB-5 | 58.1 |
| C-SYS-5 lab-lite dead endpoints (+H-LAB-4) | 59.1 (+59.2 structural) |
| C-SYS-6 MFA absent platform-wide | 56.3 |
| C-PHARM-2 taxRate 100× | 62.1 |
| C-OPD-1 audit drain unwired | 59.3 (+61.1) |
| C-OPD-2 / M-LAB-3 offline registration | 60.3 |
| C-LAB-1 / H-HUB-3 dispense monitoring leak | 58.2 |
| H-HUB-1/2 client-attested interaction check, self-attested override | 57.2 |
| H-HUB-4 unassigned-order broadcast; H-LAB-5 DTO/ID transport | 58.2 |
| H-HUB-6 Tier-1 60s window | 60.2 |
| H-HUB-7 consent gaps lab/med-statement | 58.4 |
| H-HUB-8 JWT deviations; H-ADM-1 open redirect; M-HUB-2/3 | 56.4 |
| H-PHARM-1/2 dispense loss + dead idempotency | 57.3 |
| H-PHARM-3 / H-LAB-3 / H-OPD-3 wall-clock HLC | 60.1 (+59.4) |
| H-LAB-1/2 unencrypted PHI DB + cleanup gaps; M-PHARM-3 | 58.3 |
| H-LAB-6 silent dead-letters; producer-less notifications; stranded MPI; MedicationStatement | 60.4 |
| H-OPD-1/4/5, M-OPD-2/4 unwired OPD components | 59.3 |
| H-OPD-2 / P-CRYPTO-2/3/4 key derivation, tamper swallow, identity QR | 61.2 |
| H-ADM-2 / M-HUB-4/7 non-atomic writes + practitioner-id mismatch | 61.3 |
| P-CRYPTO-1, P-SYNC-1..7 sync fail-opens | 60.2 |
| P-AUDIT-1..3, M-PHARM-4, M-OPD-1, M-ADM-1/2, M-HUB-8 audit gaps | 61.1 |
| M-HUB-1/5/12, M-ADM-3/4/5/6, M-OPD-3, admin.ts monolith | 62.2 |
| M-HUB-6 appointments RBAC + orphans | 59.4 |
| i18n gaps (all apps) | 63.1 |
| M-LAB-2 placeholder content, palette/RTL sweeps | 63.2 |
| P-UIKIT-1, P-TYPES-1, version drift, CLAUDE.md staleness | 63.3 |

## Resolved Decisions

- **MFA (2026-09-23, user):** MFA is a FEATURE, not a default requirement — an org-level toggle owned by the Admin in the Admin Portal, disabled by default, enforced server-side by the Hub only for orgs that enable it. Patient auth stays OTP-only, never MFA. Story 56.3 is re-scoped accordingly; CLAUDE.md's "MFA: TOTP required for all clinical staff roles" line is amended as part of 56.3 (Task 5). Any other story or the audit report saying "MFA required/mandatory" is superseded by this decision.

## Open Decision Points (user input needed — flagged inside the owning stories)

1. **Photo on lab list tier** (58.1) — recommend detail-tier only.
2. **Auth architecture** (Theme 4) — Supabase cookie sessions vs documented in-memory/Redis model; 56.4 hardens without deciding; a decision should be recorded in CLAUDE.md.
3. **Consent exemptions matrix** (58.4) — result delivery & dispense med-lists.
4. **PhiCleanupGuard semantics** (59.3) — clear-on-close vs key-wipe-only (post-61.2).
5. **MPI BLOCK enforcement mode** (60.3) — enforce vs staged warn.
6. **Offline cold-start unlock** (61.2) — server-secret-only vs dual-wrap with device PIN (recommended).
7. **RBAC granularity matrix** (62.2) — SUPERADMIN vs ORG_ADMIN capability split.
8. **Peer-network / ai-provenance hub routers** (59.1) — build vs flag-off local-only.
9. **Controlled-substance dispense gate** (M-PHARM-8) — PRD question, unassigned; needs product ruling.
10. **Lab-lite gamification scope** (M-LAB-3) — product ruling; no story removes it.
11. **Drug-db coded allergy matching + cross-reactivity** (P-DRUG-1) — clinically high-value follow-up epic candidate, deliberately not bundled into 57.x.

## Dispatch Guidance for Implementing Agents

- Read the owning story + its audit-report section before coding; re-verify every cited file:line against source (No-Assumptions rule — audit [A] items are agent-verified leads, not gospel).
- Never commit/stage without explicit user instruction. Parallel file-mutating agents require worktree isolation.
- DB changes go through Supabase MCP tools only.
- The Zero-Regression Mandate is an acceptance criterion in every story: run `pnpm typecheck` and the affected packages' full suites; report actual results, never implied ones.
