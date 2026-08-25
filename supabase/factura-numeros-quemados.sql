-- ─────────────────────────────────────────────────────────────────────────────
-- NÚMEROS DE FACTURA QUEMADOS — un número emitido no se reutiliza JAMÁS.
--
-- Caso real (Gesnet, 24/08/2026): se borró la factura de anticipo 2026-0006
-- (181,50 €) y la manual emitida después recibió OTRA VEZ el número 2026-0006
-- (392,48 €), porque la numeración calcula max+1 sobre las facturas VIVAS. Dos
-- PDF distintos con el mismo número — incompatible con la serie correlativa del
-- RD 1619/2012 y con VeriFactu.
--
-- Esta tabla conserva el número de toda factura EMITIDA que se elimina; la
-- numeración (lib/factura-numero.ts) une quemados y vivos al calcular el
-- siguiente. El hueco queda —decisión informada del gestor, avisada en el
-- diálogo— pero el número no vuelve a salir nunca.
--
-- Un BORRADOR no se quema: su número nunca llegó a emitirse.
--
-- Migración ADITIVA e IDEMPOTENTE: no toca ninguna factura existente, no cambia
-- ninguna columna, no reescribe nada. Ejecutar una vez en el editor SQL de
-- Supabase. Hasta entonces el código cae al comportamiento anterior.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists "FacturaNumeroQuemado" (
  "id"          text        primary key,
  "workspaceId" text        not null references "Workspace"("id") on delete cascade,
  "numero"      text        not null,
  "borradoEn"   timestamptz not null default now()
);

-- El mismo número solo se quema una vez (el servidor hace upsert ignorando el
-- duplicado: quemar dos veces no es un error, es el mismo hecho).
create unique index if not exists "FacturaNumeroQuemado_ws_numero_key"
  on "FacturaNumeroQuemado" ("workspaceId", "numero");

-- RLS: mismo criterio que Factura — cada despacho ve lo suyo. La ESCRITURA vive
-- en el servidor (service_role, ruta DELETE): nadie quema un número desde el
-- navegador.
alter table "FacturaNumeroQuemado" enable row level security;
drop policy if exists fnq_tenant_read on "FacturaNumeroQuemado";
create policy fnq_tenant_read on "FacturaNumeroQuemado"
  for select using ("workspaceId" in (select app_workspace_ids()));

-- ─────────────────────────────────────────────────────────────────────────────
-- DE PASO: el índice de idempotencia (expediente, momento) marcado «OPCIONAL» el
-- 06/08 seguía sin constar como ejecutado en prod. Comprobado el 25/08 sobre las
-- 73 facturas reales: 50 parejas (expediente, momento) afectadas, CERO conflicto
-- — el índice se crea sin tocar nada. Si ya existe, esta línea no hace nada.
-- ─────────────────────────────────────────────────────────────────────────────
create unique index if not exists "Factura_expediente_momento_key"
  on "Factura" ("expedienteId", "momento")
  where "momento" is not null and "estado" <> 'ANULADA';
