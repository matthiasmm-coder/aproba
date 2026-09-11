-- VIGÍA · renovación PROPUESTA al cliente + documento renovado PEDIDO (11/09/2026)
--
-- Estados de "Vencimiento"."estado" (texto, sin enum):
--   PENDIENTE | AVISADO            → nada iniciado
--   PROPUESTA                      → renovación propuesta al cliente (expediente creado, SIN factura), esperando respuesta
--   TRAMITANDO                     → el cliente ACEPTÓ: renovación en marcha (factura de anticipo emitida si hay tarifa)
--   RECHAZADA                      → el cliente RECHAZÓ (expediente archivado); se puede proponer de nuevo
--   SOLICITADO                     → documento renovado pedido al cliente (pasaporte, NIE…), esperando que lo suba
--   HECHO                          → ciclo cerrado
alter table "Vencimiento" add column if not exists "propuestaAt"      timestamptz; -- cuándo se envió la propuesta
alter table "Vencimiento" add column if not exists "respuestaCliente" text;        -- ACEPTADA | RECHAZADA
alter table "Vencimiento" add column if not exists "respondidoAt"     timestamptz;
alter table "Vencimiento" add column if not exists "solicitadoAt"     timestamptz; -- cuándo se pidió el documento renovado
alter table "Vencimiento" add column if not exists "recibidoAt"       timestamptz; -- cuándo llegó el documento renovado (fecha nueva sembrada)
