-- ─────────────────────────────────────────────────────────────────────────────
-- Facturas personalizables (Pro/Business): líneas de honorarios + SUPLIDOS (gastos
-- pagados por cuenta del cliente, p.ej. la tasa 790, EXENTOS de IVA y fuera de la base
-- imponible — art. 78.Tres.3º LIVA) + notas. Migración aditiva (solo añade columnas).
-- Ejecutar una vez en el editor SQL de Supabase. Repli propre: sin estas columnas, las
-- facturas siguen siendo de una sola línea (no se rompe nada).
-- ─────────────────────────────────────────────────────────────────────────────

alter table "Factura" add column if not exists "lineas"   jsonb;  -- [{ "concepto": "...", "base": 350 }]   (honorarios, con IVA 21%)
alter table "Factura" add column if not exists "suplidos" jsonb;  -- [{ "concepto": "Tasa 790-012", "importe": 38.28 }]  (sin IVA)
alter table "Factura" add column if not exists "notas"    text;
