-- Asignación de servicios a miembros concretos de la familia (pedido de Juan):
-- { "<servicioClave>": ["<clienteId>", ...] } — un servicio sin entrada se aplica a
-- TODOS los miembros (comportamiento actual ×N, retrocompatible). Solo tiene efecto
-- en expedientes familiares.
ALTER TABLE "Expediente" ADD COLUMN IF NOT EXISTS "serviciosAsignacion" JSONB;
