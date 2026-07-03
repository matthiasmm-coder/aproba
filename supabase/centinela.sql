-- ─────────────────────────────────────────────────────────────────────────────
-- EL FUNCIONARIO FANTASMA (Centinela) — revisión pre-presentación del expediente
-- «como la leería la Oficina de Extranjería». Migración ADITIVA e idempotente.
--
-- Cada revisión se PERSISTE con provincia + tipo de trámite: este histórico
-- (revisión → desenlace real del expediente) es el corpus que alimentará el
-- futuro Radar por oficina (foso de datos). Repli propre hasta migrar: el botón
-- avisa de que falta la migración, nada se rompe.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists "CentinelaRevision" (
  "id"           text        primary key,
  "workspaceId"  text        not null references "Workspace"("id") on delete cascade,
  "expedienteId" text        not null references "Expediente"("id") on delete cascade,
  "verdicto"     text        not null,             -- ROJO | AMBAR | VERDE (agregado en servidor)
  "hallazgos"    jsonb       not null default '[]'::jsonb, -- [{severidad,titulo,motivo,requisito,documentos}]
  "comprobado"   jsonb       not null default '[]'::jsonb, -- qué se verificó sin problema (transparencia)
  "noComprobable" jsonb      not null default '[]'::jsonb, -- qué no se pudo verificar por falta de datos
  "provincia"    text,                              -- corpus Radar: criterios varían por oficina
  "tipoTramite"  text        not null,
  "modelo"       text        not null,
  "inputTokens"  integer,
  "outputTokens" integer,
  "createdAt"    timestamptz not null default now()
);
create index if not exists "CentinelaRevision_expedienteId_idx" on "CentinelaRevision"("expedienteId");
create index if not exists "CentinelaRevision_ws_prov_idx" on "CentinelaRevision"("workspaceId", "provincia", "tipoTramite");

-- RLS multi-tenant: LECTURA bajo sesión (la ficha muestra la última revisión);
-- la escritura pasa por la ruta API (sesión verificada → service_role).
alter table "CentinelaRevision" enable row level security;
drop policy if exists centinela_tenant on "CentinelaRevision";
create policy centinela_tenant on "CentinelaRevision"
  for select using ("workspaceId" in (select app_workspace_ids()));
