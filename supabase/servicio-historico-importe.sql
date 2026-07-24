-- Importe histórico facturado por cada servicio ya realizado (dato del pasado, importado de
-- la migración). NO genera factura ni cuenta para VeriFactu ni para el «facturado» contable:
-- es solo información — se muestra en el «Historial de servicios» de la ficha del cliente.
-- Migración aditiva e idempotente. Ejecutar una vez en Supabase.
alter table "ServicioHistorico" add column if not exists "importe" numeric(10,2);
