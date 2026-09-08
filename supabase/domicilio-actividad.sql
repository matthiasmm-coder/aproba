-- ────────────────────────────────────────────────────────────────────────────────────
-- Domicilio de ACTIVIDAD, distinto del domicilio FISCAL (petición de Asenjo Global
-- Consulting, 08/09/2026: «el domicilio de la actividad es distinto del fiscal; en las
-- notas de encargo o presupuestos debería aparecer uno y en las facturas otro»).
--
-- Regla del producto, deliberada:
--   • FACTURAS → SIEMPRE el domicilio fiscal (es un documento tributario: la dirección
--     que consta ahí es la del emisor ante Hacienda). Esta migración NO lo toca.
--   • HOJA DE ENCARGO, PRESUPUESTO y MANDATO → el domicilio de actividad si está
--     relleno; si está vacío, el fiscal de siempre (un despacho con una sola dirección
--     no nota nada).
--
-- Se añade en los dos niveles porque la hoja de encargo ya se emite por SEDE cuando la
-- oficina tiene identidad propia: sin la columna en Oficina, una sede con empresa propia
-- seguiría imprimiendo su domicilio fiscal.
-- Migración aditiva e idempotente. Ejecutar en el editor SQL de Supabase.
-- ────────────────────────────────────────────────────────────────────────────────────

alter table "Workspace" add column if not exists "domicilioActividad" text;
alter table "Oficina"   add column if not exists "domicilioActividad" text;

-- Comprobación (debe devolver 2 filas):
-- select table_name, column_name from information_schema.columns
--  where column_name = 'domicilioActividad' order by table_name;
