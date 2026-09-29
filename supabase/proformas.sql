-- FACTURAS PROFORMA (pedido de Juan, 29/09/2026).
--
-- Juan manda al cliente, ANTES de cobrar, un documento con el importe exacto a pagar, sin
-- emitir todavía la factura (que luego habría que rectificar o anular si cambia el importe
-- o el cliente no paga). Hasta hoy lo hacía con facturas numeradas «PROFORMA»: contaban
-- como facturas emitidas y el número no se podía repetir.
--
-- Una proforma NO es una factura: tabla propia, serie propia (PRO-2026-0001), fuera de la
-- numeración de facturas, de las estadísticas, del CSV y de VERI*FACTU. Al cobrar se
-- CONVIERTE en factura (número siguiente de la serie de facturas, fecha de ese día) y la
-- proforma guarda qué factura salió de ella. Se puede anular o borrar sin dejar huecos.
--
-- Escritura SOLO por las rutas de la API (service role, tras comprobar el despacho bajo
-- sesión); lectura bajo RLS, con la misma regla que las facturas. Idempotente.

-- Importes en numeric(10,2), como "Factura".
create table if not exists "Proforma" (
  "id" text primary key,
  "workspaceId" text not null references "Workspace"("id") on delete cascade,
  "oficinaId" text references "Oficina"("id") on delete set null,
  "numero" text not null,
  "estado" text not null default 'PENDIENTE' check ("estado" in ('PENDIENTE', 'ENVIADA', 'CONVERTIDA', 'ANULADA')),
  "fechaEmision" timestamptz not null default now(),
  "validaHasta" timestamptz,
  "clienteNombre" text not null,
  "concepto" text not null,
  "baseImponible" numeric(10, 2) not null default 0,
  "iva" numeric(10, 2) not null default 0,
  "total" numeric(10, 2) not null default 0,
  "lineas" jsonb,
  "suplidos" jsonb,
  "notas" text,
  "clienteDatos" jsonb,
  "clienteId" text references "Cliente"("id") on delete set null,
  "empresaId" text references "Empresa"("id") on delete set null,
  "expedienteId" text references "Expediente"("id") on delete set null,
  "retencionPct" numeric(5, 2),
  "retencion" numeric(10, 2),
  "emisorDatos" jsonb,
  "facturaId" text references "Factura"("id") on delete set null,
  "enviadaAt" timestamptz,
  "enviadaA" text,
  "convertidaAt" timestamptz,
  "creadoPorId" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- Dos proformas no comparten número en un despacho (la ruta reintenta si chocan).
create unique index if not exists "Proforma_ws_numero" on "Proforma" ("workspaceId", "numero");
create index if not exists "Proforma_ws_creada" on "Proforma" ("workspaceId", "createdAt" desc);
-- Una factura sale de UNA sola proforma: convertir dos veces es imposible.
create unique index if not exists "Proforma_factura_unica" on "Proforma" ("facturaId") where "facturaId" is not null;

-- Lectura (y escritura bajo sesión, aunque hoy solo escribe la API): la regla de las facturas
-- (supabase/oficinas-estanco.sql) — la de un expediente que no veo, no la veo; una suelta es
-- del despacho, salvo para un asistente.
alter table "Proforma" enable row level security;
drop policy if exists pro_tenant on "Proforma";
create policy pro_tenant on "Proforma"
  for all using (
    "workspaceId" in (select app_workspace_ids())
    and (not app_es_asistente("workspaceId") or "expedienteId" in (select id from "Expediente"))
    and ("expedienteId" is null or "expedienteId" in (select id from "Expediente"))
  );

-- Comprobación: 0 filas y RLS activada, sin errores.
-- select count(*) from "Proforma";
-- select relrowsecurity from pg_class where relname = 'Proforma';
