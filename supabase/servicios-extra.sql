-- Multi-servicio: servicios ADICIONALES de un expediente (claves de ServicioConfig),
-- además del principal (servicioClave). El principal sigue pilotando el enum tipo,
-- la hoja de encargo (409 si no resuelve) y Vigía; los extras suman docs requeridos,
-- formularios y tarifas (anticipo/resto). null ≡ [] ≡ sin extras. Idempotente.
ALTER TABLE "Expediente" ADD COLUMN IF NOT EXISTS "serviciosExtra" text[];
