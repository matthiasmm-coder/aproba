-- Configuración avanzada del catálogo de servicios (agosto 2026).
-- • ServicioConfig.porcentaje / porcentajeSobre: honorarios variables además del
--   fijo (p. ej. «1,5 % sobre el precio de compraventa»). Solo informativo para
--   el cliente (portal + hoja de encargo); la facturación automática sigue
--   usando anticipo/resto.
-- • ServicioConfig.precioOculto: «precio a consultar» POR SERVICIO en el portal
--   del cliente. Sustituye al antiguo ajuste global Workspace."portalOcultarPrecios"
--   (la columna se queda pero deja de leerse; abajo se traduce su valor).
-- • Workspace.packs: packs de servicios (JSONB, array de
--   {id, nombre, desc, servicioIds[], precioDesde, precioOculto}). Van en el
--   Workspace y NO como filas de ServicioConfig para no contaminar a los
--   consumidores directos de esa tabla (facturas, expedientes, portal…).
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

ALTER TABLE "ServicioConfig" ADD COLUMN IF NOT EXISTS "porcentaje" DECIMAL(6,3);
ALTER TABLE "ServicioConfig" ADD COLUMN IF NOT EXISTS "porcentajeSobre" TEXT;
ALTER TABLE "ServicioConfig" ADD COLUMN IF NOT EXISTS "precioOculto" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "packs" JSONB;

-- Traducción del ajuste global retirado: los workspaces que ocultaban TODOS los
-- precios pasan a ocultarlos servicio a servicio (mismo resultado, ahora granular).
UPDATE "ServicioConfig" sc
SET "precioOculto" = true
FROM "Workspace" w
WHERE sc."workspaceId" = w."id"
  AND COALESCE(w."portalOcultarPrecios", false) = true;
