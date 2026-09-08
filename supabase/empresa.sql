-- ────────────────────────────────────────────────────────────────────────────────────
-- CLIENTE-EMPRESA (petición de Asenjo Global Consulting, 08/09/2026): el gestor tramita
-- el expediente de un TRABAJADOR extranjero, pero quien contrata y paga es la EMPRESA que
-- lo emplea (autorización de residencia y trabajo por cuenta ajena: el empleador es el
-- solicitante y el trabajador el beneficiario).
--
-- Modelo, calcado del dossier familiar (supabase/familia.sql):
--   • Empresa: razón social, CIF, domicilio fiscal y persona de contacto. Una empresa,
--     varios trabajadores.
--   • Cliente.empresaId: el trabajador (su ficha personal sigue siendo la de siempre —
--     formularios EX, tasas y portal son de la PERSONA).
--   • Expediente.empresaId: expediente de empresa → factura, hoja de encargo y
--     presupuesto a nombre de la empresa. Factura.empresaId lo traza.
-- Migración aditiva e idempotente. Ejecutar en el editor SQL de Supabase. Sin ella, la
-- opción «Empresa» avisa de la migración pendiente y todo lo demás sigue igual.
-- ────────────────────────────────────────────────────────────────────────────────────

create table if not exists "Empresa" (
  "id"               text        primary key,
  "workspaceId"      text        not null references "Workspace"("id") on delete cascade,
  "razonSocial"      text        not null,
  "nif"              text,
  "domicilio"        text,
  "codigoPostal"     text,
  "municipio"        text,
  "provincia"        text,
  "contactoNombre"   text,
  "contactoEmail"    text,
  "contactoTelefono" text,
  "oficinaId"        text,                       -- multi-oficina (misma regla que Cliente)
  "createdAt"        timestamptz not null default now(),
  "updatedAt"        timestamptz not null default now()
);
create index if not exists "Empresa_workspaceId_idx" on "Empresa"("workspaceId");

-- RLS multi-tenant (mismo patrón que Familia/Cliente/Expediente).
alter table "Empresa" enable row level security;
drop policy if exists empresa_tenant on "Empresa";
create policy empresa_tenant on "Empresa"
  for all using ("workspaceId" in (select app_workspace_ids()));

-- Trabajador → su empresa (si la empresa se borra, el cliente se conserva sin vínculo).
alter table "Cliente" add column if not exists "empresaId" text references "Empresa"("id") on delete set null;
create index if not exists "Cliente_empresaId_idx" on "Cliente"("empresaId");

-- Expediente de empresa.
alter table "Expediente" add column if not exists "empresaId" text;
create index if not exists "Expediente_empresaId_idx" on "Expediente"("empresaId");
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Expediente_empresaId_fkey') then
    alter table "Expediente" add constraint "Expediente_empresaId_fkey"
      foreign key ("empresaId") references "Empresa"("id") on delete set null;
  end if;
end $$;

-- Factura emitida a la empresa (se traza para listarla por empresa).
alter table "Factura" add column if not exists "empresaId" text;
create index if not exists "Factura_empresaId_idx" on "Factura"("empresaId");
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Factura_empresaId_fkey') then
    alter table "Factura" add constraint "Factura_empresaId_fkey"
      foreign key ("empresaId") references "Empresa"("id") on delete set null;
  end if;
end $$;

-- Comprobación (debe devolver 4 filas: Empresa.id, Cliente/Expediente/Factura.empresaId):
-- select table_name, column_name from information_schema.columns
--  where (table_name = 'Empresa' and column_name = 'id') or column_name = 'empresaId' order by table_name;
