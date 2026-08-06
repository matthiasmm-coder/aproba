-- Opciones de personalización por despacho (peticiones de Juan 06/08/2026,
-- generalizadas como ajustes de workspace — nada cableado a un cliente concreto):
--
--   · portalOcultarPrecios — el portal del cliente NO muestra precios en la selección
--     de servicios (los honorarios varían según el caso; el importe se acuerda y se
--     factura, no se publica). Los importes de FACTURAS emitidas siguen visibles:
--     el cliente debe ver lo que paga.
--   · encargoFormasPago — formas de pago propias del despacho, UNA POR LÍNEA,
--     impresas tal cual en la hoja de encargo en lugar de la lista automática
--     (IBAN activo + tarjeta). NULL/vacío = comportamiento automático.
--   · mandatoPropioPath — ruta en Storage del modelo de mandato PROPIO del despacho
--     (PDF subido en Ajustes). Si existe, las descargas de mandato sirven ESE PDF
--     tal cual (sin relleno automático). NULL = mandato generado por Aproba.
--
-- Idempotente. Aditivo: el código tiene replis si estas columnas faltan.

ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "portalOcultarPrecios" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "encargoFormasPago" TEXT;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "mandatoPropioPath" TEXT;
