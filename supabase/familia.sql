-- ─────────────────────────────────────────────────────────────────────────────
-- Dossier familial: agrupa varios clientes (y sus expedientes) bajo una FAMILIA.
-- Cada miembro conserva su PROPIO Expediente (su trámite/EX propio) — la familia solo
-- los agrupa para gestionarlos juntos. Migración ADITIVA e idempotente. Ejecutar una vez
-- en el editor SQL de Supabase. Hasta entonces la sección Familias queda desactivada con
-- repli propre (no rompe nada).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists "Familia" (
  "id"          text        primary key,
  "workspaceId" text        not null references "Workspace"("id") on delete cascade,
  "nombre"      text        not null,               -- p.ej. "Familia Liu"
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now()
);
create index if not exists "Familia_workspaceId_idx" on "Familia"("workspaceId");

-- RLS multi-tenant (mismo patrón que Cliente/Expediente): la familia del workspace del usuario.
alter table "Familia" enable row level security;
create policy familia_tenant on "Familia"
  for all using ("workspaceId" in (select app_workspace_ids()));

-- Vínculo de cada cliente a su familia + su rol/parentesco (texto: TITULAR|CONYUGE|PAREJA|
-- HIJO|ASCENDIENTE|OTRO — como sexo/estadoCivil, sin enum Postgres para poder evolucionar).
alter table "Cliente" add column if not exists "familiaId"  text references "Familia"("id") on delete set null;
alter table "Cliente" add column if not exists "parentesco" text;
create index if not exists "Cliente_familiaId_idx" on "Cliente"("familiaId");
