-- A packaged food's barcode (phase 11), so a scan finds the saved food without the network.
-- Stored in one form per product: EAN-8, EAN-13, or GTIN-14 digits, with a 12-digit UPC-A
-- code as its EAN-13 form; the app checks the check digit. Nullable, and like carbs and fat
-- (decision 0025) the app never sends it as null. Not unique: two foods can share a pack.
alter table public.foods
  add column barcode text,
  add constraint foods_barcode_format check (barcode ~ '^([0-9]{8}|[0-9]{13,14})$');
