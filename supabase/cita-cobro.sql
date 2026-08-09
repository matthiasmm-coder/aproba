-- ─────────────────────────────────────────────────────────────────────────────
-- Cobro de una cita previa: la cita puede llevar un importe que se cobra al
-- cliente. Al marcarlo, Aproba emite una FACTURA real (mismo circuito que el
-- resto: numeración del año, IVA, listado de Facturas, cobro con tarjeta y
-- conciliación) y el email de confirmación explica cómo pagar.
--
-- Se guarda el vínculo cita → factura para no emitir una segunda factura si el
-- gestor edita la cita y vuelve a avisar al cliente.
--
-- Aditiva e idempotente: se puede ejecutar dos veces sin daño.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "CitaPrevia" ADD COLUMN IF NOT EXISTS "facturaId" TEXT;

CREATE INDEX IF NOT EXISTS "CitaPrevia_facturaId_idx" ON "CitaPrevia" ("facturaId");

-- FK opcional: si la factura se borra, la cita se conserva sin vínculo (el
-- historial contable manda; una cita nunca debe bloquear una factura).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CitaPrevia_facturaId_fkey') THEN
    ALTER TABLE "CitaPrevia"
      ADD CONSTRAINT "CitaPrevia_facturaId_fkey"
      FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE SET NULL;
  END IF;
END $$;
