-- Factura.clienteId — FK real hacia Cliente (fix homónimos, auditoría 06/08/2026).
--
-- ANTES: la ficha del cliente leía sus facturas por clienteNombre (texto). Dos clientes
-- homónimos del MISMO despacho compartían facturas en sus fichas — frecuente en
-- extranjería (dos «Juan García»). Deuda conocida desde el 09/07.
--
-- DESPUÉS: las facturas nuevas llevan clienteId; la ficha lee por FK con repli por
-- nombre SOLO para facturas antiguas sin vínculo y manuales de nombre libre.
--
-- Idempotente: se puede ejecutar dos veces sin daño.

-- 1) Columna + FK. ON DELETE SET NULL: las facturas NUNCA se borran con el cliente
--    (la eliminación de cliente ya está bloqueada con 409 si tiene expedientes; esto
--    cubre el resto de caminos sin arriesgar historial contable).
ALTER TABLE "Factura" ADD COLUMN IF NOT EXISTS "clienteId" uuid REFERENCES "Cliente"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "Factura_workspace_cliente_idx" ON "Factura" ("workspaceId", "clienteId");

-- 2) Backfill A — por expediente (el vínculo más fiable: la factura de un expediente
--    pertenece a su cliente, aunque el gestor haya personalizado el nombre mostrado).
UPDATE "Factura" f
SET "clienteId" = e."clienteId"
FROM "Expediente" e
WHERE f."expedienteId" = e.id
  AND f."clienteId" IS NULL
  AND e."clienteId" IS NOT NULL;

-- 3) Backfill B — facturas familiares sin expediente ancla: el TITULAR de la familia
--    (la factura familiar se emite a su nombre; mismo criterio que el snapshot fiscal).
--    Solo cuando la familia tiene EXACTAMENTE un titular.
UPDATE "Factura" f
SET "clienteId" = t.id
FROM "Cliente" t
WHERE f."clienteId" IS NULL
  AND f."familiaId" IS NOT NULL
  AND t."familiaId" = f."familiaId"
  AND t."parentesco" = 'TITULAR'
  AND (SELECT count(*) FROM "Cliente" c2 WHERE c2."familiaId" = f."familiaId" AND c2."parentesco" = 'TITULAR') = 1;

-- 4) Backfill C — resto (manuales) por nombre exacto, SOLO si es inequívoco: un único
--    cliente del workspace con ese nombre completo. Ante homónimos NO se adivina:
--    la factura queda sin vínculo y la ficha la sigue mostrando por nombre.
UPDATE "Factura" f
SET "clienteId" = c.id
FROM "Cliente" c
WHERE f."clienteId" IS NULL
  AND c."workspaceId" = f."workspaceId"
  AND btrim(coalesce(c."nombre", '') || ' ' || coalesce(c."apellidos", '')) = f."clienteNombre"
  AND f."clienteNombre" <> ''
  AND (
    SELECT count(*) FROM "Cliente" c2
    WHERE c2."workspaceId" = f."workspaceId"
      AND btrim(coalesce(c2."nombre", '') || ' ' || coalesce(c2."apellidos", '')) = f."clienteNombre"
  ) = 1;

-- 5) Verificación (informativa)
SELECT
  count(*)                                    AS total_facturas,
  count(*) FILTER (WHERE "clienteId" IS NOT NULL) AS con_vinculo,
  count(*) FILTER (WHERE "clienteId" IS NULL)     AS sin_vinculo
FROM "Factura";
