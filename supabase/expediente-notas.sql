-- ─────────────────────────────────────────────────────────────────────────────
-- NOTAS / ANOTACIONES por expediente (pedido de Juan) — un bloc de notas de
-- trabajo del gestor: «cita solicitada», «a la espera de las apostillas», etc.
-- MUTABLE (se edita y se borra), a diferencia del Historial (ExpedienteEvento),
-- que es un registro de auditoría de solo lectura. Migración ADITIVA e
-- idempotente. Repli propre hasta migrar: la lista sale vacía y el guardado
-- avisa de que falta la migración, nada se rompe.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists "ExpedienteNota" (
  "id"           text        primary key,
  "workspaceId"  text        not null references "Workspace"("id")  on delete cascade,
  "expedienteId" text        not null references "Expediente"("id") on delete cascade,
  "autorId"      text        references "User"("id"),
  "autorNombre"  text,                                   -- snapshot del nombre (sobrevive a bajas)
  "texto"        text        not null,
  "createdAt"    timestamptz not null default now(),
  "updatedAt"    timestamptz not null default now()
);
create index if not exists "ExpedienteNota_expedienteId_idx" on "ExpedienteNota"("expedienteId");

-- RLS multi-tenant: LECTURA bajo sesión (la ficha lista las notas del expediente);
-- la escritura (crear/editar/borrar) pasa por las rutas API (sesión verificada →
-- service_role), como el resto de tablas sensibles.
alter table "ExpedienteNota" enable row level security;
drop policy if exists nota_tenant on "ExpedienteNota";
create policy nota_tenant on "ExpedienteNota"
  for select using ("workspaceId" in (select app_workspace_ids()));

-- Cinturón + tirantes: la escritura solo por service_role. Aunque RLS ya deniega por
-- defecto (no hay policy de insert/update/delete), revocamos explícitamente al cliente.
revoke insert, update, delete on "ExpedienteNota" from anon, authenticated;
