-- Curación de formularios POR miembro (familia heterogénea): { "<clienteId>": ["EX-10",...] }.
-- Persiste los añadidos/quitados manuales de cada miembro en la página de Formularios.
ALTER TABLE "Expediente" ADD COLUMN IF NOT EXISTS "formulariosPorMiembro" JSONB;
