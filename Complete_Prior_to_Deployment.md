# Complete Prior to Deployment

Deployment prerequisites and follow-ups for the **Epics 56–63 audit-remediation** work
(branch `audit-sep-23-improvements`). Compiled from the remediation audit of 2026-09-25
(6 parallel groups + serial gate G). All 28 stories passed with **zero regressions and no
merge blockers** — the items below are deploy-time actions and tracked follow-ups, not code
defects.

> **How to use this file:** work top to bottom. Section 1 items are **blocking** — a
> production deploy without them degrades a real feature (KDF key-establishment, KYC OCR) or
> silently under-privileges users. Sections 2–4 are non-blocking but should be scheduled.
> Re-confirm live DB / migration state at deploy time (state can drift after 2026-09-25).

---

## 1. Blocking — must complete before production deploy

### 1.1 Server-only secrets (set in the Hub host env / Supabase secrets)

Both are documented in `apps/hub-api/.env.example`. They fail *safe* if unset (see notes),
but the associated features are disabled until set.

| Env var | Story | Effect if unset |
|---------|-------|-----------------|
| `HUB_KEY_WRAPPING_MASTER_SECRET` | 61.2 | Online DEK key-establishment path is gated (offline data still readable via the PIN arm). |
| `GOOGLE_CLOUD_VISION_API_KEY` | 62.2 | `POST /api/ocr/kyc` returns 503; OPD-Lite falls back to manual entry. |

```bash
# Generate the wrapping master secret (64 hex chars, high entropy):
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Supabase secrets:
supabase secrets set HUB_KEY_WRAPPING_MASTER_SECRET=<hex-from-above>
supabase secrets set GOOGLE_CLOUD_VISION_API_KEY=<your-gcv-key>

# — or on your host (Vercel example):
vercel env add HUB_KEY_WRAPPING_MASTER_SECRET production
vercel env add GOOGLE_CLOUD_VISION_API_KEY production
```

⚠️ Cautions:
- `HUB_KEY_WRAPPING_MASTER_SECRET` **must be distinct** from `FIELD_ENCRYPTION_KEY` and
  `FIELD_ENCRYPTION_HMAC_KEY`. Rotating it forces every device to re-establish its DEK on
  next online login — set it **once, deliberately, and back it up** separately from the DB.
- `GOOGLE_CLOUD_VISION_API_KEY` is **server-only** — never expose it as `NEXT_PUBLIC_*`
  (that would ship the key in the client bundle; 62.2 / M-OPD-3 exists to prevent exactly this).

### 1.2 Confirm all migrations the shipped code depends on are applied live

Verified applied at the 2026-09-25 audit (Group G) — **re-confirm at deploy** via Supabase MCP
(`list_migrations`) against the running project:

- `063` audit chain vNext — and confirm `audit_emit_with_lock` has **exactly one** overload
  carrying `p_chain_version` (multiple overloads was the prior production-500 cause).
- `064` `org_security_policies` (MFA toggle; 0 rows ⇒ MFA-disabled default).
- `065` interaction-gate columns (interaction check server/client, supervisor PIN hash, override reason/verified).
- `066`–`069` atomic RPCs: `merge_patient_atomic`, `unmerge_patient_atomic`,
  `replace_report_observations`, `record_dispense_atomic`, `register_lab_atomic`
  (confirm `register_lab_atomic` resolves `practitioners.id` from `auth_user_id`).
- `070_medication_statement_outbox` — note the **numbering divergence**: applied under the
  name-prefix `066_medication_statement_outbox` (distinct version timestamp). Benign
  (`IF NOT EXISTS`, idempotent), but verify the table is live.

### 1.3 Run the one-time auth-claims migration script

`apps/hub-api/scripts/migrate-auth-claims.ts` (Story 56.1) copies role/org/facility/status
from `user_metadata` → `app_metadata`. Run **`--dry-run` first**, then for real, before/with
the Hub deploy.

