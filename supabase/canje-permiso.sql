-- CANJE DEL PERMISO DE CONDUCIR (Jennifer y Samara, 03/10/2026): los datos del permiso
-- extranjero de un expediente de canje (país, nº, clases, fechas, residencia, informe médico,
-- entrega en la Jefatura), para copiarlos en la sede de la DGT y vigilar sus plazos
-- (lib/canje.ts). Sin esta migración la ficha enseña la guía pero no guarda los datos.
-- Idempotente: se puede ejecutar dos veces.

alter table "Expediente" add column if not exists "canje" jsonb;

-- Comprobación (debe devolver una fila):
-- select column_name, data_type from information_schema.columns
--  where table_name = 'Expediente' and column_name = 'canje';
