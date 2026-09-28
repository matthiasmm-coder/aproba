-- ═══ FACTURA EMITIDA · RETENCIÓN IRPF + EMISOR FIJADO (28/09/2026) ═══
-- Origen: Asenjo. Marta Asenjo (abogada, autónoma) emite desde Aproba con su propia identidad
-- fiscal (una oficina emisora con su NIF y su serie), sobre todo a AGC, la sociedad: esas
-- facturas llevan retención de IRPF (15 %, o 7 % en los primeros años de actividad).
-- Idempotente (IF NOT EXISTS). El código funciona antes y después de ejecutarla.

-- 1) Retención IRPF de la factura emitida.
--    `total` sigue siendo base + IVA: es el importe total de la factura (el que va a VeriFactu,
--    que no resta retenciones). Lo que el cliente paga es total − retencion.
alter table "Factura" add column if not exists "retencionPct" numeric(5,2);
alter table "Factura" add column if not exists "retencion" numeric(10,2);

-- 2) Emisor fijado al emitir: razón social, NIF, domicilio, email y logo tal como estaban en ese
--    momento. Cambiar después los datos del despacho o de la oficina ya no reescribe las
--    facturas emitidas (null = factura anterior a esta migración: se sigue leyendo en vivo).
alter table "Factura" add column if not exists "emisorDatos" jsonb;
