-- 059_seed_pharmacy_facilities
-- Starter pharmacy directory so the OPD-Lite picker and the admin management
-- page are usable on a fresh environment. Admins maintain the list thereafter.
-- Idempotent on fixed UUIDs.
insert into pharmacy_facilities (id, name, latitude, longitude, address, province, district, facility_type, is_active)
values
  ('11111111-1111-1111-1111-111111111101','Kabul City Pharmacy',34.5553,69.2075,'Shahr-e Naw','Kabul','District 10','pharmacy',true),
  ('11111111-1111-1111-1111-111111111102','Green Cross Pharmacy',34.5261,69.1777,'Karte Se','Kabul','District 6','pharmacy',true),
  ('11111111-1111-1111-1111-111111111103','Herat Central Drug Store',34.3529,62.2040,'Central Bazaar','Herat','Injil','pharmacy',true),
  ('11111111-1111-1111-1111-111111111104','Balkh Health Pharmacy',36.7090,67.1109,'Main Road','Balkh','Mazar-e Sharif','pharmacy',true),
  ('11111111-1111-1111-1111-111111111105','Kandahar Care Pharmacy',31.6289,65.7372,'Shahr-e Naw','Kandahar','District 1','pharmacy',true),
  ('11111111-1111-1111-1111-111111111106','Nangarhar Family Pharmacy',34.4265,70.4515,'Jalalabad Center','Nangarhar','Jalalabad','pharmacy',true),
  ('11111111-1111-1111-1111-111111111107','Kunduz Relief Pharmacy',36.7286,68.8681,'City Center','Kunduz','Kunduz','pharmacy',true),
  ('11111111-1111-1111-1111-111111111108','Bamyan Community Pharmacy',34.8100,67.8210,'Bazaar Street','Bamyan','Bamyan','pharmacy',true)
on conflict (id) do nothing;
