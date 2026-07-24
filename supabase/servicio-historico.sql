-- ─────────────────────────────────────────────────────────────────────────────
-- Historial de servicios de un cliente: trámites ya realizados en el PASADO (importados
-- de una migración, o trámites cerrados). NO es un expediente: sin kanban, sin portal,
-- sin contador de cuota. Solo el registro "a este cliente se le hizo X el día D".
-- La ficha del cliente muestra este historial JUNTO a los expedientes reales (una sola
-- historia). Migración aditiva e idempotente. Ejecutar una vez en Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists "ServicioHistorico" (
  "id"            text        primary key,
  "workspaceId"   text        not null references "Workspace"("id") on delete cascade,
  "clienteId"     text        not null references "Cliente"("id")   on delete cascade,
  "tipo"          text        not null default 'OTRO',   -- TipoTramite (para etiqueta + validez)
  "servicioClave" text,                                  -- clave del ServicioConfig, si se mapeó
  "etiqueta"      text        not null,                  -- nombre mostrado (label del catálogo o trámite bruto)
  "fecha"         timestamptz,                           -- fecha en que se realizó/resolvió
  "estado"        text,                                  -- resultado (FINALIZADO, RESUELTO…) — informativo
  "referencia"    text,                                  -- referencia original del Excel, si la había
  "notas"         text,
  "origen"        text        not null default 'MIGRACION',
  "createdAt"     timestamptz not null default now(),
  "updatedAt"     timestamptz not null default now()
);
create index if not exists "ServicioHistorico_clienteId_idx"   on "ServicioHistorico"("clienteId");
create index if not exists "ServicioHistorico_workspaceId_idx" on "ServicioHistorico"("workspaceId");

-- RLS multi-tenant (mismo patrón que el resto de tablas). El import escribe con service_role
-- (bypassa RLS); la ficha lee con la sesión del gestor (esta policy la acota al despacho).
alter table "ServicioHistorico" enable row level security;
drop policy if exists serviciohistorico_tenant on "ServicioHistorico";
create policy serviciohistorico_tenant on "ServicioHistorico"
  for all using ("workspaceId" in (select app_workspace_ids()));
