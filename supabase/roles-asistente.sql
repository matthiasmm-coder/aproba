-- ─────────────────────────────────────────────────────────────────────────────
-- ROLES — el ASISTENTE solo ve SUS expedientes. Migración idempotente.
-- Ejecutar una vez en el editor SQL de Supabase.
--
-- POR QUÉ EN RLS Y NO EN CADA RUTA: las 19 rutas que tocan un expediente lo
-- RESUELVEN BAJO RLS antes de escribir con service_role (patrón anti-IDOR de la
-- casa). Si la política lo esconde, la resolución devuelve null y la ruta corta
-- en 404 — sin tocar 19 ficheros y sin que se pueda olvidar uno mañana.
--
-- Reparto que impone esta migración:
--   · OWNER / ADMIN  → todo el despacho (sin cambios)
--   · GESTOR         → todo el despacho (sin cambios; borrar sigue siendo de admin)
--   · ASISTENTE      → SOLO los expedientes que tiene asignados
--
-- NO afecta al portal del cliente (/j, /s, /c, /f): esas rutas van por
-- service_role con token, que no pasa por RLS.
--
-- ⚠️ Esto REEMPLAZA dos políticas vivas. Si algo saliera mal, la vuelta atrás es
-- exactamente esto (deja el reparto anterior: todo el despacho para todos):
--
--   drop policy if exists exp_tenant on "Expediente";
--   create policy exp_tenant on "Expediente"
--     for all using ("workspaceId" in (select app_workspace_ids()));
--   drop policy if exists fac_tenant on "Factura";
--   create policy fac_tenant on "Factura"
--     for all using ("workspaceId" in (select app_workspace_ids()));
-- ─────────────────────────────────────────────────────────────────────────────

-- ¿El usuario actual es ASISTENTE en ESTE workspace? Una persona puede ser
-- asistente en un despacho y administradora en otro: la pregunta es por workspace.
create or replace function app_es_asistente(ws text)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from "Membership"
    where "userId" = auth.uid()::text and "workspaceId" = ws and role = 'ASISTENTE'
  )
$$;

-- Expedientes: tenant + (si soy asistente) solo los míos.
-- Un expediente sin asignar (creado por el cliente desde su espacio) NO es de
-- nadie: el asistente no lo ve, y está bien — no se lo han encargado.
drop policy if exists exp_tenant on "Expediente";
create policy exp_tenant on "Expediente"
  for all using (
    "workspaceId" in (select app_workspace_ids())
    and (
      not app_es_asistente("workspaceId")
      or "asignadoAId" = auth.uid()::text
    )
  );

-- Facturas: las de MIS expedientes. La subconsulta a "Expediente" ya viaja
-- filtrada por la política de arriba (Postgres aplica RLS también dentro de las
-- subconsultas), así que basta con exigir que la factura cuelgue de uno visible.
-- Una factura suelta (expedienteId null, emitida a mano) queda fuera del alcance
-- del asistente: es facturación del despacho, no trabajo suyo.
drop policy if exists fac_tenant on "Factura";
create policy fac_tenant on "Factura"
  for all using (
    "workspaceId" in (select app_workspace_ids())
    and (
      not app_es_asistente("workspaceId")
      or "expedienteId" in (select id from "Expediente")
    )
  );
