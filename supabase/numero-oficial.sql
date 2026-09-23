-- ─────────────────────────────────────────────────────────────────────────────────────
-- Nº DE EXPEDIENTE OFICIAL (Extranjería) — petición de Jennifer (Gesnet), 23/09/2026
--
-- «Es bueno colocar un campo de número de expediente.» Es el número que la Oficina de
-- Extranjería asigna al expediente, NO la referencia interna de Aproba (EXP-2026-0001).
-- Con él se consulta el estado en infoext2 (la web oficial busca por NIE o por este
-- número) y es la columna central del Excel con el que los despachos siguen sus casos.
-- Texto libre: el formato cambia según la provincia y el procedimiento.
-- ─────────────────────────────────────────────────────────────────────────────────────

alter table "Expediente" add column if not exists "numeroOficial" text;

-- Buscar por número dentro del despacho (la vista tabla y la búsqueda lo usan).
create index if not exists "Expediente_ws_numeroOficial_idx"
  on "Expediente" ("workspaceId", "numeroOficial") where "numeroOficial" is not null;
