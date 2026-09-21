-- ────────────────────────────────────────────────────────────────────────────────────
-- EXPEDIENTE DE EMPRESA con N trabajadores (petición de Luis, Asenjo Global, 21/09/2026:
-- «se debe crear primero el expediente y luego el trabajador»).
--
-- Hasta hoy un expediente de empresa era el expediente de UN trabajador con la empresa
-- como pagadora (supabase/empresa.sql). Desde ahora el expediente puede ser DE LA EMPRESA:
-- nace con sus datos y sin trabajador, y los trabajadores se le añaden después (desde la
-- ficha, o desde el enlace de la empresa cuando llegue el portal de empresa).
--
--   1) Expediente.clienteId pasa a ser OPCIONAL — pero solo cuando hay empresa: la
--      restricción «cliente o empresa» impide que nazca un expediente sin nadie.
--      Las 137+ filas existentes conservan su clienteId; nada cambia para ellas.
--   2) ExpedienteTrabajador: QUÉ trabajadores están en ESTE expediente. No sirve
--      Cliente.empresaId (calcado de la familia) porque una empresa abre varios
--      expedientes a lo largo del tiempo con distintos trabajadores. Cada fila lleva
--      además el jeton del enlace individual del trabajador (lote 3), cuándo se le envió,
--      y su «presentado» propio (los trabajadores de un mismo lote se presentan en
--      fechas distintas).
--
-- Migración aditiva e idempotente. Ejecutar una vez en el editor SQL de Supabase.
-- Sin ella, «Empresa» en Nuevo expediente avisa de la migración pendiente y el resto
-- del producto sigue igual (las lecturas son tolerantes: sin tabla → sin trabajadores).
-- ────────────────────────────────────────────────────────────────────────────────────

-- 1) clienteId opcional, pero nunca «nadie»: cliente o empresa.
alter table "Expediente" alter column "clienteId" drop not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Expediente_cliente_o_empresa_chk') then
    alter table "Expediente" add constraint "Expediente_cliente_o_empresa_chk"
      check ("clienteId" is not null or "empresaId" is not null);
  end if;
end $$;

-- 2) Trabajadores del expediente.
create table if not exists "ExpedienteTrabajador" (
  "id"              text        primary key,
  "workspaceId"     text        not null references "Workspace"("id") on delete cascade,
  "expedienteId"    text        not null references "Expediente"("id") on delete cascade,
  "clienteId"       text        not null references "Cliente"("id") on delete cascade,
  "token"           text        not null,   -- enlace individual del trabajador (32 hex): SOLO sus documentos y su mandato
  "enlaceEnviadoAt" timestamptz,            -- cuándo se le mandó su enlace (null = todavía no)
  "presentadoAt"    timestamptz,            -- presentado ante la Administración, POR trabajador
  "createdAt"       timestamptz not null default now()
);
create unique index if not exists "ExpedienteTrabajador_exp_cli_key" on "ExpedienteTrabajador"("expedienteId", "clienteId");
create unique index if not exists "ExpedienteTrabajador_token_key"   on "ExpedienteTrabajador"("token");
create index        if not exists "ExpedienteTrabajador_clienteId_idx" on "ExpedienteTrabajador"("clienteId");
create index        if not exists "ExpedienteTrabajador_workspaceId_idx" on "ExpedienteTrabajador"("workspaceId");

-- RLS multi-tenant (mismo patrón que Empresa/Familia/Cliente/Expediente).
alter table "ExpedienteTrabajador" enable row level security;
drop policy if exists expediente_trabajador_tenant on "ExpedienteTrabajador";
create policy expediente_trabajador_tenant on "ExpedienteTrabajador"
  for all using ("workspaceId" in (select app_workspace_ids()));

-- Comprobación (2 consultas):
--   select is_nullable from information_schema.columns
--    where table_name = 'Expediente' and column_name = 'clienteId';        -- → YES
--   select count(*) from "ExpedienteTrabajador";                            -- → 0
--
-- Vuelta atrás (si hiciera falta): volver al código anterior basta, PERO antes hay que
-- borrar los expedientes con clienteId nulo (son solo los de empresa creados con el
-- modelo nuevo) y después:
--   alter table "Expediente" drop constraint if exists "Expediente_cliente_o_empresa_chk";
--   alter table "Expediente" alter column "clienteId" set not null;
--   drop table if exists "ExpedienteTrabajador";
