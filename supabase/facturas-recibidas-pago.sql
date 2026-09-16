-- ────────────────────────────────────────────────────────────────────────────────────
-- FACTURAS RECIBIDAS · pago (16/09/2026): estado pendiente/pagada con fecha, IBAN del
-- proveedor (leído de la factura) y referencia de la orden de transferencia SEPA generada.
-- Aproba NO mueve dinero: genera el fichero pain.001 que el gestor importa en su banca.
-- Migración aditiva e idempotente. Ejecutar en el editor SQL de Supabase.
-- ────────────────────────────────────────────────────────────────────────────────────

alter table "FacturaRecibida" add column if not exists "proveedorIban" text;
alter table "FacturaRecibida" add column if not exists "estado"        text not null default 'PENDIENTE'; -- PENDIENTE | PAGADA
alter table "FacturaRecibida" add column if not exists "fechaPago"     date;
alter table "FacturaRecibida" add column if not exists "ordenPago"     text;                             -- MsgId del fichero SEPA que la incluyó
create index if not exists "FacturaRecibida_ws_estado_idx" on "FacturaRecibida"("workspaceId", "estado");

-- Comprobación:
-- select "estado", count(*) from "FacturaRecibida" group by 1;
