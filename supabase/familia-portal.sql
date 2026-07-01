-- ─────────────────────────────────────────────────────────────────────────────
-- Enlace de portal a nivel de FAMILIA: un único token permite al titular rellenar la
-- ficha de todos los miembros y subir los documentos compartidos de la familia, sin un
-- enlace por persona. Mismo modelo que Expediente.portalToken (el token ES la credencial).
-- Migración aditiva e idempotente. Ejecutar una vez en el editor SQL de Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

alter table "Familia" add column if not exists "portalToken" text;

-- Único cuando existe; Postgres permite varios NULL en un índice único (familias sin enlace).
create unique index if not exists "Familia_portalToken_key" on "Familia"("portalToken");
