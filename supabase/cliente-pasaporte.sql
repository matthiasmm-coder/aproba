-- Ficha del cliente: NIE y Pasaporte en dos campos separados (pedido por Juan).
-- Hasta ahora un único campo numeroDocumento hacía de «NIE / Pasaporte»; a partir
-- de ahora numeroDocumento = NIE y la nueva columna pasaporte = pasaporte.
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "pasaporte" TEXT;

-- Datos existentes: lo que no tiene formato de NIE (X/Y/Z + dígitos) ni de DNI
-- español (8 dígitos + letra) es un pasaporte → se mueve a la nueva columna.
-- Idempotente (las filas movidas quedan con numeroDocumento NULL).
UPDATE "Cliente"
SET "pasaporte" = "numeroDocumento", "numeroDocumento" = NULL
WHERE "pasaporte" IS NULL
  AND "numeroDocumento" IS NOT NULL
  AND btrim("numeroDocumento") <> ''
  AND btrim("numeroDocumento") !~* '^[XYZ][-. ]?[0-9]'
  AND btrim("numeroDocumento") !~ '^[0-9]{8}[A-Za-z]$';
