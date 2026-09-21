-- ─────────────────────────────────────────────────────────────────────────────────────
-- REQUERIMIENTOS (petición de Jennifer Ibarra, Gesadmbcn, 21/09/2026)
--
-- «En extranjería nos llegan requerimientos. Usualmente nos dan 10 días hábiles para
--  aportar. ¿Es posible tener un apartado de requerimientos y que Aproba nos recuerde
--  cuando se vence?»
--
-- Es la fecha MÁS CRÍTICA del oficio: pasado el plazo, el expediente se tiene por
-- desistido. Por eso NO vive en "Vencimiento" (Vigía), que desde el 11/09 significa
-- «renovación PROPUESTA al cliente» y puede acabar en factura: un requerimiento no
-- propone nada, es un plazo que hay que cumplir.
--
-- LA GESTORÍA MANDA, de principio a fin:
--   · la "fechaLimite" la ESCRIBE ella (la lee en el requerimiento); la app solo ofrece
--     calcular 10 días hábiles como ayuda, y ella la corrige si cae en festivo local;
--   · "avisarDias" es SU umbral (cuántos días antes quiere el primer aviso);
--   · el aviso va al DESPACHO, nunca al cliente: Aproba no escribe a nadie por su cuenta;
--   · lo cierra ella con "Marcar como aportado".
-- ─────────────────────────────────────────────────────────────────────────────────────

create table if not exists "Requerimiento" (
  "id"           text        primary key,
  "workspaceId"  text        not null references "Workspace"("id") on delete cascade,
  "expedienteId" text        not null references "Expediente"("id") on delete cascade,
  "asunto"       text        not null,                  -- qué pide la Administración
  "docs"         text[]      not null default '{}',     -- documentos pedidos (opcional)
  "recibidoEl"   timestamptz,                           -- cuándo llegó el requerimiento
  "fechaLimite"  timestamptz not null,                  -- la escribe la gestoría
  "avisarDias"   integer     not null default 3,        -- su umbral de aviso
  "ultimoAviso"  integer,                               -- último hito avisado (días); null = nunca
  "estado"       text        not null default 'PENDIENTE',  -- PENDIENTE | APORTADO
  "aportadoEl"   timestamptz,
  "notas"        text,
  "creadoPor"    text,
  "createdAt"    timestamptz not null default now(),
  "updatedAt"    timestamptz not null default now()
);

create index if not exists "Requerimiento_ws_estado_fecha_idx" on "Requerimiento" ("workspaceId", "estado", "fechaLimite");
create index if not exists "Requerimiento_expedienteId_idx"    on "Requerimiento" ("expedienteId");

-- RLS multi-tenant: LECTURA bajo sesión (pantalla y ficha); toda ESCRITURA pasa por
-- rutas API (sesión verificada → service_role), nunca directa desde el navegador.
alter table "Requerimiento" enable row level security;
drop policy if exists requerimiento_tenant on "Requerimiento";
create policy requerimiento_tenant on "Requerimiento"
  for select using ("workspaceId" in (select app_workspace_ids()));
