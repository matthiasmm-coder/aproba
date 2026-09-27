-- HOJA DE ENCARGO y MANDATO: un interruptor para CADA uno (Matthias, 27/09/2026).
--
-- Hasta hoy "hojaEncargoActiva" encendía la hoja de encargo Y el mandato. Se separan:
--   · Workspace.hojaEncargoActiva → la hoja de encargo (sin cambios)
--   · Workspace.mandatoActivo     → el mandato (NUEVO)
--   · Oficina.mandatoActivo       → el de una sede con bloque propio (NUEVO; null = sigue a
--                                   la hoja de ese bloque)
--
-- Arranque: cada despacho y cada sede conservan lo que tenían (mandato = hoja). Sin esta
-- migración el código ya funciona igual que antes: el mandato sigue a la hoja
-- (lib/encargo-activo.ts). Idempotente: se puede ejecutar dos veces.

alter table "Workspace" add column if not exists "mandatoActivo" boolean;
update "Workspace" set "mandatoActivo" = "hojaEncargoActiva" where "mandatoActivo" is null;
alter table "Workspace" alter column "mandatoActivo" set default false;

alter table "Oficina" add column if not exists "mandatoActivo" boolean;
update "Oficina" set "mandatoActivo" = "hojaEncargoActiva"
  where "mandatoActivo" is null and "hojaEncargoActiva" is not null;

-- Comprobación (debe devolver 0 filas): despachos cuyo mandato no quedó igual que su hoja.
-- select id, nombre from "Workspace" where "mandatoActivo" is distinct from "hojaEncargoActiva";
