-- ─────────────────────────────────────────────────────────────────────────────
-- MULTI-OFICINA — VISTAS ESTANCAS. Migración idempotente.
-- Ejecutar una vez en el editor SQL de Supabase.
--
-- Hasta ahora el filtro por sede era una COOKIE: cómodo, pero un gestor de Gran
-- Via podía cambiar el selector y ver Diagonal. Jennifer pidió «vistas
-- distintas», así que la separación baja a la base.
--
-- LA REGLA, en una frase:
--   · usuario CON oficina asignada  → solo ve la suya
--   · usuario SIN oficina («Todas») → lo ve todo   ← la vista consolidada
--
-- Repartir es por tanto una decisión explícita: se deja en «Todas» a quien deba
-- verlo todo (es justo lo que ya recomienda la ayuda de Ajustes).
--
-- ⚠️ LAS FILAS SIN OFICINA LAS VE TODO EL MUNDO. Es deliberado: si se ocultaran,
-- importar 200 clientes sin elegir sede los volvería invisibles para todos menos
-- para los de «Todas» — un dato invisible es peor que un dato compartido.
-- Asignar la sede es lo que los reparte.
--
-- Cascada gratis: Documento, Formulario y ExpedienteEvento se filtran vía
-- subconsulta a "Expediente", y Postgres aplica RLS también dentro de las
-- subconsultas. No hay que tocar sus políticas.
--
-- NO afecta al portal del cliente (/j, /s, /c, /f): va por service_role.
--
-- ⚠️ Vuelta atrás (deja el filtro solo en la cookie, como antes):
--
--   drop policy if exists cli_tenant on "Cliente";
--   create policy cli_tenant on "Cliente"
--     for all using ("workspaceId" in (select app_workspace_ids()));
--   drop policy if exists exp_tenant on "Expediente";
--   create policy exp_tenant on "Expediente" for all using (
--     "workspaceId" in (select app_workspace_ids())
--     and (not app_es_asistente("workspaceId") or "asignadoAId" = auth.uid()::text));
--   drop policy if exists venc_tenant on "Vencimiento";
--   create policy venc_tenant on "Vencimiento"
--     for select using ("workspaceId" in (select app_workspace_ids()));
--   drop policy if exists fac_tenant on "Factura";
--   create policy fac_tenant on "Factura" for all using (
--     "workspaceId" in (select app_workspace_ids())
--     and (not app_es_asistente("workspaceId") or "expedienteId" in (select id from "Expediente")));
-- ─────────────────────────────────────────────────────────────────────────────

-- Mi sede en ESTE despacho, o NULL si no tengo ninguna asignada (= las veo todas).
-- Una persona puede llevar una sede en un despacho y todas en otro: se pregunta
-- por workspace, igual que app_es_asistente.
create or replace function app_mi_oficina(ws text)
returns text
language sql stable
security definer set search_path = public
as $$
  select "oficinaId" from "Membership"
  where "userId" = auth.uid()::text and "workspaceId" = ws
  limit 1
$$;

-- ¿Veo una fila de esta sede? Sí si no tengo sede asignada, si la fila no tiene
-- sede, o si es la mía.
create or replace function app_ve_oficina(ws text, fila text)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select app_mi_oficina(ws) is null or fila is null or fila = app_mi_oficina(ws)
$$;

-- Clientes: tenant + mi sede.
drop policy if exists cli_tenant on "Cliente";
create policy cli_tenant on "Cliente"
  for all using (
    "workspaceId" in (select app_workspace_ids())
    and app_ve_oficina("workspaceId", "oficinaId")
  );

-- Expedientes: tenant + (asistente → solo los suyos) + mi sede.
drop policy if exists exp_tenant on "Expediente";
create policy exp_tenant on "Expediente"
  for all using (
    "workspaceId" in (select app_workspace_ids())
    and (not app_es_asistente("workspaceId") or "asignadoAId" = auth.uid()::text)
    and app_ve_oficina("workspaceId", "oficinaId")
  );

-- Vencimientos: siguen a SU cliente, que ya viaja filtrado por la política de
-- arriba. Basta con exigir que el cliente sea visible.
drop policy if exists venc_tenant on "Vencimiento";
create policy venc_tenant on "Vencimiento"
  for select using (
    "workspaceId" in (select app_workspace_ids())
    and "clienteId" in (select id from "Cliente")
  );

-- Facturas: la de un expediente que no veo, no la veo. Una factura suelta
-- (expedienteId null, emitida a mano) es del despacho y sigue visible — salvo
-- para un asistente, cuyo alcance es estrictamente lo que tiene asignado.
drop policy if exists fac_tenant on "Factura";
create policy fac_tenant on "Factura"
  for all using (
    "workspaceId" in (select app_workspace_ids())
    and (not app_es_asistente("workspaceId") or "expedienteId" in (select id from "Expediente"))
    and ("expedienteId" is null or "expedienteId" in (select id from "Expediente"))
  );
