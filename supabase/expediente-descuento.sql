-- Descuento por expediente (pedido por Juan): ajustar el presupuesto ANTES de enviar
-- el enlace al cliente — packs familiares, varios servicios juntos. Se aplica a los
-- HONORARIOS (tras el ×N de familia); las tasas y suplidos nunca se descuentan (se
-- repercuten por su importe exacto). JSONB: { "tipo": "PORCENTAJE"|"IMPORTE",
-- "valor": 10, "motivo": "Pack familiar" }. NULL = sin descuento. Aditiva e idempotente.
ALTER TABLE "Expediente" ADD COLUMN IF NOT EXISTS "descuento" JSONB;