- At the 2026-09-25 audit the live DB already showed **all users carrying `app_metadata.role`
  with zero drift** — so this may be a no-op, but run the dry-run to confirm reconciliation
  (asserts zero users with a `user_metadata` role but no `app_metadata` role).
- Until a user's `app_metadata` is populated and their token refreshes (≤15 min), they resolve
  as unprivileged; client display keeps working via a temporary fallback.

### 1.4 Legacy patient-photo re-key (only if legacy UUID-keyed photo objects exist)

New photo uploads already use opaque random keys (`opaquePhotoKey()`, Story 58.1), so no
migration is *required*. If the storage bucket has pre-remediation photos keyed by patient
UUID, run `apps/hub-api/scripts/rekey-patient-photos.mjs` at deploy to re-key them to opaque
keys (prevents the real patient UUID leaking via a signed photo URL — audit C-SYS-4).

---

## 2. Deferred gate steps — schedule after a clean release cycle (tracked, intentional)

These were **intentionally left staged** and are documented in-code; they are not omissions.

- **60.1 — flip HLC hub-format validation from log-only → enforce.**
  `apps/hub-api/src/lib/hlc-format.ts` defaults `HLC_FORMAT_MODE=log-only`; flip to `enforce`
  only after telemetry shows spokes ship clean HLC stamps **and** legacy-stamped entries have
  drained (minimum one release of log-only).
- **59.2 — empty the spoke-contract allowlist.**
  `apps/hub-api/src/__tests__/spoke-contract.allowlist.json` (~27 pre-existing dead spoke→hub
  paths, warning-only). The list must **only shrink**; drive it to empty under Story 59.1.
  Never add an entry to silence a new failure.

---

## 3. CI / tooling

- **Raise the vitest `testTimeout`** (e.g. 30000ms) in CI, or run on unloaded hardware. The
  default 5000ms produces spurious timeout flakes on cold worktrees / loaded machines — every
  such "failure" in the audit passed on isolated re-run. A fresh worktree must also run
  `pnpm install` + `pnpm -r --filter "./packages/**" build` before app suites resolve
  `@ultranos/*` dist entries.
- **Wire `check:dist` into CI** — `pnpm --filter @ultranos/ui-kit check:dist`
  (`packages/ui-kit/scripts/check-dist-fresh.mjs`) guards against a stale gitignored `dist/`.

---

## 4. Non-blocking follow-ups (open a ticket; none block merge or deploy)

- **63.2:** 11 invalid `bg-primary-50` no-op classes remain in edited lab-lite files (AC4
  partial). No visual effect (invalid class renders nothing before and after) — cleanup only.
- **57.2:** supervisor-PIN **set-flow admin UI** is deferred. Until it ships, no practitioner
  has a PIN, so online BLOCKED/UNAVAILABLE overrides `NO_PIN_SET`-reject (fails safe — blocks,
  never opens). Track before enabling override in production. Also: switch the PIN compare to
  `crypto.timingSafeEqual` (`apps/hub-api/src/services/supervisor-override.ts`).
- **61.1:** add an automated integration test that hits the real `audit_emit_with_lock` RPC to
  guard JS↔Postgres `computeChainHash` parity (currently proven only by mocked reference
  hashers + a manual live-DB check).
- **`pharmopedia`:** regenerate the `profile-rtl` snapshot (`vitest -u`) — stale after the
  intentional Story 58.1 avatar-ring change (out of the Epics 56–63 scope).
- **`063` migration file:** correct the stale `-- AUTHORED, NOT APPLIED` header comment — it
  **is** applied live.
- **`opd-lite-mobile` typecheck** failure is **pre-existing on `main`** (RN tsconfig picks up
  ui-kit web DOM types) — not introduced by this work; fix independently if desired.

---

_Source of record: the Epics 56–63 remediation audit (2026-09-25). Re-verify live DB/migration
state at deploy — this checklist reflects state as of that date._
