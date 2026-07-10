-- Casilla de trámite de la página 2 forzada por el gestor, por modelo de formulario.
-- Ej.: {"EX-17":"DUPLICADO"}. La eligen en la página Formularios; TODOS los canales de
-- relleno (descarga gestor, export ZIP, seguimiento del cliente) la respetan.
-- Sin la migración, la app degrada con elegancia: el selector sigue funcionando por
-- descarga (query param), solo que sin memoria entre canales.
ALTER TABLE "Expediente" ADD COLUMN IF NOT EXISTS "p2Overrides" JSONB;
