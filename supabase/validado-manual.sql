-- Validación manual del expediente (22/08/2026).
-- El gestor declara con UN botón que las tres secciones que cuentan para la
-- completitud (Información, Documentos, Formularios) están OK: el expediente pasa a
-- 100 % y entra en «Listo para presentar», aunque al producto le falten datos que el
-- despacho ya tiene por otra vía (papeles en mano, ficha que no aplica…).
-- NULL = sin validar: todos los expedientes existentes conservan su cálculo automático.
ALTER TABLE "Expediente" ADD COLUMN IF NOT EXISTS "validadoAt" timestamptz;
