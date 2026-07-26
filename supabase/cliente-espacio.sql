-- ─────────────────────────────────────────────────────────────────────────────
-- ESPACIO DEL CLIENTE (persistente): un token estable POR CLIENTE (además del token
-- por expediente). Se genera solo, al terminar su primer expediente (o al visitar su
-- página de seguimiento). Con él, /c/[token] lista todos sus trámites (en curso,
-- terminados e histórico pre-migración) y permite SOLICITAR un trámite nuevo.
-- Migración aditiva e idempotente. Ejecutar una vez en Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "espacioToken" TEXT;

-- Unicidad solo cuando hay token (los clientes sin espacio quedan a NULL).
CREATE UNIQUE INDEX IF NOT EXISTS "Cliente_espacioToken_key"
  ON "Cliente"("espacioToken") WHERE "espacioToken" IS NOT NULL;
