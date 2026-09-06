# Ultranos Infographics — Creative Brief for Graphics Agent

**Purpose:** Produce two standalone infographics for the Ultranos healthcare micro-app platform.
1. **Graphic 1 — System Overview** ("what Ultranos is")
2. **Graphic 2 — App Flow & Integration** ("how the apps connect and sync")

**Audience:** Mixed — investors/partners, clinical stakeholders, and technical reviewers. Keep it visually clean and legible at a glance, but factually precise (this is a healthcare system; do not invent numbers or capabilities).

**Ground-truth source:** All facts below were verified against the actual codebase at `c:\Users\malan\OneDrive\Documents\Ultranos` (CLAUDE.md, `docs/prd-v3.md`, `packages/sync-engine`, `apps/hub-api/src/trpc/routers`, and each app). Do NOT add capabilities that aren't listed here. If you need a fact that isn't here, mark it as a placeholder rather than guessing.

---

## 0. Shared Visual Identity (use for BOTH graphics)

Pull directly from the design system so the graphics feel native to the product.

- **Primary color — "Wise Green":** `#2e9e71` (web token `--primary`, oklch(0.527 0.154 150.069); RN token `Colors.primary500 = #2e9e71`). This is the hero brand color. Never use generic blue as primary.
- **Semantic accents:**
  - Destructive / allergy / critical = **red** (`--destructive`) — reserve for safety-critical elements.
  - Success = green, Warning = amber/yellow, Info = blue — use sparingly for status legends only.
- **Neutrals:** warm off-white background, near-black foreground, soft card surfaces with subtle borders.
- **Corner radius:** generous, rounded — `rounded-xl` (16px) on cards/boxes, pill shapes (`rounded-full`) for tags/badges. Matches the product's soft, modern feel.
- **Typography:**
  - Headings: **Public Sans** (bold/semibold).
  - Body / labels / data: **Manrope**.
  - If Arabic sample text is shown: **Noto Kufi Arabic**.
- **Iconography:** line-style icons (product uses lucide-react). Medical icons (pill, stethoscope, flask/microscope) stay upright; navigation arrows/chevrons mirror in RTL.
- **Tone:** clinical-trust meets modern-startup. Clean grid, lots of whitespace, no clutter. Think "medical fintech."
- **RTL note:** The product is RTL-first (Arabic/Dari). If feasible, design the layout so it reads cleanly if mirrored; at minimum, don't hard-code a left-to-right-only visual metaphor that breaks meaning when flipped.

---

## 1. GRAPHIC 1 — System Overview Infographic

### Goal
A single poster-style graphic that answers: *"What is Ultranos, who is it for, and what makes it safe/different?"*

### Headline / positioning (verified framing)
- **Name:** Ultranos
- **One-liner:** "A decentralized, offline-first healthcare micro-app platform for low-resource, offline-prone clinical environments."
- **Region:** MENA & Central Asia (UAE, KSA, Jordan, Afghanistan; EU diaspora). Optional subtle map motif of this region.
- **Architecture tagline:** "Hub-and-Spoke — role-specific Spoke apps sync asynchronously to a FHIR R4-aligned Central Hub."

### Section A — The Ecosystem at a glance (central visual)
Show a **Central Hub** in the middle with role-specific **Spoke apps** radiating out. Use icons + short labels. Mark build status with a small legend (● Production-ready / ◐ Scaffolded / future).

**Central Hub API** (the Hub) — Node.js + Next.js API/tRPC, PostgreSQL 16 (Supabase), Redis. Responsibilities: patient ledger, IAM/auth, conflict resolution, audit log, event broker, encryption orchestration, AI routing. ● Production-ready.

**Spoke apps** (role-locked, each fully functional offline):
| App | Role / User | Platform | Direction | Status |
|-----|-------------|----------|-----------|--------|
| **OPD Lite** (primary) | Clinician / GP consultation + e-prescribing | Next.js 15 PWA (desktop) | Bidirectional sync | ● Production-ready |
| **Health Passport** (Patient Lite Mobile) | Patient + Family Guardian | React Native (iOS+Android) | Pull-only | ● Production-ready |
| **Pharmacy Lite** | Pharmacist / dispensing tech | Next.js 15 PWA | Push-only | ● Production-ready |
| **Lab Lite** | Lab technician / phlebotomist | Next.js 15 PWA | Push-only, data-minimized | ◐ Scaffolded |
| **OPD Lite Mobile** | Field GP (rural) | Expo / React Native | Bidirectional (planned) | ◐ Scaffolded / future |
| **Pharmopedia** | Drug reference (clinicians/pharmacists) | Expo / React Native | Offline reference | ◐ Scaffolded / future |
| **Admin Portal** | System admin / compliance | Next.js 15 PWA | Read-only Hub queries (hub-companion, not a spoke) | ● Production-ready |

