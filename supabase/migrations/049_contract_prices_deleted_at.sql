-- Wholesale Delete-Sync: soft-delete tombstone for cross-device ContractPrice removal.
-- deleted_at is stamped by the Hub on an action:'delete' sync push; the generic
-- org-scoped pull returns the tombstone row (bumped hlc_timestamp) so other devices
-- delete their local copy. The plain UNIQUE(org_id,customer_id,catalog_item_id) would
-- block re-adding a removed pair, so it is replaced by a PARTIAL unique index that
-- ignores tombstones (deleted_at IS NULL).

ALTER TABLE contract_prices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

ALTER TABLE contract_prices DROP CONSTRAINT IF EXISTS contract_prices_org_id_customer_id_catalog_item_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_prices_pair_live
  ON contract_prices (org_id, customer_id, catalog_item_id) WHERE deleted_at IS NULL;
