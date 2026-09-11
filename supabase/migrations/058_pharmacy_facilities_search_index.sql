-- 058_pharmacy_facilities_search_index
-- Trigram indexes to support ILIKE '%q%' substring search over the pharmacy
-- directory (pharmacy.search / pharmacy.listForAdmin in the hub-api pharmacy router).
create extension if not exists pg_trgm;

create index if not exists idx_pharmacy_facilities_name_trgm
  on pharmacy_facilities using gin (name gin_trgm_ops);

create index if not exists idx_pharmacy_facilities_address_trgm
  on pharmacy_facilities using gin (address gin_trgm_ops);

create index if not exists idx_pharmacy_facilities_province_trgm
  on pharmacy_facilities using gin (province gin_trgm_ops);
