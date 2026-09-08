-- Batch/lot dispense traceability: carry the dispensed manufacturing lot number to the
-- Hub so MedicationDispense records support batch-level recall traceability (the client
-- already captures batchLot at fulfillment; it was dropped at the client->Hub boundary).
-- batch_lot is a manufacturing lot number (NOT PHI) -> plaintext, nullable (not all
-- dispenses have a lot; optional end-to-end, backward compatible).

ALTER TABLE medication_dispenses ADD COLUMN IF NOT EXISTS batch_lot TEXT;
