-- Estado del cobro de lo facturado ANTES de Aproba (migración de datos) — 24/09/2026, Luis.
-- Nada de esto es una factura de Aproba: es lo que el despacho ya facturó en su sistema
-- anterior. Sirve para saber si está cobrado y perseguir lo pendiente desde Aproba, sin
-- volver a emitir (ni numerar, ni enviar a la AEAT) facturas que ya existen.
--   · ServicioHistorico.cobro        → trámites TERMINADOS importados (historial del cliente)
--   · Expediente.importePrevio/cobroPrevio → trámites EN CURSO importados (lo ya facturado)
-- Idempotente: se puede ejecutar dos veces.

alter table "ServicioHistorico" add column if not exists "cobro" text;
alter table "ServicioHistorico" drop constraint if exists "ServicioHistorico_cobro_check";
alter table "ServicioHistorico" add constraint "ServicioHistorico_cobro_check" check ("cobro" in ('COBRADA', 'PENDIENTE'));

alter table "Expediente" add column if not exists "importePrevio" numeric(12, 2);
alter table "Expediente" add column if not exists "cobroPrevio" text;
alter table "Expediente" drop constraint if exists "Expediente_cobroPrevio_check";
alter table "Expediente" add constraint "Expediente_cobroPrevio_check" check ("cobroPrevio" in ('COBRADA', 'PENDIENTE'));

-- Los pendientes se listan en «Cobros pendientes»: índices parciales, solo lo que falta cobrar.
create index if not exists "ServicioHistorico_cobro_pendiente_idx" on "ServicioHistorico" ("workspaceId") where "cobro" = 'PENDIENTE';
create index if not exists "Expediente_cobroPrevio_pendiente_idx" on "Expediente" ("workspaceId") where "cobroPrevio" = 'PENDIENTE';