> Design note: Emphasize the 4 core spokes (OPD Lite, Health Passport, Pharmacy Lite, Lab Lite). Treat OPD Lite Mobile, Pharmopedia, and Admin Portal as secondary/supporting to avoid overcrowding.

### Section B — Four platform pillars (icon row / quadrant)
1. **Offline-First** — every clinical workflow completes with no network; durable sync queue survives restart; "pull the ethernet cable" test.
2. **Encrypted end-to-end** — AES-256-GCM field-level PHI encryption at the Hub; Web Crypto AES-GCM (IndexedDB) on desktop PWAs; SQLCipher + device keystore on mobile; TLS 1.3 in transit.
3. **FHIR R4-aligned** — all clinical data maps to FHIR R4 resources (Patient, Encounter, MedicationRequest, Observation, Condition, AllergyIntolerance, DiagnosticReport, Consent).
4. **Multilingual & RTL-first** — English, Arabic, Dari, Pashto (`en`, `ar`, `prs`, `ps`); RTL built in from day one.

### Section C — Healthcare safety guardrails (a "safety" band — use red accents tastefully)
Present as 5–6 short, punchy guarantees:
- **Allergies first, in red, never hidden** — highest display prominence in every clinician view.
- **Drug interaction checks never fail silently** — on failure the UI shows "Interaction check unavailable" (never a false "no interactions"). Severity tiers: CONTRAINDICATED / ALLERGY_MATCH (blocking) → MAJOR → MODERATE → MINOR.
- **AI needs a human gate** — no AI-generated clinical note or suggestion is committed to the record without explicit physician confirmation.
- **Every PHI access is audited** — append-only audit log with SHA-256 hash chaining; PHI never appears in logs.
- **Safety-critical data is append-only** — allergies, active meds, critical diagnoses are never overwritten on conflict (see Graphic 2).
- **Data minimization by role** — Lab Portal can only see patient name + age; Pharmacy sees name + DOB only, no clinical notes.

### Section D — Trust / footer strip (small)
- Auth: JWT RS256 (15-min, in-memory), refresh-token rotation, TOTP/MFA for clinical staff, OTP-only for patients.
- Regional data residency: UAE & KSA in-country hosting; GDPR SCCs for EU.
- Monorepo: shared packages — `sync-engine`, `crypto`, `shared-types` (FHIR), `drug-db`, `ui-kit`, `audit-logger`, `mpi-engine`.

### Layout guidance for Graphic 1
- Vertical poster (portrait) works well: header → hub-and-spoke diagram → 4 pillars → safety band → footer.
- Central hub-and-spoke diagram is the visual anchor (top third/center).
- Keep to the brand palette; use Wise Green for structure, red ONLY for the safety band and allergy references.

---

## 2. GRAPHIC 2 — App Flow & Integration Infographic

### Goal
Show *how data moves* between the apps and the Hub: sync directions, the offline queue, conflict resolution tiers, and the QR artifacts that bridge apps offline.

### Central concept: everything flows through the Hub
- **Spokes never talk to each other directly.** All coordination goes through the Central Hub's conflict-resolution engine.
- Sync is via tRPC: `sync.push` (spoke → Hub) and `sync.pull` (Hub → spoke), plus role-specific endpoints (`medication.recordDispense`, `lab.authorizeResult`, `lab.createNotification`).

### Section A — The integration map (main diagram)
Center = **Central Hub** (PostgreSQL + Redis). Draw directional arrows to/from each app. Use arrow style/color to encode direction:

- **OPD Lite ⇄ Hub** (bidirectional, thick arrow both ways): pushes Encounters, Prescriptions (MedicationRequest), Diagnoses (Condition), Vitals (Observation), SOAP notes (ClinicalImpression), Allergies; pulls changes from other clinicians/devices.
- **Pharmacy Lite → Hub** (push-only): pushes MedicationDispense records after scanning a prescription QR.
- **Lab Lite → Hub** (push-only, data-minimized): pushes DiagnosticReport (results), authorization actions, and notifications. Only reads patient **name + age**.
- **Health Passport ← Hub** (pull-only): patient pulls own aggregated health data (prescriptions, labs, vitals, meds, allergies) into an encrypted local cache.
- **Admin Portal ← Hub** (read-only queries): user management, credentialing, consent audit, conflict-resolution queue, system health.

### Section B — Cross-app QR bridges (the offline "handoff" artifacts)
These are how apps interoperate **without a network**. Show two distinct QR chips:

