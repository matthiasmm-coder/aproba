-- ─────────────────────────────────────────────────────────────────────────────
-- Documentos COMPARTIDOS de una familia (libro de familia, justificante de vivienda del
-- reagrupante, certificado de matrimonio…): se suben UNA vez a nivel de familia y valen
-- para todos los miembros, sin pedirlos a cada uno. Migración aditiva e idempotente.
-- Ejecutar una vez en el editor SQL de Supabase. Requiere supabase/familia.sql aplicado.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists "DocumentoFamilia" (
  "id"            text        primary key,
  "familiaId"     text        not null references "Familia"("id") on delete cascade,
  "workspaceId"   text        not null references "Workspace"("id") on delete cascade,
  "tipo"          text        not null,              -- etiqueta libre (Libro de familia, Vivienda…)
  "nombreArchivo" text,
  "storagePath"   text        not null,              -- bucket privado `documentos`, ruta familias/{id}/…
  "mimeType"      text,
  "sizeBytes"     integer,
  "createdAt"     timestamptz not null default now()
);
create index if not exists "DocumentoFamilia_familiaId_idx" on "DocumentoFamilia"("familiaId");

-- RLS multi-tenant (mismo patrón que Familia/Cliente): docs de la familia del workspace.
alter table "DocumentoFamilia" enable row level security;
drop policy if exists documentofamilia_tenant on "DocumentoFamilia";  -- re-ejecutable (create policy no es idempotente)
create policy documentofamilia_tenant on "DocumentoFamilia"
  for all using ("workspaceId" in (select app_workspace_ids()));
