-- ────────────────────────────────────────────────────────────────────────────────────
-- FACTURAS RECIBIDAS (proveedores) — 16/09/2026, petición de Asenjo Global Consulting
-- («no podríamos gestionar las facturas que nos emitan… en la base de datos»).
--
-- Regla del producto: Aproba ARCHIVA y LEE las facturas recibidas (proveedor, fecha,
-- base, IVA, total) y las exporta junto a las emitidas. NO es contabilidad: ni libro de
-- IVA soportado, ni modelo 303, ni conciliación. El archivo vive en el bucket privado
-- `documentos` bajo recibidas/<workspace>/<id>/<archivo>.
-- Migración aditiva e idempotente. Ejecutar en el editor SQL de Supabase.
-- ────────────────────────────────────────────────────────────────────────────────────

create table if not exists "FacturaRecibida" (
  "id"              text        primary key,
  "workspaceId"     text        not null references "Workspace"("id") on delete cascade,
  "oficinaId"       text        references "Oficina"("id") on delete set null,
  "expedienteId"    text        references "Expediente"("id") on delete set null,  -- opcional: gasto ligado a un expediente
  "proveedorNombre" text,
  "proveedorNif"    text,
  "numero"          text,
  "fecha"           date,                                                          -- fecha de emisión de la factura
  "baseImponible"   numeric(12,2),
  "tipoIva"         numeric(5,2),                                                  -- porcentaje (21, 10, 4, 0)
  "cuotaIva"        numeric(12,2),
  "total"           numeric(12,2),
  "concepto"        text,
  "notas"           text,
  "archivoPath"     text        not null,
  "archivoNombre"   text        not null,
  "archivoMime"     text        not null,
  "archivoSize"     integer,
  "origen"          text        not null default 'MANUAL',                         -- MANUAL (subida) | EMAIL (reenvío a la dirección del despacho)
  "bandejaId"       text,                                                          -- fila de BandejaEntrada de la que salió, si vino por email
  "confianza"       numeric(4,2),                                                  -- 0-1, lectura IA
  "revisar"         boolean     not null default false,                            -- algún dato no leído o dudoso: el gestor lo confirma
  "creadoPorId"     text,
  "createdAt"       timestamptz not null default now(),
  "updatedAt"       timestamptz not null default now()
);
create index if not exists "FacturaRecibida_ws_fecha_idx" on "FacturaRecibida"("workspaceId", "fecha" desc, "createdAt" desc);

-- RLS multi-tenant (mismo patrón que Factura).
alter table "FacturaRecibida" enable row level security;
drop policy if exists facturarecibida_tenant on "FacturaRecibida";
create policy facturarecibida_tenant on "FacturaRecibida"
  for all using ("workspaceId" in (select app_workspace_ids()));

-- Comprobación:
-- select count(*) from "FacturaRecibida";