1. **Identity QR — "Health Passport"** (Patient → Clinician/Lab/Pharmacy scanner)
   - Payload: `{ pid, iat, exp, v, sig? }` (short JWT-style keys; `pid`=patient id, `iat`=issued, `exp`=expiry). 24-hour expiry, auto-refresh. **No PHI.** Optional ECDSA-P256 signature.
2. **Prescription QR** (OPD Lite → Pharmacy Lite)
   - Payload: `{ payload, sig, pub, issued_at, expiry }` where `payload` is a minified prescription bundle (medication codes, dosage, duration — **no demographics/notes/diagnoses**). Signed with **Ed25519**; verified **offline** by the pharmacy against the embedded public key + a local Key Revocation List (fail-closed if revoked).

> Design idea: a small "clinician → prints/shows QR → pharmacist scans → verifies offline → records dispense" mini-flow strip.

### Section C — The offline sync engine (how it works under the hood)
Show a compact "life of a record" flow:

`Create offline` → `HLC timestamp stamped` → `durable queue (pending)` → `on reconnect: drain worker` → `sync.push (batched)` → `Hub conflict-checks + stores` → `synced` (or `conflict` → returned for merge).

Key facts to surface:
- **HLC (Hybrid Logical Clock)** timestamps — not wall-clock — guarantee causal ordering across offline devices. Format `wallMs:counter:nodeId`.
- **Durable queue** survives app restart (Dexie/IndexedDB on web, SQLite on mobile). Statuses: `pending → syncing → synced / failed / awaiting-key`. Exponential backoff, capped retries.
- **Priority sync order** (render as a ranked stack — this is a great visual):
  1. Allergies / Consent / Key-revocation (safety-critical)
  2. Prescriptions (active meds)
  3. Lab notifications / dispenses
  4. Clinical notes / encounters
  5. Vitals / scheduling
  6. Demographics / metadata

### Section D — Conflict resolution tiers (a signature diagram)
This is the most important "why it's safe" visual. Render as a 4-tier ladder/table with color coding (Tier 1 = red/critical, down to Tier 3 = neutral):

| Tier | Data | Strategy on conflict |
|------|------|----------------------|
| **Tier 1 — Safety-critical** | Allergies, active meds, critical diagnoses | **Append-only** — both versions kept, flagged for physician review, **prescription generation blocked** until resolved. Never Last-Write-Wins. |
| **Tier 2 — Clinical** | Notes, lab results, vitals, historical Rx | Timestamp-based (newer HLC wins); older kept as addendum |
| **Tier 3 — Operational** | Demographics, preferences | Last-Write-Wins |
| **Consent** | Consent grants/withdrawals | Append-only ledger, syncs at priority 1 |
| **Tier 4 — Queue events** | Multi-device events for same patient | Chronological replay by HLC; anything within a 60-second window is flagged for review |

> Emphasize the headline: **"Allergies & active meds are append-only — never overwritten."**

### Section E (optional, small) — Duplicate-encounter safety net
Recent work worth a small callout if space allows: a DB-level unique constraint (one open encounter per patient+practitioner) + an automatic **reconcile** step that re-parents child records (vitals, conditions, prescriptions) to the canonical encounter when a duplicate is detected on sync — so no clinical data is stranded.

### Layout guidance for Graphic 2
- Landscape works well here: Hub in the center with spokes around it (top half) → sync-engine flow strip (middle) → conflict tiers ladder (bottom).
- Use consistent arrow legend: solid double-arrow = bidirectional, single arrow = push or pull (label direction).
- Color arrows by app or by direction — pick one and keep it consistent.
- The QR bridges and the conflict tiers are the two "wow" details — give them room.

---

## 3. Accuracy guardrails (read before you design)

- **Do NOT** show spokes syncing directly to each other. Always through the Hub.
- **Do NOT** imply Lab or Pharmacy can read full patient records — they are minimized/role-locked.
- **Do NOT** claim OPD Lite Mobile, Pharmopedia, or Lab Lite are fully built — they are scaffolded/future (Lab Lite is push-only and scaffolded).
- **Do NOT** put PHI (real patient names/diagnoses) in any example. Use obvious placeholders ("Patient A", "Rx-001").
- **Do NOT** substitute a generic blue brand color — the brand is Wise Green `#2e9e71`.
- Keep any numbers to those listed here (24h QR expiry, 60s conflict window, RS256/15-min tokens, 4 core spokes). If you want to add a metric that isn't here, flag it as a placeholder.

## 4. Deliverable format
- Two separate graphics (Graphic 1 portrait, Graphic 2 landscape suggested — adjust if the medium requires).
- Provide an editable/source form plus an export (e.g., SVG + PNG) if the tooling allows.
- Include a tiny legend on each: build-status dots (Graphic 1) and arrow-direction key (Graphic 2).
