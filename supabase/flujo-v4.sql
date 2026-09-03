-- FLUJO v4 (03/09/2026): el ciclo del despacho termina en la ENTREGA.
-- Dos columnas de trabajo (Preparación · Preparado) y un solo gesto de cierre,
-- «Facturar y archivar», que registra CÓMO termina el expediente:
--   en_tramite  · presentado ante la Administración o entregado al cliente; resolución pendiente
--   concedido   · resolución favorable (Vigía siembra la caducidad estimada)
--   denegado    · resolución desfavorable o inadmisión
--   desistido   · cerrado sin presentar
-- La columna es opcional para el código (repli: la categoría se deduce del estado).
-- Idempotente: se puede pegar varias veces en el SQL Editor.
alter table public."Expediente" add column if not exists "salida" text;
alter table public."Expediente" drop constraint if exists "Expediente_salida_check";
alter table public."Expediente" add constraint "Expediente_salida_check"
  check ("salida" is null or "salida" in ('en_tramite', 'concedido', 'denegado', 'desistido'));
-- Archivados de antes: la categoría se deduce del estado (una sola vez, sin pisar nada).
update public."Expediente" set "salida" = 'concedido' where "salida" is null and "archivadoAt" is not null and "estado" in ('RESUELTO', 'FINALIZADO');
update public."Expediente" set "salida" = 'denegado'  where "salida" is null and "archivadoAt" is not null and "estado" = 'RECHAZADO';
update public."Expediente" set "salida" = 'en_tramite' where "salida" is null and "archivadoAt" is not null and "estado" in ('PRESENTADO', 'CITA_HUELLAS');
