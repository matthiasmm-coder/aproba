-- ─────────────────────────────────────────────────────────────────────────────────────
-- RETENCIÓN DE IRPF en las facturas RECIBIDAS (pregunta de Luis Agudo, Asenjo, 23/09/2026)
--
-- «En relación a las facturas, tanto emitidas como las recibidas, si tuviera retención
--  por IRPF, no sólo por IVA, ¿cómo lo reconoce Aproba? En las recibidas sí tenemos ese caso.»
--
-- Muchas facturas que recibe un despacho (abogados, procuradores, alquileres) llevan
-- retención: base + IVA − retención = total. Hasta hoy Aproba no la conocía, así que:
--   · la factura se marcaba «revisar» con el aviso FALSO «los importes no cuadran»;
--   · base + IVA no cuadraba con el total en pantalla, y parecía un error de lectura.
-- El dinero nunca estuvo en juego: «total» es el importe FINAL A PAGAR (ya con la
-- retención descontada) y es de ahí que sale la orden de transferencia SEPA.
-- ─────────────────────────────────────────────────────────────────────────────────────

alter table "FacturaRecibida" add column if not exists "retencion"     numeric(12,2);  -- importe retenido, en positivo
alter table "FacturaRecibida" add column if not exists "tipoRetencion" numeric(5,2);   -- porcentaje (15, 7, 2, 1…)
