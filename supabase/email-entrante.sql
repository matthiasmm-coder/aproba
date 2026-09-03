-- RECEPCIÓN DE DOCUMENTOS POR EMAIL (03/09/2026)
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
--
-- 1. Cada workspace recibe un token → dirección docs-<token>@in.aproba-software.com.
-- 2. «BandejaEntrada»: cada email recibido (asunto, remitente, adjuntos ya guardados
--    en el bucket `documentos` bajo bandeja/<workspace>/<email>/…) y a quién se asignó.

alter table "Workspace" add column if not exists "emailEntranteToken" text;
create unique index if not exists "Workspace_emailEntranteToken_key" on "Workspace"("emailEntranteToken");

-- Token para los workspaces existentes (10 caracteres hex; la app genera los nuevos).
update "Workspace"
   set "emailEntranteToken" = lower(substr(md5(random()::text || id || clock_timestamp()::text), 1, 10))
 where "emailEntranteToken" is null;

create table if not exists "BandejaEntrada" (
  "id"             text        primary key,
  "workspaceId"    text        not null references "Workspace"("id") on delete cascade,
  "resendEmailId"  text        not null unique,                 -- idempotencia (reintentos del webhook)
  "remitente"      text        not null,                        -- dirección de quien envió
  "remitenteNombre" text,
  "asunto"         text,
  "texto"          text,                                        -- cuerpo (acotado) para reconocer al cliente y para leerlo en la bandeja
  "recibidoAt"     timestamptz not null default now(),
  "adjuntos"       jsonb       not null default '[]'::jsonb,    -- [{nombre, mime, size, storagePath, destino?, docId?}]
  "clienteId"      text        references "Cliente"("id") on delete set null,
  "expedienteId"   text        references "Expediente"("id") on delete set null,
  "estado"         text        not null default 'PENDIENTE',    -- PENDIENTE | ASIGNADO | DESCARTADO
  "motivo"         text,                                        -- por qué se asignó (email, documento, teléfono, nombre) o no
  "createdAt"      timestamptz not null default now(),
  "updatedAt"      timestamptz not null default now()
);
create index if not exists "BandejaEntrada_workspaceId_estado_idx" on "BandejaEntrada"("workspaceId", "estado", "recibidoAt" desc);

-- RLS multi-tenant (mismo patrón que el resto de tablas).
alter table "BandejaEntrada" enable row level security;
drop policy if exists bandejaentrada_tenant on "BandejaEntrada";
create policy bandejaentrada_tenant on "BandejaEntrada"
  for all using ("workspaceId" in (select app_workspace_ids()));

-- Verificación rápida:
-- select count(*) filter (where "emailEntranteToken" is null) as sin_token from "Workspace";
-- select * from "BandejaEntrada" order by "recibidoAt" desc limit 5;
