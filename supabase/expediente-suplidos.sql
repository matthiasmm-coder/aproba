-- Tasas y suplidos AJUSTADOS por expediente (pedido por Juan): jsonb [{concepto, importe}].
-- Cuando está presente, REEMPLAZA los suplidos del servicio para ESE expediente (p. ej. el
-- TIE 16,08 € en vez del 12 € por defecto). null = se toman los del servicio (Ajustes).
-- Alimenta la hoja de encargo, la primera factura y el presupuesto del portal. Idempotente.
ALTER TABLE "Expediente" ADD COLUMN IF NOT EXISTS "suplidosOverride" JSONB;
