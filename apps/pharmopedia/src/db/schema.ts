export const DB_NAME = 'pharmopedia.db'
export const SCHEMA_VERSION = 1

/**
 * Full DDL for the Pharmopedia local database.
 *
 * drug_catalog: stores tier-scoped JSON payloads from Hub API sync.
 *   brand_names_flat / local_names_flat: pre-computed space-joined search text
 *   (populated by application code at upsert time, not generated columns).
 *
 * drug_catalog_fts: FTS5 content table over drug_catalog.
 *   Rebuilt via `INSERT INTO drug_catalog_fts(drug_catalog_fts) VALUES('rebuild')`
 *   after each sync batch. inn_name + atc_code + brand_names_flat + local_names_flat
 *   are indexed for full-text search.
 *
 * sync_meta: key-value store for sync state.
 *   Keys: 'lastVersion' (integer string), 'lastSyncAt' (ISO 8601 string)
 */
export const CREATE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS drug_catalog (
    atc_code          TEXT PRIMARY KEY,
    inn_name          TEXT NOT NULL,
    brand_names       TEXT,          -- JSON array e.g. ["Augmentin"]
    dose_forms        TEXT,          -- JSON array e.g. ["tablet","syrup"]
    therapeutic_class TEXT,
    local_names       TEXT,          -- JSON object e.g. {"prs":"آموکسیسیلین","ps":"..."}
    tier1_json        TEXT NOT NULL, -- DrugEntryTier1 serialised (all roles)
    tier2_json        TEXT,          -- DrugEntryTier2 serialised (clinical+); NULL for PATIENT
    tier3_json        TEXT,          -- DrugEntryTier3 serialised (pharmacist); NULL for clinical-
    version           INTEGER NOT NULL,
    brand_names_flat  TEXT NOT NULL DEFAULT '',  -- brand_names array joined by space
    local_names_flat  TEXT NOT NULL DEFAULT ''   -- local_names object values joined by space
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS drug_catalog_fts USING fts5(
    inn_name,
    atc_code,
    brand_names_flat,
    local_names_flat,
    content='drug_catalog',
    content_rowid='rowid',
    tokenize='unicode61'
  );

  CREATE TABLE IF NOT EXISTS sync_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`
