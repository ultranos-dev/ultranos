-- Volume/quantity price breaks: tiered pricing per (customer, item) stored as a
-- JSONB array on the existing contract_prices row. Each tier is
-- { minQuantity, priceMinor } (snake-cased inner keys at rest). The flat `price`
-- column remains the base price for quantities below the first break.
-- Reuses the ContractPrice sync (push/pull/delete) — no new resource type.

ALTER TABLE contract_prices ADD COLUMN IF NOT EXISTS tiers JSONB NOT NULL DEFAULT '[]'::jsonb;
