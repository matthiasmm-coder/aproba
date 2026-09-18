-- ─────────────────────────────────────────────────────────────────────────────
-- «¿Presenta el despacho como representante?» — 18/09/2026.
-- Los formularios oficiales traen una sección «DATOS DEL REPRESENTANTE A EFECTOS DE
-- PRESENTACIÓN DE LA SOLICITUD». Rellenarla siempre sería decir que el despacho
-- representa en expedientes donde no lo hace, así que es una decisión POR EXPEDIENTE.
-- null / false = sección en blanco (comportamiento de siempre) · true = con los datos
-- del despacho (Ajustes › Despacho, o la sede del expediente).
-- Migración aditiva e idempotente. Ejecutar en el editor SQL de Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

alter table "Expediente" add column if not exists "presentaGestor" boolean;

-- Comprobación:
-- select count(*) filter (where "presentaGestor") as con_representante, count(*) from "Expediente";
