-- ─────────────────────────────────────────────────────────────────────────────
-- VIGÍA — motor de vencimientos/renovaciones. Migración ADITIVA e idempotente.
-- Ejecutar una vez en el editor SQL de Supabase. Hasta entonces, repli propre:
-- la pantalla Vencimientos muestra vacío y los hooks de siembra se ignoran.
--
-- (1) Cliente.fechaCaducidad / tipoVencimiento: la fecha de caducidad que la IA
--     YA extrae de cada TIE (hoy se muestra y se tira) se persiste en el cliente.
--     TEXT AAAA-MM-DD, como fechaNacimiento (patrón ficha plana). NO forma parte
--     de FICHA_KEYS: la escribe la máquina, no el cliente en el portal.
-- (2) Tabla Vencimiento: una fila = "a este cliente le caduca X el día D".
--     Estados: PENDIENTE → AVISADO (cron avisó al gestor) → TRAMITANDO (renovación
--     iniciada, expedienteRenovacionId enlazado) → HECHO (renovación finalizada).
--     TEXT sin enum Postgres (como parentesco/sexo) para poder evolucionar.
-- ─────────────────────────────────────────────────────────────────────────────

alter table "Cliente" add column if not exists "fechaCaducidad"  text;
alter table "Cliente" add column if not exists "tipoVencimiento" text;

create table if not exists "Vencimiento" (
  "id"                     text        primary key,
  "workspaceId"            text        not null references "Workspace"("id") on delete cascade,
  "clienteId"              text        not null references "Cliente"("id") on delete cascade,
  "expedienteId"           text        references "Expediente"("id") on delete set null, -- expediente que lo sembró (FINALIZADO)
  "expedienteRenovacionId" text        references "Expediente"("id") on delete set null, -- expediente de renovación creado desde Vigía
  "fecha"                  timestamptz not null,                 -- cuándo caduca
  "tipo"                   text        not null default 'TIE',   -- qué caduca (TIE, …)
  "estado"                 text        not null default 'PENDIENTE', -- PENDIENTE|AVISADO|TRAMITANDO|HECHO
  "createdAt"              timestamptz not null default now(),
  "updatedAt"              timestamptz not null default now()
);
create index if not exists "Vencimiento_workspaceId_fecha_idx" on "Vencimiento"("workspaceId", "fecha");
create index if not exists "Vencimiento_clienteId_idx" on "Vencimiento"("clienteId");

-- RLS multi-tenant: LECTURA bajo sesión (pantalla Vencimientos); toda escritura pasa
-- por rutas API (sesión verificada → service_role), nunca directa desde el navegador.
alter table "Vencimiento" enable row level security;
drop policy if exists venc_tenant on "Vencimiento";
create policy venc_tenant on "Vencimiento"
  for select using ("workspaceId" in (select app_workspace_ids()));
