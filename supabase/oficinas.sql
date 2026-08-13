-- ─────────────────────────────────────────────────────────────────────────────
-- MULTI-OFICINA (plan Business) — migración ADITIVA e idempotente.
-- Ejecutar una vez en el editor SQL de Supabase. Hasta entonces, repli propre:
-- ningún código existente lee estas columnas, y los workspaces mono-oficina no
-- cambian en nada (oficinaId NULL en todas partes = comportamiento actual).
--
-- (1) Tabla Oficina: sedes de un mismo despacho (caso Gesnet: Gran Via + Diagonal).
--     Todo lo demás sigue compartido: suscripción, cuota, servicios, hoja de
--     encargo. La oficina es una DIMENSIÓN del workspace, no un workspace aparte.
-- (2) oficinaId en Membership/Cliente/Expediente, NULLABLE:
--     NULL = «todas» (administradores) o «sin afectar» (mono-oficina).
--     El Expediente se estampa con la oficina de su cliente al crearse
--     (denormalizado a propósito: el board filtra sin join).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists "Oficina" (
  "id"          text        primary key,
  "workspaceId" text        not null references "Workspace"("id") on delete cascade,
  "nombre"      text        not null,
  "direccion"   text,
  "telefono"    text,
  "orden"       integer     not null default 0,
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now()
);
create index if not exists "Oficina_workspaceId_idx" on "Oficina"("workspaceId");

alter table "Membership" add column if not exists "oficinaId" text references "Oficina"("id") on delete set null;
alter table "Cliente"    add column if not exists "oficinaId" text references "Oficina"("id") on delete set null;
alter table "Expediente" add column if not exists "oficinaId" text references "Oficina"("id") on delete set null;

create index if not exists "Cliente_oficinaId_idx"    on "Cliente"("oficinaId");
create index if not exists "Expediente_oficinaId_idx" on "Expediente"("oficinaId");

-- RLS multi-tenant: LECTURA bajo sesión (selector y filtros); toda escritura pasa
-- por rutas API (sesión verificada → service_role), nunca directa desde el navegador.
alter table "Oficina" enable row level security;
drop policy if exists oficina_tenant on "Oficina";
create policy oficina_tenant on "Oficina"
  for select using ("workspaceId" in (select app_workspace_ids()));
