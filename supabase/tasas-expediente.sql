-- ─────────────────────────────────────────────────────────────────────────────
-- Tasas del expediente — 18/09/2026.
-- La pantalla Formularios enseñaba las CINCO tasas en todos los expedientes. Ahora sale
-- la que corresponde al servicio (lib/tasas.ts) y el gestor puede quitar o añadir otra;
-- esta columna guarda esa curación, como formulariosGenerados con los modelos EX.
-- null = automático (según el servicio) · array = lo que el gestor dejó (puede ir vacío).
-- Migración aditiva e idempotente. Ejecutar en el editor SQL de Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

alter table "Expediente" add column if not exists "tasas" text[];

-- Comprobación:
-- select count(*) filter (where "tasas" is not null) as curados, count(*) from "Expediente";
