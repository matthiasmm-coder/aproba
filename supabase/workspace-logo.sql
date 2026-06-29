-- Branding de las facturas (feature 4b): logo del despacho. Migración aditiva.
-- Ejecutar una vez en el editor SQL de Supabase. Sin esta columna, la factura usa el
-- nombre/NIF/domicilio del despacho como encabezado (repli propre, no se rompe nada).
alter table "Workspace" add column if not exists "logoUrl" text;
