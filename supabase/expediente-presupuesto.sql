-- Presupuesto con el precio de ESTE expediente (pedido por Juan, 26/09/2026): el gestor
-- fija los honorarios del expediente al generar el presupuesto, sin tocar el precio del
-- servicio en Ajustes (Juan cobra según el cliente y la complejidad del trámite).
--
-- "tarifasPropias" JSONB: { "<clave del servicio>": { "anticipo": 200, "resto": 150 } }
--   Honorarios SIN IVA, por servicio (en familia, por persona, como el catálogo). Sustituyen
--   a la tarifa del catálogo en el presupuesto, la hoja de encargo, el enlace del cliente y
--   las facturas del expediente. NULL = precio del catálogo.
-- "presupuestoOpciones" JSONB: { "validezDias": 30, "nota": "..." } — solo las imprime el
--   presupuesto. NULL = 30 días y sin nota.
--
-- Aditiva e idempotente: no cambia nada de lo existente.
ALTER TABLE "Expediente" ADD COLUMN IF NOT EXISTS "tarifasPropias" JSONB;
ALTER TABLE "Expediente" ADD COLUMN IF NOT EXISTS "presupuestoOpciones" JSONB;
