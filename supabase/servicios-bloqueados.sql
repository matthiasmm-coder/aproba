-- ─────────────────────────────────────────────────────────────────────────────
-- SERVICIOS BLOQUEADOS POR EL GESTOR — 18/09/2026 (petición de Luis y Marta Asenjo).
--
-- El gestor cierra el presupuesto ANTES de enviar el enlace: los servicios que ha
-- elegido llegan al portal MARCADOS y BLOQUEADOS (el cliente no puede quitarlos), y el
-- cliente sigue viendo el resto del catálogo por temas y puede AÑADIR lo que quiera.
--
-- Columna nueva, separada de `serviciosExtra`: después de la primera confirmación esa
-- columna mezcla lo del gestor con lo que añadió el cliente, así que no se puede deducir
-- de ella qué estaba bloqueado. Vacío o NULL = nada bloqueado (comportamiento de siempre).
-- Migración aditiva e idempotente. Ejecutar en el editor SQL de Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

alter table "Expediente" add column if not exists "serviciosBloqueados" text[];

-- Comprobación:
-- select count(*) from "Expediente" where "serviciosBloqueados" is not null;
