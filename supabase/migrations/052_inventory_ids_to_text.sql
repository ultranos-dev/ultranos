-- Correct the inventory/procurement id columns from UUID to TEXT.
-- These columns hold CLIENT resource ids, which are `string` in the client types:
-- newly-created ids are UUIDs (crypto.randomUUID), but seed/imported data uses
-- readable strings (e.g. "seed-batch-amox-1"). A UUID column rejects those with
-- "invalid input syntax for type uuid". catalog_item_id was already TEXT for the
-- same reason; this brings the id/foreign-id columns in line. org_id stays UUID
-- (a real org id stamped from the authenticated context). Tables are empty, so the
-- USING-less type change is trivial and lossless.

ALTER TABLE pharmacy_suppliers        ALTER COLUMN id TYPE TEXT;

ALTER TABLE pharmacy_purchase_orders  ALTER COLUMN id TYPE TEXT;
ALTER TABLE pharmacy_purchase_orders  ALTER COLUMN supplier_id TYPE TEXT;

ALTER TABLE goods_receipts            ALTER COLUMN id TYPE TEXT;
ALTER TABLE goods_receipts            ALTER COLUMN supplier_id TYPE TEXT;
ALTER TABLE goods_receipts            ALTER COLUMN purchase_order_id TYPE TEXT;

ALTER TABLE stock_batches             ALTER COLUMN id TYPE TEXT;
ALTER TABLE stock_batches             ALTER COLUMN supplier_id TYPE TEXT;
ALTER TABLE stock_batches             ALTER COLUMN goods_receipt_id TYPE TEXT;

ALTER TABLE stock_movements           ALTER COLUMN id TYPE TEXT;
ALTER TABLE stock_movements           ALTER COLUMN stock_batch_id TYPE TEXT;
