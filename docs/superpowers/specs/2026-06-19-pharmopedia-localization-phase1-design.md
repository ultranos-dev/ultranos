# Pharmopedia Localization Phase 1 — Machine Translation of Patient Prose (Design)

> **Status:** Design / decisions locked 2026-06-19.
> **Context:** The drug catalog is richly populated but English-only. The platform targets MENA & Central Asia; users read Arabic / Dari / Pashto. This spec covers **Phase 1**: machine-translate the patient-facing Tier-1 prose into ar/prs/ps and display it under an "unverified" disclaimer. The clinician confirm/edit workflow is **Phase 2** (deferred, noted).

## 1. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| L1 | Gate model (CLAUDE.md rule #2) | **Machine translation shown with an "unverified machine translation" disclaimer**, plus a clinician confirm/edit workflow (Phase 2). `translation_status` per field/lang tracks `machine` vs `confirmed`; both the AI version (Phase 1) and a future confirmed version (Phase 2) are stored. Nothing unverified is ever presented as authoritative. |
| L2 | Field scope (Phase 1) | **Patient Tier-1 prose only:** `summaryPlain`, `usedFor`, `warningsSummaryPlain`, and `whenToSeekHelp` / `storageInstructions` when present. Clinical fields (contraindications, MOA, dosing, pregnancy, …) stay English until a later pass. |
| L3 | Languages | **Arabic (`ar`) + Dari (`prs`) + Pashto (`ps`)** — Arabic added because the platform targets MENA and the app already ships an Arabic UI; `resolveLocalized` already reads arbitrary keys. |
| L4 | Engine | **Gemini** (`GEMINI_API_KEY` already in repo `.env`). Hub-side, batched, fault-tolerant. |

## 2. Data model

- **shared-types:** extend `DrugLocalizedText` from `{ en?, prs?, ps? }` to `{ en?, ar?, prs?, ps? }`. `resolveLocalized` reads keys dynamically, so display requires no further change for the value itself.
- **DB:** add `translation_status JSONB NOT NULL DEFAULT '{}'` to `drug_catalog`:
  ```jsonc
  { "summaryPlain": { "ar": "machine", "prs": "machine", "ps": "machine" },
    "warningsSummaryPlain": { "ar": "confirmed", ... } }
  ```
  Phase 1 only ever writes `"machine"`. Phase 2's confirm action flips entries to `"confirmed"`. A field/lang absent from the map means "no translation" (English fallback — no disclaimer, since the original English is authoritative).
- **Status field-name keys** use the camelCase entity field names (`summaryPlain`, not `summary_plain`) so the renderer can index by the entity property it is resolving.

## 3. Translation ETL (Hub-side)

New files in `scripts/etl/drug-catalog/`:

- **`sources/translator.ts`** — a thin Gemini client. `translate(text: string): Promise<{ ar?: string; prs?: string; ps?: string } | null>`: one structured call returning all three languages for an English input; JSON-mode/parsed response; retry on transient failure; returns `null` on hard failure (caller skips). Reads `GEMINI_API_KEY`.
- **`run-translate.ts`** — the runner:
  1. Fetch catalog rows (atc_code, inn_name, the target JSONB fields, translation_status), paginated.
  2. For each row, for each target field that has an `en` value: determine which of `{ar, prs, ps}` are **missing** from that field's JSONB. **Idempotent** — skip any lang already present (never re-translate; never clobber a Phase-2 `confirmed` value).
  3. Translate the missing langs (one Gemini call per field-value, bounded concurrency `TRANSLATE_CONCURRENCY`), merge the new keys into the field's JSONB, and set `translation_status[field][lang] = "machine"` for each newly written lang.
  4. Chunked upsert of `{ atc_code, inn_name, <changed fields>, translation_status, last_etl_refresh }` (onConflict `atc_code`; inn_name included for the NOT-NULL ON CONFLICT candidate). The `version` trigger bumps → device sync delivers it.
- **Fault tolerance:** a failed translation for one field skips that field (counted), never aborts. The list of target fields is a single constant shared by the runner.

The target fields are the populated patient Tier-1 prose: `summary_plain` (`summaryPlain`), `used_for` (`usedFor`), `warnings_summary_plain` (`warningsSummaryPlain`), `when_to_seek_help` (`whenToSeekHelp`), `storage_instructions` (`storageInstructions`). `used_for` is an array of `DrugLocalizedText` (translate each item); the rest are single `DrugLocalizedText`.

## 4. hub-api + sync

- `scopeEntryToTier` already maps the localized fields; add `translationStatus` (from `row.translation_status`) to the Tier-1 entity so the device knows which displayed values are machine output.
- No new endpoint in Phase 1 (the confirm workflow is Phase 2). `ETL_PROTECTED_FIELDS` gains `translation_status` (ETL-owned).

## 5. Display (Pharmopedia)

- **`resolveLocalized`** gains a third return field `machineTranslated: boolean`. New signature option: pass the field's status map; when the resolved language is non-`en` and `status[lang] === 'machine'`, return `machineTranslated: true`. English (or a confirmed translation, or English fallback) → `false`.
- **Page-level banner** on the drug-detail screen: when the active language is `ar/prs/ps` **and** any displayed field on the page is machine-translated, render a single dismissible-free info banner at the top — *"Some information on this page was machine-translated and has not been verified by a clinician."* — localized into the active UI language (an i18n key, human-translated like the rest of the UI chrome). Page-level (not per-field) keeps Phase 1 simple and unambiguous; per-field badges are a possible refinement.
- The banner copy itself is UI chrome (not drug content) → translated in `ar/en/prs/ps.ts` like every other UI string, no machine translation/gate needed for it.

## 6. Testing

- **ETL:** `translator.ts` parses Gemini's structured response and returns the 3 langs (mocked fetch); returns null on error. `run-translate.ts`: only translates **missing** langs (idempotency — a field already having `prs` is not re-translated and `confirmed` is never overwritten); writes the right JSONB keys + `translation_status="machine"`; payload shape correct; never touches non-target columns.
- **App:** `resolveLocalized` returns `machineTranslated` correctly across (en, machine prs, confirmed prs, missing→en-fallback). Banner shows for a machine-translated prs view; hidden for English and for confirmed-only content.

## 7. Phase 2 (deferred — not built in this spec)

Clinician confirm/edit workflow in `EnrichTab`: list machine-translated fields for a drug, let a pharmacist/admin edit the translation and **confirm** it (flip `translation_status[field][lang]` → `confirmed`, store the edited text). Confirmed content drops the disclaimer. Per-field badges. Possibly broaden scope to clinical fields. Phase 1 is fully rule-#2-compliant on its own via the always-on disclaimer + stored AI version.

## 8. Out of scope / notes

- Translation quality is machine-grade; the disclaimer + Phase-2 review is the safeguard. Clinical-critical fields are intentionally **not** translated in Phase 1.
- Re-running the ETL is safe and only fills gaps (idempotent).
- Cost/volume: ~2,000 drugs × ~2 populated patient fields × 3 langs, one batched call per field-value.
