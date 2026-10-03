-- VISTA TABLA EDITABLE (Jennifer, Gesnet, 03/10/2026): dos datos que su Excel llevaba y
-- Aproba no guardaba. Se escriben desde la propia Tabla (Expedientes › Tabla).
--   colaborador   — la entidad externa / subcontrata con la que se lleva el trámite (texto libre).
--   tasaPagadaEl  — el día en que se pagó la tasa (null = sin pagar o sin anotar).
-- Sin esta migración la Tabla sale igual: esas dos columnas quedan vacías y sin editar.
-- Idempotente: se puede ejecutar dos veces.

alter table "Expediente" add column if not exists "colaborador" text;
alter table "Expediente" add column if not exists "tasaPagadaEl" date;

-- Comprobación (debe devolver las dos columnas):
-- select column_name, data_type from information_schema.columns
--  where table_name = 'Expediente' and column_name in ('colaborador', 'tasaPagadaEl');
