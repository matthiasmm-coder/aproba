-- Tasas y suplidos por servicio (Juan, 2026-07-13): jsonb [{concepto, importe}].
-- SIN IVA y fuera de la base imponible (art. 78.Tres.3º LIVA). Se enseñan en el
-- presupuesto (portal + hoja de encargo) y se añaden a la PRIMERA factura automática
-- del expediente. Idempotente.
ALTER TABLE "ServicioConfig" ADD COLUMN IF NOT EXISTS "suplidos" JSONB;
