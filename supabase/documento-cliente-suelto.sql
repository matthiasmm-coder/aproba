-- ─────────────────────────────────────────────────────────────────────────────
-- Documentos SUELTOS de un cliente (subidos por el gestor desde la ficha del cliente,
-- SIN expediente): pasaporte, TIE, empadronamiento… El gestor elige el tipo en un
-- desplegable y sube el archivo. Independiente de Documento (que pertenece a un
-- expediente). Migración aditiva e idempotente. Ejecutar una vez en Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists "DocumentoCliente" (
  "id"            text        primary key,
  "clienteId"     text        not null references "Cliente"("id") on delete cascade,
  "workspaceId"   text        not null references "Workspace"("id") on delete cascade,
  "tipo"          text        not null,              -- etiqueta (Pasaporte, TIE actual…)
  "nombreArchivo" text,
  "storagePath"   text        not null,              -- bucket privado `documentos`, ruta clientes/{id}/…
  "mimeType"      text,
  "sizeBytes"     integer,
  "createdAt"     timestamptz not null default now()
);
create index if not exists "DocumentoCliente_clienteId_idx" on "DocumentoCliente"("clienteId");

-- RLS multi-tenant (mismo patrón que el resto de tablas).
alter table "DocumentoCliente" enable row level security;
drop policy if exists documentocliente_tenant on "DocumentoCliente";
create policy documentocliente_tenant on "DocumentoCliente"
  for all using ("workspaceId" in (select app_workspace_ids()));
