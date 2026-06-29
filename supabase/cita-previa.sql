-- ─────────────────────────────────────────────────────────────────────────────
-- Citas previas: cita de consulta/asesoría con un cliente (existente o nombre libre),
-- INDEPENDIENTE de un expediente. Migración aditiva (solo crea una tabla). Ejecutar
-- una vez en el editor SQL de Supabase. Hasta entonces, la función queda desactivada
-- con repli propre (no rompe nada).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists "CitaPrevia" (
  "id"          text        primary key,
  "workspaceId" text        not null references "Workspace"("id") on delete cascade,
  "clienteId"   text        references "Cliente"("id") on delete set null,  -- opcional: null = walk-in / prospecto
  "nombre"      text        not null,                                       -- nombre del cliente o nombre libre
  "email"       text,
  "telefono"    text,
  "fecha"       text        not null,                                       -- YYYY-MM-DD
  "hora"        text,                                                       -- HH:MM
  "lugar"       text,                                                       -- oficina / videollamada / dirección
  "motivo"      text,                                                       -- motivo de la consulta
  "notas"       text,
  "estado"      text        not null default 'confirmada',                 -- pendiente | confirmada | realizada | cancelada
  "asignadoAId" text        references "User"("id") on delete set null,    -- gestor/abogado que la atiende
  "createdAt"   timestamptz not null default now()
);

create index if not exists "CitaPrevia_workspaceId_idx" on "CitaPrevia"("workspaceId");
create index if not exists "CitaPrevia_clienteId_idx" on "CitaPrevia"("clienteId");
create index if not exists "CitaPrevia_fecha_idx" on "CitaPrevia"("workspaceId", "fecha");

-- RLS multi-tenant (mismo patrón que Cliente/Expediente): el workspace del usuario.
alter table "CitaPrevia" enable row level security;
create policy citaprevia_tenant on "CitaPrevia"
  for all using ("workspaceId" in (select app_workspace_ids()));

-- Duración (minutos) y precio (€) de la cita — añadidos después. Aditivo e idempotente.
alter table "CitaPrevia" add column if not exists "duracion" integer;
alter table "CitaPrevia" add column if not exists "precio"   numeric(10,2);
