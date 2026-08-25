-- ─────────────────────────────────────────────────────────────────────────────
-- NÚMEROS DE FACTURA QUEMADOS — un número emitido no se reutiliza JAMÁS.
--
-- Caso real (Gesnet, 24/08/2026): la gestora borró la factura de anticipo
-- 2026-0006 (181,50 €) y emitió una manual… que recibió OTRA VEZ el número
-- 2026-0006 (392,48 €), porque la numeración calcula max+1 sobre las facturas
-- VIVAS. Dos PDF distintos con el mismo número — incompatible con la serie
-- correlativa del RD 1619/2012 y con VeriFactu.
--
-- Esta tabla conserva el número de toda factura EMITIDA (no borrador) que se
-- elimina; la numeración (lib/factura-numero.ts) la une a las vivas al calcular
-- el siguiente. El hueco queda (decisión informada del gestor, avisada en el
-- diálogo), pero el número no vuelve a salir nunca.
-- Aditivo e idempotente. Ejecutar en el editor SQL de Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists "FacturaNumeroQuemado" (
  id uuid primary key default gen_random_uuid(),
  "workspaceId" uuid not null references "Workspace"(id) on delete cascade,
  numero text not null,
  "borradoEn" timestamptz not null default now()
);

-- El mismo número solo se quema una vez (los borrados de la era anterior al fix
-- pudieron reutilizar números: on conflict do nothing en el código).
create unique index if not exists "FacturaNumeroQuemado_ws_numero_key"
  on "FacturaNumeroQuemado" ("workspaceId", "numero");

-- Solo lectura para el tenant (por si algún día la numeración corre bajo sesión);
-- la escritura queda en service_role (la ruta DELETE del servidor).
alter table "FacturaNumeroQuemado" enable row level security;
drop policy if exists fnq_tenant_read on "FacturaNumeroQuemado";
create policy fnq_tenant_read on "FacturaNumeroQuemado"
  for select using ("workspaceId" in (select app_workspace_ids()));

-- ─────────────────────────────────────────────────────────────────────────────
-- DE PASO (mismo chantier): el índice de idempotencia (expediente, momento)
-- marcado «OPCIONAL» el 06/08 seguía sin constar como ejecutado. Idempotente:
-- si ya existe, esta línea no hace nada.
-- ─────────────────────────────────────────────────────────────────────────────
create unique index if not exists "Factura_expediente_momento_key"
  on "Factura" ("expedienteId", "momento")
  where "momento" is not null and "estado" <> 'ANULADA';
